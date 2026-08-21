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

type ParseResult =
  | { ok: true; document: Record<string, unknown> }
  | { ok: false; error: string };

const exampleHelm = `apiVersion: v2
name: opsforge-web
version: 0.1.0
appVersion: "1.8.2"
description: Web application for OpsForge
type: application

# Defaults intended for lower-risk environments.
values:
  replicaCount: 2
  image:
    repository: ghcr.io/example/opsforge-web
    tag: "1.8.2"
    pullPolicy: IfNotPresent
  service:
    type: ClusterIP
    port: 80
  ingress:
    enabled: true
    className: nginx
    annotations:
      kubernetes.io/ingress.class: nginx
  resources:
    requests:
      cpu: 200m
      memory: 256Mi
    limits:
      cpu: 500m
      memory: 512Mi
  securityContext:
    runAsNonRoot: true
    allowPrivilegeEscalation: false
    readOnlyRootFilesystem: true
    capabilities:
      drop: ["ALL"]
  env:
    - name: NODE_ENV
      value: production
    - name: API_URL
      value: "https://api.example.com"

{{- if .Values.ingress.enabled }}
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: {{ .Release.Name }}-ingress
  labels:
    app.kubernetes.io/name: {{ .Chart.Name }}
  annotations:
    kubernetes.io/ingress.class: nginx
spec:
  rules:
    - host: example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: {{ .Release.Name }}-service
                port:
                  number: 80
{{- end }}

---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ .Release.Name }}
  labels:
    app: {{ .Chart.Name }}
spec:
  replicas: {{ .Values.replicaCount }}
  selector:
    matchLabels:
      app: {{ .Chart.Name }}
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxUnavailable: 25%
      maxSurge: 25%
  template:
    metadata:
      labels:
        app: {{ .Chart.Name }}
    spec:
      securityContext:
        runAsNonRoot: true
      containers:
        - name: web
          image: "{{ .Values.image.repository }}:{{ .Values.image.tag }}"
          imagePullPolicy: {{ .Values.image.pullPolicy }}
          ports:
            - containerPort: 80
          readinessProbe:
            httpGet:
              path: /healthz
              port: 80
          livenessProbe:
            httpGet:
              path: /healthz
              port: 80
          securityContext:
            runAsNonRoot: true
            allowPrivilegeEscalation: false
            readOnlyRootFilesystem: true
            capabilities:
              drop: ["ALL"]
          resources:
            requests:
              cpu: 200m
              memory: 256Mi
            limits:
              cpu: 500m
              memory: 512Mi
---
apiVersion: v1
kind: Service
metadata:
  name: {{ .Release.Name }}-service
spec:
  selector:
    app: {{ .Chart.Name }}
  ports:
    - port: 80
      targetPort: 80
      protocol: TCP
`;

function hasHelmTemplateSyntax(value: string): boolean {
  return /\{\{[-#]?\s*[\s\S]*?[-#]?\s*\}\}/.test(value);
}

function sanitizeHelmTemplateContent(value: string): string {
  const withoutConditionalBlocks = value
    .replace(/\{\{[-#]?\s*(?:if|range|with)\b[\s\S]*?\}\}[\s\S]*?\{\{[-#]?\s*(?:else|end)\b[\s\S]*?\}\}/g, " ")
    .replace(/\{\{[-#]?\s*(?:if|range|with)\b[\s\S]*?\}\}/g, " ")
    .replace(/\{\{[-#]?\s*(?:else|end)\b[\s\S]*?\}\}/g, " ");

  return withoutConditionalBlocks.replace(
    /\{\{[-#]?\s*(?:include|tpl|template|printf|toYaml|toJson|quote|default|required|trim|trimSuffix|trimPrefix|replace|split|join|list|dict|coalesce|first|last|title|lower|upper|b64enc|b64dec|if|range|with|else|end|eq|ne|lt|gt|and|or|not)\b[\s\S]*?[-#]?\s*\}\}/g,
    " __HELM_PLACEHOLDER__ ",
  ).replace(/\{\{[\s\S]*?\}\}/g, " __HELM_PLACEHOLDER__ ");
}

function safeYamlParse(rawText: string): {
  ok: boolean;
  kind: "helm-template" | "yaml" | "malformed";
  documents: Record<string, unknown>[];
  error?: string;
} {
  const trimmed = rawText.trim();

  if (!trimmed) {
    return {
      ok: false,
      kind: "malformed",
      documents: [],
      error: "The input is empty. Paste Helm values, templates, or a chart manifest first.",
    };
  }

  const hasHelmSyntax = hasHelmTemplateSyntax(trimmed);
  const sanitized = hasHelmSyntax ? sanitizeHelmTemplateContent(trimmed) : trimmed;

  try {
    const documents = [] as Record<string, unknown>[];
    const parsedDocs = yaml.loadAll(sanitized) as unknown[];

    for (const parsedDoc of parsedDocs) {
      if (parsedDoc && typeof parsedDoc === "object") {
        documents.push(parsedDoc as Record<string, unknown>);
      }
    }

    if (documents.length === 0) {
      return {
        ok: false,
        kind: hasHelmSyntax ? "helm-template" : "malformed",
        documents: [],
        error: hasHelmSyntax
          ? "Helm template syntax was detected, but the normalized content did not produce any parseable YAML documents."
          : "The content could not be parsed into a valid YAML document.",
      };
    }

    return {
      ok: true,
      kind: hasHelmSyntax ? "helm-template" : "yaml",
      documents,
    };
  } catch (error) {
    return {
      ok: false,
      kind: hasHelmSyntax ? "helm-template" : "malformed",
      documents: [],
      error:
        error instanceof Error
          ? `YAML parsing failed: ${error.message}`
          : "YAML parsing failed. Check the structure and indentation of the Helm content.",
    };
  }
}

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isSemanticVersion(value: string): boolean {
  return /^v?\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(value);
}

function containsSecretLikeText(text: string): boolean {
  const lower = text.toLowerCase();
  return /(password|secret|token|api[_-]?key|access[_-]?key|private[_-]?key|client[_-]?secret)/.test(lower);
}

function analyzeHelmChart(rawText: string): Finding[] {
  rawText = rawText || "";

  const findings: Finding[] = [];
  const trimmed = rawText.trim();

  if (!trimmed) {
    findings.push({
      title: "Empty Helm chart input",
      severity: "CRITICAL",
      description: "No chart content was provided.",
      recommendation: "Paste a Helm chart file or YAML snippet before running the analyzer.",
    });
    return findings;
  }

  const parseResult = safeYamlParse(rawText);
  if (!parseResult.ok) {
    findings.push({
      title:
        parseResult.kind === "helm-template"
          ? "Helm template syntax is present but YAML structure is malformed"
          : "YAML parsing failed",
      severity: parseResult.kind === "helm-template" ? "WARNING" : "CRITICAL",
      description: parseResult.error || "The Helm content could not be parsed reliably.",
      recommendation:
        parseResult.kind === "helm-template"
          ? "Check for unmatched template tags, broken block syntax, or malformed YAML adjacent to Helm template expressions."
          : "Check the YAML structure, indentation, and Helm template syntax before retrying the analysis.",
    });
    return findings;
  }

  if (parseResult.kind === "helm-template") {
    findings.push({
      title: "Helm template syntax detected",
      severity: "PASS",
      description: "The input contains Helm template syntax and was normalized before YAML parsing so structure can still be analyzed.",
    });
  } else {
    findings.push({
      title: "YAML structure parsed successfully",
      severity: "PASS",
      description: "The supplied content parsed as valid YAML and can be analyzed statically.",
    });
  }

  const chartMetadata = parseResult.documents[0] as Record<string, unknown> | undefined;
  const apiVersion = normalizeString(chartMetadata?.apiVersion);
  const chartName = normalizeString(chartMetadata?.name);
  const version = normalizeString(chartMetadata?.version);
  const appVersion = normalizeString(chartMetadata?.appVersion ?? "");

  if (apiVersion) {
    findings.push({
      title: "Chart API version configured",
      severity: "PASS",
      description: `The chart defines apiVersion: ${apiVersion}.`,
    });
  } else {
    findings.push({
      title: "Chart API version missing",
      severity: "WARNING",
      description: "The chart metadata does not declare an apiVersion.",
      recommendation: "Set apiVersion in Chart.yaml to match the chart type and Kubernetes compatibility.",
    });
  }

  if (chartName) {
    findings.push({
      title: "Chart name configured",
      severity: "PASS",
      description: `The chart name is set to "${chartName}".`,
    });
  } else {
    findings.push({
      title: "Chart name missing",
      severity: "WARNING",
      description: "The chart metadata is missing a name.",
      recommendation: "Define a chart name in Chart.yaml so it is easy to identify and release.",
    });
  }

  if (version) {
    const validVersion = isSemanticVersion(version);
    findings.push({
      title: "Chart version configured",
      severity: validVersion ? "PASS" : "WARNING",
      description: validVersion
        ? `The chart version is valid: ${version}.`
        : `The chart version is set to "${version}", but it does not look like a semantic version.`,
      recommendation: validVersion
        ? undefined
        : "Use a semantic version such as 0.1.0 or 1.2.3 for Helm releases.",
    });
  } else {
    findings.push({
      title: "Chart version missing",
      severity: "WARNING",
      description: "The chart metadata does not include a version.",
      recommendation: "Set a version in Chart.yaml so Helm can track and release chart updates correctly.",
    });
  }

  if (appVersion) {
    const validAppVersion = isSemanticVersion(appVersion);
    findings.push({
      title: "Application version configured",
      severity: validAppVersion ? "PASS" : "WARNING",
      description: validAppVersion
        ? `The app version is valid: ${appVersion}.`
        : `The appVersion is set to "${appVersion}", but it does not look like a standard semantic version.`,
      recommendation: validAppVersion
        ? undefined
        : "Use a stable version string or a civilized semantic version for appVersion.",
    });
  } else {
    findings.push({
      title: "Application version missing",
      severity: "WARNING",
      description: "The chart does not define appVersion.",
      recommendation: "Define appVersion to track the application version associated with the Helm release.",
    });
  }

  const lowerText = rawText.toLowerCase();
  const deploymentRegex = /kind:\s*deployment|kind:\s*statefulset|kind:\s*daemonset/i;
  const hasDeployment = deploymentRegex.test(rawText);

  if (hasDeployment) {
    findings.push({
      title: "Kubernetes workload detected",
      severity: "PASS",
      description: "A Kubernetes workload such as Deployment or StatefulSet is present.",
    });
  } else {
    findings.push({
      title: "Workload definition not detected",
      severity: "WARNING",
      description: "No Deployment or other workload manifest pattern was found in the Helm content.",
      recommendation: "Add a resource manifest such as Deployment, StatefulSet, or DaemonSet to run the application.",
    });
  }

  const replicasMatch = rawText.match(/replicas\s*:\s*([0-9]+)/i);
  const replicas = replicasMatch ? Number(replicasMatch[1]) : undefined;

  if (replicas !== undefined) {
    const replicasStatus = replicas >= 2 ? "PASS" : "WARNING";
    findings.push({
      title: "Replica count configured",
      severity: replicasStatus,
      description:
        replicas >= 2
          ? `The workload defines ${replicas} replicas, which is a healthier production default.`
          : `The workload defines ${replicas} replicas, which may be insufficient for production availability.`,
      recommendation:
        replicas >= 2
          ? undefined
          : "Increase replicas to at least 2 for production-like workloads to reduce downtime.",
    });
  } else {
    findings.push({
      title: "Replica count missing",
      severity: "WARNING",
      description: "No explicit replicas value was found.",
      recommendation: "Define replicas for workload stability and availability.",
    });
  }

  const hasResourceRequests = /requests:\s*\n\s*cpu:|memory:/i.test(rawText);
  const hasResourceLimits = /limits:\s*\n\s*cpu:|memory:/i.test(rawText);

  if (hasResourceRequests) {
    findings.push({
      title: "Resource requests configured",
      severity: "PASS",
      description: "Container resource requests are present.",
    });
  } else {
    findings.push({
      title: "Resource requests missing",
      severity: "WARNING",
      description: "The chart does not appear to set CPU or memory requests.",
      recommendation: "Set requests so Kubernetes can schedule the pod effectively.",
    });
  }

  if (hasResourceLimits) {
    findings.push({
      title: "Resource limits configured",
      severity: "PASS",
      description: "Container resource limits are present.",
    });
  } else {
    findings.push({
      title: "Resource limits missing",
      severity: "WARNING",
      description: "The chart does not appear to define CPU or memory limits.",
      recommendation: "Add resource limits to prevent noisy-neighbor and runaway workload situations.",
    });
  }

  const readiness = /readinessProbe:/i.test(rawText);
  const liveness = /livenessProbe:/i.test(rawText);
  const startup = /startupProbe:/i.test(rawText);

  if (readiness) {
    findings.push({
      title: "Readiness probe configured",
      severity: "PASS",
      description: "Readiness probes are present for the container workload.",
    });
  } else {
    findings.push({
      title: "Readiness probe missing",
      severity: "WARNING",
      description: "No readinessProbe was detected.",
      recommendation: "Add a readinessProbe so traffic is only sent to ready pods.",
    });
  }

  if (liveness) {
    findings.push({
      title: "Liveness probe configured",
      severity: "PASS",
      description: "Liveness probes are present.",
    });
  } else {
    findings.push({
      title: "Liveness probe missing",
      severity: "WARNING",
      description: "No livenessProbe was detected.",
      recommendation: "Configure a livenessProbe to help Kubernetes restart unhealthy containers.",
    });
  }

  if (startup) {
    findings.push({
      title: "Startup probe configured",
      severity: "PASS",
      description: "A startupProbe was detected for slow-starting workloads.",
    });
  } else {
    findings.push({
      title: "Startup probe not detected",
      severity: "WARNING",
      description: "No startupProbe was found, which may be a missed optimization for slow containers.",
      recommendation: "Consider adding a startupProbe when workloads take time to initialize.",
    });
  }

  const hasSecurityContext = /securityContext:/i.test(rawText);
  const runAsNonRoot = /runAsNonRoot:\s*true/i.test(rawText);
  const privileged = /privileged:\s*true/i.test(rawText);
  const allowPrivilegeEscalation = /allowPrivilegeEscalation:\s*true/i.test(rawText);
  const capabilities = /capabilities:/i.test(rawText);
  const dangerousCapabilities = /(ADD|NET_ADMIN|NET_RAW|SYS_ADMIN|SYS_MODULE|SYS_PTRACE|ALL)/i.test(rawText);

  if (hasSecurityContext) {
    findings.push({
      title: "Security context configured",
      severity: "PASS",
      description: "A pod or container securityContext is present.",
    });
  } else {
    findings.push({
      title: "Security context missing",
      severity: "WARNING",
      description: "No securityContext was detected for the workload.",
      recommendation: "Set a securityContext to control non-root execution, privilege rules, and Linux capability drops.",
    });
  }

  if (runAsNonRoot) {
    findings.push({
      title: "Run as non-root enforced",
      severity: "PASS",
      description: "The chart appears to run containers as a non-root user.",
    });
  } else {
    findings.push({
      title: "Non-root execution not enforced",
      severity: "WARNING",
      description: "The chart does not clearly enforce non-root execution.",
      recommendation: "Set runAsNonRoot: true to reduce the impact of a compromised workload.",
    });
  }

  if (privileged) {
    findings.push({
      title: "Privileged containers enabled",
      severity: "CRITICAL",
      description: "A container is explicitly configured with privileged: true.",
      recommendation: "Remove privileged mode unless you have a well-justified requirement and strong controls.",
    });
  } else {
    findings.push({
      title: "Privileged mode not detected",
      severity: "PASS",
      description: "No privileged container settings were detected.",
    });
  }

  if (allowPrivilegeEscalation) {
    findings.push({
      title: "Privilege escalation allowed",
      severity: "WARNING",
      description: "allowPrivilegeEscalation is enabled, which can increase container blast radius.",
      recommendation: "Set allowPrivilegeEscalation: false for most workloads.",
    });
  } else {
    findings.push({
      title: "Privilege escalation restricted",
      severity: "PASS",
      description: "Privilege escalation does not appear to be enabled.",
    });
  }

  if (capabilities) {
    findings.push({
      title: "Capabilities configuration present",
      severity: dangerousCapabilities ? "WARNING" : "PASS",
      description: dangerousCapabilities
        ? "The workload appears to configure Linux capabilities in a way that may be risky."
        : "The workload configures Linux capabilities in a controlled way.",
      recommendation: dangerousCapabilities
        ? "Drop unnecessary capabilities such as ALL and avoid privileged network or admin capabilities."
        : undefined,
    });
  } else {
    findings.push({
      title: "Capabilities not explicitly set",
      severity: "WARNING",
      description: "No explicit capabilities configuration was found.",
      recommendation: "Set explicit capabilities and drop unnecessary ones where possible.",
    });
  }

  const hasImageRepository = /image:\s*\n\s*repository:|repository:\s*[^\n]+/i.test(rawText);
  const hasImageTag = /tag:\s*"?[A-Za-z0-9._-]+"?/i.test(rawText);
  const hasLatestTag = /tag:\s*["']?latest["']?/i.test(rawText);
  const hasPinnedVersion = /tag:\s*["']?\d+\.\d+\.\d+["']?/i.test(rawText);

  if (hasImageRepository) {
    findings.push({
      title: "Image repository configured",
      severity: "PASS",
      description: "The chart defines an image repository.",
    });
  } else {
    findings.push({
      title: "Image repository missing",
      severity: "WARNING",
      description: "No image repository was found in the chart configuration.",
      recommendation: "Set an image repository so the workload can pull the correct container image.",
    });
  }

  if (hasImageTag) {
    findings.push({
      title: "Image tag configured",
      severity: hasLatestTag ? "WARNING" : "PASS",
      description: hasLatestTag
        ? "The image tag uses a mutable tag such as latest."
        : "The image tag appears to be pinned to a specific release or version.",
      recommendation: hasLatestTag
        ? "Use an explicit semantic version or immutable digest instead of latest."
        : undefined,
    });
  } else {
    findings.push({
      title: "Image tag missing",
      severity: "WARNING",
      description: "The chart does not define an image tag.",
      recommendation: "Set a tag or digest so the deployment is reproducible and auditable.",
    });
  }

  if (hasLatestTag) {
    findings.push({
      title: "Mutable image tag detected",
      severity: "WARNING",
      description: "The chart uses a mutable image tag, which may change over time.",
      recommendation: "Use a fixed tag such as 1.8.2 or an immutable image digest.",
    });
  } else if (hasPinnedVersion) {
    findings.push({
      title: "Image is version-pinned",
      severity: "PASS",
      description: "The chart appears to use a fixed versioned image tag.",
    });
  }

  const imagePullPolicy = /imagePullPolicy:\s*(?:Always|IfNotPresent|Never)/i.test(rawText);
  if (imagePullPolicy) {
    findings.push({
      title: "Image pull policy configured",
      severity: "PASS",
      description: "The workload specifies an imagePullPolicy, which helps clarify update behavior.",
    });
  } else {
    findings.push({
      title: "Image pull policy not set",
      severity: "WARNING",
      description: "No imagePullPolicy was detected.",
      recommendation: "Set imagePullPolicy explicitly, especially when using mutable tags or controlled registries.",
    });
  }

  if (/\.Values\./i.test(rawText)) {
    findings.push({
      title: "Chart configuration is parameterized",
      severity: "PASS",
      description: "The chart uses .Values, which helps keep environment-specific settings configurable.",
    });
  } else {
    findings.push({
      title: "Hardcoded configuration detected",
      severity: "WARNING",
      description: "The chart appears to encode environment-specific values directly in manifests.",
      recommendation: "Move environment-sensitive values into values.yaml or chart variables.",
    });
  }

  const hasDefaultValues = /replicaCount:|image:|service:|resources:/i.test(rawText);
  if (hasDefaultValues) {
    findings.push({
      title: "Sensible defaults provided",
      severity: "PASS",
      description: "The chart appears to include practical default values for common deployment settings.",
    });
  } else {
    findings.push({
      title: "Default values may be missing",
      severity: "WARNING",
      description: "The chart does not clearly provide default configuration values.",
      recommendation: "Add default values for commonly tuned settings like replicas, image settings, and resource allocation.",
    });
  }

  const namespacePattern = /namespace:\s*\{|metadata:\s*\n\s*namespace:|namespace:\s*\"|namespace:\s*\w+/i;
  if (namespacePattern.test(rawText)) {
    findings.push({
      title: "Namespace handling appears defined",
      severity: "PASS",
      description: "A namespace is present or explicitly handled in the chart.",
    });
  } else {
    findings.push({
      title: "Namespace handling not explicit",
      severity: "WARNING",
      description: "The chart does not clearly define a namespace.",
      recommendation: "Consider setting namespace values explicitly or relying on a release namespace policy for production clarity.",
    });
  }

  const labelsAndSelectors = /labels:|selector:|matchLabels:/i.test(rawText);
  if (labelsAndSelectors) {
    findings.push({
      title: "Labels and selectors present",
      severity: "PASS",
      description: "The chart includes labeling and selector metadata for workload routing and ownership.",
    });
  } else {
    findings.push({
      title: "Labels and selectors could be improved",
      severity: "WARNING",
      description: "The workload does not clearly define labels or selectors.",
      recommendation: "Add labels and selectors so services and operations can target workloads consistently.",
    });
  }

  const hasService = /kind:\s*service/i.test(rawText);
  if (hasService) {
    findings.push({
      title: "Service configuration detected",
      severity: "PASS",
      description: "A Service resource is included for network exposure.",
    });
  } else {
    findings.push({
      title: "Service configuration missing",
      severity: "WARNING",
      description: "No Service resource was found.",
      recommendation: "Add a Service if the workload needs internal or external access.",
    });
  }

  const hasIngress = /kind:\s*ingress/i.test(rawText);
  if (hasIngress) {
    findings.push({
      title: "Ingress configuration present",
      severity: "PASS",
      description: "An Ingress resource was detected.",
    });
  } else {
    findings.push({
      title: "Ingress not detected",
      severity: "WARNING",
      description: "No Ingress resource was found.",
      recommendation: "Add an Ingress only when external access is required and proper routing policies are in place.",
    });
  }

  const secretPatterns = /(password|secret|token|apiKey|api_key|accessKey|secretKey)/i;
  const rawSecretMatches = secretPatterns.test(rawText);
  if (rawSecretMatches) {
    findings.push({
      title: "Potential plaintext credentials",
      severity: "CRITICAL",
      description: "The chart appears to contain secret-like values in plaintext configuration.",
      recommendation: "Move credentials into Kubernetes Secrets, External Secrets, or a secret manager instead of injecting sensitive values directly in manifests.",
    });
  } else {
    findings.push({
      title: "No obvious plaintext credentials detected",
      severity: "PASS",
      description: "No direct secret-like values were detected in the chart payload.",
    });
  }

  const secretEnv = /valueFrom:\s*\n\s*secretKeyRef|valueFrom:\s*\n\s*configMapKeyRef|secretKeyRef:/i.test(rawText);
  if (secretEnv) {
    findings.push({
      title: "Secrets handled via Kubernetes primitives",
      severity: "PASS",
      description: "The chart appears to use Kubernetes Secret references for sensitive values.",
    });
  } else {
    findings.push({
      title: "Secrets may be handled poorly",
      severity: "WARNING",
      description: "No obvious Secret or ConfigMap reference pattern was detected.",
      recommendation: "Prefer Secret references for sensitive values and ConfigMap references for non-sensitive configuration.",
    });
  }

  const configMapUsage = /configMapKeyRef:|kind:\s*configmap|ConfigMap/i.test(rawText);
  if (configMapUsage) {
    findings.push({
      title: "ConfigMap usage detected",
      severity: "PASS",
      description: "The chart appears to separate configuration from secrets.",
    });
  } else {
    findings.push({
      title: "ConfigMap usage not detected",
      severity: "WARNING",
      description: "The chart does not clearly separate config from sensitive values.",
      recommendation: "Use ConfigMaps for non-sensitive configuration and Secrets for sensitive values.",
    });
  }

  if (/hostNetwork:\s*true/i.test(rawText)) {
    findings.push({
      title: "Host network enabled",
      severity: "WARNING",
      description: "The workload uses hostNetwork, which can introduce network isolation and security issues.",
      recommendation: "Avoid hostNetwork unless it is strictly required for the application design.",
    });
  } else {
    findings.push({
      title: "Host networking not enabled",
      severity: "PASS",
      description: "The chart does not appear to use hostNetwork.",
    });
  }

  if (/hostPID:\s*true/i.test(rawText)) {
    findings.push({
      title: "Host PID namespace enabled",
      severity: "WARNING",
      description: "The chart exposes the host PID namespace, which broadens risk exposure.",
      recommendation: "Avoid hostPID unless there is a strong operational reason and compensating controls.",
    });
  } else {
    findings.push({
      title: "Host PID namespace not enabled",
      severity: "PASS",
      description: "The workload does not appear to share the host PID namespace.",
    });
  }

  if (/hostPath:/i.test(rawText)) {
    findings.push({
      title: "HostPath mount detected",
      severity: "WARNING",
      description: "The chart mounts host paths, which can increase security and portability risk.",
      recommendation: "Prefer persistent volume claims or managed storage instead of hostPath mounts when possible.",
    });
  } else {
    findings.push({
      title: "No hostPath mount detected",
      severity: "PASS",
      description: "The workload does not appear to mount host paths directly.",
    });
  }

  if (/rollingUpdate|strategy:\s*\n\s*type:\s*RollingUpdate/i.test(rawText)) {
    findings.push({
      title: "Rolling update strategy configured",
      severity: "PASS",
      description: "A rolling update strategy is defined for the workload.",
    });
  } else {
    findings.push({
      title: "Rolling update strategy not obvious",
      severity: "WARNING",
      description: "The deployment does not explicitly define a rolling update strategy.",
      recommendation: "Use a rolling update strategy for safer production deployments.",
    });
  }

  if (/kind:\s*poddisruptionbudget|PodDisruptionBudget/i.test(rawText)) {
    findings.push({
      title: "PodDisruptionBudget detected",
      severity: "PASS",
      description: "The chart includes a PodDisruptionBudget, which supports higher availability.",
    });
  } else {
    findings.push({
      title: "PodDisruptionBudget not detected",
      severity: "WARNING",
      description: "No PodDisruptionBudget was found for the workload.",
      recommendation: "Consider adding a PDB for production workloads to protect availability during voluntary disruptions.",
    });
  }

  return findings;
}

export default function HelmAnalyzerPage() {
  const [chartContent, setChartContent] = useState(exampleHelm);
  const [analyzed, setAnalyzed] = useState(true);

  const { findings, analysisError } = useMemo(() => {
    if (!analyzed) {
      return { findings: [] as Finding[], analysisError: null as string | null };
    }

    try {
      return { findings: analyzeHelmChart(chartContent), analysisError: null as string | null };
    } catch (error) {
      return {
        findings: [] as Finding[],
        analysisError:
          error instanceof Error
            ? error.message
            : "Unexpected error while analyzing this Helm chart.",
      };
    }
  }, [chartContent, analyzed]);

  const passed = findings.filter((finding) => finding.severity === "PASS").length;
  const warnings = findings.filter((finding) => finding.severity === "WARNING").length;
  const critical = findings.filter((finding) => finding.severity === "CRITICAL").length;

  function runAnalysis() {
    setAnalyzed(true);
  }

  function clear() {
    setChartContent("");
    setAnalyzed(false);
  }

  function loadExample() {
    setChartContent(exampleHelm);
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
            Helm Analyzer
          </h1>

          <p className="mt-4 max-w-3xl text-zinc-400">
            Review Helm charts for Kubernetes security, reliability,
            configuration, and production-readiness issues.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="font-medium">Helm chart YAML / template content</h2>

              <button
                onClick={loadExample}
                className="text-sm text-zinc-400 transition hover:text-white"
              >
                Load example
              </button>
            </div>

            <textarea
              value={chartContent}
              onChange={(event) => {
                setChartContent(event.target.value);
                setAnalyzed(false);
              }}
              spellCheck={false}
              className="min-h-[560px] w-full resize-y rounded-xl border border-zinc-800 bg-zinc-950 p-4 font-mono text-sm leading-6 text-zinc-200 outline-none transition focus:border-zinc-500"
              placeholder="Paste Helm Chart.yaml, values.yaml, template YAML, or templated Kubernetes manifests here..."
            />

            <div className="mt-4 flex flex-wrap gap-3">
              <button
                onClick={runAnalysis}
                className="rounded-lg bg-white px-5 py-2.5 text-sm font-medium text-black transition hover:bg-zinc-200"
              >
                Analyze Helm Chart
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
                  This does not mean the chart is safe — the analyzer could not complete. Adjust the input and try again.
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
                  Paste Helm content and click <span className="text-white">Analyze Helm Chart</span>.
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
              text="Flags privileged containers, unsafe capabilities, plaintext secrets, and risky pod configuration."
            />
            <InfoCard
              title="Reliability"
              text="Looks for replicas, probes, resource settings, rolling strategies, and disruption budgets."
            />
            <InfoCard
              title="Operational hygiene"
              text="Checks chart metadata, values usage, namespace handling, ingress, and deployment conventions."
            />
          </div>

          <div className="mt-6 rounded-xl border border-amber-900/60 bg-amber-950/20 p-5">
            <div className="font-medium text-amber-400">Important</div>
            <p className="mt-2 text-sm leading-6 text-zinc-400">
              This analyzer performs static checks on Helm chart content and Kubernetes YAML. It is
              intended to surface common production issues early but does not replace helm lint,
              kubectl validation, or end-to-end cluster testing.
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
