"use client";

import { useMemo, useState } from "react";


type Severity = "PASS" | "WARNING" | "CRITICAL";
type Category = "Security" | "Reliability" | "Networking" | "Governance";

type Finding = {
  title: string;
  severity: Severity;
  category: Category;
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

// Returns the index just past the double-quoted string starting at `index`
// (which must point at the opening `"`), honoring `\"` escapes. HCL has no
// single-quoted strings, so `'` is never treated as a string delimiter.
function skipStringLiteral(text: string, index: number): number {
  let i = index + 1;

  while (i < text.length) {
    if (text[i] === "\\") {
      i += 2;
      continue;
    }
    if (text[i] === '"') {
      return i + 1;
    }
    i += 1;
  }

  return text.length;
}

// Returns the index just past a `#`/`//` line comment starting at `index`.
function skipLineComment(text: string, index: number): number {
  const newlineIndex = text.indexOf("\n", index);
  return newlineIndex === -1 ? text.length : newlineIndex + 1;
}

// Returns the index just past the closing `*/` of a block comment starting
// at `index` (which must point at the opening `/*`).
function skipBlockComment(text: string, index: number): number {
  const closeIndex = text.indexOf("*/", index + 2);
  return closeIndex === -1 ? text.length : closeIndex + 2;
}

// Scans the full text for `resource "<resourceType>" "<name>" {` headers,
// treating `#`/`//` line comments, `/* */` block comments, and `"..."`
// strings as opaque along the way. This means a resource declaration that
// only *appears* inside a comment, or inside another resource's quoted
// string value, is never examined as a candidate header in the first place
// — unlike a plain regex scan over the raw text, which cannot tell code
// apart from commented-out or string-embedded text.
function getResourceBlocks(terraformText: string, resourceType: string): string[] {
  const headerPattern = new RegExp(
    `resource\\s+"${resourceType}"\\s+"[^"]+"\\s*\\{`,
    "iy",
  );
  const blocks: string[] = [];
  let index = 0;

  while (index < terraformText.length) {
    const char = terraformText[index];
    const nextChar = terraformText[index + 1];

    if (char === '"') {
      index = skipStringLiteral(terraformText, index);
      continue;
    }

    if (char === "#" || (char === "/" && nextChar === "/")) {
      index = skipLineComment(terraformText, index);
      continue;
    }

    if (char === "/" && nextChar === "*") {
      index = skipBlockComment(terraformText, index);
      continue;
    }

    headerPattern.lastIndex = index;
    const match = headerPattern.exec(terraformText);

    if (match) {
      const openingBraceIndex = index + match[0].lastIndexOf("{");
      const block = extractBalancedBlock(terraformText, openingBraceIndex);

      if (block !== null) {
        blocks.push(block);
        index = openingBraceIndex + block.length;
        continue;
      }
    }

    index += 1;
  }

  return blocks;
}

// Scans forward from an opening `{` and returns the brace-balanced block,
// treating `#`/`//` line comments, `/* */` block comments, and `"..."`
// strings as opaque so braces inside them are never counted. Returns null if
// the block never closes (e.g. truncated/malformed input).
function extractBalancedBlock(text: string, openingBraceIndex: number): string | null {
  let depth = 0;
  let index = openingBraceIndex;

  while (index < text.length) {
    const char = text[index];
    const nextChar = text[index + 1];

    if (char === '"') {
      index = skipStringLiteral(text, index);
      continue;
    }

    if (char === "#" || (char === "/" && nextChar === "/")) {
      index = skipLineComment(text, index);
      continue;
    }

    if (char === "/" && nextChar === "*") {
      index = skipBlockComment(text, index);
      continue;
    }

    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return text.slice(openingBraceIndex, index + 1);
      }
    }

    index += 1;
  }

  return null;
}

function isTerraformReferenceLike(value: string): boolean {
  const normalized = value.trim();
  if (!normalized) {
    return true;
  }

  return (
    normalized.startsWith("var.") ||
    normalized.startsWith("local.") ||
    normalized.startsWith("data.") ||
    normalized.startsWith("module.") ||
    normalized.includes("${") ||
    normalized.includes("file(") ||
    normalized.includes("sensitive(") ||
    normalized.includes("jsondecode(") ||
    normalized.includes("yamldecode(") ||
    normalized.includes("aws_") ||
    normalized.includes("random_") ||
    normalized.includes("tls_") ||
    normalized.includes("data.") ||
    normalized.includes("lookup(") ||
    normalized.includes("join(")
  );
}

function extractLiteralValue(rawValue: string): string | null {
  const trimmed = rawValue.trim();

  if (!trimmed) {
    return null;
  }

  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }

  if (/^<<-?\w+/.test(trimmed)) {
    return trimmed.replace(/^<<-?\w+/, "").trim();
  }

  return trimmed;
}

function analyzeIamPolicy(terraformText: string): Finding[] {
  const policyResourceTypes = [
    "aws_iam_policy",
    "aws_iam_role_policy",
    "aws_iam_user_policy",
    "aws_iam_group_policy",
  ];

  const findings: Finding[] = [];
  let sawPolicyBlock = false;
  let hasWildcardAction = false;
  let hasWildcardResource = false;
  let hasBroadAction = false;

  function extractLiteralList(value: string): string[] {
    const trimmed = value.trim();
    if (!trimmed) {
      return [];
    }

    const extracted: string[] = [];
    const matches = trimmed.matchAll(/(?:"([^"]+)"|'([^']+)'|\b([A-Za-z0-9:*_\-]+)\b)/g);
    for (const match of matches) {
      const candidate = match[1] ?? match[2] ?? match[3] ?? "";
      if (candidate) {
        extracted.push(candidate.trim());
      }
    }

    return extracted.filter(Boolean);
  }

  function extractPolicyValues(block: string, key: string): string[] {
    const values: string[] = [];
        const patterns = [
      new RegExp(String.raw`${key}\s*=\s*(?:"([^"]+)"|'([^']+)'|\[([^\]]+)\]|([^\s,}]+))`, "gi"),
      new RegExp(String.raw`["']${key}["']\s*:\s*(?:"([^"]+)"|'([^']+)'|\[([^\]]+)\]|([^\s,}]+))`, "gi"),
    ];

    for (const pattern of patterns) {
      for (const match of block.matchAll(pattern)) {
        const raw = match[1] ?? match[2] ?? match[3] ?? match[4] ?? "";
        if (!raw) continue;

        if (raw.includes("[")) {
          values.push(...extractLiteralList(raw));
          continue;
        }

        values.push(raw.trim());
      }
    }

    return values.filter(Boolean);
  }

  for (const resourceType of policyResourceTypes) {
    const blocks = getResourceBlocks(terraformText, resourceType);
    for (const block of blocks) {
      sawPolicyBlock = true;

      const actionValues = extractPolicyValues(block, "Action");
      const resourceValues = extractPolicyValues(block, "Resource");

      if (actionValues.some((value) => value === "*")) {
        hasWildcardAction = true;
      }
      if (actionValues.some((value) => /:\*$/.test(value))) {
        hasBroadAction = true;
      }
      if (resourceValues.some((value) => value === "*")) {
        hasWildcardResource = true;
      }
    }
  }

  if (!sawPolicyBlock) {
    return findings;
  }

  if (hasWildcardAction && hasWildcardResource) {
    findings.push({
      title: "IAM policy grants wildcard action and wildcard resource",
      severity: "CRITICAL",
      category: "Security",
      description:
        "The supplied Terraform contains a policy where both Action and Resource are effectively wildcarded. This is a clearly excessive permission pattern and should be reviewed carefully.",
      recommendation:
        "Restrict the policy to the minimum required actions and resources, and replace wildcard permissions with specific AWS actions and resource ARNs.",
    });
    return findings;
  }

  if (hasWildcardAction || hasWildcardResource || hasBroadAction) {
    findings.push({
      title: "IAM policy contains broad wildcard permissions",
      severity: "WARNING",
      category: "Security",
      description:
        "The supplied Terraform includes wildcard IAM actions or resources, or a broad service-wide action pattern such as s3:* or iam:*.",
      recommendation:
        "Review the policy for least-privilege access and replace wildcard entries with more specific actions or resource scopes where possible.",
    });
  }

  return findings;
}

function analyzeSecurityGroups(terraformText: string): Finding[] {
  const findings: Finding[] = [];
  const sgBlocks = getResourceBlocks(terraformText, "aws_security_group");

  if (sgBlocks.length === 0) {
    return findings;
  }

  const publicExposureIssues: string[] = [];
  const criticalPorts = new Set([22, 3389, 3306, 5432, 6379, 1433, 27017, 1521]);

  for (const block of sgBlocks) {
    const ingressBlocks = block.match(/ingress\s*\{[\s\S]*?\}/gim) || [];

    for (const ingressBlock of ingressBlocks) {
      const hasPublicCidr =
        /cidr_blocks\s*=\s*\[[\s\S]*?(?:"0\.0\.0\.0\/0"|"::\/0")[\s\S]*\]/i.test(
          ingressBlock,
        ) ||
        /ipv6_cidr_blocks\s*=\s*\[[\s\S]*?"::\/0"[\s\S]*\]/i.test(ingressBlock);

      if (!hasPublicCidr) {
        continue;
      }

      const fromMatch = ingressBlock.match(/from_port\s*=\s*(\d+)/i);
      const toMatch = ingressBlock.match(/to_port\s*=\s*(\d+)/i);
      const fromPort = fromMatch ? Number(fromMatch[1]) : null;
      const toPort = toMatch ? Number(toMatch[1]) : null;
      const rangeLabel =
        fromPort !== null && toPort !== null
          ? `${fromPort}-${toPort}`
          : fromPort !== null
          ? `${fromPort}`
          : "unknown range";

      const isRangeOpen =
        fromPort !== null && toPort !== null && (fromPort === 0 || toPort === 65535 || fromPort < toPort);
      const hasCriticalPort =
        fromPort !== null && toPort !== null &&
        (criticalPorts.has(fromPort) || criticalPorts.has(toPort) ||
          (fromPort < 65535 && toPort > 0 && (fromPort <= 22 && toPort >= 22 || fromPort <= 3389 && toPort >= 3389 || fromPort <= 3306 && toPort >= 3306 || fromPort <= 5432 && toPort >= 5432 || fromPort <= 6379 && toPort >= 6379 || fromPort <= 1433 && toPort >= 1433 || fromPort <= 27017 && toPort >= 27017 || fromPort <= 1521 && toPort >= 1521)));

      if (hasCriticalPort || isRangeOpen) {
        publicExposureIssues.push(
          `Public ingress on ${rangeLabel} is open to 0.0.0.0/0 or ::/0.`,
        );
      } else {
        publicExposureIssues.push(
          `Public ingress on ${rangeLabel} is open to 0.0.0.0/0 or ::/0.`,
        );
      }
    }
  }

  if (publicExposureIssues.length === 0) {
    findings.push({
      title: "No public firewall exposure detected",
      severity: "PASS",
      category: "Networking",
      description:
        "No public 0.0.0.0/0 or ::/0 ingress rules were detected in supplied aws_security_group blocks.",
    });
    return findings;
  }

  const highestSeverity = publicExposureIssues.some((issue) =>
    /22|3389|3306|5432|6379|1433|27017|1521/.test(issue),
  )
    ? "CRITICAL"
    : "WARNING";

  findings.push({
    title:
      highestSeverity === "CRITICAL"
        ? "Public SSH, RDP, or database access detected"
        : "Public application exposure detected",
    severity: highestSeverity,
    category: "Networking",
    description:
      publicExposureIssues.length > 0
        ? `The supplied Terraform contains public ingress rules with broad exposure: ${publicExposureIssues.join(" ")}`
        : "Unable to fully verify this configuration from the supplied Terraform.",
    recommendation:
      highestSeverity === "CRITICAL"
        ? "Restrict these ports to trusted CIDRs or private networks, and avoid exposing database or administrative services directly to the internet."
        : "Review the exposed ports and limit ingress to trusted sources or private load balancers instead of allowing public access broadly.",
  });

  return findings;
}

function analyzeS3Buckets(terraformText: string): Finding[] {
  const findings: Finding[] = [];
  const s3Buckets = getResourceBlocks(terraformText, "aws_s3_bucket");
  const s3PublicAccessBlocks = getResourceBlocks(
    terraformText,
    "aws_s3_bucket_public_access_block",
  );

  if (s3Buckets.length === 0) {
    return findings;
  }

  let publicAccessPattern = false;
  let encryptionIssue = false;
  let versioningIssue = false;

  for (const bucket of s3Buckets) {
    if (/acl\s*=\s*["'](?:public-read|public-read-write|authenticated-read)["']/i.test(bucket)) {
      publicAccessPattern = true;
    }
    if (/policy\s*=\s*.*\*.*|Principal\s*:\s*\*|aws:\s*\*|\[\s*"\*"\s*\]/i.test(bucket)) {
      publicAccessPattern = true;
    }
    if (!/server_side_encryption_configuration|bucket_key_enabled|kms_master_key_id/i.test(bucket)) {
      encryptionIssue = true;
    }
    if (!/versioning\s*\{[\s\S]*?enabled\s*=\s*true/i.test(bucket)) {
      versioningIssue = true;
    }
  }

  if (publicAccessPattern) {
    findings.push({
      title: "S3 bucket appears publicly accessible or broadly shared",
      severity: "WARNING",
      category: "Security",
      description:
        "The supplied Terraform includes S3 bucket ACL or policy patterns consistent with public or broadly shared access. This does not guarantee public exposure without the rest of the environment context, but it warrants review.",
      recommendation:
        "Remove public ACLs and public bucket policies, enable public access block settings, and restrict access to trusted principals and required actions only.",
    });
  }

  if (s3PublicAccessBlocks.length === 0) {
    findings.push({
      title: "S3 public access block configuration missing",
      severity: "WARNING",
      category: "Security",
      description:
        "The supplied Terraform does not define aws_s3_bucket_public_access_block for the bucket. This does not prove the bucket is public, but it leaves the bucket without a common guardrail for public exposure.",
      recommendation:
        "Configure block_public_acls, block_public_policy, ignore_public_acls, and restrict_public_buckets to reduce accidental public exposure.",
    });
  } else {
    const accessBlockText = s3PublicAccessBlocks.join("\n");
    const missingAccessProtections = [
      !/block_public_acls\s*=\s*(?:true|false)/i.test(accessBlockText),
      !/block_public_policy\s*=\s*(?:true|false)/i.test(accessBlockText),
      !/ignore_public_acls\s*=\s*(?:true|false)/i.test(accessBlockText),
      !/restrict_public_buckets\s*=\s*(?:true|false)/i.test(accessBlockText),
    ].filter(Boolean).length;

    if (missingAccessProtections > 0) {
      findings.push({
        title: "S3 public access block is incomplete",
        severity: "WARNING",
        category: "Security",
        description:
          "The supplied Terraform includes a public access block resource, but one or more access-block protections are missing or not explicitly set.",
        recommendation:
          "Set all public access block flags to true to prevent accidental public bucket exposure.",
      });
    } else {
      findings.push({
        title: "S3 public access block is configured",
        severity: "PASS",
        category: "Security",
        description:
          "The supplied Terraform includes a public access block configuration with explicit public exposure protections.",
      });
    }
  }

  if (encryptionIssue) {
    findings.push({
      title: "S3 encryption may be missing",
      severity: "WARNING",
      category: "Security",
      description:
        "One or more S3 buckets appear to be missing encryption configuration. This does not prove the bucket is unencrypted in all contexts, but the supplied Terraform does not show an encryption guardrail.",
      recommendation:
        "Enable server-side encryption and consider KMS-managed keys for buckets handling sensitive data.",
    });
  }

  if (versioningIssue) {
    findings.push({
      title: "S3 versioning may be disabled",
      severity: "WARNING",
      category: "Reliability",
      description:
        "The supplied Terraform does not show S3 bucket versioning enabled for one or more buckets.",
      recommendation:
        "Enable bucket versioning to improve rollback, recovery, and object overwrite protection.",
    });
  }

  return findings;
}

function analyzeRds(terraformText: string): Finding[] {
  const findings: Finding[] = [];
  const dbBlocks = getResourceBlocks(terraformText, "aws_db_instance");

  if (dbBlocks.length === 0) {
    return findings;
  }

  for (const block of dbBlocks) {
    const hasPubliclyAccessible = /publicly_accessible\s*=\s*true/i.test(block);
    const hasPublicSecurityExposure = /cidr_blocks\s*=\s*\[[\s\S]*?(?:"0\.0\.0\.0\/0"|"::\/0")[\s\S]*\]/i.test(terraformText);

    if (hasPubliclyAccessible) {
      findings.push({
        title: "RDS instance is publicly accessible",
        severity: hasPublicSecurityExposure ? "CRITICAL" : "WARNING",
        category: "Security",
        description: hasPublicSecurityExposure
          ? "The supplied Terraform sets publicly_accessible = true and also exposes a public ingress path in the same configuration, making public database exposure plausible."
          : "The supplied Terraform sets publicly_accessible = true. This does not prove a public security group rule is present, but it indicates a public database configuration that needs review.",
        recommendation:
          "Keep the database private unless there is a clear operational reason for public access, and restrict it to trusted networks or private endpoints.",
      });
    }

    if (/storage_encrypted\s*=\s*false/i.test(block) || !/storage_encrypted\s*=/.test(block)) {
      findings.push({
        title: "RDS encryption is not explicitly enabled",
        severity: "WARNING",
        category: "Security",
        description:
          "The supplied Terraform does not clearly show RDS storage encryption enabled. This is not always a vulnerability, but it is a common production-hardening requirement.",
        recommendation:
          "Set storage_encrypted = true for database instances that hold sensitive or regulated data.",
      });
    }

    if (/backup_retention_period\s*=\s*0/i.test(block) || !/backup_retention_period\s*=/.test(block)) {
      findings.push({
        title: "RDS backup retention may be insufficient",
        severity: "WARNING",
        category: "Reliability",
        description:
          "The supplied Terraform does not clearly show an appropriate backup retention period for the database instance.",
        recommendation:
          "Set a non-zero backup_retention_period to support recovery and operational resilience.",
      });
    }

    if (/deletion_protection\s*=\s*false/i.test(block) || !/deletion_protection\s*=/.test(block)) {
      findings.push({
        title: "RDS deletion protection is not explicitly enabled",
        severity: "WARNING",
        category: "Reliability",
        description:
          "The supplied Terraform does not clearly enable deletion protection for the database. This may be acceptable for non-production workloads, but it is a common production safeguard.",
        recommendation:
          "Set deletion_protection = true for production databases unless there is a deliberate operational exception.",
      });
    }
  }

  return findings;
}

function analyzeProviderVersionPinning(terraformText: string): Finding[] {
  const findings: Finding[] = [];
  const providerBlocks = terraformText.match(/provider\s+"[^"]+"\s*\{[\s\S]*?\}/gim) || [];

  if (providerBlocks.length === 0) {
    return findings;
  }

  for (const block of providerBlocks) {
    const hasVersionConstraint = /version\s*=\s*["'][^"']+["']/i.test(block);
    const hasBroadConstraint = /version\s*=\s*["']\s*(?:>=\s*0|>=\s*1|~>\s*0|~>\s*1|\*|\s*"\s*")/i.test(block);

    if (!hasVersionConstraint || hasBroadConstraint) {
      findings.push({
        title: "Provider version pinning is missing or too broad",
        severity: "WARNING",
        category: "Governance",
        description:
          "The supplied Terraform contains a provider block without a clear version pin or with an unbounded version constraint. This can make infrastructure less reproducible across environments.",
        recommendation:
          "Pin provider versions to improve reproducibility and reduce unexpected upgrades.",
      });
    } else {
      findings.push({
        title: "Provider version constraints are present",
        severity: "PASS",
        category: "Governance",
        description:
          "Terraform provider versions appear to be constrained or pinned.",
      });
    }
  }

  return findings;
}

function analyzeModuleVersionPinning(terraformText: string): Finding[] {
  const findings: Finding[] = [];
  const moduleBlocks = terraformText.match(/module\s+"[^"]+"\s*\{[\s\S]*?\}/gim) || [];

  for (const block of moduleBlocks) {
    const sourceMatch = block.match(/source\s*=\s*["']([^"']+)["']/i);
    const source = sourceMatch ? sourceMatch[1] : "";
    const isLocalModule =
      source.startsWith("./") ||
      source.startsWith("../") ||
      source.startsWith("git::") ||
      source.startsWith("github.com") ||
      source.startsWith("bitbucket.org") ||
      source.startsWith("git@") ||
      source.startsWith("file:");

    if (isLocalModule) {
      continue;
    }

    const versionConstraint = /version\s*=\s*["'][^"']+["']/i.test(block);
    const hasBroadConstraint = /version\s*=\s*["']\s*(?:>=\s*0|>=\s*1|~>\s*0|~>\s*1|\*|\s*"\s*)/i.test(block);

    if (!versionConstraint || hasBroadConstraint) {
      findings.push({
        title: `Module version pinning is missing or too broad: ${source || "module"}`,
        severity: "WARNING",
        category: "Governance",
        description:
          "The supplied Terraform contains a registry module without a clear version pin or with a broad version constraint. This can lead to unexpected module updates.",
        recommendation:
          "Pin registry modules to a known version to improve reproducibility and reviewability.",
      });
    }
  }

  return findings;
}

function analyzeResourceTagging(terraformText: string): Finding[] {
  const findings: Finding[] = [];
  const taggableResources = [
    "aws_instance",
    "aws_db_instance",
    "aws_s3_bucket",
    "aws_security_group",
    "aws_vpc",
    "aws_eks_cluster",
    "aws_lambda_function",
    "aws_ebs_volume",
    "aws_lb",
    "aws_alb",
    "aws_elb",
    "aws_iam_role",
  ];

  const missingTags: string[] = [];

  for (const resourceType of taggableResources) {
    const blocks = getResourceBlocks(terraformText, resourceType);
    if (blocks.length === 0) {
      continue;
    }

    let foundMeaningfulTags = false;

    for (const block of blocks) {
      const tagBlockMatch = block.match(/tags\s*=\s*\{([\s\S]*?)\}/i);
      const tagBlock = tagBlockMatch ? tagBlockMatch[1] : "";
      const hasMeaningfulTags = /(?:[A-Za-z0-9_-]+\s*=\s*(?:\"[^\"]+\"|'[^']+'|[A-Za-z0-9_./:-]+))/.test(tagBlock);

      if (hasMeaningfulTags) {
        foundMeaningfulTags = true;
      }
    }

    if (!foundMeaningfulTags) {
      missingTags.push(resourceType);
    }
  }

  if (missingTags.length > 0) {
    findings.push({
      title: "AWS resources appear to be missing tags",
      severity: "WARNING",
      category: "Governance",
      description:
        "The supplied Terraform contains AWS resources that commonly support tags but do not appear to define them. This does not prove every resource is untagged in every environment, but it is an important governance gap to review.",
      recommendation:
        "Add consistent ownership, environment, application, and cost-allocation tags where appropriate.",
    });
  } else {
    findings.push({
      title: "Resource tagging appears present",
      severity: "PASS",
      category: "Governance",
      description:
        "Tagged AWS resources were detected in the configuration.",
    });
  }

  return findings;
}

function analyzeTerraformBackend(terraformText: string): Finding[] {
  const findings: Finding[] = [];
  const backendBlocks = terraformText.match(/terraform\s*\{[\s\S]*?backend\s+"[^"]+"\s*\{[\s\S]*?\}/gim) || [];

  if (backendBlocks.length > 0) {
    const backendText = backendBlocks.join("\n");
    if (/backend\s+"local"/i.test(backendText)) {
      findings.push({
        title: "Local Terraform backend is explicitly configured",
        severity: "WARNING",
        category: "Governance",
        description:
          "The supplied Terraform explicitly configures a local backend. This can be appropriate for local development, but it is not generally the preferred pattern for team or production use.",
        recommendation:
          "Use a remote backend for shared or production workflows when multiple engineers or environments depend on the same state.",
      });
      return findings;
    }

    findings.push({
      title: "Remote backend configured",
      severity: "PASS",
      category: "Governance",
      description:
        "A remote backend block was detected, which is better for team collaboration and state management.",
    });
    return findings;
  }

  findings.push({
    title: "Remote backend cannot be confirmed from the supplied Terraform",
    severity: "WARNING",
    category: "Governance",
    description:
      "Unable to verify a remote backend from the supplied Terraform.",
    recommendation:
      "Review the Terraform state strategy and consider a remote backend for shared or production usage.",
  });

  return findings;
}

function analyzeBackups(terraformText: string): Finding[] {
  const findings: Finding[] = [];
  const dbBlocks = getResourceBlocks(terraformText, "aws_db_instance");

  if (dbBlocks.length === 0) {
    return findings;
  }

  for (const block of dbBlocks) {
    if (/backup_retention_period\s*=\s*0/i.test(block)) {
      findings.push({
        title: "RDS backup retention is explicitly disabled",
        severity: "WARNING",
        category: "Reliability",
        description:
          "The supplied Terraform sets backup_retention_period = 0 for an RDS instance, which removes the default backup protection for recovery scenarios.",
        recommendation:
          "Set a non-zero backup_retention_period that matches your recovery objectives.",
      });
    } else if (!/backup_retention_period\s*=/.test(block)) {
      findings.push({
        title: "RDS backup retention cannot be confirmed from the supplied Terraform",
        severity: "WARNING",
        category: "Reliability",
        description:
          "Unable to fully verify backup retention from the supplied Terraform.",
        recommendation:
          "Review the RDS backup strategy and configure an appropriate backup_retention_period for production or shared workloads.",
      });
    }
  }

  return findings;
}

function analyzeDeletionProtection(terraformText: string): Finding[] {
  const findings: Finding[] = [];
  const dbBlocks = getResourceBlocks(terraformText, "aws_db_instance");

  if (dbBlocks.length === 0) {
    return findings;
  }

  for (const block of dbBlocks) {
    if (/deletion_protection\s*=\s*true/i.test(block)) {
      findings.push({
        title: "RDS deletion protection is enabled",
        severity: "PASS",
        category: "Reliability",
        description:
          "The supplied Terraform explicitly enables deletion protection for the RDS instance.",
      });
      continue;
    }

    if (/deletion_protection\s*=\s*false/i.test(block)) {
      findings.push({
        title: "RDS deletion protection is explicitly disabled",
        severity: "WARNING",
        category: "Reliability",
        description:
          "The supplied Terraform explicitly disables deletion protection for an RDS instance. This can increase the risk of accidental data loss during destructive operations.",
        recommendation:
          "Set deletion_protection = true for production or long-lived databases unless a deliberate exception is required.",
      });
      continue;
    }

    const isProductionLike = /environment\s*=\s*["'](?:prod|production|prod\b|production\b)["']|tags\s*=\s*\{[\s\S]*Environment\s*=\s*["'](?:prod|production)["']|identifier\s*=\s*["'][^"\n]*(?:prod|production)[^"\n]*["']/i.test(block);
    if (isProductionLike) {
      findings.push({
        title: "RDS deletion protection is not explicitly set",
        severity: "WARNING",
        category: "Reliability",
        description:
          "Unable to fully verify deletion protection from the supplied Terraform.",
        recommendation:
          "Consider enabling deletion_protection for production databases where accidental destruction would be disruptive.",
      });
    }
  }

  return findings;
}

function analyzeLifecycleProtection(terraformText: string): Finding[] {
  const findings: Finding[] = [];
  const productionLikeResources = [
    "aws_db_instance",
    "aws_eks_cluster",
    "aws_rds_cluster",
    "aws_s3_bucket",
  ];

  for (const resourceType of productionLikeResources) {
    const blocks = getResourceBlocks(terraformText, resourceType);
    for (const block of blocks) {
      if (/lifecycle\s*\{[\s\S]*?prevent_destroy\s*=\s*true/i.test(block)) {
        findings.push({
          title: `Lifecycle protection is configured for ${resourceType}`,
          severity: "PASS",
          category: "Reliability",
          description:
            "The supplied Terraform explicitly configures prevent_destroy = true for a critical resource.",
        });
        continue;
      }

      if (/lifecycle\s*\{[\s\S]*?prevent_destroy\s*=\s*false/i.test(block)) {
        findings.push({
          title: `${resourceType} explicitly disables lifecycle protection`,
          severity: "WARNING",
          category: "Reliability",
          description:
            "The supplied Terraform explicitly disables prevent_destroy for a critical resource. This may be intentionally safe for lower-risk workloads, but it removes a common protection against accidental destruction.",
          recommendation:
            "Set prevent_destroy = true for production-critical resources where accidental replacement or deletion would be disruptive.",
        });
        continue;
      }

      const isProductionLike = /environment\s*=\s*["'](?:prod|production|stage|staging)["']|tags\s*=\s*\{[\s\S]*Environment\s*=\s*["'](?:prod|production|stage|staging)["']|identifier\s*=\s*["'][^"\n]*(?:prod|production|stage|staging)[^"\n]*["']/i.test(block);
      if (isProductionLike) {
        findings.push({
          title: `${resourceType} does not appear to enforce lifecycle protection`,
          severity: "WARNING",
          category: "Reliability",
          description:
            "Unable to fully verify lifecycle protection from the supplied Terraform.",
          recommendation:
            "Consider using lifecycle rules and prevent_destroy for production-critical resources where accidental deletion would be disruptive.",
        });
      }
    }
  }

  return findings;
}

function analyzeHighAvailability(terraformText: string): Finding[] {
  const findings: Finding[] = [];
  const dbBlocks = getResourceBlocks(terraformText, "aws_db_instance");

  for (const block of dbBlocks) {
    if (/multi_az\s*=\s*true/i.test(block)) {
      findings.push({
        title: "Database is configured for multi-AZ resilience",
        severity: "PASS",
        category: "Reliability",
        description:
          "The supplied Terraform explicitly enables multi-AZ configuration for the database.",
      });
      continue;
    }

    if (/availability_zone\s*=\s*"[^"]+"/i.test(block) || /multi_az\s*=\s*false/i.test(block)) {
      findings.push({
        title: "Database is pinned to a single availability zone",
        severity: "WARNING",
        category: "Reliability",
        description:
          "The supplied Terraform explicitly configures the database in a single availability zone or disables multi-AZ redundancy.",
        recommendation:
          "Review whether the database should use multi-AZ configuration for production resiliency and recovery scenarios.",
      });
    }
  }

  return findings;
}

function analyzeLogging(terraformText: string): Finding[] {
  const findings: Finding[] = [];

  if (/aws_db_instance[\s\S]*?enabled_cloudwatch_logs_exports/i.test(terraformText)) {
    findings.push({
      title: "RDS log exports are configured",
      severity: "PASS",
      category: "Reliability",
      description:
        "The supplied Terraform explicitly configures RDS CloudWatch log exports.",
    });
  } else if (/aws_db_instance/.test(terraformText)) {
    findings.push({
      title: "RDS log exports are not clearly configured",
      severity: "WARNING",
      category: "Reliability",
      description:
        "Unable to fully verify database logging from the supplied Terraform.",
      recommendation:
        "Review whether RDS log exports should be enabled for operational visibility and troubleshooting.",
    });
  }

  const s3Buckets = getResourceBlocks(terraformText, "aws_s3_bucket");
  for (const block of s3Buckets) {
    if (/logging\s*\{[\s\S]*?target_bucket/i.test(block)) {
      findings.push({
        title: "S3 access logging is configured",
        severity: "PASS",
        category: "Reliability",
        description:
          "The supplied Terraform includes an S3 logging configuration for access auditing.",
      });
    } else if (/bucket\s*=\s*["'][^"']+["']/i.test(block)) {
      findings.push({
        title: "S3 access logging is not clearly configured",
        severity: "WARNING",
        category: "Reliability",
        description:
          "Unable to fully verify S3 access logging from the supplied Terraform.",
        recommendation:
          "Consider enabling S3 access logging for buckets handling operational or audit-sensitive data.",
      });
    }
  }

  if (/aws_lb|aws_alb|aws_elb/.test(terraformText) && !/access_logs\s*\{[\s\S]*?enabled\s*=\s*true/i.test(terraformText)) {
    findings.push({
      title: "Load balancer access logs are not clearly configured",
      severity: "WARNING",
      category: "Reliability",
      description:
        "Unable to fully verify load balancer access logging from the supplied Terraform.",
      recommendation:
        "Enable access logs where the workload depends on a public or application-facing load balancer.",
    });
  }

  return findings;
}

function analyzeMonitoring(terraformText: string): Finding[] {
  const findings: Finding[] = [];

  if (/aws_db_instance[\s\S]*?monitoring_interval|monitoring_role_arn/i.test(terraformText)) {
    findings.push({
      title: "RDS monitoring is configured",
      severity: "PASS",
      category: "Reliability",
      description:
        "The supplied Terraform explicitly configures RDS monitoring-related settings.",
    });
  } else if (/aws_db_instance/.test(terraformText)) {
    findings.push({
      title: "RDS monitoring cannot be confirmed from the supplied Terraform",
      severity: "WARNING",
      category: "Reliability",
      description:
        "Unable to fully verify monitoring from the supplied Terraform.",
      recommendation:
        "Review whether CloudWatch monitoring should be enabled for the database workload.",
    });
  }

  if (/aws_cloudwatch_metric_alarm|aws_cloudwatch_dashboard|aws_cloudwatch_log_group/.test(terraformText)) {
    findings.push({
      title: "CloudWatch monitoring resources are configured",
      severity: "PASS",
      category: "Reliability",
      description:
        "The supplied Terraform includes CloudWatch monitoring resources directly.",
    });
  }

  return findings;
}

function analyzeSensitiveVariables(terraformText: string): Finding[] {
  const findings: Finding[] = [];
  const variableBlocks = terraformText.match(/variable\s+"[^"]+"\s*\{[\s\S]*?\}/gim) || [];

  for (const block of variableBlocks) {
    const nameMatch = block.match(/variable\s+"([^"]+)"/i);
    const variableName = nameMatch ? nameMatch[1] : "";
    const loweredName = variableName.toLowerCase();
    const isSensitiveName =
      /password|secret|token|key|api_key|client_secret|private_key|credential/i.test(loweredName);
    const isMarkedSensitive = /sensitive\s*=\s*true/i.test(block);
    const hasLiteralDefault = /default\s*=\s*["'][^"']+["']/i.test(block);

    if (isSensitiveName && !isMarkedSensitive && hasLiteralDefault) {
      findings.push({
        title: `Sensitive variable should be marked sensitive: ${variableName}`,
        severity: "WARNING",
        category: "Security",
        description:
          "A variable whose name suggests it contains secrets or credentials appears to be defined without sensitive = true.",
        recommendation:
          "Add sensitive = true to the variable declaration so Terraform does not display it in plans and UI output.",
      });
    }
  }

  const literalSecretLines = terraformText
    .split(/\r?\n/)
    .filter((line) => /(?:password|secret|token|access_key|secret_key|api_key|private_key|client_secret|db_password)/i.test(line));

  for (const line of literalSecretLines) {
    const match = line.match(/([A-Za-z0-9_]*(?:password|secret|token|access_key|secret_key|api_key|private_key|client_secret|db_password)[A-Za-z0-9_]*)\s*=\s*(.+)/i);
    if (!match) continue;

    const [, key, rawValue] = match;
    const trimmedValue = rawValue.trim();
    const literalValue = extractLiteralValue(trimmedValue);

    if (
      !literalValue ||
      !literalValue.length ||
      isTerraformReferenceLike(literalValue) ||
      literalValue === "null" ||
      literalValue === "true" ||
      literalValue === "false"
    ) {
      continue;
    }

    const lowerKey = key.toLowerCase();
    const sensitiveName = /password|secret|token|access_key|secret_key|api_key|private_key|client_secret|db_password/.test(lowerKey);

    if (sensitiveName) {
      findings.push({
        title: `Hardcoded secret value detected: ${key}`,
        severity: "CRITICAL",
        category: "Security",
        description:
          "The supplied Terraform contains a literal secret-like value assigned to a sensitive field. This is a high-risk configuration pattern unless the value is being sourced from a secure external reference.",
        recommendation:
          "Move the value to a secret manager, environment variable, or Terraform variable marked sensitive = true instead of hardcoding the value in the configuration.",
      });
      break;
    }
  }

  return findings;
}

function hasObviousTerraformSyntaxIssue(terraformText: string): boolean {
  const sanitized = terraformText
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/#.*$/gm, "")
    .replace(/\/\/.*$/gm, "");

  let braceDepth = 0;
  let parenDepth = 0;
  let bracketDepth = 0;
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let escaped = false;

  for (let index = 0; index < sanitized.length; index += 1) {
    const char = sanitized[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = true;
      continue;
    }

    if (char === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote;
      continue;
    }

    if (char === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
      continue;
    }

    if (inSingleQuote || inDoubleQuote) {
      continue;
    }

    if (char === "{") braceDepth += 1;
    if (char === "}") braceDepth -= 1;
    if (char === "(") parenDepth += 1;
    if (char === ")") parenDepth -= 1;
    if (char === "[") bracketDepth += 1;
    if (char === "]") bracketDepth -= 1;

    if ([braceDepth, parenDepth, bracketDepth].some((depth) => depth < 0)) {
      return true;
    }
  }

  if (braceDepth !== 0 || parenDepth !== 0 || bracketDepth !== 0) {
    return true;
  }

  const likelyUnclosedBlock =
    /(?:resource|module|variable|provider|data|locals|terraform|output)\s+["'][^"']+["']\s*\{[\s\S]*$/i.test(
      sanitized,
    ) && !/\}\s*$/.test(sanitized);

  if (likelyUnclosedBlock) {
    return true;
  }

  return false;
}

function analyzeTerraform(terraformText: string): Finding[] {
  const findings: Finding[] = [];
  const normalized = terraformText.trim();

  if (!normalized) {
    findings.push({
      title: "Empty Terraform configuration",
      severity: "CRITICAL",
      category: "Security",
      description: "No Terraform configuration was provided.",
      recommendation:
        "Paste a Terraform file or module definition before running the analyzer.",
    });
    return findings;
  }

  if (hasObviousTerraformSyntaxIssue(terraformText)) {
    findings.push({
      title: "Terraform syntax appears incomplete",
      severity: "WARNING",
      category: "Governance",
      description:
        "The supplied Terraform appears to be incomplete or malformed. Unable to fully verify this configuration from the supplied text.",
      recommendation:
        "Check the Terraform configuration for missing braces, quotes, or closing blocks before re-running the analyzer.",
    });
    return findings;
  }

  const blockPattern =
    /\b(?:resource|variable|module|provider|data|locals|terraform|output)\b/gi;
  const hasTerraformBlocks = blockPattern.test(terraformText);

  if (!hasTerraformBlocks) {
    findings.push({
      title: "Terraform structure not recognized",
      severity: "CRITICAL",
      category: "Governance",
      description:
        "The input does not appear to contain recognizable Terraform blocks.",
      recommendation:
        "Use standard Terraform blocks such as resource, variable, provider, module, data, locals, terraform, or output.",
    });
  } else {
    findings.push({
      title: "Terraform blocks detected",
      severity: "PASS",
      category: "Governance",
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
      category: "Security",
      description:
        "The configuration appears to embed secrets directly in Terraform values.",
      recommendation:
        "Store secrets in environment variables, secret managers, or Terraform variables with sensitive=true, and never commit literal secrets into source control.",
    });
  } else {
    findings.push({
      title: "No obvious hardcoded secrets",
      severity: "PASS",
      category: "Security",
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
      category: "Security",
      description:
        "A literal AWS access key pattern was found in the Terraform configuration.",
      recommendation:
        "Use IAM roles, workload identity, or environment-backed credentials instead of hardcoded AWS keys.",
    });
  } else {
    findings.push({
      title: "AWS credential handling not obviously hardcoded",
      severity: "PASS",
      category: "Security",
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
      category: "Networking",
      description:
        "The Terraform configuration exposes services to the public internet or broad CIDR ranges.",
      recommendation:
        "Restrict ingress to trusted IP ranges, use bastion or VPN patterns, and avoid exposing administrative ports publicly.",
    });
  } else {
    findings.push({
      title: "Public ingress not obviously exposed",
      severity: "PASS",
      category: "Networking",
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
      category: "Security",
      description:
        "One or more AWS resources appear to be missing standard encryption configuration.",
      recommendation:
        "Enable encryption for databases, EBS volumes, and S3 buckets using AWS managed keys or customer-managed keys where required.",
    });
  } else {
    findings.push({
      title: "Encryption requirements appear covered",
      severity: "PASS",
      category: "Security",
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
      category: "Security",
      description:
        "The configuration appears to configure S3 bucket access in a public or broadly shared way.",
      recommendation:
        "Use private ACLs or Bucket Policies, restrict public access, and prefer least-privilege access patterns.",
    });
  } else {
    findings.push({
      title: "S3 access policy not obviously public",
      severity: "PASS",
      category: "Security",
      description:
        "No obvious public ACL or public access policy pattern was detected for S3 resources.",
    });
  }

  const environmentSpecificDeclarations = terraformText.match(/(?:variable|locals)\s+"[^"]+"\s*\{[\s\S]*?(?:default|value)\s*=\s*["'](?:prod|production|staging|stage|dev|development|test|qa|uat)["']/gim) || [];

  if (environmentSpecificDeclarations.length > 0) {
    findings.push({
      title: "Hardcoded environment-specific values",
      severity: "WARNING",
      category: "Governance",
      description:
        "The Terraform config contains explicit environment-specific defaults that may be better handled with variables or environment tiers.",
      recommendation:
        "Prefer variables or tfvars files for region, environment, and account-specific values to reduce duplication and environment drift.",
    });
  } else {
    findings.push({
      title: "Environment configuration appears parameterized",
      severity: "PASS",
      category: "Governance",
      description:
        "No obvious hardcoded environment-specific values were detected.",
    });
  }

  const hasProviderBlock = /provider\s+"[^"]+"\s*\{/.test(terraformText);
  if (!hasProviderBlock) {
    findings.push({
      title: "Provider configuration not detected",
      severity: "WARNING",
      category: "Governance",
      description:
        "No provider block was found. This may be acceptable in modules, but it is worth confirming provider intent.",
      recommendation:
        "Define provider requirements explicitly where the module is meant to target a cloud platform.",
    });
  }

  const outputBlocks = terraformText.match(/output\s+"[^"]+"\s*\{/gim) || [];
  if (outputBlocks.length > 0) {
    findings.push({
      title: "Outputs defined",
      severity: "PASS",
      category: "Governance",
      description: `Terraform output blocks were detected (${outputBlocks.length}).`,
    });
  } else {
    findings.push({
      title: "Outputs not defined",
      severity: "WARNING",
      category: "Governance",
      description:
        "No output blocks were detected. Outputs make critical values easier to share and consume.",
      recommendation:
        "Add outputs for important values such as resource IDs, endpoints, and connection details.",
    });
  }

  findings.push(...analyzeIamPolicy(terraformText));
  findings.push(...analyzeSecurityGroups(terraformText));
  findings.push(...analyzeS3Buckets(terraformText));
  findings.push(...analyzeRds(terraformText));
  findings.push(...analyzeProviderVersionPinning(terraformText));
  findings.push(...analyzeModuleVersionPinning(terraformText));
  findings.push(...analyzeResourceTagging(terraformText));
  findings.push(...analyzeTerraformBackend(terraformText));
  findings.push(...analyzeBackups(terraformText));
  findings.push(...analyzeDeletionProtection(terraformText));
  findings.push(...analyzeLifecycleProtection(terraformText));
  findings.push(...analyzeHighAvailability(terraformText));
  findings.push(...analyzeLogging(terraformText));
  findings.push(...analyzeMonitoring(terraformText));
  findings.push(...analyzeSensitiveVariables(terraformText));

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
        <div>
          <h3 className="font-medium">{finding.title}</h3>
          <div className="mt-1 text-[10px] uppercase tracking-[0.18em] text-zinc-500">
            {finding.category}
          </div>
        </div>

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


