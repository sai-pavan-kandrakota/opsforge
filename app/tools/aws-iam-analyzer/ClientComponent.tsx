"use client";

import { useMemo, useState } from "react";


type Severity = "PASS" | "WARNING" | "CRITICAL";

type Finding = {
  title: string;
  severity: Severity;
  description: string;
  recommendation?: string;
};

type Statement = {
  Sid?: string;
  Effect?: string;
  Action?: string | string[];
  Resource?: string | string[];
  Principal?: unknown;
  Condition?: unknown;
  NotAction?: string | string[];
  NotResource?: string | string[];
};

const examplePolicy = JSON.stringify(
  {
    Version: "2012-10-17",
    Statement: [
      {
        Sid: "AllowReadOnlyArtifactBucket",
        Effect: "Allow",
        Action: ["s3:GetObject", "s3:ListBucket"],
        Resource: [
          "arn:aws:s3:::opsforge-artifacts-prod/*",
          "arn:aws:s3:::opsforge-artifacts-prod",
        ],
        Condition: {
          Bool: {
            "aws:MultiFactorAuthPresent": "true",
          },
        },
      },
      {
        Sid: "AdminAccess",
        Effect: "Allow",
        Action: "*",
        Resource: "*",
        Principal: "*",
      },
      {
        Sid: "AllowEC2Describe",
        Effect: "Allow",
        Action: ["ec2:DescribeInstances", "ec2:DescribeImages"],
        Resource: "*",
      },
      {
        Sid: "AllowPassRoleForOnlyDeployRole",
        Effect: "Allow",
        Action: "iam:PassRole",
        Resource: "arn:aws:iam::123456789012:role/opsforge-deploy-role",
      },
      {
        Sid: "AllowAssumeRoleForOpsRole",
        Effect: "Allow",
        Action: "sts:AssumeRole",
        Resource: "arn:aws:iam::123456789012:role/opsforge-ops-role",
      },
      {
        Sid: "DenySensitiveDelete",
        Effect: "Deny",
        Action: ["s3:DeleteBucket", "iam:DeleteRole"],
        Resource: "*",
      },
    ],
  },
  null,
  2,
);

function toStringArray(value: unknown): string[] {
  if (typeof value === "string") {
    return [value];
  }

  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string");
  }

  return [];
}

type EffectKind = "allow" | "deny" | "unknown";

function getEffectKind(statement: Statement): EffectKind {
  const value = String(statement.Effect || "").trim().toLowerCase();
  if (value === "allow") return "allow";
  if (value === "deny") return "deny";
  return "unknown";
}

type ActionSpec = {
  mode: "include" | "exclude" | "both" | "none";
  actions: string[];
};

// Action and NotAction are opposites, not variants of the same thing: Action
// lists the exact API calls a statement applies to, while NotAction lists
// the calls it EXCLUDES — so under Allow it applies to every other action
// instead. Merging them into one array (as this analyzer previously did)
// makes `Allow + NotAction: "iam:*"` look like a narrow two-word allow list
// when it actually grants everything except IAM. They must stay separate.
function getActionSpec(statement: Statement): ActionSpec {
  const included = toStringArray(statement.Action);
  const excluded = toStringArray(statement.NotAction);

  if (included.length > 0 && excluded.length > 0) {
    // Not valid AWS policy grammar — a statement should use one or the
    // other. Surfaced as its own finding rather than guessed at below.
    return { mode: "both", actions: included };
  }
  if (included.length > 0) {
    return { mode: "include", actions: included };
  }
  if (excluded.length > 0) {
    return { mode: "exclude", actions: excluded };
  }
  return { mode: "none", actions: [] };
}

function hasAnyActionField(statement: Statement): boolean {
  return toStringArray(statement.Action).length > 0 || toStringArray(statement.NotAction).length > 0;
}

type ResourceSpec = {
  mode: "include" | "exclude" | "both" | "none";
  resources: string[];
};

// Resource and NotResource are opposites, mirroring Action/NotAction above:
// Resource lists the exact ARNs a statement applies to, while NotResource
// lists the ones it EXCLUDES — so under Allow it applies to every other
// resource instead. Treating NotResource as an ordinary scoped Resource list
// would make `Allow + NotResource: "arn:...:one-bucket/*"` look like a
// narrow single-resource grant when it actually grants access to every
// other resource in the account.
function getResourceSpec(statement: Statement): ResourceSpec {
  const included = toStringArray(statement.Resource);
  const excluded = toStringArray(statement.NotResource);

  if (included.length > 0 && excluded.length > 0) {
    // Not valid AWS policy grammar — a statement should use one or the
    // other. Left out of the wildcard-resource risk logic below rather
    // than guessed at, mirroring the Action/NotAction "both" handling.
    return { mode: "both", resources: included };
  }
  if (included.length > 0) {
    return { mode: "include", resources: included };
  }
  if (excluded.length > 0) {
    return { mode: "exclude", resources: excluded };
  }
  return { mode: "none", resources: [] };
}

function getResourceList(statement: Statement): string[] {
  return toStringArray(statement.Resource);
}

function hasAnyResourceField(statement: Statement): boolean {
  return toStringArray(statement.Resource).length > 0 || toStringArray(statement.NotResource).length > 0;
}

// Tracks which statements a risky pattern was found in, split by Effect. An
// Allow statement is a real grant; an explicit Deny using the same pattern
// is a restrictive guardrail and must never be reported as dangerous. A
// statement with a missing/invalid Effect is recorded on neither side —
// that ambiguity is already surfaced by the "Effect" check above, and this
// analyzer should not guess whether it behaves as Allow or Deny.
type EffectBucket = { allow: string[]; denyGuardrail: string[] };

function newBucket(): EffectBucket {
  return { allow: [], denyGuardrail: [] };
}

function recordEffect(bucket: EffectBucket, effect: EffectKind, sid: string) {
  if (effect === "allow") {
    bucket.allow.push(sid);
  } else if (effect === "deny") {
    bucket.denyGuardrail.push(sid);
  }
}

const HIGH_PRIVILEGE_ACTIONS = [
  "iam:*",
  "iam:attachuserpolicy",
  "iam:createuser",
  "iam:putusersharedpolicy",
  "iam:createpolicyversion",
  "iam:attachrolepolicy",
  "sts:*",
  "ec2:*",
  "kms:*",
  "s3:*",
];

function getStatements(policy: Record<string, unknown>): Statement[] {
  if (!policy || typeof policy !== "object") {
    return [];
  }

  const raw = policy.Statement;
  if (Array.isArray(raw)) {
    return raw.filter((item): item is Statement => !!item && typeof item === "object");
  }

  if (raw && typeof raw === "object") {
    return [raw as Statement];
  }

  return [];
}

function analyzePolicy(policyText: string): Finding[] {
  const findings: Finding[] = [];
  const trimmed = policyText.trim();

  if (!trimmed) {
    findings.push({
      title: "Empty input",
      severity: "CRITICAL",
      description: "No IAM policy JSON was provided.",
      recommendation: "Paste an IAM policy document to run a static security review.",
    });
    return findings;
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(trimmed) as Record<string, unknown>;
  } catch (_error) {
    findings.push({
      title: "JSON syntax",
      severity: "CRITICAL",
      description: "The policy is not valid JSON and could not be parsed.",
      recommendation: "Fix the JSON syntax, including quotes, commas, and braces before running analysis.",
    });
    return findings;
  }

  findings.push({
    title: "JSON syntax",
    severity: "PASS",
    description: "The policy JSON parsed successfully and can be reviewed statically.",
  });

  const version = parsed.Version;
  if (typeof version === "string" && version.trim()) {
    findings.push({
      title: "Policy Version",
      severity: "PASS",
      description: `The policy includes Version: "${version}".`,
    });
  } else {
    findings.push({
      title: "Policy Version",
      severity: "WARNING",
      description: "The policy does not define a Version value.",
      recommendation: 'Set Version to "2012-10-17" for a standard AWS IAM policy document.',
    });
  }

  const statements = getStatements(parsed);
  if (statements.length > 0) {
    findings.push({
      title: "Statement existence",
      severity: "PASS",
      description: `The policy includes ${statements.length} statement(s).`,
    });
  } else {
    findings.push({
      title: "Statement existence",
      severity: "CRITICAL",
      description: "No Statement block was found in the policy.",
      recommendation: "Add a Statement object or array with Effect, Action, and Resource information.",
    });
    return findings;
  }

  // getStatements() silently filters out non-object entries when Statement
  // is an array, so a corrupted entry (a stray string, null, etc.) would
  // otherwise be dropped from analysis with no indication anything was
  // excluded.
  const rawStatement = parsed.Statement;
  const malformedStatementCount = Array.isArray(rawStatement) ? rawStatement.length - statements.length : 0;
  if (malformedStatementCount > 0) {
    findings.push({
      title: "Malformed statement entries",
      severity: "WARNING",
      description: `${malformedStatementCount} entr${malformedStatementCount === 1 ? "y" : "ies"} in the Statement array were not valid statement objects and were excluded from analysis.`,
      recommendation: "Ensure every entry in the Statement array is a JSON object with Effect, Action, and Resource fields.",
    });
  }

  const missingEffect: string[] = [];
  const missingAction: string[] = [];
  const missingResource: string[] = [];
  const emptyStatements: string[] = [];

  statements.forEach((statement, index) => {
    const sid = statement.Sid || `Statement ${index + 1}`;
    if (!statement.Effect) {
      missingEffect.push(sid);
    }
    if (!hasAnyActionField(statement)) {
      missingAction.push(sid);
    }
    if (!hasAnyResourceField(statement)) {
      missingResource.push(sid);
    }
    if (!statement.Effect && !statement.Action && !statement.Resource && !statement.Principal) {
      emptyStatements.push(sid);
    }
  });

  if (missingEffect.length === 0) {
    findings.push({
      title: "Effect",
      severity: "PASS",
      description: "All statements define an explicit Effect value.",
    });
  } else {
    findings.push({
      title: "Effect",
      severity: "WARNING",
      description: `Some statements are missing Effect values: ${missingEffect.join(", ")}.`,
      recommendation: "Specify Allow or Deny for each statement to make the policy behavior explicit.",
    });
  }

  if (missingAction.length === 0) {
    findings.push({
      title: "Action",
      severity: "PASS",
      description: "All statements include one or more actions.",
    });
  } else {
    findings.push({
      title: "Action",
      severity: "WARNING",
      description: `Some statements do not declare actions: ${missingAction.join(", ")}.`,
      recommendation: "Define the AWS API action list explicitly so the permission scope is clear.",
    });
  }

  if (missingResource.length === 0) {
    findings.push({
      title: "Resource",
      severity: "PASS",
      description: "All statements include resource targets.",
    });
  } else {
    findings.push({
      title: "Resource",
      severity: "WARNING",
      description: `Some statements do not declare resources: ${missingResource.join(", ")}.`,
      recommendation: "Scope access to the exact resource ARNs or resource patterns required.",
    });
  }

  if (emptyStatements.length === 0) {
    findings.push({
      title: "Empty statements",
      severity: "PASS",
      description: "No empty policy statements were found.",
    });
  } else {
    findings.push({
      title: "Empty statements",
      severity: "WARNING",
      description: `The policy contains empty or incomplete statements: ${emptyStatements.join(", ")}.`,
      recommendation: "Remove or complete empty policy statements before deployment.",
    });
  }

  const principalClaims = newBucket();
  const denyStatements: string[] = [];
  const conditionStatements: string[] = [];
  const specificStrongPasses: string[] = [];
  const ambiguousActionNotAction: string[] = [];
  const notActionAllowGrants: { sid: string; excludedActions: string[]; resourceHasWildcard: boolean }[] = [];
  const notResourceAllowGrants: { sid: string; excludedResources: string[]; actionHasWildcard: boolean }[] = [];

  const wildcardAction = newBucket();
  const wildcardResource = newBucket();
  const broadPrivilegedActions = newBucket();
  const iamWildcard = newBucket();
  const stsWildcard = newBucket();
  const kmsWildcard = newBucket();
  const s3Wildcard = newBucket();
  const ec2Wildcard = newBucket();
  const passRole = newBucket();
  const assumeRole = newBucket();
  const sensitiveActionWithWildcardResource = newBucket();

  // Whether ANY Allow + iam:PassRole statement pairs the action with a
  // wildcard Resource — the actual privilege-escalation condition, tracked
  // directly from the resource fact rather than inferred from the Sid text.
  let passRoleAllowHasWildcardResource = false;

  statements.forEach((statement, index) => {
    const sid = statement.Sid || `Statement ${index + 1}`;
    const effect = getEffectKind(statement);
    const actionSpec = getActionSpec(statement);
    const resources = getResourceList(statement);
    const resourceSpec = getResourceSpec(statement);
    // Allow + NotResource grants every resource EXCEPT the ones listed, so
    // it is treated as broad/wildcard-equivalent for the same risk checks
    // that a literal Resource: "*" feeds (wildcard-resource, sensitive
    // action + broad resource, and PassRole). A statement combining both
    // Resource and NotResource is invalid AWS grammar and is intentionally
    // excluded from this, mirroring the Action/NotAction "both" handling.
    const resourceHasWildcard =
      resourceSpec.mode === "include" ? resourceSpec.resources.includes("*") : resourceSpec.mode === "exclude";
    const actionsLower = actionSpec.actions.map((action) => action.toLowerCase());

    if (statement.Principal && JSON.stringify(statement.Principal).includes("*")) {
      recordEffect(principalClaims, effect, sid);
    }

    if (effect === "deny") {
      denyStatements.push(sid);
    }

    if (statement.Condition) {
      conditionStatements.push(sid);
    }

    if (actionSpec.mode === "both") {
      ambiguousActionNotAction.push(sid);
    }

    // Resource "*" is a literal fact about the statement regardless of
    // whether Action or NotAction defines its action scope, so it is
    // tracked independent of actionSpec.mode below.
    if (resourceHasWildcard) {
      recordEffect(wildcardResource, effect, sid);
    }

    if (actionSpec.mode === "exclude" && effect === "allow") {
      // Allow + NotAction grants every action EXCEPT the ones listed — the
      // opposite of a narrow allow list — so it gets its own finding below
      // rather than being folded into the literal-Action checks.
      notActionAllowGrants.push({ sid, excludedActions: actionSpec.actions, resourceHasWildcard });
    }
    // Deny + NotAction denies every action except the ones listed. That is
    // not a permission grant, so it is intentionally left out of every risk
    // bucket below rather than guessed at.

    if (resourceSpec.mode === "exclude" && effect === "allow") {
      // Allow + NotResource grants every resource EXCEPT the ones listed —
      // the opposite of a narrow resource scope — so it gets its own
      // finding below rather than being folded into the literal-Resource
      // checks.
      notResourceAllowGrants.push({
        sid,
        excludedResources: resourceSpec.resources,
        actionHasWildcard: actionSpec.mode === "include" && actionsLower.includes("*"),
      });
    }
    // Deny + NotResource denies every resource except the ones listed. That
    // is not a permission grant, so it is intentionally left out of every
    // risk bucket below rather than guessed at.

    if (actionSpec.mode === "include") {
      if (actionsLower.includes("*")) {
        recordEffect(wildcardAction, effect, sid);
      }

      if (actionsLower.some((action) => action === "iam:*" || action === "iam")) {
        recordEffect(iamWildcard, effect, sid);
      }
      if (actionsLower.some((action) => action === "sts:*" || action === "sts")) {
        recordEffect(stsWildcard, effect, sid);
      }
      if (actionsLower.some((action) => action === "kms:*" || action === "kms")) {
        recordEffect(kmsWildcard, effect, sid);
      }
      if (actionsLower.some((action) => action === "s3:*" || action === "s3")) {
        recordEffect(s3Wildcard, effect, sid);
      }
      if (actionsLower.some((action) => action === "ec2:*" || action === "ec2")) {
        recordEffect(ec2Wildcard, effect, sid);
      }

      if (actionsLower.some((action) => action === "iam:passrole")) {
        recordEffect(passRole, effect, sid);
        if (effect === "allow" && resourceHasWildcard) {
          passRoleAllowHasWildcardResource = true;
        }
      }

      if (actionsLower.some((action) => action === "sts:assumerole")) {
        recordEffect(assumeRole, effect, sid);
      }

      const isHighPrivilege = actionsLower.some((action) => HIGH_PRIVILEGE_ACTIONS.includes(action));
      if (isHighPrivilege) {
        recordEffect(broadPrivilegedActions, effect, sid);

        if (resourceHasWildcard) {
          recordEffect(sensitiveActionWithWildcardResource, effect, sid);
        }
      }

      if (
        actionSpec.actions.length > 0 &&
        resources.length > 0 &&
        actionSpec.actions.every((action) => action.includes(":") && !action.includes("*"))
      ) {
        specificStrongPasses.push(sid);
      }
    }
  });

  if (principalClaims.allow.length > 0) {
    findings.push({
      title: "Principal",
      severity: "CRITICAL",
      description: `Wildcard or public principals were detected in: ${principalClaims.allow.join(", ")}.`,
      recommendation: 'Avoid "*" principal values unless there is a clear and approved public-access design. Restrict principals to trusted identities or roles.',
    });
  } else if (principalClaims.denyGuardrail.length > 0) {
    findings.push({
      title: "Principal",
      severity: "PASS",
      description: `Wildcard or public principal(s) appear only in explicit Deny statement(s) (${principalClaims.denyGuardrail.join(", ")}), which restricts access rather than granting it.`,
    });
  } else {
    findings.push({
      title: "Principal",
      severity: "PASS",
      description: "The policy does not appear to use a public wildcard principal.",
    });
  }

  if (ambiguousActionNotAction.length > 0) {
    findings.push({
      title: "Action and NotAction combined",
      severity: "WARNING",
      description: `Statement(s) ${ambiguousActionNotAction.join(", ")} define both Action and NotAction, which AWS treats as invalid. This analyzer evaluated only the Action list for these statements and did not infer further meaning from the combination.`,
      recommendation: "Use either Action or NotAction in a statement, never both, so its permission scope is unambiguous.",
    });
  } else {
    findings.push({
      title: "Action and NotAction combined",
      severity: "PASS",
      description: "No statements combine Action and NotAction in a single statement.",
    });
  }

  if (wildcardAction.allow.length > 0) {
    findings.push({
      title: "Wildcard Action: \"*\"",
      severity: "CRITICAL",
      description: `Allow statement(s) grant Action "*" (every AWS API action): ${wildcardAction.allow.join(", ")}.`,
      recommendation: "Replace wildcard actions with the exact AWS API calls required for the workload.",
    });
  } else if (wildcardAction.denyGuardrail.length > 0) {
    findings.push({
      title: "Wildcard Action: \"*\"",
      severity: "PASS",
      description: `Action "*" appears only in explicit Deny statement(s) (${wildcardAction.denyGuardrail.join(", ")}), which restricts access rather than granting it.`,
    });
  } else {
    findings.push({
      title: "Wildcard Action: \"*\"",
      severity: "PASS",
      description: "The policy does not rely on broad wildcard actions.",
    });
  }

  if (notActionAllowGrants.length > 0) {
    const grantHasWildcardResource = notActionAllowGrants.some((grant) => grant.resourceHasWildcard);
    const details = notActionAllowGrants
      .map((grant) => `${grant.sid} (excludes ${grant.excludedActions.join(", ") || "no actions"})`)
      .join("; ");
    findings.push({
      title: "NotAction broad permission scope",
      severity: grantHasWildcardResource ? "CRITICAL" : "WARNING",
      description: `Allow statement(s) use NotAction, which grants every action EXCEPT the ones listed rather than only those actions: ${details}.`,
      recommendation: "Prefer an explicit Action allow-list over NotAction. If NotAction is required, scope Resource narrowly and add Conditions — never combine an Allow + NotAction statement with Resource \"*\".",
    });
  } else {
    findings.push({
      title: "NotAction broad permission scope",
      severity: "PASS",
      description: "No Allow statements use NotAction to implicitly grant a broad set of actions.",
    });
  }

  if (wildcardResource.allow.length > 0) {
    findings.push({
      title: "Wildcard Resource: \"*\"",
      severity: "CRITICAL",
      description: `Wildcard resources were detected in Allow statement(s): ${wildcardResource.allow.join(", ")}.`,
      recommendation: "Scope Resource to exact ARNs whenever possible to reduce blast radius.",
    });
  } else if (wildcardResource.denyGuardrail.length > 0) {
    findings.push({
      title: "Wildcard Resource: \"*\"",
      severity: "PASS",
      description: `Resource "*" appears only in explicit Deny statement(s) (${wildcardResource.denyGuardrail.join(", ")}), which restricts access rather than granting it.`,
    });
  } else {
    findings.push({
      title: "Wildcard Resource: \"*\"",
      severity: "PASS",
      description: "The policy scopes access to specific resource paths instead of all resources.",
    });
  }

  if (notResourceAllowGrants.length > 0) {
    const grantHasWildcardAction = notResourceAllowGrants.some((grant) => grant.actionHasWildcard);
    const details = notResourceAllowGrants
      .map((grant) => `${grant.sid} (excludes ${grant.excludedResources.join(", ") || "no resources"})`)
      .join("; ");
    findings.push({
      title: "NotResource broad permission scope",
      severity: grantHasWildcardAction ? "CRITICAL" : "WARNING",
      description: `Allow statement(s) use NotResource, which grants access to every resource EXCEPT the ones listed rather than only those resources: ${details}.`,
      recommendation: "Prefer an explicit Resource allow-list over NotResource. If NotResource is required, scope Action narrowly and add Conditions — never combine an Allow + NotResource statement with Action \"*\".",
    });
  } else {
    findings.push({
      title: "NotResource broad permission scope",
      severity: "PASS",
      description: "No Allow statements use NotResource to implicitly grant access to a broad set of resources.",
    });
  }

  if (broadPrivilegedActions.allow.length > 0) {
    findings.push({
      title: "AdministratorAccess-like permissions",
      severity: "CRITICAL",
      description: `The policy contains broad administrative or service-wide permissions in Allow statement(s): ${broadPrivilegedActions.allow.join(", ")}.`,
      recommendation: "Restrict the policy to the smallest necessary action set and minimize administrative access.",
    });
  } else if (broadPrivilegedActions.denyGuardrail.length > 0) {
    findings.push({
      title: "AdministratorAccess-like permissions",
      severity: "PASS",
      description: `Broad administrative actions appear only in explicit Deny statement(s) (${broadPrivilegedActions.denyGuardrail.join(", ")}), which is a restrictive guardrail rather than a grant.`,
    });
  } else {
    findings.push({
      title: "AdministratorAccess-like permissions",
      severity: "PASS",
      description: "No administrator-like permission pattern was identified.",
    });
  }

  if (iamWildcard.allow.length > 0) {
    findings.push({
      title: "iam:* permissions",
      severity: "CRITICAL",
      description: `iam:* access was found in Allow statement(s): ${iamWildcard.allow.join(", ")}.`,
      recommendation: "Avoid iam:* unless the role truly needs full IAM administration, which is uncommon in production.",
    });
  } else if (iamWildcard.denyGuardrail.length > 0) {
    findings.push({
      title: "iam:* permissions",
      severity: "PASS",
      description: `iam:* appears only in explicit Deny statement(s) (${iamWildcard.denyGuardrail.join(", ")}), which blocks this access rather than granting it.`,
    });
  } else {
    findings.push({
      title: "iam:* permissions",
      severity: "PASS",
      description: "No iam:* permissions were detected.",
    });
  }

  if (stsWildcard.allow.length > 0) {
    findings.push({
      title: "sts:* permissions",
      severity: "WARNING",
      description: `sts:* was detected in Allow statement(s): ${stsWildcard.allow.join(", ")}.`,
      recommendation: "Limit STS assumptions to the specific roles required by your workload.",
    });
  } else if (stsWildcard.denyGuardrail.length > 0) {
    findings.push({
      title: "sts:* permissions",
      severity: "PASS",
      description: `sts:* appears only in explicit Deny statement(s) (${stsWildcard.denyGuardrail.join(", ")}), which blocks this access rather than granting it.`,
    });
  } else {
    findings.push({
      title: "sts:* permissions",
      severity: "PASS",
      description: "No STS wildcard permissions were found.",
    });
  }

  if (kmsWildcard.allow.length > 0) {
    findings.push({
      title: "kms:* permissions",
      severity: "WARNING",
      description: `kms:* access was found in Allow statement(s): ${kmsWildcard.allow.join(", ")}.`,
      recommendation: "Limit KMS access to the specific key ARNs needed for encryption and decryption.",
    });
  } else if (kmsWildcard.denyGuardrail.length > 0) {
    findings.push({
      title: "kms:* permissions",
      severity: "PASS",
      description: `kms:* appears only in explicit Deny statement(s) (${kmsWildcard.denyGuardrail.join(", ")}), which blocks this access rather than granting it.`,
    });
  } else {
    findings.push({
      title: "kms:* permissions",
      severity: "PASS",
      description: "No KMS wildcard permissions were detected.",
    });
  }

  if (s3Wildcard.allow.length > 0) {
    findings.push({
      title: "s3:* permissions",
      severity: "WARNING",
      description: `s3:* access was found in Allow statement(s): ${s3Wildcard.allow.join(", ")}.`,
      recommendation: "Prefer specific S3 actions such as GetObject, PutObject, or ListBucket rather than broad S3:* access.",
    });
  } else if (s3Wildcard.denyGuardrail.length > 0) {
    findings.push({
      title: "s3:* permissions",
      severity: "PASS",
      description: `s3:* appears only in explicit Deny statement(s) (${s3Wildcard.denyGuardrail.join(", ")}), which blocks this access rather than granting it.`,
    });
  } else {
    findings.push({
      title: "s3:* permissions",
      severity: "PASS",
      description: "No broad S3 wildcard permissions were found.",
    });
  }

  if (ec2Wildcard.allow.length > 0) {
    findings.push({
      title: "ec2:* permissions",
      severity: "WARNING",
      description: `ec2:* access was found in Allow statement(s): ${ec2Wildcard.allow.join(", ")}.`,
      recommendation: "Use the smallest set of EC2 actions required for the workload, and avoid generic administrative permissions.",
    });
  } else if (ec2Wildcard.denyGuardrail.length > 0) {
    findings.push({
      title: "ec2:* permissions",
      severity: "PASS",
      description: `ec2:* appears only in explicit Deny statement(s) (${ec2Wildcard.denyGuardrail.join(", ")}), which blocks this access rather than granting it.`,
    });
  } else {
    findings.push({
      title: "ec2:* permissions",
      severity: "PASS",
      description: "No broad EC2 wildcard permissions were detected.",
    });
  }

  if (passRole.allow.length > 0) {
    findings.push({
      title: "PassRole permission",
      severity: passRoleAllowHasWildcardResource ? "CRITICAL" : "WARNING",
      description: `iam:PassRole appears in Allow statement(s): ${passRole.allow.join(", ")}.`,
      recommendation: "Limit PassRole to the exact role ARNs required, and do not permit a broad resource wildcard for it.",
    });
  } else if (passRole.denyGuardrail.length > 0) {
    findings.push({
      title: "PassRole permission",
      severity: "PASS",
      description: `iam:PassRole appears only in explicit Deny statement(s) (${passRole.denyGuardrail.join(", ")}), which blocks this access rather than granting it.`,
    });
  } else {
    findings.push({
      title: "PassRole permission",
      severity: "PASS",
      description: "No iam:PassRole permissions were found.",
    });
  }

  if (assumeRole.allow.length > 0) {
    findings.push({
      title: "AssumeRole permission",
      severity: "WARNING",
      description: `sts:AssumeRole is present in Allow statement(s): ${assumeRole.allow.join(", ")}.`,
      recommendation: "Temporarily or permanently restrict AssumeRole to trusted roles and avoid broad trust patterns.",
    });
  } else if (assumeRole.denyGuardrail.length > 0) {
    findings.push({
      title: "AssumeRole permission",
      severity: "PASS",
      description: `sts:AssumeRole appears only in explicit Deny statement(s) (${assumeRole.denyGuardrail.join(", ")}), which blocks this access rather than granting it.`,
    });
  } else {
    findings.push({
      title: "AssumeRole permission",
      severity: "PASS",
      description: "No sts:AssumeRole permissions were detected.",
    });
  }

  if (sensitiveActionWithWildcardResource.allow.length > 0) {
    findings.push({
      title: "Sensitive actions combined with Resource \"*\"",
      severity: "CRITICAL",
      description: `High-impact actions are combined with wildcard resources in Allow statement(s), creating an especially risky access pattern: ${sensitiveActionWithWildcardResource.allow.join(", ")}.`,
      recommendation: "Limit privileged actions to specific resource ARNs and avoid Resource '*' for IAM, STS, KMS, and S3 operations.",
    });
  } else if (sensitiveActionWithWildcardResource.denyGuardrail.length > 0) {
    findings.push({
      title: "Sensitive actions combined with Resource \"*\"",
      severity: "PASS",
      description: `High-impact actions combined with Resource "*" appear only in explicit Deny statement(s) (${sensitiveActionWithWildcardResource.denyGuardrail.join(", ")}), which restricts access rather than granting it.`,
    });
  } else {
    findings.push({
      title: "Sensitive actions combined with Resource \"*\"",
      severity: "PASS",
      description: "Privileged actions are not obviously paired with wildcard resources in the policy.",
    });
  }

  if (denyStatements.length > 0) {
    findings.push({
      title: "Explicit Deny statements",
      severity: "PASS",
      description: `Explicit deny rules are present in ${denyStatements.join(", ")}.`,
    });
  } else {
    findings.push({
      title: "Explicit Deny statements",
      severity: "WARNING",
      description: "No explicit Deny statements were detected.",
      recommendation: "Consider adding Deny rules for operations that must be blocked regardless of other allows.",
    });
  }

  if (conditionStatements.length > 0) {
    findings.push({
      title: "Conditions configured",
      severity: "PASS",
      description: "The policy includes Conditions that can restrict access by MFA, IP, VPC, or other context.",
    });
  } else {
    findings.push({
      title: "Conditions configured",
      severity: "WARNING",
      description: "No policy conditions were detected for the statements reviewed.",
      recommendation: "Add conditions such as aws:MultiFactorAuthPresent or aws:SourceIp where appropriate to reduce risk.",
    });
  }

  if (specificStrongPasses.length > 0) {
    findings.push({
      title: "Resource-level permissions where possible",
      severity: "PASS",
      description: `The policy scopes permissions to specific actions and resource types in ${specificStrongPasses.join(", ")}.`,
    });
  } else {
    findings.push({
      title: "Resource-level permissions where possible",
      severity: "WARNING",
      description: "The policy does not clearly show resource-level scoping in all statements.",
      recommendation: "Prefer specific ARNs or resource patterns over broad resource wildcards when the access pattern allows it.",
    });
  }

  findings.push({
    title: "Multiple statements",
    severity: statements.length > 1 ? "PASS" : "WARNING",
    description:
      statements.length > 1
        ? `The policy contains ${statements.length} statements, which is a normal pattern for separating access scopes.`
        : "The policy contains only one statement, which may be fine, but it reduces the ability to separate access by purpose.",
  });

  return findings;
}

export default function AwsIamAnalyzerPage() {
  const [input, setInput] = useState(examplePolicy);
  const [results, setResults] = useState<Finding[]>(() => analyzePolicy(examplePolicy));

  const summary = useMemo(
    () => ({
      PASS: results.filter((item) => item.severity === "PASS").length,
      WARNING: results.filter((item) => item.severity === "WARNING").length,
      CRITICAL: results.filter((item) => item.severity === "CRITICAL").length,
    }),
    [results],
  );

  const handleAnalyze = () => {
    setResults(analyzePolicy(input));
  };

  const handleClear = () => {
    setInput("");
    setResults([]);
  };

  const handleLoadExample = () => {
    setInput(examplePolicy);
    setResults(analyzePolicy(examplePolicy));
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="mb-8 rounded-2xl border border-zinc-800 bg-zinc-900/80 p-6 shadow-xl shadow-zinc-950/40">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-cyan-400">OpsForge</p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.3fr_0.7fr]">
          <section className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-4 shadow-xl shadow-zinc-950/40">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-white">IAM policy JSON</h2>
            </div>

            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              spellCheck={false}
              aria-label="AWS IAM policy JSON input"
              className="h-[460px] w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 font-mono text-sm text-zinc-200 outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/30"
              placeholder="Paste an AWS IAM policy JSON document here..."
            />

            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={handleLoadExample}
                className="rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2.5 text-sm font-medium text-zinc-300 transition hover:border-cyan-500 hover:text-cyan-300"
              >
                Load example
              </button>
              <button
                type="button"
                onClick={handleAnalyze}
                className="rounded-lg bg-cyan-500 px-4 py-2.5 text-sm font-semibold text-zinc-950 transition hover:bg-cyan-400"
              >
                Analyze Policy
              </button>
              <button
                type="button"
                onClick={handleClear}
                className="rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2.5 text-sm font-medium text-zinc-300 transition hover:border-zinc-500 hover:text-white"
              >
                Clear
              </button>
            </div>
          </section>

          <aside className="space-y-4">
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5 shadow-xl shadow-zinc-950/40">
              <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.2em] text-zinc-500">Summary</h2>
              <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
                {[
                  { label: "PASSED", value: summary.PASS, badge: "text-emerald-400", border: "border-emerald-500/30", bg: "bg-emerald-500/10" },
                  { label: "WARNINGS", value: summary.WARNING, badge: "text-amber-400", border: "border-amber-500/30", bg: "bg-amber-500/10" },
                  { label: "CRITICAL", value: summary.CRITICAL, badge: "text-red-400", border: "border-red-500/30", bg: "bg-red-500/10" },
                ].map((item) => (
                  <div key={item.label} className={`rounded-xl border p-4 ${item.border} ${item.bg}`}>
                    <div className={`text-xs font-semibold uppercase tracking-[0.2em] ${item.badge}`}>
                      {item.label}
                    </div>
                    <div className="mt-2 text-3xl font-bold text-white">{item.value}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5 shadow-xl shadow-zinc-950/40">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.2em] text-zinc-500">Quick checks</h2>
              <ul className="space-y-2 text-sm text-zinc-400">
                <li>• Avoid wildcard Action and Resource values unless explicitly required.</li>
                <li>• Prefer scoped IAM actions and exact ARNs.</li>
                <li>• Require MFA, IP, or VPC conditions for sensitive operations.</li>
                <li>• Review PassRole and AssumeRole access carefully.</li>
              </ul>
            </div>
          </aside>
        </div>

        <section className="mt-8 rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5 shadow-xl shadow-zinc-950/40">
          <div className="mb-5 flex items-center justify-between gap-3">
            <h2 className="text-xl font-semibold text-white">Detailed findings</h2>
          </div>

          {results.length === 0 ? (
            <div className="rounded-xl border border-dashed border-zinc-700 bg-zinc-950/40 p-6 text-sm text-zinc-500">
              Run the analyzer to review the policy findings.
            </div>
          ) : (
            <div className="grid gap-4">
              {results.map((finding, index) => (
                <div key={`${finding.title}-${index}`} className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="text-base font-semibold text-white">{finding.title}</div>
                    <span
                      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.2em] ${
                        finding.severity === "PASS"
                          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                          : finding.severity === "WARNING"
                            ? "border-amber-500/30 bg-amber-500/10 text-amber-300"
                            : "border-red-500/30 bg-red-500/10 text-red-300"
                      }`}
                    >
                      {finding.severity}
                    </span>
                  </div>

                  <p className="mt-3 text-sm leading-6 text-zinc-400 break-words">{finding.description}</p>

                  {finding.recommendation ? (
                    <p className="mt-3 rounded-lg border border-zinc-700 bg-zinc-900/60 p-3 text-sm text-cyan-200">
                      <span className="font-semibold text-cyan-300">Recommendation:</span> {finding.recommendation}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </section>

        <div className="mt-6 rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-4 text-sm text-cyan-100">
          This analyzer performs static policy checks only. Validate IAM policies against your organization's security requirements before deployment.
        </div>
      </div>
    </div>
  );
}
