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

function getResourceBlocks(terraformText: string, resourceType: string): string[] {
  const pattern = new RegExp(
    `resource\\s+"${resourceType}"\\s+"[^"]+"\\s*\\{[\\s\\S]*?\\n\\s*\\}`,
    "gim",
  );
  return terraformText.match(pattern) || [];
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
  let wildcardAction = false;
  let wildcardResource = false;
  let broadAction = false;
  const policyExamples: string[] = [];

  for (const resourceType of policyResourceTypes) {
    const blocks = getResourceBlocks(terraformText, resourceType);
    for (const block of blocks) {
      sawPolicyBlock = true;
      policyExamples.push(block);

      const actionMatches =
        /(?:Action|actions)\s*=\s*["']([^"']+)["']|["']Action["']\s*:\s*["']([^"']+)["']|["']action["']\s*:\s*["']([^"']+)["']/gi;
      const resourceMatches =
        /(?:Resource|resources)\s*=\s*["']([^"']+)["']|["']Resource["']\s*:\s*["']([^"']+)["']|["']resource["']\s*:\s*["']([^"']+)["']/gi;

      const actionText = block.match(actionMatches)?.join(" ") ?? "";
      const resourceText = block.match(resourceMatches)?.join(" ") ?? "";

      if (/(?:\*|iam:\*)/i.test(actionText)) {
        wildcardAction = true;
      }
      if (/(?:\*|\[\s*"\*"\s*\]|\[\s*\*\s*\])/.test(actionText)) {
        wildcardAction = true;
      }
      if (/(?:\*|\[\s*"\*"\s*\]|\[\s*\*\s*\])/.test(resourceText)) {
        wildcardResource = true;
      }
      if (/iam:\*/i.test(actionText)) {
        broadAction = true;
      }
    }
  }

  if (!sawPolicyBlock) {
    return findings;
  }

  if (wildcardAction && wildcardResource) {
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

  if (wildcardAction || wildcardResource || broadAction) {
    findings.push({
      title: "IAM policy contains broad wildcard permissions",
      severity: "WARNING",
      category: "Security",
      description:
        "The supplied Terraform includes wildcard IAM actions or resources, or a broad iam:* pattern. This is not automatically malicious, but it warrants review and least-privilege tightening.",
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
      category: "Governance",
      description:
        "The Terraform config contains environment-specific configuration values that are often better handled by variables or separate environment tiers.",
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
  const hasRequiredProviders = /required_providers\s*\{/.test(terraformText);
  const versionUsagePattern = /version\s*=\s*["'].*["']/g;
  const versionPins = terraformText.match(versionUsagePattern) || [];

  if (hasRequiredProviders || versionPins.length > 0) {
    findings.push({
      title: "Provider version constraints are present",
      severity: "PASS",
      category: "Governance",
      description:
        "Terraform provider versions appear to be constrained or pinned.",
    });
  } else if (hasProviderBlock) {
    findings.push({
      title: "Provider version pinning missing",
      severity: "WARNING",
      category: "Governance",
      description:
        "The provider block exists, but no obvious version constraint is configured.",
      recommendation:
        "Add a version constraint using required_providers or provider version settings to reduce surprise upgrades.",
    });
  } else {
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
      category: "Governance",
      description:
        "Some AWS resources do not appear to define tags, which is often expected for ownership, cost, and governance.",
      recommendation:
        "Add common tags such as Name, Environment, Owner, and CostCenter to critical infrastructure resources.",
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

  const backendPattern = /terraform\s*\{[\s\S]*?backend\s+"[^"]+"\s*\{/im;
  if (backendPattern.test(terraformText)) {
    findings.push({
      title: "Remote backend configured",
      severity: "PASS",
      category: "Governance",
      description:
        "A remote backend block was detected, which is better for team collaboration and state management.",
    });
  } else {
    findings.push({
      title: "No remote backend configured",
      severity: "WARNING",
      category: "Governance",
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
