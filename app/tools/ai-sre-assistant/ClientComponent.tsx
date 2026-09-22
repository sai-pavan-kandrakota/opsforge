"use client";

import { useState } from "react";

// ---------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------

type IncidentSeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
type ConfidenceLevel = "High" | "Medium" | "Low";
type IncidentDomain =
  | "Kubernetes"
  | "AWS"
  | "CI/CD"
  | "Database"
  | "Networking"
  | "Application"
  | "Observability";

type DomainFinding = {
  domain: IncidentDomain;
  confidence: ConfidenceLevel;
  signals: string[];
};

type IncidentAnalysis = {
  severity: IncidentSeverity;
  severityEvidence: string[];
  primaryDomain: IncidentDomain | "Unknown";
  secondaryDomains: DomainFinding[];
  confidence: ConfidenceLevel;
  evidence: string[];
  summary: string;
  investigationSteps: string[];
  immediateActions: string[];
  followUpActions: string[];
  additionalInformationNeeded: string[];
};

// ---------------------------------------------------------------------
// Example inputs
// ---------------------------------------------------------------------

const exampleInputs: Record<string, string> = {
  crashLoop: `apiVersion: apps/v1
kind: Deployment
metadata:
  name: api
spec:
  replicas: 3
  selector:
    matchLabels:
      app: api
  template:
    metadata:
      labels:
        app: api
    spec:
      containers:
      - name: api
        image: registry.example.com/opsforge/api:2025.07.12
        ports:
        - containerPort: 8080
        readinessProbe:
          httpGet:
            path: /healthz
            port: 8080
          initialDelaySeconds: 10
          periodSeconds: 10
        livenessProbe:
          httpGet:
            path: /healthz
            port: 8080
          initialDelaySeconds: 20
          periodSeconds: 20
status:
  conditions:
    - type: Available
      status: "False"
  replicas: 3
  readyReplicas: 0
  unreadyReplicas: 3

Logs show: Back-off restarting failed container and CrashLoopBackOff after startup failures.
`,
  imagePullBackOff: `kubectl get pods
NAME                     READY   STATUS             RESTARTS   AGE
api-69b7f9d95f-7v4xw     0/1     ImagePullBackOff   0          4m
api-69b7f9d95f-7v5bdm     0/1     ImagePullBackOff   0          3m

Error: Failed to pull image "registry.example.com/opsforge/api:latest": pull access denied, repository does not exist or may require authorization.
`,
  http502: `Ingress logs show repeated 502 Bad Gateway responses from the frontend API route.
The service is intermittently unavailable and the upstream connection times out.
The issue started 20 minutes ago after a deployment to the API service.
`,
  highCpu: `Node memory and CPU are elevated across the api workload.
Multiple pods are in a hot state and p99 latency is increasing.
Prometheus alerts: container_cpu_usage_seconds_total spikes and OOMKilled events appear.
`,
  githubActions: `GitHub Actions deployment job failed during the production rollout.
The workflow reports: Error: failed to login to GHCR, and the deployment script exited with code 1.
The same job had a successful build step and then failed during image push.
` ,
};

// ---------------------------------------------------------------------
// Text normalization — collapses surface-form variants (CamelCase,
// hyphenated, spaced) of known technical terms into one canonical token,
// so downstream matching doesn't need to special-case every spelling.
// ---------------------------------------------------------------------

const CANONICALIZATION_RULES: Array<[RegExp, string]> = [
  [/crash[\s-]*loop[\s-]*back[\s-]*off/gi, " crashloopbackoff "],
  [/crash[\s-]*loop\b(?!\s*-?\s*back)/gi, " crashloopbackoff "],
  [/image[\s-]*pull[\s-]*back[\s-]*off/gi, " imagepullbackoff "],
  [/err[\s-]*image[\s-]*pull\b/gi, " imagepullbackoff "],
  [/access[\s-]*denied/gi, " accessdenied "],
  [/not[\s-]*authorized/gi, " notauthorized "],
  [/oom[\s-]*killed/gi, " oomkilled "],
  [/out[\s-]*of[\s-]*memory/gi, " oomkilled "],
  [/timed[\s-]*out/gi, " timeout "],
  [/time[\s-]*out/gi, " timeout "],
  [/connection[\s-]*refused/gi, " connectionrefused "],
  [/connection[\s-]*reset/gi, " connectionreset "],
];

function normalizeIncidentText(raw: string): string {
  let text = raw || "";

  for (const [pattern, replacement] of CANONICALIZATION_RULES) {
    text = text.replace(pattern, replacement);
  }

  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

// ---------------------------------------------------------------------
// Phrase matching + negation
// ---------------------------------------------------------------------

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findPhraseMatches(text: string, phrase: string): { start: number; end: number }[] {
  const pattern = new RegExp(`\\b${escapeRegExp(phrase)}\\b`, "gi");
  const occurrences: { start: number; end: number }[] = [];
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    occurrences.push({ start: match.index, end: match.index + match[0].length });
    if (match[0].length === 0) {
      pattern.lastIndex += 1;
    }
  }

  return occurrences;
}

const NEGATION_CUES =
  /\b(no|not|never|without|isn't|wasn't|aren't|weren't|don't|doesn't|didn't|hasn't|haven't|hadn't|wouldn't|couldn't|shouldn't|won't|cannot|can't|n't)\b/i;
const NEGATION_WINDOW_WORDS = 6;
const SENTENCE_BOUNDARY = /[.!?\n]/;

// Negation is scoped to the current sentence/clause (stops at ., !, ?, or a
// newline — but not at a comma, so a comma-separated list like "No
// Kubernetes, AWS, or CI/CD" stays one negatable unit) AND to the last few
// words within it, so a negation cue in an earlier, unrelated sentence can
// never suppress a match several sentences later.
function isNegated(text: string, matchIndex: number): boolean {
  let clauseStart = 0;
  for (let i = matchIndex - 1; i >= 0; i -= 1) {
    if (SENTENCE_BOUNDARY.test(text[i])) {
      clauseStart = i + 1;
      break;
    }
  }

  const clause = text.slice(clauseStart, matchIndex);
  const words = clause.trim().split(/\s+/).filter(Boolean).slice(-NEGATION_WINDOW_WORDS).join(" ");
  return NEGATION_CUES.test(words);
}

type Signal = { phrase: string; label: string; weight: 1 | 2 | 3 };

type SignalOccurrence = { phrase: string; label: string; weight: number; start: number; end: number };

// Collects non-negated matches, then suppresses a weaker occurrence whose
// entire span is contained inside a strictly stronger occurrence's span
// (e.g. "role" inside "iam role"), so overlapping sub-phrases of one
// stronger signal are no longer double-counted as independent evidence.
// Separate occurrences, repeated occurrences, and equal-weight overlaps
// are never suppressed. Finally deduped by evidence label (so a signal
// list with several surface forms mapped to the same label — e.g.
// "throttled"/"throttling"/"throttle" — never inflates the score or the
// evidence list beyond one entry).
function collectSignalMatches(text: string, signals: Signal[]): { label: string; weight: number }[] {
  const occurrences: SignalOccurrence[] = signals.flatMap((signal) =>
    findPhraseMatches(text, signal.phrase)
      .filter(({ start }) => !isNegated(text, start))
      .map(({ start, end }) => ({ phrase: signal.phrase, label: signal.label, weight: signal.weight, start, end }))
  );

  const surviving = occurrences.filter(
    (occ) =>
      !occurrences.some(
        (other) =>
          other.weight > occ.weight &&
          other.start <= occ.start &&
          other.end >= occ.end &&
          !(other.start === occ.start && other.end === occ.end)
      )
  );

  const bestByLabel = new Map<string, number>();
  for (const occ of surviving) {
    const current = bestByLabel.get(occ.label) ?? 0;
    if (occ.weight > current) {
      bestByLabel.set(occ.label, occ.weight);
    }
  }

  return Array.from(bestByLabel.entries()).map(([label, weight]) => ({ label, weight }));
}

// ---------------------------------------------------------------------
// Domain signal tables — strong (3) / moderate (2) / weak (1) evidence
// per domain. Generic, ambiguous words ("aws", "role", "pipeline") are
// deliberately weak-only, so a single stray mention can never by itself
// clear the inclusion threshold (see MIN_DOMAIN_SCORE below).
// ---------------------------------------------------------------------

const DOMAIN_SIGNALS: Record<IncidentDomain, Signal[]> = {
  Kubernetes: [
    { phrase: "crashloopbackoff", label: "CrashLoopBackOff", weight: 3 },
    { phrase: "imagepullbackoff", label: "ImagePullBackOff", weight: 3 },
    { phrase: "readiness probe", label: "Readiness probe", weight: 3 },
    { phrase: "liveness probe", label: "Liveness probe", weight: 3 },
    { phrase: "kubectl", label: "kubectl usage", weight: 3 },
    { phrase: "pod eviction", label: "Pod eviction", weight: 3 },
    { phrase: "oomkilled", label: "OOMKilled", weight: 2 },
    { phrase: "kubelet", label: "kubelet", weight: 2 },
    { phrase: "node pressure", label: "Node pressure", weight: 2 },
    { phrase: "cordoned", label: "Node cordoned", weight: 2 },
    { phrase: "evicted", label: "Pod evicted", weight: 2 },
    { phrase: "disk pressure", label: "Disk pressure", weight: 2 },
    { phrase: "namespace", label: "Namespace reference", weight: 1 },
    { phrase: "namespaces", label: "Namespace reference", weight: 1 },
    { phrase: "pod", label: "Pod reference", weight: 2 },
    { phrase: "pods", label: "Pod reference", weight: 2 },
    { phrase: "container", label: "Container reference", weight: 1 },
    { phrase: "containers", label: "Container reference", weight: 1 },
    { phrase: "helm", label: "Helm reference", weight: 1 },
    { phrase: "restart", label: "Restart", weight: 1 },
    { phrase: "rollout", label: "Rollout reference", weight: 1 },
  ],
  AWS: [
    { phrase: "accessdenied", label: "AccessDenied", weight: 3 },
    { phrase: "notauthorized", label: "Not authorized", weight: 3 },
    { phrase: "iam role", label: "IAM role", weight: 3 },
    { phrase: "eks", label: "EKS", weight: 3 },
    { phrase: "cloudtrail", label: "CloudTrail", weight: 3 },
    { phrase: "sts assume role", label: "STS AssumeRole", weight: 3 },
    { phrase: "s3 bucket", label: "S3 bucket", weight: 3 },
    { phrase: "alb", label: "ALB", weight: 2 },
    { phrase: "load balancer", label: "Load balancer", weight: 2 },
    { phrase: "quota exceeded", label: "Quota exceeded", weight: 2 },
    { phrase: "availability zone", label: "Availability zone", weight: 2 },
    { phrase: "ec2", label: "EC2", weight: 2 },
    { phrase: "autoscaling group", label: "Autoscaling group", weight: 2 },
    { phrase: "aws", label: "AWS reference", weight: 1 },
    { phrase: "iam", label: "IAM reference", weight: 1 },
    { phrase: "role", label: "Role reference", weight: 1 },
    { phrase: "roles", label: "Role reference", weight: 1 },
    { phrase: "throttled", label: "Throttling", weight: 1 },
    { phrase: "throttling", label: "Throttling", weight: 1 },
    { phrase: "throttle", label: "Throttling", weight: 1 },
  ],
  "CI/CD": [
    { phrase: "github actions", label: "GitHub Actions", weight: 3 },
    { phrase: "workflow failed", label: "Workflow failed", weight: 3 },
    { phrase: "pipeline failed", label: "Pipeline failed", weight: 3 },
    { phrase: "gitlab ci", label: "GitLab CI", weight: 3 },
    { phrase: "jenkins", label: "Jenkins", weight: 3 },
    { phrase: "build failed", label: "Build failed", weight: 3 },
    { phrase: "deployment failure", label: "Deployment failure", weight: 2 },
    { phrase: "rollout failure", label: "Rollout failure", weight: 2 },
    { phrase: "image push", label: "Image push", weight: 2 },
    { phrase: "docker build", label: "Docker build", weight: 2 },
    { phrase: "artifact", label: "Artifact reference", weight: 1 },
    { phrase: "artifacts", label: "Artifact reference", weight: 1 },
    { phrase: "unable to authenticate", label: "Authentication failure", weight: 2 },
    { phrase: "login failed", label: "Login failed", weight: 2 },
    { phrase: "pipeline", label: "Pipeline reference", weight: 1 },
    { phrase: "pipelines", label: "Pipeline reference", weight: 1 },
    { phrase: "workflow", label: "Workflow reference", weight: 1 },
    { phrase: "workflows", label: "Workflow reference", weight: 1 },
    { phrase: "ci/cd", label: "CI/CD reference", weight: 1 },
    { phrase: "cicd", label: "CI/CD reference", weight: 1 },
  ],
  Database: [
    { phrase: "deadlock", label: "Deadlock", weight: 3 },
    { phrase: "deadlocking", label: "Deadlock", weight: 3 },
    { phrase: "deadlocked", label: "Deadlock", weight: 3 },
    { phrase: "replication", label: "Replication issue", weight: 3 },
    { phrase: "postgres", label: "Postgres", weight: 3 },
    { phrase: "mysql", label: "MySQL", weight: 3 },
    { phrase: "sqlstate", label: "SQLSTATE error", weight: 3 },
    { phrase: "connection pool exhausted", label: "Connection pool exhausted", weight: 3 },
    { phrase: "too many connections", label: "Too many connections", weight: 3 },
    { phrase: "database", label: "Database reference", weight: 1 },
    { phrase: "db connection", label: "DB connection", weight: 2 },
    { phrase: "slow query", label: "Slow query", weight: 2 },
    { phrase: "lock timeout", label: "Lock timeout", weight: 2 },
    { phrase: "redis", label: "Redis", weight: 2 },
    { phrase: "query", label: "Query reference", weight: 1 },
    { phrase: "queries", label: "Query reference", weight: 1 },
    { phrase: "connection pool", label: "Connection pool reference", weight: 1 },
    { phrase: "index", label: "Index reference", weight: 1 },
  ],
  Networking: [
    { phrase: "dns resolution", label: "DNS resolution failure", weight: 3 },
    { phrase: "connectionrefused", label: "Connection refused", weight: 3 },
    { phrase: "connectionreset", label: "Connection reset", weight: 3 },
    { phrase: "tls handshake", label: "TLS handshake failure", weight: 3 },
    { phrase: "certificate expired", label: "Certificate expired", weight: 3 },
    { phrase: "gateway timeout", label: "Gateway timeout", weight: 3 },
    { phrase: "dns", label: "DNS reference", weight: 2 },
    { phrase: "tls", label: "TLS reference", weight: 2 },
    { phrase: "certificate", label: "Certificate reference", weight: 1 },
    { phrase: "upstream", label: "Upstream reference", weight: 2 },
    { phrase: "ingress", label: "Ingress reference", weight: 2 },
    { phrase: "load balancer", label: "Load balancer", weight: 2 },
    { phrase: "gateway", label: "Gateway reference", weight: 1 },
    { phrase: "handshake", label: "Handshake reference", weight: 1 },
    { phrase: "network", label: "Network reference", weight: 1 },
    { phrase: "networks", label: "Network reference", weight: 1 },
  ],
  Application: [
    { phrase: "stack trace", label: "Stack trace", weight: 3 },
    { phrase: "unhandled exception", label: "Unhandled exception", weight: 3 },
    { phrase: "segmentation fault", label: "Segmentation fault", weight: 3 },
    { phrase: "null pointer", label: "Null pointer", weight: 3 },
    { phrase: "exception", label: "Exception", weight: 1 },
    { phrase: "exceptions", label: "Exception", weight: 1 },
    { phrase: "traceback", label: "Traceback", weight: 2 },
    { phrase: "http 500", label: "HTTP 500", weight: 2 },
    { phrase: "panic", label: "Panic", weight: 1 },
    { phrase: "config error", label: "Config error", weight: 2 },
    { phrase: "error", label: "Error reference", weight: 1 },
    { phrase: "errors", label: "Error reference", weight: 1 },
    { phrase: "bug", label: "Bug reference", weight: 1 },
    { phrase: "bugs", label: "Bug reference", weight: 1 },
    { phrase: "crash", label: "Crash reference", weight: 1 },
  ],
  Observability: [
    { phrase: "slo breach", label: "SLO breach", weight: 3 },
    { phrase: "error budget", label: "Error budget", weight: 3 },
    { phrase: "prometheus alert", label: "Prometheus alert", weight: 3 },
    { phrase: "grafana dashboard", label: "Grafana dashboard alert", weight: 3 },
    { phrase: "slo", label: "SLO reference", weight: 2 },
    { phrase: "prometheus", label: "Prometheus", weight: 2 },
    { phrase: "grafana", label: "Grafana", weight: 2 },
    { phrase: "alert fired", label: "Alert fired", weight: 2 },
    { phrase: "metrics spike", label: "Metrics spike", weight: 2 },
    { phrase: "trace latency", label: "Trace latency", weight: 2 },
    { phrase: "alert", label: "Alert reference", weight: 1 },
    { phrase: "alerts", label: "Alert reference", weight: 1 },
    { phrase: "metrics", label: "Metrics reference", weight: 1 },
    { phrase: "dashboard", label: "Dashboard reference", weight: 1 },
    { phrase: "trace", label: "Trace reference", weight: 1 },
    { phrase: "traces", label: "Trace reference", weight: 1 },
  ],
};

// A domain must clear this score before it is named at all — a single
// weak, generic signal (e.g. the bare word "role") can never alone
// reach it, which is what previously caused an HR sentence about a
// person's "role" to be classified as an AWS incident.
const MIN_DOMAIN_SCORE = 2;

function confidenceFromScore(score: number): ConfidenceLevel {
  if (score >= 6) return "High";
  if (score >= 3) return "Medium";
  return "Low";
}

function scoreDomains(text: string): { domain: IncidentDomain; score: number; signals: string[] }[] {
  const domains = Object.keys(DOMAIN_SIGNALS) as IncidentDomain[];

  return domains
    .map((domain) => {
      const matches = collectSignalMatches(text, DOMAIN_SIGNALS[domain]);
      const score = matches.reduce((sum, m) => sum + m.weight, 0);
      return { domain, score, signals: matches.map((m) => m.label) };
    })
    .filter((result) => result.score >= MIN_DOMAIN_SCORE)
    .sort((a, b) => b.score - a.score);
}

// ---------------------------------------------------------------------
// Severity — scored independently of domain detection, over the same
// normalized text, so severity never depends on whether a domain was
// recognized (an incident can be "severity: CRITICAL, domain: Unknown").
// ---------------------------------------------------------------------

const SEVERITY_SIGNALS: Signal[] = [
  { phrase: "total outage", label: "Total outage", weight: 3 },
  { phrase: "full outage", label: "Full outage", weight: 3 },
  { phrase: "production down", label: "Production down", weight: 3 },
  { phrase: "data loss", label: "Data loss", weight: 3 },
  { phrase: "security breach", label: "Security breach", weight: 3 },
  { phrase: "nobody can access", label: "Nobody can access the service", weight: 3 },
  { phrase: "nobody can log in", label: "Nobody can log in", weight: 3 },
  { phrase: "site down", label: "Site down", weight: 3 },
  { phrase: "all pods down", label: "All pods down", weight: 3 },
  { phrase: "service completely down", label: "Service completely down", weight: 3 },
  { phrase: "outage", label: "Outage", weight: 2 },
  { phrase: "unavailable", label: "Unavailable", weight: 2 },
  { phrase: "critical", label: "Marked critical", weight: 2 },
  { phrase: "crashloopbackoff", label: "CrashLoopBackOff", weight: 2 },
  { phrase: "oomkilled", label: "OOMKilled", weight: 2 },
  { phrase: "accessdenied", label: "AccessDenied", weight: 2 },
  { phrase: "imagepullbackoff", label: "ImagePullBackOff", weight: 2 },
  { phrase: "repeated failures", label: "Repeated failures", weight: 2 },
  { phrase: "failed rollout", label: "Failed rollout", weight: 2 },
  { phrase: "deployment failure", label: "Deployment failure", weight: 2 },
  { phrase: "service down", label: "Service down", weight: 2 },
  { phrase: "timeout", label: "Timeout", weight: 1 },
  { phrase: "connectionrefused", label: "Connection refused", weight: 1 },
  { phrase: "connectionreset", label: "Connection reset", weight: 1 },
  { phrase: "warning", label: "Warning", weight: 1 },
  { phrase: "partial outage", label: "Partial outage", weight: 1 },
  { phrase: "degraded", label: "Degraded", weight: 1 },
  { phrase: "error rate", label: "Elevated error rate", weight: 1 },
  { phrase: "slow", label: "Reported as slow", weight: 1 },
];

function scoreSeverity(text: string): { severity: IncidentSeverity; evidence: string[] } {
  const matches = collectSignalMatches(text, SEVERITY_SIGNALS);
  const score = matches.reduce((sum, m) => sum + m.weight, 0);

  let severity: IncidentSeverity = "LOW";
  if (score >= 5) severity = "CRITICAL";
  else if (score >= 2) severity = "HIGH";
  else if (score >= 1) severity = "MEDIUM";

  return { severity, evidence: matches.map((m) => m.label) };
}

// ---------------------------------------------------------------------
// Domain-specific content — investigation steps, immediate actions, and
// follow-up actions are generated from the detected primary domain
// instead of one hardcoded block shared by every incident.
// ---------------------------------------------------------------------

const INVESTIGATION_STEPS: Record<IncidentDomain, string[]> = {
  Kubernetes: [
    "Inspect pod status (`kubectl get pods -n <namespace>`) for CrashLoopBackOff, ImagePullBackOff, or Pending state.",
    "Inspect recent events (`kubectl get events --sort-by=.lastTimestamp`) for scheduling, image, or probe failures.",
    "Inspect container logs, including the previous instance if it has restarted (`kubectl logs <pod> --previous`).",
    "Inspect resource requests/limits and node capacity if OOM or eviction is suspected.",
    "Inspect recent deployment or rollout history for a correlated change (`kubectl rollout history`).",
  ],
  AWS: [
    "Inspect CloudTrail for the relevant time window if an authorization or configuration change is suspected.",
    "Validate the IAM role or policy has the specific permission the failing action requires.",
    "Check the AWS Service Health Dashboard for the affected service and region.",
    "Check service quotas and limits for the affected resource type.",
    "Confirm the correct account and region context were used for the failing call.",
  ],
  "CI/CD": [
    "Inspect the failed workflow or job run in full, including the specific failing step.",
    "Compare the failing revision against the last known-good run for changed steps, dependencies, or configuration.",
    "Inspect credentials, tokens, and secrets used by the pipeline for expiry or permission changes.",
    "Inspect artifact publication and image registry authentication.",
    "Confirm whether the failure is isolated to this pipeline or affects other pipelines on the same runner.",
  ],
  Database: [
    "Inspect active connection count and pool saturation against the configured limit.",
    "Inspect slow-query logs or currently running queries for long-held locks.",
    "Inspect for deadlocks and identify the transactions or queries involved.",
    "Inspect replication lag and replica health if applicable.",
    "Inspect storage capacity and disk I/O saturation.",
  ],
  Networking: [
    "Validate DNS resolution for the affected hostname from both an affected and an unaffected host.",
    "Test raw connectivity — TCP and TLS handshake — to the upstream endpoint.",
    "Inspect load balancer or ingress controller health checks and target status.",
    "Check proxy or gateway logs for repeated timeouts, connection-refused, or connection-reset errors.",
    "Inspect TLS certificate validity and expiration.",
  ],
  Application: [
    "Inspect the full stack trace and the first failing frame in application code.",
    "Inspect recent code or configuration deployments correlated with the failure start time.",
    "Inspect dependency and downstream service health and response times.",
    "Reproduce the failure path with the same input in a non-production environment if it is safe to do so.",
  ],
  Observability: [
    "Confirm the alert's underlying query and threshold, and whether it reflects real user impact or a noisy signal.",
    "Inspect the dashboard for the affected service around the alert window for correlated metrics.",
    "Determine which SLO or error budget is being consumed and at what rate.",
    "Cross-reference logs and traces for the same time window to identify the first failing request.",
  ],
};

function investigationStepsFor(domain: IncidentDomain): string[] {
  return INVESTIGATION_STEPS[domain] ?? [];
}

const IMMEDIATE_ACTION_BY_DOMAIN: Record<IncidentDomain, string> = {
  Kubernetes:
    "Confirm whether failing pods are crashing due to image, config, resource-limit, or probe issues before forcing a restart; prefer a controlled rollback over ad hoc redeploys if a recent change correlates.",
  AWS: "Confirm the specific IAM permission, service limit, or configuration causing the failure before broadening access or retrying blindly.",
  "CI/CD":
    "Isolate the failing pipeline stage and verify the artifact or image publication path before re-running the full pipeline.",
  Database:
    "Identify and, if safe, terminate the specific blocking query or connection rather than restarting the database wholesale.",
  Networking:
    "Validate DNS, TLS, and ingress/load-balancer health before changing traffic routing or restarting services.",
  Application: "Isolate the failing request path and check for a correlated deployment before rolling back broadly.",
  Observability:
    "Confirm the alert reflects real user impact before paging further; check for a known noisy or misconfigured alert.",
};

function immediateActionsFor(domain: IncidentDomain, severity: IncidentSeverity): string[] {
  const actions = [IMMEDIATE_ACTION_BY_DOMAIN[domain]];

  if (severity === "CRITICAL" || severity === "HIGH") {
    actions.push(
      "Preserve current logs, metrics, and state as evidence before taking remediation steps that are hard to reverse.",
    );
  }

  return actions;
}

const FOLLOWUP_BY_DOMAIN: Record<IncidentDomain, string> = {
  Kubernetes:
    "Review the triggering deployment or configuration change and add a guardrail — resource limits, probe tuning, or a staged rollout — to prevent recurrence.",
  AWS: "Conduct a least-privilege review of the IAM role or policy involved before re-granting or widening access.",
  "CI/CD":
    "Document the root cause in the pipeline runbook and add a guardrail — a required check, permission scope, or dependency pin — to prevent recurrence.",
  Database:
    "Review the query or transaction pattern that caused the contention and consider an index, timeout, or transaction-scope change.",
  Networking:
    "Confirm whether the issue was transient or requires a configuration or certificate-renewal fix, and document the resolution.",
  Application: "File the root cause with the owning team and add a regression test or monitor covering this failure path.",
  Observability:
    "Review whether the alert threshold reflects real user impact; tune it if noisy, or formalize it if it caught a genuine issue.",
};

function followUpActionsFor(domain: IncidentDomain, severity: IncidentSeverity, ongoing: boolean): string[] {
  const actions: string[] = [];

  if (severity === "CRITICAL" || severity === "HIGH") {
    actions.push(
      "Document a full incident timeline and hold a review before the same change or condition is allowed to repeat.",
    );
  } else {
    actions.push(
      "Track recurrence — if this pattern repeats, treat it as a signal to address the underlying cause rather than the symptom.",
    );
  }

  actions.push(FOLLOWUP_BY_DOMAIN[domain]);

  if (ongoing && (severity === "CRITICAL" || severity === "HIGH")) {
    actions.push("Confirm the incident is fully mitigated and stable before closing it out.");
  }

  return actions;
}

const RESOLVED_CUES = /\b(resolved|fixed|mitigated|restored|back online|back up|no longer occurring)\b/i;

function looksResolved(text: string): boolean {
  return RESOLVED_CUES.test(text);
}

function additionalInfoNeeded(): string[] {
  return [
    "The exact error message or a short log excerpt",
    "Which service, workload, or component is affected",
    "Any recent deployment, configuration, or infrastructure change",
    "When the issue started and whether it is ongoing",
    "Which platform is involved (Kubernetes, a specific cloud provider, a specific database, etc.)",
  ];
}

// Reuses the app's canonical severity colors (red/amber/emerald) rather than
// introducing a new color for this tool's four-tier CRITICAL/HIGH/MEDIUM/LOW
// model. CRITICAL and HIGH share red — the canonical palette has no separate
// "danger-adjacent" hue once rose is retired as a severity color.
function severityTextClass(severity: IncidentSeverity): string {
  if (severity === "CRITICAL" || severity === "HIGH") return "text-red-400";
  if (severity === "MEDIUM") return "text-amber-400";
  return "text-emerald-400";
}

function buildSummary(domain: IncidentDomain, confidence: ConfidenceLevel, severity: IncidentSeverity, signals: string[]): string {
  const evidenceList = signals.slice(0, 3).join(", ");
  return `${domain} incident, ${confidence.toLowerCase()} confidence, based on: ${evidenceList}. Severity assessed as ${severity}.`;
}

// ---------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------

function emptyInputAnalysis(): IncidentAnalysis {
  return {
    severity: "LOW",
    severityEvidence: [],
    primaryDomain: "Unknown",
    secondaryDomains: [],
    confidence: "Low",
    evidence: [],
    summary: "Paste an incident description, log excerpt, alert, or deployment failure to run an analysis.",
    investigationSteps: [],
    immediateActions: [],
    followUpActions: [],
    additionalInformationNeeded: additionalInfoNeeded(),
  };
}

function analyzeIncident(input: string): IncidentAnalysis {
  const raw = (input || "").trim();

  if (!raw) {
    return emptyInputAnalysis();
  }

  const text = normalizeIncidentText(raw);
  const { severity, evidence: severityEvidence } = scoreSeverity(text);
  const domainScores = scoreDomains(text);
  const ongoing = !looksResolved(text);

  if (domainScores.length === 0) {
    return {
      severity,
      severityEvidence,
      primaryDomain: "Unknown",
      secondaryDomains: [],
      confidence: "Low",
      evidence: [],
      summary:
        severity === "LOW"
          ? "Not enough specific evidence was found to identify a failure domain or confirm severity from the text provided."
          : `Severity appears ${severity.toLowerCase()} based on the language used, but no specific system or platform could be identified from the text provided.`,
      investigationSteps: [],
      immediateActions: [
        "Preserve the current state and any logs, alerts, or dashboards before making changes.",
        "Confirm the blast radius — which users, services, or environments are affected.",
      ],
      followUpActions: [
        "Gather the specific error messages, affected service, and recent changes, then re-run the analysis with that detail.",
      ],
      additionalInformationNeeded: additionalInfoNeeded(),
    };
  }

  const primary = domainScores[0];
  const secondaryDomains: DomainFinding[] = domainScores.slice(1).map((d) => ({
    domain: d.domain,
    confidence: confidenceFromScore(d.score),
    signals: d.signals,
  }));
  const primaryConfidence = confidenceFromScore(primary.score);

  return {
    severity,
    severityEvidence,
    primaryDomain: primary.domain,
    secondaryDomains,
    confidence: primaryConfidence,
    evidence: primary.signals,
    summary: buildSummary(primary.domain, primaryConfidence, severity, primary.signals),
    investigationSteps: investigationStepsFor(primary.domain),
    immediateActions: immediateActionsFor(primary.domain, severity),
    followUpActions: followUpActionsFor(primary.domain, severity, ongoing),
    additionalInformationNeeded: [],
  };
}

// ---------------------------------------------------------------------
// Small inline-code renderer for investigation steps (`kubectl ...`)
// ---------------------------------------------------------------------

function renderWithInlineCode(text: string) {
  const parts = text.split(/(`[^`]+`)/g);
  return parts.map((part, index) => {
    if (part.startsWith("`") && part.endsWith("`") && part.length > 1) {
      return (
        <code key={index} className="rounded bg-zinc-800 px-1.5 py-0.5 text-cyan-200">
          {part.slice(1, -1)}
        </code>
      );
    }
    return <span key={index}>{part}</span>;
  });
}

// ---------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------

export default function AiSreAssistantPage() {
  const [input, setInput] = useState(exampleInputs.crashLoop);
  const [analysis, setAnalysis] = useState<IncidentAnalysis>(() => {
    try {
      return analyzeIncident(exampleInputs.crashLoop);
    } catch {
      return emptyInputAnalysis();
    }
  });
  const [error, setError] = useState("");

  const handleAnalyze = () => {
    if (!input.trim()) {
      setError("Please paste an incident description, log excerpt, alert, or deployment failure before running the analysis.");
      return;
    }

    try {
      const result = analyzeIncident(input);
      setError("");
      setAnalysis(result);
    } catch {
      setError(
        "Analysis failed for this input. This does not mean the incident is resolved — the analyzer could not process the pasted text. The previous result below is unchanged; try shortening or simplifying the input and analyze again.",
      );
    }
  };

  const handleClear = () => {
    setInput("");
    setError("");
    setAnalysis(emptyInputAnalysis());
  };

  const loadExample = (key: keyof typeof exampleInputs) => {
    setInput(exampleInputs[key]);

    try {
      const result = analyzeIncident(exampleInputs[key]);
      setError("");
      setAnalysis(result);
    } catch {
      setError("Could not generate the example analysis. Please try again.");
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="mb-8 rounded-2xl border border-zinc-800 bg-zinc-900/80 p-6 shadow-2xl shadow-zinc-950/60 backdrop-blur-sm">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.25em] text-cyan-400">OpsForge</p>
          <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">SRE Incident Analyzer</h1>
          <p className="mt-3 max-w-3xl text-base text-zinc-400">
            Deterministic incident triage: classify the likely failure domain, assess severity, and get an evidence-based investigation plan — entirely in your browser, no external calls.
          </p>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-4 shadow-xl shadow-zinc-950/40">
          <div className="mb-4 flex flex-wrap gap-2">
            {[
              ["Kubernetes CrashLoopBackOff", "crashLoop"],
              ["Kubernetes ImagePullBackOff", "imagePullBackOff"],
              ["HTTP 502 / 503", "http502"],
              ["High CPU / memory", "highCpu"],
              ["GitHub Actions deployment failure", "githubActions"],
            ].map(([label, key]) => (
              <button
                key={key}
                type="button"
                onClick={() => loadExample(key as keyof typeof exampleInputs)}
                className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-xs font-medium text-zinc-300 transition hover:border-cyan-500 hover:text-cyan-300"
              >
                {label}
              </button>
            ))}
          </div>

          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            spellCheck={false}
            aria-label="Incident details input"
            className="h-[360px] w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 font-mono text-sm text-zinc-200 outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/30"
            placeholder="Paste incident details, logs, alerts, application errors, deployment failures, or Kubernetes issues here..."
          />

          {error ? (
            <div role="alert" className="mt-3 rounded-lg border border-rose-500/20 bg-rose-500/10 p-3 text-sm text-rose-200">
              {error}
            </div>
          ) : null}

          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleAnalyze}
              className="rounded-lg bg-cyan-500 px-4 py-2.5 text-sm font-semibold text-zinc-950 transition hover:bg-cyan-400"
            >
              Analyze Incident
            </button>
            <button
              type="button"
              onClick={handleClear}
              className="rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2.5 text-sm font-medium text-zinc-300 transition hover:border-zinc-500 hover:text-white"
            >
              Clear
            </button>
          </div>
        </div>

        <section className="mt-8 rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5 shadow-xl shadow-zinc-950/40">
          <div className="mb-5 flex items-center justify-between gap-3">
            <h2 className="text-xl font-semibold text-white">Incident analysis</h2>
          </div>

          <p className="mb-5 text-sm leading-6 text-zinc-400">{analysis.summary}</p>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-4">
              <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">Primary domain</div>
              <div className="mt-2">
                <span className="inline-flex rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2 py-1 text-sm text-cyan-200">
                  {analysis.primaryDomain}
                </span>
              </div>
            </div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-4">
              <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">Severity</div>
              <div className={`mt-3 text-xl font-bold ${severityTextClass(analysis.severity)}`}>{analysis.severity}</div>
            </div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-4">
              <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">Confidence</div>
              <div className="mt-3 text-xl font-bold text-white">{analysis.confidence}</div>
            </div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-4">
              <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">Secondary domains</div>
              <div className="mt-2 flex flex-wrap gap-2 text-sm text-zinc-400">
                {analysis.secondaryDomains.length === 0 ? (
                  <span className="text-zinc-600">None identified</span>
                ) : (
                  analysis.secondaryDomains.map((d) => (
                    <span
                      key={d.domain}
                      title={`${d.confidence} confidence — ${d.signals.join(", ")}`}
                      className="rounded-full border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs"
                    >
                      {d.domain} ({d.confidence})
                      <span className="sr-only">
                        signals: {d.signals.join(", ")}
                      </span>
                    </span>
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="mt-6 grid gap-4">
            <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-4">
              <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-zinc-500">Evidence</h3>
              {analysis.evidence.length === 0 ? (
                <p className="mt-3 text-sm leading-6 text-zinc-500">No specific evidence phrases were matched for a primary domain.</p>
              ) : (
                <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-zinc-400">
                  {analysis.evidence.map((item, index) => (
                    <li key={`${item}-${index}`}>{item}</li>
                  ))}
                </ul>
              )}
              {analysis.severityEvidence.length > 0 ? (
                <p className="mt-3 text-xs text-zinc-600">
                  Severity evidence: {analysis.severityEvidence.join(", ")}
                </p>
              ) : null}
            </div>

            {analysis.investigationSteps.length > 0 ? (
              <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-4">
                <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-zinc-500">Investigation plan</h3>
                <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-6 text-zinc-400">
                  {analysis.investigationSteps.map((step, index) => (
                    <li key={`${step}-${index}`}>{renderWithInlineCode(step)}</li>
                  ))}
                </ol>
              </div>
            ) : null}

            {analysis.immediateActions.length > 0 ? (
              <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-4">
                <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-zinc-500">Immediate actions</h3>
                <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-zinc-400">
                  {analysis.immediateActions.map((item, index) => (
                    <li key={`${item}-${index}`}>{item}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {analysis.followUpActions.length > 0 ? (
              <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-4">
                <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-zinc-500">Follow-up / root-cause review</h3>
                <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-zinc-400">
                  {analysis.followUpActions.map((item, index) => (
                    <li key={`${item}-${index}`}>{item}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {analysis.additionalInformationNeeded.length > 0 ? (
              <div className="rounded-xl border border-amber-900/40 bg-amber-950/10 p-4">
                <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-amber-400">Additional information needed</h3>
                <p className="mt-2 text-sm leading-6 text-zinc-400">
                  The failure domain could not be determined from the text provided. Provide any of the following for a more useful analysis:
                </p>
                <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-zinc-400">
                  {analysis.additionalInformationNeeded.map((item, index) => (
                    <li key={`${item}-${index}`}>{item}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </section>

        <div className="mt-6 rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-4 text-sm text-cyan-100">
          OpsForge provides diagnostic suggestions, not definitive incident conclusions. Verify commands and recommendations against your environment before execution.
        </div>
      </div>
    </div>
  );
}
