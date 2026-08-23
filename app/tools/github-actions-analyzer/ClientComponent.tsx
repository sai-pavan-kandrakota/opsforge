"use client";

import { useMemo, useState } from "react";
import * as yaml from "js-yaml";


type Severity = "PASS" | "WARNING" | "CRITICAL";

type Finding = {
  title: string;
  severity: Severity;
  description: string;
  recommendation?: string;
};

type WorkflowDocument = {
  name?: string;
  on?: unknown;
  jobs?: Record<string, unknown>;
  permissions?: unknown;
  env?: Record<string, unknown>;
};

const exampleWorkflow = `name: CI/CD Pipeline

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  id-token: write

jobs:
  build:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    permissions:
      contents: read
      packages: write
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Build
        run: npm run build

      - name: Upload artifact
        uses: actions/upload-artifact@v4
        with:
          name: build-output
          path: dist/

  test:
    needs: build
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Run tests
        run: npm test -- --runInBand

  deploy:
    needs: test
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    timeout-minutes: 10
    environment: production
    permissions:
      contents: read
      id-token: write
    steps:
      - name: Deploy to production
        env:
          TOKEN: \${{ secrets.PROD_TOKEN }}
        run: echo "Deploying with $TOKEN"

  security-scan:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    permissions:
      contents: read
      security-events: write
    steps:
      - name: Check out code
        uses: actions/checkout@main

      - name: Run Trivy
        uses: aquasecurity/trivy-action@v0.20.0

      - name: Log secrets
        run: echo "AWS_SECRET_ACCESS_KEY=\${{ secrets.AWS_SECRET_ACCESS_KEY }}"`;

function parseWorkflowYaml(yamlText: string): WorkflowDocument | null {
  const trimmed = yamlText.trim();

  if (!trimmed) {
    return null;
  }

  try {
    const parsed = yaml.load(trimmed) as WorkflowDocument | undefined;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch (_error) {
    return null;
  }
}

// Returns `rawYaml` with `#` line comments removed, treating single- and
// double-quoted string content as opaque so a `#` inside a quoted value
// (e.g. a URL fragment) is never mistaken for a comment start. Scoped only
// for use by the hardcoded-secret detection below - this does not affect
// how the rest of analyzeGitHubActionsWorkflow parses or reads the workflow.
function stripYamlComments(rawYaml: string): string {
  let result = "";
  let index = 0;

  while (index < rawYaml.length) {
    const char = rawYaml[index];

    if (char === '"' || char === "'") {
      const quote = char;
      let end = index + 1;

      while (end < rawYaml.length) {
        if (quote === '"' && rawYaml[end] === "\\") {
          end += 2;
          continue;
        }
        if (rawYaml[end] === quote) {
          if (quote === "'" && rawYaml[end + 1] === "'") {
            end += 2;
            continue;
          }
          end += 1;
          break;
        }
        end += 1;
      }

      result += rawYaml.slice(index, end);
      index = end;
      continue;
    }

    if (char === "#") {
      const newlineIndex = rawYaml.indexOf("\n", index);
      if (newlineIndex === -1) {
        break;
      }
      index = newlineIndex;
      continue;
    }

    result += char;
    index += 1;
  }

  return result;
}

function analyzeGitHubActionsWorkflow(rawYaml: string): Finding[] {
  rawYaml = rawYaml || "";

  const findings: Finding[] = [];
  const trimmed = rawYaml.trim();

  if (!trimmed) {
    findings.push({
      title: "Empty workflow input",
      severity: "CRITICAL",
      description: "No workflow YAML was provided.",
      recommendation: "Paste a GitHub Actions workflow before running the analyzer.",
    });
    return findings;
  }

  const parsed = parseWorkflowYaml(rawYaml);
  if (!parsed) {
    findings.push({
      title: "YAML syntax invalid",
      severity: "CRITICAL",
      description: "The workflow YAML could not be parsed. Check for invalid indentation or malformed syntax.",
      recommendation: "Validate the YAML structure and ensure keys, colons, lists, and indentation are correct.",
    });
    return findings;
  }

  const workflowName = typeof parsed.name === "string" ? parsed.name.trim() : "";
  if (workflowName) {
    findings.push({
      title: "Workflow name configured",
      severity: "PASS",
      description: `The workflow name is set to "${workflowName}".`,
    });
  } else {
    findings.push({
      title: "Workflow name missing",
      severity: "WARNING",
      description: "This workflow does not define a name attribute.",
      recommendation: "Add a clear name so CI/CD runs are easier to identify in GitHub Actions UI.",
    });
  }

  const triggerConfig = parsed.on;
  if (triggerConfig && typeof triggerConfig === "object") {
    const triggerKeys = Object.keys(triggerConfig as Record<string, unknown>);
    if (triggerKeys.length > 0) {
      findings.push({
        title: "Workflow triggers configured",
        severity: "PASS",
        description: `The workflow defines triggers: ${triggerKeys.join(", ")}.`,
      });
    } else {
      findings.push({
        title: "No triggers detected",
        severity: "WARNING",
        description: "The workflow does not define any trigger configuration.",
        recommendation: "Define explicit triggers such as push, pull_request, or workflow_dispatch.",
      });
    }
  } else {
    findings.push({
      title: "Workflow triggers missing",
      severity: "WARNING",
      description: "No on: block was found for this workflow.",
      recommendation: "Add a valid on: configuration to ensure the workflow runs when expected.",
    });
  }

  const jobs = parsed.jobs && typeof parsed.jobs === "object" ? (parsed.jobs as Record<string, unknown>) : {};

  if (Object.keys(jobs).length > 0) {
    findings.push({
      title: "Jobs configured",
      severity: "PASS",
      description: `The workflow declares ${Object.keys(jobs).length} job(s).`,
    });
  } else {
    findings.push({
      title: "No jobs found",
      severity: "CRITICAL",
      description: "The workflow does not contain any jobs.",
      recommendation: "Add at least one job so the workflow can perform actions or checks.",
    });
  }

  const jobsArray = Object.entries(jobs);
  const missingTimeoutJobs: string[] = [];
  const jobsMissingDependencies: string[] = [];
  const jobsWithEnvironment: string[] = [];
  const selfHostedJobs: string[] = [];

  jobsArray.forEach(([jobName, jobConfig]) => {
    const jobObject = jobConfig && typeof jobConfig === "object" ? (jobConfig as Record<string, unknown>) : {};
    const timeoutMinutes = jobObject["timeout-minutes"];

    if (typeof timeoutMinutes !== "number" && typeof timeoutMinutes !== "string") {
      missingTimeoutJobs.push(jobName);
    }

    const needs = jobObject.needs;
    if (typeof needs === "undefined" && /deploy|release|production/i.test(jobName)) {
      jobsMissingDependencies.push(jobName);
    }

    if (jobObject.environment) {
      jobsWithEnvironment.push(jobName);
    }

    const runsOn = jobObject["runs-on"];
    if (typeof runsOn === "string" && runsOn.toLowerCase().includes("self-hosted")) {
      selfHostedJobs.push(jobName);
    }
  });

  if (missingTimeoutJobs.length === 0) {
    findings.push({
      title: "Job timeout configuration present",
      severity: "PASS",
      description: "All jobs define a timeout-minutes value.",
    });
  } else {
    findings.push({
      title: "Jobs missing timeout-minutes",
      severity: "WARNING",
      description: `The following jobs do not define timeout-minutes: ${missingTimeoutJobs.join(", ")}.`,
      recommendation: "Add timeout-minutes to long-running or production jobs to avoid hung workflows.",
    });
  }

  if (jobsMissingDependencies.length === 0) {
    findings.push({
      title: "Deployment sequencing appears reasonable",
      severity: "PASS",
      description: "No obvious deployment jobs are missing sequencing dependencies.",
    });
  } else {
    findings.push({
      title: "Deployment jobs may be missing needs",
      severity: "WARNING",
      description: `Workflow names indicate deployment-related jobs without explicit dependencies: ${jobsMissingDependencies.join(", ")}.`,
      recommendation: "Use needs: to ensure deployment jobs wait for tests, security checks, or artifact creation.",
    });
  }

  if (selfHostedJobs.length === 0) {
    findings.push({
      title: "No self-hosted runner usage detected",
      severity: "PASS",
      description: "The workflow does not appear to use self-hosted runners.",
    });
  } else {
    findings.push({
      title: "Self-hosted runners in use",
      severity: "WARNING",
      description: `The workflow uses self-hosted runners for: ${selfHostedJobs.join(", ")}.`,
      recommendation: "Review runner hardening, patching, and access boundaries when using self-hosted infrastructure.",
    });
  }

  const concurrencyValue = (parsed as Record<string, unknown>).concurrency;
  if (concurrencyValue) {
    findings.push({
      title: "Concurrency controls configured",
      severity: "PASS",
      description: "The workflow defines concurrency controls to limit overlapping runs.",
    });
  } else {
    findings.push({
      title: "Concurrency not configured",
      severity: "WARNING",
      description: "This workflow does not define concurrency controls.",
      recommendation: "Add concurrency to prevent duplicate deployments or overlapping CI runs on the same branch.",
    });
  }

  const rawPermissions = parsed.permissions;
  const permissionsValue = rawPermissions && typeof rawPermissions === "object" ? rawPermissions as Record<string, unknown> : {};
  const permissionKeys = Object.keys(permissionsValue);

  if (permissionKeys.length > 0) {
    const highPrivilege = Object.entries(permissionsValue).some(([name, value]) => {
      const textValue = String(value).toLowerCase();
      return ["write", "admin", "readwrite"].includes(textValue) && !["contents", "id-token", "security-events"].includes(name);
    });

    if (highPrivilege) {
      findings.push({
        title: "Workflow permissions are broad",
        severity: "WARNING",
        description: "The workflow requests elevated permissions beyond the minimum needed.",
        recommendation: "Scope permissions to the minimum required for the job and prefer read-only defaults.",
      });
    } else {
      findings.push({
        title: "Permissions scoped appropriately",
        severity: "PASS",
        description: "Permissions are explicitly set and not obviously excessive.",
      });
    }
  } else {
    findings.push({
      title: "Permissions configuration missing",
      severity: "WARNING",
      description: "No workflow-level permissions were detected.",
      recommendation: "Set explicit permissions to reduce accidental privilege escalation in CI/CD jobs.",
    });
  }

  const workflowPermissionsText = JSON.stringify(rawPermissions ?? {});
  const hasGitHubSecrets = /secrets\.[A-Z0-9_]+/i.test(rawYaml);
  if (hasGitHubSecrets) {
    findings.push({
      title: "Secrets are used",
      severity: "PASS",
      description: "The workflow references GitHub Actions secrets from the environment.",
    });
  } else {
    findings.push({
      title: "Secrets not obviously used",
      severity: "WARNING",
      description: "No GitHub Actions secret references were detected in the workflow.",
      recommendation: "Use secrets for credentials, tokens, and other sensitive values instead of embedding them in the workflow itself.",
    });
  }

  const hardcodedSecretPattern =
    /(?:password\s*[:=]\s*["'][^"']+["']|token\s*[:=]\s*["'][^"']+["']|secret\s*[:=]\s*["'][^"']+["']|\$\{\{\s*secrets\.[A-Z0-9_]+\s*\}\}|(?:AWS_SECRET_ACCESS_KEY|GITHUB_TOKEN)\b\s*[:=][^\n]*|ghp_[A-Za-z0-9]+)/gi;
  const secretDetectionText = stripYamlComments(rawYaml);
  const hardcodedSecretHits = (secretDetectionText.match(hardcodedSecretPattern) || []).filter(
    (hit) =>
      !/^\$\{\{\s*secrets\.[A-Z0-9_]+\s*\}\}$/i.test(hit) &&
      !(/^(?:AWS_SECRET_ACCESS_KEY|GITHUB_TOKEN)\b/i.test(hit) && /secrets\.[A-Z0-9_]+/i.test(hit))
  );
  const suspiciousSecretInRun = /echo\s+["'].*(?:password|secret|token|key)=/i.test(secretDetectionText);

  if (hardcodedSecretHits.length > 0) {
    findings.push({
      title: "Hardcoded credentials or secrets detected",
      severity: "CRITICAL",
      description: "The workflow contains literal secrets or credential-like values.",
      recommendation: "Remove inline credentials and replace them with GitHub secrets or environment-based credentials.",
    });
  } else if (suspiciousSecretInRun) {
    findings.push({
      title: "Sensitive values may be exposed in shell output",
      severity: "CRITICAL",
      description: "The workflow appears to print secret-like values into logs.",
      recommendation: "Avoid echoing tokens or secrets to stdout. Use masked or redacted secret handling instead.",
    });
  } else {
    findings.push({
      title: "No obvious hardcoded secret pattern detected",
      severity: "PASS",
      description: "The workflow does not appear to bake raw secrets into script output or environment values.",
    });
  }

  const pullRequestJobs = jobsArray.filter(([_, job]) => {
    const jobObject = job && typeof job === "object" ? (job as Record<string, unknown>) : {};
    const jobIf = typeof jobObject.if === "string" ? jobObject.if : "";
    return jobIf.toLowerCase().includes("pull_request") || jobObject["if"] === "github.event_name == 'pull_request'";
  });

  const dangerousPrWrite = jobsArray.filter(([jobName, job]) => {
    const jobObject = job && typeof job === "object" ? (job as Record<string, unknown>) : {};
    const permissions = jobObject.permissions && typeof jobObject.permissions === "object" ? (jobObject.permissions as Record<string, unknown>) : {};
    const permissionValues = Object.values(permissions);
    return permissionValues.some((value) => String(value).toLowerCase() === "write") && /pull_request|pr/i.test(jobName);
  });

  if (pullRequestJobs.length > 0 && dangerousPrWrite.length > 0) {
    findings.push({
      title: "pull_request jobs with write permissions",
      severity: "CRITICAL",
      description: "A pull_request workflow appears to allow write permissions, which can create unsafe execution paths.",
      recommendation: "Prefer read-only permissions for pull_request workflows and validate third-party code before granting write access.",
    });
  } else if (pullRequestJobs.length > 0) {
    findings.push({
      title: "pull_request workflow permissions appear constrained",
      severity: "PASS",
      description: "The pull_request workflow does not obviously request dangerous write permissions.",
    });
  } else {
    findings.push({
      title: "No pull_request write-pattern detected",
      severity: "PASS",
      description: "The workflow does not appear to match the risky pull_request write pattern.",
    });
  }

  const usesPullRequestTarget = /pull_request_target/i.test(rawYaml);
  if (usesPullRequestTarget) {
    findings.push({
      title: "pull_request_target is used",
      severity: "CRITICAL",
      description: "This workflow uses pull_request_target, which has elevated security implications.",
      recommendation: "Use pull_request_target only with strict verification, minimal permissions, and careful validation of untrusted code.",
    });
  } else {
    findings.push({
      title: "pull_request_target not detected",
      severity: "PASS",
      description: "The workflow does not use pull_request_target.",
    });
  }

  const usesThirdPartyActions = /uses:\s*[^\n]+@[^\s]+/gim;
  const actionMatches = rawYaml.match(usesThirdPartyActions) || [];
  const unpinnedActions = actionMatches.filter((action) => {
    const trimmed = action.replace(/^uses:\s*/i, "").trim();
    return trimmed.includes("@main") || trimmed.includes("@master") || trimmed.includes("@latest") || trimmed.includes("@dev");
  });

  if (unpinnedActions.length > 0) {
    findings.push({
      title: "Mutable action refs detected",
      severity: "WARNING",
      description: `The workflow uses actions with mutable refs such as ${unpinnedActions.slice(0, 3).join(", ")}.`,
      recommendation: "Pin third-party actions to a released version or a commit SHA for reproducible behavior.",
    });
  } else if (actionMatches.length > 0) {
    findings.push({
      title: "Third-party actions are version-pinned",
      severity: "PASS",
      description: "The workflow references actions with explicit versions rather than mutable branch references.",
    });
  } else {
    findings.push({
      title: "No third-party actions detected",
      severity: "PASS",
      description: "No external actions were detected in the workflow.",
    });
  }

  const pinnedVersionActions = Array.from(rawYaml.matchAll(/uses:\s*[^\n]+@v\d+/gim)).length;
  const pinnedCommitActions = Array.from(rawYaml.matchAll(/uses:\s*[^\n]+@[0-9a-f]{40}/gim)).length;

  if (pinnedVersionActions > 0 || pinnedCommitActions > 0) {
    findings.push({
      title: "Action pinning observed",
      severity: "PASS",
      description: `The workflow contains ${pinnedVersionActions} version-pinned action(s) and ${pinnedCommitActions} commit-pinned action(s).`,
    });
  } else {
    findings.push({
      title: "Action version pinning not obvious",
      severity: "WARNING",
      description: "No version-pinned or SHA-pinned actions were detected.",
      recommendation: "Pin actions to a stable version or commit SHA to reduce the risk of upstream changes.",
    });
  }

  const hasCaching = /cache:|actions\/cache|setup-node.*cache|npm cache|pnpm store|pip cache/i.test(rawYaml);
  if (hasCaching) {
    findings.push({
      title: "Dependency caching configured",
      severity: "PASS",
      description: "The workflow appears to take advantage of package caching to reduce CI run time.",
    });
  } else {
    findings.push({
      title: "Dependency caching not detected",
      severity: "WARNING",
      description: "The workflow does not appear to cache dependencies or build artifacts.",
      recommendation: "Consider caching package managers or build outputs to reduce build latency and cost.",
    });
  }

  const dockerPatterns = /docker build|docker push|docker\/login-action|buildx|docker\/build-push-action/i;
  if (dockerPatterns.test(rawYaml)) {
    const usingDockerBuild = /docker\/build-push-action|docker build|buildx/i.test(rawYaml);
    const usingDockerLogin = /docker\/login-action|docker login/i.test(rawYaml);
    const usesDockerSecrets = /secrets\.[A-Z0-9_]+/i.test(rawYaml);

    if (usingDockerBuild && usingDockerLogin && usesDockerSecrets) {
      findings.push({
        title: "Container publishing workflow security appears conscious",
        severity: "PASS",
        description: "The workflow includes Docker auth and secret usage while building or pushing images.",
      });
    } else {
      findings.push({
        title: "Docker workflow may not be hardened",
        severity: "WARNING",
        description: "The Docker workflow does not clearly demonstrate secure build or push patterns.",
        recommendation: "Use authenticated registry access, avoid storing credentials in the workflow, and prefer signed or provenance-aware images where appropriate.",
      });
    }
  } else {
    findings.push({
      title: "No Docker build/push workflow detected",
      severity: "PASS",
      description: "No Docker image workflow pattern was found in the YAML.",
    });
  }

  const uploads = /upload-artifact|download-artifact/i.test(rawYaml);
  if (uploads) {
    findings.push({
      title: "Artifact upload/download usage detected",
      severity: "PASS",
      description: "The workflow includes artifact upload or download steps, which is useful for build outputs and release promotion.",
    });
  } else {
    findings.push({
      title: "Artifact handling not detected",
      severity: "WARNING",
      description: "No artifact upload or download steps were found.",
      recommendation: "Use artifacts when passing outputs between jobs or for deployment packaging and review.",
    });
  }

  const suspiciousLogsPattern = /echo\s+["'].*\$\{\{\s*(?:secrets|github\.token|github\.event|env\.)/i;
  if (suspiciousLogsPattern.test(rawYaml)) {
    findings.push({
      title: "Workflow may expose sensitive values in logs",
      severity: "CRITICAL",
      description: "The workflow prints secret-like values or token references to stdout or logs.",
      recommendation: "Remove secret output from logging and prefer masked or non-echoing secret handling.",
    });
  } else {
    findings.push({
      title: "No obvious secret logging pattern detected",
      severity: "PASS",
      description: "The workflow does not appear to display secrets in shell output.",
    });
  }

  const runsOnSelfHost = /runs-on:\s*self-hosted/i.test(rawYaml);
  if (runsOnSelfHost) {
    findings.push({
      title: "Self-hosted runner pattern detected",
      severity: "WARNING",
      description: "The workflow is configured for self-hosted runners.",
      recommendation: "Review runner isolation, patching, and access control before using self-hosted runners for production execution.",
    });
  } else {
    findings.push({
      title: "No self-hosted runner pattern detected",
      severity: "PASS",
      description: "The workflow appears to use GitHub-hosted runners.",
    });
  }

  const deploymentJobs = jobsArray.filter(([jobName]) => /deploy|release|prod|production/i.test(jobName));
  const deploymentWithoutEnvironment = deploymentJobs.filter(([jobName, job]) => {
    const jobObject = job && typeof job === "object" ? (job as Record<string, unknown>) : {};
    return !jobObject.environment;
  });

  if (deploymentWithoutEnvironment.length === 0) {
    findings.push({
      title: "Production deployment jobs define environments",
      severity: "PASS",
      description: "Deployment-related jobs appear to be associated with an environment.",
    });
  } else {
    findings.push({
      title: "Deployment jobs may lack environment protection",
      severity: "WARNING",
      description: `The following secret or production-like jobs do not declare an environment: ${deploymentWithoutEnvironment.map(([name]) => name).join(", ")}.`,
      recommendation: "Use environments for deployment approvals, variable scoping, and protection rules in production workflows.",
    });
  }

  return findings;
}

export default function GitHubActionsAnalyzerPage() {
  const [workflow, setWorkflow] = useState(exampleWorkflow);
  const [analyzed, setAnalyzed] = useState(true);

  const { findings, analysisError } = useMemo(() => {
    if (!analyzed) {
      return { findings: [] as Finding[], analysisError: null as string | null };
    }

    try {
      return { findings: analyzeGitHubActionsWorkflow(workflow), analysisError: null as string | null };
    } catch (error) {
      return {
        findings: [] as Finding[],
        analysisError:
          error instanceof Error
            ? error.message
            : "Unexpected error while analyzing this workflow.",
      };
    }
  }, [workflow, analyzed]);

  const passed = findings.filter((finding) => finding.severity === "PASS").length;
  const warnings = findings.filter((finding) => finding.severity === "WARNING").length;
  const critical = findings.filter((finding) => finding.severity === "CRITICAL").length;

  function runAnalysis() {
    setAnalyzed(true);
  }

  function clear() {
    setWorkflow("");
    setAnalyzed(false);
  }

  function loadExample() {
    setWorkflow(exampleWorkflow);
    setAnalyzed(true);
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <div className="mx-auto max-w-7xl px-6 py-12">
        <div className="mb-10">
          <div className="mb-3 text-sm uppercase tracking-[0.2em] text-zinc-500">
            DevOps Security Tool
          </div>

          <h1 className="text-4xl font-semibold tracking-tight md:text-5xl">
            GitHub Actions Analyzer
          </h1>

          <p className="mt-4 max-w-3xl text-zinc-400">
            Review GitHub Actions workflows for security, reliability, performance,
            and CI/CD best practices.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="font-medium">GitHub Actions workflow YAML</h2>

              <button
                onClick={loadExample}
                className="text-sm text-zinc-400 transition hover:text-white"
              >
                Load example
              </button>
            </div>

            <textarea
              value={workflow}
              onChange={(event) => {
                setWorkflow(event.target.value);
                setAnalyzed(false);
              }}
              spellCheck={false}
              aria-label="GitHub Actions workflow input"
              className="min-h-[560px] w-full resize-y rounded-xl border border-zinc-800 bg-zinc-950 p-4 font-mono text-sm leading-6 text-zinc-200 outline-none transition focus:border-zinc-500"
              placeholder="Paste your GitHub Actions workflow here..."
            />

            <div className="mt-4 flex flex-wrap gap-3">
              <button
                onClick={runAnalysis}
                className="rounded-lg bg-white px-5 py-2.5 text-sm font-medium text-zinc-950 transition hover:bg-zinc-200"
              >
                Analyze Workflow
              </button>

              <button
                onClick={clear}
                className="rounded-lg border border-zinc-700 px-5 py-2.5 text-sm text-zinc-300 transition hover:border-zinc-500 hover:text-white"
              >
                Clear
              </button>
            </div>
          </section>

          <section>
            {analysisError ? (
              <div className="rounded-xl border border-red-900/60 bg-red-950/20 p-5">
                <p className="font-medium text-red-400">Analysis failed</p>
                <p className="mt-2 break-all font-mono text-sm text-red-300/80">{analysisError}</p>
                <p className="mt-3 text-sm text-zinc-400">
                  This does not mean the workflow is safe — the analyzer could not complete. Adjust the input and try again.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <SummaryCard label="PASSED" value={passed} type="pass" />
                <SummaryCard label="WARNINGS" value={warnings} type="warning" />
                <SummaryCard label="CRITICAL" value={critical} type="critical" />
              </div>
            )}

            <div className="mt-4 space-y-3">
              {!analyzed ? (
                <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-6 text-sm text-zinc-400">
                  Paste a workflow and click <span className="text-white">Analyze Workflow</span>.
                </div>
              ) : analysisError ? null : findings.length === 0 ? (
                <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-6 text-sm text-zinc-400">
                  No findings available.
                </div>
              ) : (
                findings.map((finding, index) => (
                  <FindingCard key={`${finding.title}-${index}`} finding={finding} />
                ))
              )}
            </div>
          </section>
        </div>

        <section className="mt-16 border-t border-zinc-900 pt-12">
          <h2 className="text-2xl font-semibold">What OpsForge checks</h2>

          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <InfoCard
              title="Security"
              text="Flags unsafe permissions, hardcoded secrets, risky triggers, and insecure CI/CD patterns."
            />
            <InfoCard
              title="Reliability"
              text="Looks for concurrency gaps, timeout settings, deployment sequencing, and environment protection."
            />
            <InfoCard
              title="Performance"
              text="Checks caching, artifact usage, and workflow efficiency to reduce wasted CI/CD time."
            />
          </div>

          <div className="mt-6 rounded-xl border border-amber-900/60 bg-amber-950/20 p-5">
            <div className="font-medium text-amber-400">Important</div>
            <p className="mt-2 text-sm leading-6 text-zinc-400">
              This analyzer performs static checks on workflow YAML. It helps catch common
              DevOps issues early but does not replace GitHub security policies, branch
              protections, or live CI/CD validation.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  type,
}: {
  label: string;
  value: number;
  type: "pass" | "warning" | "critical";
}) {
  const textClass =
    type === "pass"
      ? "text-emerald-400"
      : type === "warning"
      ? "text-amber-400"
      : "text-red-400";

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
      <div className={`text-xs font-medium tracking-widest ${textClass}`}>{label}</div>
      <div className={`mt-2 text-3xl font-semibold ${textClass}`}>{value}</div>
    </div>
  );
}

function FindingCard({ finding }: { finding: Finding }) {
  const badgeClass =
    finding.severity === "PASS"
      ? "border-emerald-500/40 bg-emerald-950/30 text-emerald-400"
      : finding.severity === "WARNING"
      ? "border-amber-500/40 bg-amber-950/30 text-amber-400"
      : "border-red-500/40 bg-red-950/30 text-red-400";

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="font-medium">{finding.title}</div>

        <span
          className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-medium ${badgeClass}`}
        >
          {finding.severity}
        </span>
      </div>

      <p className="mt-3 text-sm leading-6 text-zinc-400 break-words">{finding.description}</p>

      {finding.recommendation && (
        <div className="mt-4 border-t border-zinc-800 pt-4">
          <div className="text-xs uppercase tracking-widest text-zinc-600">
            Recommendation
          </div>
          <p className="mt-2 text-sm leading-6 text-zinc-300">
            {finding.recommendation}
          </p>
        </div>
      )}
    </div>
  );
}

function InfoCard({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-5">
      <h3 className="font-medium">{title}</h3>
      <p className="mt-3 text-sm leading-6 text-zinc-400">{text}</p>
    </div>
  );
}
