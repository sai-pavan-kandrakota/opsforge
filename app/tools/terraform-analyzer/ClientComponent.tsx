"use client";

import { useMemo, useState } from "react";


type Severity = "PASS" | "WARNING" | "CRITICAL";

type Finding = {
  title: string;
  severity: Severity;
  description: string;
  recommendation?: string;
};

const exampleTerraform = `terraform {
  required_version = ">= 1.6.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  backend "s3" {
    bucket = "opsforge-terraform-state"
    key    = "platform/production/terraform.tfstate"
    region = "us-east-1"
  }
}

provider "aws" {
  region = var.aws_region
}

variable "aws_region" {
  description = "AWS region for deployment"
  type        = string
  default     = "us-east-1"
}

variable "db_password" {
  description = "Database password"
  type        = string
  sensitive   = true
  default     = "ChangeMe123!"
}

resource "aws_vpc" "main" {
  cidr_block = "10.0.0.0/16"

  tags = {
    Name        = "opsforge-vpc"
    Environment = "production"
    Owner       = "platform"
  }
}

resource "aws_security_group" "web" {
  name        = "web-sg"
  description = "Allow HTTP and HTTPS"
  vpc_id      = aws_vpc.main.id

  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "web-sg"
  }
}

resource "aws_db_instance" "app" {
  allocated_storage   = 20
  engine              = "postgres"
  instance_class      = "db.t3.micro"
  username            = "appuser"
  password            = var.db_password
  skip_final_snapshot = true
  storage_encrypted   = true

  tags = {
    Name        = "app-db"
    Environment = "production"
  }
}

resource "aws_s3_bucket" "logs" {
  bucket = "opsforge-logs-prod"
  acl    = "public-read"

  versioning {
    enabled = true
  }

  tags = {
    Name        = "opsforge-logs-prod"
    Environment = "production"
  }
}

output "vpc_id" {
  value = aws_vpc.main.id
}

output "db_endpoint" {
  value = aws_db_instance.app.address
}`;

function analyzeTerraform(terraformText: string): Finding[] {
  const findings: Finding[] = [];
  const normalized = terraformText.trim();

  if (!normalized) {
    findings.push({
      title: "Empty Terraform configuration",
      severity: "CRITICAL",
      description: "No Terraform configuration was provided.",
      recommendation:
        "Paste a Terraform file or module definition before running the analyzer.",
    });
    return findings;
  }

  const blockPattern =
    /\b(?:resource|variable|module|provider|data|locals|terraform)\b/gi;
  const hasTerraformBlocks = blockPattern.test(terraformText);

  if (!hasTerraformBlocks) {
    findings.push({
      title: "Terraform structure not recognized",
      severity: "CRITICAL",
      description:
        "The input does not appear to contain recognizable Terraform blocks.",
      recommendation:
        "Use standard Terraform blocks such as resource, variable, provider, module, data, locals, or terraform.",
    });
  } else {
    findings.push({
      title: "Terraform blocks detected",
      severity: "PASS",
      description: "The configuration contains recognizable Terraform blocks.",
    });
  }

  const secretLikeAssignments = [
    "password",
    "secret",
    "token",
    "access_key",
    "secret_key",
    "api_key",
    "private_key",
    "client_secret",
    "db_password",
  ];

  const hardcodedSecretMatches: string[] = [];
  const secretPattern =
    /(^|\s)([A-Za-z0-9_]*(?:password|secret|token|access_key|secret_key|api_key|private_key|client_secret|db_password)[A-Za-z0-9_]*)\s*=\s*["']([^"']+)["']/gim;

  for (const match of terraformText.matchAll(secretPattern)) {
    const key = match[2]?.trim() ?? "";
    const rawValue = match[3]?.trim() ?? "";
    const isNormalReference =
      rawValue.includes("var.") ||
      rawValue.includes("local.") ||
      rawValue.includes("data.") ||
      rawValue.includes("aws_iam") ||
      rawValue.includes("${") ||
      rawValue.includes("file(") ||
      rawValue.includes("jsondecode(") ||
      rawValue.includes("sensitive(") ||
      rawValue.includes("random_");

    if (
      !isNormalReference &&
      secretLikeAssignments.some((item) => key.toLowerCase().includes(item))
    ) {
      hardcodedSecretMatches.push(`${key}=${rawValue}`);
    }
  }

  if (hardcodedSecretMatches.length > 0) {
    findings.push({
      title: "Hardcoded secret detected",
      severity: "CRITICAL",
      description:
        "The configuration appears to embed secrets directly in Terraform values.",
      recommendation:
        "Store secrets in environment variables, secret managers, or Terraform variables with sensitive=true, and never commit literal secrets into source control.",
    });
  } else {
    findings.push({
      title: "No obvious hardcoded secrets",
      severity: "PASS",
      description:
        "No obvious inline secret values were detected in Terraform assignments.",
    });
  }

  const awsAccessKeyPattern =
    /(?:\b(?:AKIA|ASIA)[A-Z0-9]{12,}\b|access_key\s*=\s*["'](?:AKIA|ASIA)[A-Z0-9]{12,}["'])/g;
  if (awsAccessKeyPattern.test(terraformText)) {
    findings.push({
      title: "AWS access key pattern detected",
      severity: "CRITICAL",
      description:
        "A literal AWS access key pattern was found in the Terraform configuration.",
      recommendation:
        "Use IAM roles, workload identity, or environment-backed credentials instead of hardcoded AWS keys.",
    });
  } else {
    findings.push({
      title: "AWS credential handling not obviously hardcoded",
      severity: "PASS",
      description:
        "No obvious literal AWS access-key patterns were found in the Terraform input.",
    });
  }

  const publicExposurePattern =
    /(?:cidr_blocks\s*=\s*\[[^\]]*"0\.0\.0\.0\/0"[^\]]*\]|ipv6_cidr_blocks\s*=\s*\[[^\]]*"::\/0"[^\]]*\]|(?:from_port|to_port).*0\.0\.0\.0\/0)/gim;
  const publicExposureMatches = terraformText.match(publicExposurePattern) || [];
  const sshOrRdpOpen = /(?:22|3389)/i.test(terraformText);

  if (publicExposureMatches.length > 0) {
    findings.push({
      title: "Public network exposure detected",
      severity: sshOrRdpOpen ? "CRITICAL" : "WARNING",
      description:
        "The Terraform configuration exposes services to the public internet or broad CIDR ranges.",
      recommendation:
        "Restrict ingress to trusted IP ranges, use bastion or VPN patterns, and avoid exposing administrative ports publicly.",
    });
  } else {
    findings.push({
      title: "Public ingress not obviously exposed",
      severity: "PASS",
      description:
        "No obvious public ingress rules such as 0.0.0.0/0 were detected.",
    });
  }

  const encryptionChecks = [
    {
      label: "Database encryption",
      pattern: /resource\s+"aws_db_instance"\s+"[^"]+"[\s\S]*?\}/im,
      required: /storage_encrypted\s*=\s*true/i,
    },
    {
      label: "EBS encryption",
      pattern: /resource\s+"aws_ebs_volume"\s+"[^"]+"[\s\S]*?\}/im,
      required: /encrypted\s*=\s*true/i,
    },
    {
      label: "S3 encryption",
      pattern: /resource\s+"aws_s3_bucket"\s+"[^"]+"[\s\S]*?\}/im,
      required:
        /server_side_encryption_configuration|bucket_key_enabled|kms_master_key_id/i,
    },
  ];

  let encryptionIssueCount = 0;
  for (const check of encryptionChecks) {
    const blocks = terraformText.match(check.pattern) || [];
    if (blocks.length === 0) continue;
    const blockText = blocks.join("\n");
    if (!check.required.test(blockText)) {
      encryptionIssueCount += 1;
    }
  }

  if (encryptionIssueCount > 0) {
    findings.push({
      title: "Encryption safeguards may be missing",
      severity: "WARNING",
      description:
        "One or more AWS resources appear to be missing standard encryption configuration.",
      recommendation:
        "Enable encryption for databases, EBS volumes, and S3 buckets using AWS managed keys or customer-managed keys where required.",
    });
  } else {
    findings.push({
      title: "Encryption requirements appear covered",
      severity: "PASS",
      description:
        "No obvious missing-encryption patterns were identified in common AWS resource blocks.",
    });
  }

  const s3PublicAccessPattern =
    /resource\s+"aws_s3_bucket"[\s\S]*?(?:acl\s*=\s*["'](?:public-read|public-read-write|authenticated-read)["']|policy\s*=\s*.*\*.*)/im;
  if (s3PublicAccessPattern.test(terraformText)) {
    findings.push({
      title: "S3 public access style issue",
      severity: "WARNING",
      description:
        "The configuration appears to configure S3 bucket access in a public or broadly shared way.",
      recommendation:
        "Use private ACLs or Bucket Policies, restrict public access, and prefer least-privilege access patterns.",
    });
  } else {
    findings.push({
      title: "S3 access policy not obviously public",
      severity: "PASS",
      description:
        "No obvious public ACL or public access policy pattern was detected for S3 resources.",
    });
  }

  const environmentSpecificValues = [
    /\bregion\s*=\s*["'](?:us-east-1|us-west-2|eu-west-1|ap-southeast-1)["']/gi,
    /\bami\s*=\s*["']ami-[A-Za-z0-9]+["']/gi,
    /\benvironment\s*=\s*["'](?:prod|production|dev|staging)["']/gi,
    /\baccount_id\s*=\s*["']\d+["']/gi,
  ];

  const hardcodedEnvironmentMatches = environmentSpecificValues.filter((pattern) =>
    pattern.test(terraformText),
  ).length;

  if (hardcodedEnvironmentMatches > 0) {
    findings.push({
      title: "Hardcoded environment-specific values",
      severity: "WARNING",
      description:
        "The Terraform config contains environment-specific configuration values that are often better handled by variables or separate environment tiers.",
      recommendation:
        "Prefer variables or tfvars files for region, environment, and account-specific values to reduce duplication and environment drift.",
    });
  } else {
    findings.push({
      title: "Environment configuration appears parameterized",
      severity: "PASS",
      description:
        "No obvious hardcoded environment-specific values were detected.",
    });
  }

  const hasProviderBlock = /provider\s+"[^"]+"\s*\{/.test(terraformText);
  const hasRequiredProviders = /required_providers\s*\{/.test(terraformText);
  const versionUsagePattern = /version\s*=\s*["'].*["']/g;
  const versionPins = terraformText.match(versionUsagePattern) || [];

  if (hasRequiredProviders || versionPins.length > 0) {
    findings.push({
      title: "Provider version constraints are present",
      severity: "PASS",
      description:
        "Terraform provider versions appear to be constrained or pinned.",
    });
  } else if (hasProviderBlock) {
    findings.push({
      title: "Provider version pinning missing",
      severity: "WARNING",
      description:
        "The provider block exists, but no obvious version constraint is configured.",
      recommendation:
        "Add a version constraint using required_providers or provider version settings to reduce surprise upgrades.",
    });
  } else {
    findings.push({
      title: "Provider configuration not detected",
      severity: "WARNING",
      description:
        "No provider block was found. This may be acceptable in modules, but it is worth confirming provider intent.",
      recommendation:
        "Define provider requirements explicitly where the module is meant to target a cloud platform.",
    });
  }

  const awsResourceTypes = [
    "aws_instance",
    "aws_db_instance",
    "aws_s3_bucket",
    "aws_security_group",
    "aws_vpc",
    "aws_eks_cluster",
    "aws_lambda_function",
    "aws_ecs_cluster",
  ];

  const tagsIssues: string[] = [];
  for (const resourceType of awsResourceTypes) {
    const resourceRegex = new RegExp(
      `resource\\s+"${resourceType}"\\s+"[^"]+"\\s*\\{([\\s\\S]*?)\\n\\s*\\}`,
      "gim",
    );
    const blocks = terraformText.match(resourceRegex) || [];
    for (const block of blocks) {
      const hasTags = /tags\s*\s*\{/.test(block) || /tags\s*=\s*\{/.test(block);
      if (!hasTags) {
        tagsIssues.push(resourceType);
      }
    }
  }

  if (tagsIssues.length > 0) {
    findings.push({
      title: "AWS resource tagging is inconsistent",
      severity: "WARNING",
      description:
        "Some AWS resources do not appear to define tags, which is often expected for ownership, cost, and governance.",
      recommendation:
        "Add common tags such as Name, Environment, Owner, and CostCenter to critical infrastructure resources.",
    });
  } else {
    findings.push({
      title: "Resource tagging appears present",
      severity: "PASS",
      description:
        "Tagged AWS resources were detected in the configuration.",
    });
  }

  const backendPattern = /terraform\s*\{[\s\S]*?backend\s+"[^"]+"\s*\{/im;
  if (backendPattern.test(terraformText)) {
    findings.push({
      title: "Remote backend configured",
      severity: "PASS",
      description:
        "A remote backend block was detected, which is better for team collaboration and state management.",
    });
  } else {
    findings.push({
      title: "No remote backend configured",
      severity: "WARNING",
      description:
        "No backend block was found. Local state may be unsuitable for shared or production environments.",
      recommendation:
        "Configure a remote backend such as S3, Terraform Cloud, or Azure Storage to improve collaboration and state safety.",
    });
  }

  const outputBlocks = terraformText.match(/output\s+"[^"]+"\s*\{/gim) || [];
  if (outputBlocks.length > 0) {
    findings.push({
      title: "Outputs defined",
      severity: "PASS",
      description: `Terraform output blocks were detected (${outputBlocks.length}).`,
    });
  } else {
    findings.push({
      title: "Outputs not defined",
      severity: "WARNING",
      description:
        "No output blocks were detected. Outputs make critical values easier to share and consume.",
      recommendation:
        "Add outputs for important values such as resource IDs, endpoints, and connection details.",
    });
  }

  return findings;
}

export default function TerraformAnalyzerPage() {
  const [terraform, setTerraform] = useState(exampleTerraform);
  const [analyzed, setAnalyzed] = useState(true);

  const findings = useMemo(
    () => (analyzed ? analyzeTerraform(terraform) : []),
    [terraform, analyzed],
  );

  const passed = findings.filter((finding) => finding.severity === "PASS").length;
  const warnings = findings.filter((finding) => finding.severity === "WARNING").length;
  const critical = findings.filter((finding) => finding.severity === "CRITICAL").length;

  function runAnalysis() {
    setAnalyzed(true);
  }

  function clear() {
    setTerraform("");
    setAnalyzed(false);
  }

  function loadExample() {
    setTerraform(exampleTerraform);
    setAnalyzed(true);
  }

  return (
    <main className="min-h-screen bg-black text-white">
      <div className="mx-auto max-w-7xl px-6 py-12">
        <div className="mb-10">
          <div className="mb-3 text-sm uppercase tracking-[0.2em] text-zinc-500">
            DevOps Security Tool
          </div>

          <h1 className="text-4xl font-semibold tracking-tight md:text-5xl">
            Terraform Analyzer
          </h1>

          <p className="mt-4 max-w-3xl text-zinc-400">
            Reviews Terraform configurations for security, reliability, and
            production-readiness issues before they reach a shared environment.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="font-medium">Terraform HCL</h2>

              <button
                onClick={loadExample}
                className="text-sm text-zinc-400 transition hover:text-white"
              >
                Load example
              </button>
            </div>

            <textarea
              value={terraform}
              onChange={(event) => {
                setTerraform(event.target.value);
                setAnalyzed(false);
              }}
              spellCheck={false}
              className="min-h-[560px] w-full resize-y rounded-xl border border-zinc-800 bg-black p-4 font-mono text-sm leading-6 text-zinc-200 outline-none transition focus:border-zinc-500"
              placeholder="Paste Terraform HCL here..."
            />

            <div className="mt-4 flex flex-wrap gap-3">
              <button
                onClick={runAnalysis}
                className="rounded-lg bg-white px-5 py-2.5 text-sm font-medium text-black transition hover:bg-zinc-200"
              >
                Analyze Terraform
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
            <div className="grid grid-cols-3 gap-3">
              <SummaryCard label="PASSED" value={passed} type="pass" />
              <SummaryCard label="WARNINGS" value={warnings} type="warning" />
              <SummaryCard label="CRITICAL" value={critical} type="critical" />
            </div>

            <div className="mt-4 space-y-3">
              {!analyzed ? (
                <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-6 text-sm text-zinc-400">
                  Paste a Terraform configuration and click{" "}
                  <span className="text-white">Analyze Terraform</span>.
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
              title="Security posture"
              text="Looks for hardcoded secrets, AWS key patterns, and public access issues before deployment."
            />
            <InfoCard
              title="Operational hygiene"
              text="Flags version constraints, tags, state configuration, and resource-level best practices."
            />
            <InfoCard
              title="Production readiness"
              text="Highlights encryption gaps, weak defaults, and missing outputs that affect reliability and traceability."
            />
          </div>

          <div className="mt-6 rounded-xl border border-amber-900/60 bg-amber-950/20 p-5">
            <div className="font-medium text-amber-400">Important</div>
            <p className="mt-2 text-sm leading-6 text-zinc-400">
              This analyzer performs practical static checks on Terraform code. It is
              intended to surface likely issues early, but it does not replace
              terraform validate, plan reviews, or specialized policy-as-code tools.
            </p>
          </div>
        </section>
      </div>
    </main>
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
      <div className={`text-xs font-medium tracking-widest ${textClass}`}>
        {label}
      </div>
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
        <h3 className="font-medium">{finding.title}</h3>

        <span
          className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-medium ${badgeClass}`}
        >
          {finding.severity}
        </span>
      </div>

      <p className="mt-3 text-sm leading-6 text-zinc-400">{finding.description}</p>

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
