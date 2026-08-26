"use client";

import { useState } from "react";
import * as yaml from "js-yaml";


type Severity = "pass" | "warning" | "critical";

type Check = {
  title: string;
  severity: Severity;
  description: string;
  recommendation?: string;
};

type ResourceResult = {
  apiVersion: string;
  kind: string;
  name: string;
  namespace: string;
  checks: Check[];
};

const exampleYaml = `apiVersion: apps/v1
kind: Deployment
metadata:
  name: nginx
  namespace: production
spec:
  replicas: 3
  selector:
    matchLabels:
      app: nginx
  template:
    metadata:
      labels:
        app: nginx
    spec:
      containers:
        - name: nginx
          image: nginx:latest
          ports:
            - containerPort: 80`;

function getEffectiveSecurityContext(container: any, podSpec: any) {
  return {
    ...(podSpec?.securityContext || {}),
    ...(container?.securityContext || {}),
  };
}

function getHighRiskCapabilities() {
  return new Set([
    "ALL",
    "SYS_ADMIN",
    "NET_ADMIN",
    "SYS_PTRACE",
    "SYS_MODULE",
    "DAC_READ_SEARCH",
    "DAC_OVERRIDE",
    "SETPCAP",
    "AUDIT_CONTROL",
    "AUDIT_WRITE",
    "SYS_TIME",
    "SYS_RAW_IO",
    "NET_RAW",
  ]);
}

// True when `image` carries an explicit tag or digest, based on the final
// `/`-separated path segment only (repository[:tag] or repository@digest).
// A registry host of the form host:port (e.g. myregistry.io:5000/myapp) can
// only ever appear before the first `/`, so a colon anywhere earlier in the
// string is never a tag separator - checking the whole string with
// `.includes(":")` was fooled by exactly that case.
function hasExplicitImageTag(image: string): boolean {
  const lastSegment = image.split("/").pop() || "";
  return lastSegment.includes(":") || lastSegment.includes("@");
}

type ContainerKind = "container" | "initContainer" | "ephemeralContainer";

// Runs every container-level check against a single container, shared by
// analyzeDeployment and analyzeWorkload for all three container arrays a
// pod spec can define (containers, initContainers, ephemeralContainers) so
// the same checks aren't hand-duplicated three times. Findings are labeled
// with an init:/ephemeral: prefix so it's clear which container produced
// them; plain containers keep their existing unprefixed titles exactly as
// before. ephemeralContainers do not support resources, ports, or probes
// (rejected by the Kubernetes API server if set), so those checks are
// skipped for that container kind rather than reporting on fields that
// can never legitimately be present.
function analyzeContainerChecks(
  container: any,
  podSpec: any,
  index: number,
  containerKind: ContainerKind
): Check[] {
  const checks: Check[] = [];
  const namePrefix =
    containerKind === "initContainer" ? "init" : containerKind === "ephemeralContainer" ? "ephemeral" : null;
  const baseName = container?.name || `container-${index + 1}`;
  const containerName = namePrefix ? `${namePrefix}:${baseName}` : baseName;
  const supportsResourcesAndProbes = containerKind !== "ephemeralContainer";

  const image = container?.image || "";

  if (!image) {
    checks.push({
      title: `${containerName}: image missing`,
      severity: "critical",
      description:
        "The container does not specify a container image.",
      recommendation:
        "Set a valid container image.",
    });
  } else if (
    image.endsWith(":latest") ||
    image === "latest" ||
    !hasExplicitImageTag(image)
  ) {
    checks.push({
      title: `${containerName}: mutable image tag`,
      severity: "warning",
      description:
        `Container uses "${image}", which may change over time.`,
      recommendation:
        "Use a fixed image version or digest.",
    });
  } else {
    checks.push({
      title: `${containerName}: fixed image version`,
      severity: "pass",
      description:
        `Container uses image "${image}".`,
    });
  }

  if (supportsResourcesAndProbes) {
    const resources = container?.resources;

    if (resources?.requests && resources?.limits) {
      checks.push({
        title: `${containerName}: resource requests and limits`,
        severity: "pass",
        description:
          "CPU and memory resource configuration is present.",
      });
    } else {
      checks.push({
        title: `${containerName}: resources missing`,
        severity: "warning",
        description:
          "Resource requests and/or limits are not configured.",
        recommendation:
          "Define CPU and memory requests and limits to improve scheduling and resource control.",
      });
    }
  }

  const securityContext = getEffectiveSecurityContext(container, podSpec);

  if (securityContext?.runAsNonRoot === true) {
    checks.push({
      title: `${containerName}: non-root execution`,
      severity: "pass",
      description:
        "The workload explicitly requires non-root execution.",
    });
  } else {
    checks.push({
      title: `${containerName}: non-root execution`,
      severity: "warning",
      description:
        "The container does not explicitly require non-root execution.",
      recommendation:
        "Consider setting securityContext.runAsNonRoot: true.",
    });
  }

  if (typeof securityContext?.runAsUser === "number") {
    if (securityContext.runAsUser === 0) {
      const rootSeverity =
        securityContext?.privileged === true ||
        securityContext?.allowPrivilegeEscalation === true
          ? "critical"
          : "warning";

      checks.push({
        title: `${containerName}: runAsUser`,
        severity: rootSeverity,
        description:
          "The container is explicitly configured to run as UID 0.",
        recommendation:
          "Set a non-root user ID unless the workload explicitly requires root privileges.",
      });
    } else {
      checks.push({
        title: `${containerName}: runAsUser`,
        severity: "pass",
        description: `The container is explicitly configured to run as UID ${securityContext.runAsUser}.`,
      });
    }
  } else {
    checks.push({
      title: `${containerName}: runAsUser`,
      severity: "warning",
      description:
        "The container does not explicitly define a user ID.",
      recommendation:
        "Set securityContext.runAsUser to a non-root UID when possible.",
    });
  }

  if (securityContext?.privileged === true) {
    checks.push({
      title: `${containerName}: privileged container`,
      severity: "critical",
      description:
        "The container is configured as privileged.",
      recommendation:
        "Remove privileged mode unless it is explicitly required.",
    });
  } else {
    checks.push({
      title: `${containerName}: privileged mode`,
      severity: "pass",
      description:
        "The container is not explicitly configured as privileged.",
    });
  }

  if (securityContext?.allowPrivilegeEscalation === true) {
    checks.push({
      title: `${containerName}: allowPrivilegeEscalation`,
      severity: "critical",
      description:
        "The container explicitly sets allowPrivilegeEscalation: true.",
      recommendation:
        "Set securityContext.allowPrivilegeEscalation: false unless the workload explicitly requires privilege escalation.",
    });
  } else if (securityContext?.allowPrivilegeEscalation === false) {
    checks.push({
      title: `${containerName}: allowPrivilegeEscalation`,
      severity: "pass",
      description:
        "The container explicitly disables privilege escalation.",
    });
  } else {
    checks.push({
      title: `${containerName}: allowPrivilegeEscalation`,
      severity: "warning",
      description:
        "The container does not explicitly define allowPrivilegeEscalation.",
      recommendation:
        "Set securityContext.allowPrivilegeEscalation: false unless the workload explicitly requires privilege escalation.",
    });
  }

  const capabilities = securityContext?.capabilities || {};
  const addedCapabilities = Array.isArray(capabilities.add)
    ? capabilities.add
        .map((cap: any) => String(cap).trim())
        .filter(Boolean)
    : [];
  const droppedCapabilities = Array.isArray(capabilities.drop)
    ? capabilities.drop
        .map((cap: any) => String(cap).trim())
        .filter(Boolean)
    : [];

  if (addedCapabilities.length > 0) {
    const dangerousCaps = addedCapabilities.filter((cap: string) =>
      getHighRiskCapabilities().has(cap.toUpperCase())
    );

    checks.push({
      title: `${containerName}: capabilities.add`,
      severity: dangerousCaps.length > 0 ? "critical" : "warning",
      description: `The container adds Linux capabilities: ${addedCapabilities.join(", ")}.`,
      recommendation:
        "Consider dropping all Linux capabilities and adding back only the capabilities required by the application.",
    });
  } else {
    checks.push({
      title: `${containerName}: capabilities.add`,
      severity: "pass",
      description: "The container does not add Linux capabilities.",
    });
  }

  if (droppedCapabilities.includes("ALL") || droppedCapabilities.includes("all")) {
    checks.push({
      title: `${containerName}: capabilities.drop`,
      severity: "pass",
      description: "The container drops all Linux capabilities.",
    });
  } else {
    checks.push({
      title: `${containerName}: capabilities.drop`,
      severity: "warning",
      description:
        "The container does not explicitly drop all Linux capabilities.",
      recommendation:
        "Consider dropping all Linux capabilities and adding back only the capabilities required by the application.",
    });
  }

  if (securityContext?.readOnlyRootFilesystem === true) {
    checks.push({
      title: `${containerName}: readOnlyRootFilesystem`,
      severity: "pass",
      description: "The container root filesystem is read-only.",
    });
  } else {
    checks.push({
      title: `${containerName}: readOnlyRootFilesystem`,
      severity: "warning",
      description: "The container root filesystem is writable.",
      recommendation:
        "Set securityContext.readOnlyRootFilesystem: true where the application supports a read-only root filesystem.",
    });
  }

  const seccompType = securityContext?.seccompProfile?.type;
  if (seccompType === "RuntimeDefault" || seccompType === "Localhost") {
    checks.push({
      title: `${containerName}: seccompProfile`,
      severity: "pass",
      description: `The container explicitly configures seccompProfile.type as "${seccompType}".`,
    });
  } else {
    checks.push({
      title: `${containerName}: seccompProfile`,
      severity: "warning",
      description:
        "The container does not explicitly configure a seccomp profile.",
      recommendation:
        "Set seccompProfile.type to RuntimeDefault or an approved profile.",
    });
  }

  if (supportsResourcesAndProbes) {
    const hostPortValues = (container?.ports || [])
      .filter((port: any) => typeof port?.hostPort === "number")
      .map((port: any) => `${port.containerPort || "unknown"}:${port.hostPort}`);

    if (hostPortValues.length > 0) {
      checks.push({
        title: `${containerName}: hostPort`,
        severity: "warning",
        description: `The container is bound to host ports: ${hostPortValues.join(", ")}.`,
        recommendation:
          "Prefer a Kubernetes Service instead of hostPort unless node-level port binding is explicitly required.",
      });
    } else {
      checks.push({
        title: `${containerName}: hostPort`,
        severity: "pass",
        description: "The container does not bind to host ports.",
      });
    }
  }

  const imagePullPolicy = container?.imagePullPolicy;
  if (typeof imagePullPolicy === "string") {
    checks.push({
      title: `${containerName}: imagePullPolicy`,
      severity: "pass",
      description: `The container explicitly sets imagePullPolicy to "${imagePullPolicy}".`,
    });
  } else {
    checks.push({
      title: `${containerName}: imagePullPolicy`,
      severity: "warning",
      description:
        "The container does not explicitly set imagePullPolicy, which can create operational inconsistency.",
      recommendation:
        "Set imagePullPolicy explicitly to match your deployment policy and image lifecycle needs.",
    });
  }

  if (supportsResourcesAndProbes) {
    if (container?.startupProbe) {
      checks.push({
        title: `${containerName}: startupProbe`,
        severity: "pass",
        description: "A startup probe is configured.",
      });
    } else {
      checks.push({
        title: `${containerName}: startupProbe`,
        severity: "warning",
        description:
          "No startup probe is configured for this container.",
        recommendation:
          "Consider adding a startupProbe for slow-starting applications to prevent premature restarts.",
      });
    }

    if (container?.readinessProbe) {
      checks.push({
        title: `${containerName}: readiness probe`,
        severity: "pass",
        description:
          "A readiness probe is configured.",
      });
    } else {
      checks.push({
        title: `${containerName}: readiness probe`,
        severity: "warning",
        description:
          "No readiness probe is configured.",
        recommendation:
          "Add a readiness probe so Kubernetes can determine when the application is ready to receive traffic.",
      });
    }

    if (container?.livenessProbe) {
      checks.push({
        title: `${containerName}: liveness probe`,
        severity: "pass",
        description:
          "A liveness probe is configured.",
      });
    } else {
      checks.push({
        title: `${containerName}: liveness probe`,
        severity: "warning",
        description:
          "No liveness probe is configured.",
        recommendation:
          "Add a liveness probe so Kubernetes can detect unhealthy containers.",
      });
    }
  }

  return checks;
}

// Runs analyzeContainerChecks across all three container arrays a pod spec
// can define, in order: containers, then initContainers, then
// ephemeralContainers. Missing/empty arrays default to [] and simply
// contribute nothing, so a pod spec with only `containers` produces
// identical output to before this function existed.
function analyzeAllContainers(podSpec: any): Check[] {
  const checks: Check[] = [];
  const containers = podSpec?.containers || [];

  containers.forEach((container: any, index: number) => {
    checks.push(...analyzeContainerChecks(container, podSpec, index, "container"));
  });

  const initContainers = podSpec?.initContainers || [];
  initContainers.forEach((container: any, index: number) => {
    checks.push(...analyzeContainerChecks(container, podSpec, index, "initContainer"));
  });

  const ephemeralContainers = podSpec?.ephemeralContainers || [];
  ephemeralContainers.forEach((container: any, index: number) => {
    checks.push(...analyzeContainerChecks(container, podSpec, index, "ephemeralContainer"));
  });

  return checks;
}

// Shared by analyzeDeployment (always) and analyzeWorkload (StatefulSet
// only - DaemonSet/Job/CronJob/Pod have no comparable replica concept).
// `kind` is interpolated into the message text, so calling this with
// kind="Deployment" reproduces the original Deployment-only wording
// byte-for-byte.
function analyzeReplicaAvailability(kind: string, replicas: unknown): Check {
  if (typeof replicas === "number" && replicas >= 2) {
    return {
      title: "Multiple replicas configured",
      severity: "pass",
      description: `${kind} is configured with ${replicas} replicas.`,
    };
  }

  return {
    title: "High availability",
    severity: "warning",
    description: `The ${kind} does not have at least 2 replicas.`,
    recommendation: "Consider using multiple replicas for better availability.",
  };
}

// Workload-level (not container-level) ServiceAccount posture: whether the
// pod auto-mounts a ServiceAccount token (defaults to true when unset) and
// whether it uses a dedicated ServiceAccount rather than the implicit
// "default" one. Shared by analyzeDeployment and analyzeWorkload.
function analyzeServiceAccountPosture(podSpec: any): Check[] {
  const checks: Check[] = [];

  if (podSpec?.automountServiceAccountToken === false) {
    checks.push({
      title: "automountServiceAccountToken",
      severity: "pass",
      description: "The pod explicitly disables automatic mounting of a ServiceAccount token.",
    });
  } else {
    checks.push({
      title: "automountServiceAccountToken",
      severity: "warning",
      description:
        "The pod does not explicitly disable automountServiceAccountToken, which defaults to mounting a ServiceAccount token into the pod.",
      recommendation:
        "Set automountServiceAccountToken: false unless the workload requires Kubernetes API access.",
    });
  }

  const serviceAccountName = podSpec?.serviceAccountName || podSpec?.serviceAccount;
  if (serviceAccountName && serviceAccountName !== "default") {
    checks.push({
      title: "serviceAccountName",
      severity: "pass",
      description: `The pod uses a dedicated ServiceAccount "${serviceAccountName}".`,
    });
  } else {
    checks.push({
      title: "serviceAccountName",
      severity: "warning",
      description:
        "The pod does not specify a dedicated ServiceAccount and uses the default ServiceAccount for its namespace.",
      recommendation:
        "Create and assign a dedicated, minimally-privileged ServiceAccount instead of relying on the default ServiceAccount.",
    });
  }

  return checks;
}

function analyzeDeployment(document: any): Check[] {
  const checks: Check[] = [];

  const spec = document?.spec;
  const template = spec?.template;
  const podSpec = template?.spec;
  const containers = podSpec?.containers || [];

  checks.push(analyzeReplicaAvailability(document?.kind || "Deployment", spec?.replicas));

  if (document?.metadata?.namespace) {
    checks.push({
      title: "Namespace configured",
      severity: "pass",
      description: `Workload uses namespace "${document.metadata.namespace}".`,
    });
  } else {
    checks.push({
      title: "Namespace not specified",
      severity: "warning",
      description:
        "The Deployment does not explicitly define a namespace.",
      recommendation:
        "Specify the target namespace when managing production workloads.",
    });
  }

  if (podSpec?.hostNetwork === true) {
    checks.push({
      title: "hostNetwork",
      severity: "critical",
      description: "The pod is configured with hostNetwork: true.",
      recommendation:
        "Disable hostNetwork unless the workload explicitly requires host networking.",
    });
  } else {
    checks.push({
      title: "hostNetwork",
      severity: "pass",
      description: "The pod is not configured to use the host network.",
    });
  }

  if (podSpec?.hostPID === true) {
    checks.push({
      title: "hostPID",
      severity: "critical",
      description: "The pod is configured with hostPID: true.",
      recommendation:
        "Disable hostPID unless the workload explicitly requires access to the host process namespace.",
    });
  } else {
    checks.push({
      title: "hostPID",
      severity: "pass",
      description: "The pod is not configured to share the host process namespace.",
    });
  }

  if (podSpec?.hostIPC === true) {
    checks.push({
      title: "hostIPC",
      severity: "warning",
      description: "The pod is configured with hostIPC: true.",
      recommendation:
        "Disable hostIPC unless the workload explicitly requires the host IPC namespace.",
    });
  } else {
    checks.push({
      title: "hostIPC",
      severity: "pass",
      description: "The pod is not configured to share the host IPC namespace.",
    });
  }

  if (podSpec?.volumes?.some((volume: any) => volume?.hostPath)) {
    const hostPathVolumes = podSpec.volumes.filter((volume: any) => volume?.hostPath);
    const hostPathDetail = hostPathVolumes
      .map((volume: any) => `${volume.name || "unnamed"}: ${volume.hostPath.path || "unknown path"}`)
      .join(", ");

    checks.push({
      title: "hostPath volumes",
      severity: "critical",
      description: `The pod mounts hostPath volumes: ${hostPathDetail}.`,
      recommendation:
        "Avoid hostPath where possible; use a Kubernetes-managed volume such as emptyDir, PVC, or another appropriate storage mechanism.",
    });
  } else {
    checks.push({
      title: "hostPath volumes",
      severity: "pass",
      description: "The pod does not mount hostPath volumes.",
    });
  }

  checks.push(...analyzeServiceAccountPosture(podSpec));

  if (containers.length === 0) {
    checks.push({
      title: "Container configuration",
      severity: "critical",
      description:
        "No containers were found in the Pod template.",
      recommendation:
        "Define at least one container under spec.template.spec.containers.",
    });

    return checks;
  }

  checks.push(...analyzeAllContainers(podSpec));

  return checks;
}

function getPodSpec(document: any): any | null {
  // Extract pod spec from common workload types
  if (!document || typeof document !== "object") return null;

  const kind = document.kind;

  if (kind === "Pod") {
    return document.spec || null;
  }

  // Deployment / StatefulSet / DaemonSet commonly have spec.template.spec
  if (
    kind === "Deployment" ||
    kind === "StatefulSet" ||
    kind === "DaemonSet"
  ) {
    return document?.spec?.template?.spec || null;
  }

  // Job: spec.template.spec
  if (kind === "Job") {
    return document?.spec?.template?.spec || null;
  }

  // CronJob: spec.jobTemplate.spec.template.spec
  if (kind === "CronJob") {
    return (
      document?.spec?.jobTemplate?.spec?.template?.spec || null
    );
  }

  return null;
}

function analyzeWorkload(document: any): Check[] {
  const checks: Check[] = [];

  // StatefulSet has the same meaningful spec.replicas concept as
  // Deployment; DaemonSet/Job/CronJob/Pod do not (DaemonSet runs one pod
  // per node, Job/CronJob use parallelism, Pod has no replica concept at
  // all), so the check is intentionally scoped to StatefulSet only.
  if (document?.kind === "StatefulSet") {
    checks.push(analyzeReplicaAvailability(document.kind, document?.spec?.replicas));
  }

  if (document?.metadata?.namespace) {
    checks.push({
      title: "Namespace configured",
      severity: "pass",
      description: `Workload uses namespace "${document.metadata.namespace}".`,
    });
  } else {
    checks.push({
      title: "Namespace not specified",
      severity: "warning",
      description: "The resource does not explicitly define a namespace.",
      recommendation:
        "Specify the target namespace when managing production workloads.",
    });
  }

  const podSpec = getPodSpec(document);
  const containers = podSpec?.containers || [];

  if (podSpec?.hostNetwork === true) {
    checks.push({
      title: "hostNetwork",
      severity: "critical",
      description: "The pod is configured with hostNetwork: true.",
      recommendation:
        "Disable hostNetwork unless the workload explicitly requires host networking.",
    });
  } else {
    checks.push({
      title: "hostNetwork",
      severity: "pass",
      description: "The pod is not configured to use the host network.",
    });
  }

  if (podSpec?.hostPID === true) {
    checks.push({
      title: "hostPID",
      severity: "critical",
      description: "The pod is configured with hostPID: true.",
      recommendation:
        "Disable hostPID unless the workload explicitly requires access to the host process namespace.",
    });
  } else {
    checks.push({
      title: "hostPID",
      severity: "pass",
      description: "The pod is not configured to share the host process namespace.",
    });
  }

  if (podSpec?.hostIPC === true) {
    checks.push({
      title: "hostIPC",
      severity: "warning",
      description: "The pod is configured with hostIPC: true.",
      recommendation:
        "Disable hostIPC unless the workload explicitly requires the host IPC namespace.",
    });
  } else {
    checks.push({
      title: "hostIPC",
      severity: "pass",
      description: "The pod is not configured to share the host IPC namespace.",
    });
  }

  if (podSpec?.volumes?.some((volume: any) => volume?.hostPath)) {
    const hostPathVolumes = podSpec.volumes.filter((volume: any) => volume?.hostPath);
    const hostPathDetail = hostPathVolumes
      .map((volume: any) => `${volume.name || "unnamed"}: ${volume.hostPath.path || "unknown path"}`)
      .join(", ");

    checks.push({
      title: "hostPath volumes",
      severity: "critical",
      description: `The pod mounts hostPath volumes: ${hostPathDetail}.`,
      recommendation:
        "Avoid hostPath where possible; use a Kubernetes-managed volume such as emptyDir, PVC, or another appropriate storage mechanism.",
    });
  } else {
    checks.push({
      title: "hostPath volumes",
      severity: "pass",
      description: "The pod does not mount hostPath volumes.",
    });
  }

  checks.push(...analyzeServiceAccountPosture(podSpec));

  if (!podSpec) {
    checks.push({
      title: "Pod template",
      severity: "warning",
      description:
        "Unable to locate a pod spec for this resource. Container-level checks may be limited.",
      recommendation:
        "Ensure the workload defines a pod template (spec.template.spec for controllers or spec for Pod).",
    });
  }

  if (containers.length === 0) {
    checks.push({
      title: "Container configuration",
      severity: "critical",
      description: "No containers were found in the Pod template.",
      recommendation:
        "Define at least one container in the pod spec.",
    });

    return checks;
  }

  checks.push(...analyzeAllContainers(podSpec));

  return checks;
}

const DEPRECATED_KUBERNETES_APIS = [
  {
    apiVersion: "extensions/v1beta1",
    kinds: ["Ingress", "Deployment", "DaemonSet", "ReplicaSet", "NetworkPolicy"],
    reason: "This API group is deprecated and removed from newer Kubernetes versions.",
    replacement: "Use the stable API versions in networking.k8s.io/v1, apps/v1, or policy/v1.",
  },
  {
    apiVersion: "apps/v1beta1",
    kinds: ["Deployment", "StatefulSet", "DaemonSet"],
    reason: "The apps/v1beta1 API is deprecated in favor of the stable apps/v1 API.",
    replacement: "Use apps/v1 for workload resources.",
  },
  {
    apiVersion: "apps/v1beta2",
    kinds: ["Deployment", "StatefulSet", "DaemonSet"],
    reason: "The apps/v1beta2 API is deprecated and no longer the recommended API version.",
    replacement: "Use apps/v1 for workload resources.",
  },
  {
    apiVersion: "networking.k8s.io/v1beta1",
    kinds: ["Ingress"],
    reason: "Ingress in networking.k8s.io/v1beta1 is deprecated in favor of networking.k8s.io/v1.",
    replacement: "Use networking.k8s.io/v1 and the modern ingress specification.",
  },
  {
    apiVersion: "batch/v1beta1",
    kinds: ["CronJob"],
    reason: "The beta CronJob API was replaced by the stable batch/v1 API.",
    replacement: "Use batch/v1 for CronJob resources.",
  },
];

function getResourceName(document: any): string {
  return document?.metadata?.name || "<unnamed>";
}

function getResourceNamespace(document: any): string {
  return document?.metadata?.namespace || "<none>";
}

function getWorkloadLabels(workload: any): Record<string, string> {
  if (!workload || typeof workload !== "object") return {};

  if (workload.kind === "Pod") {
    return workload?.metadata?.labels || workload?.spec?.metadata?.labels || {};
  }

  if (workload.kind === "CronJob") {
    return (
      workload?.spec?.jobTemplate?.spec?.template?.metadata?.labels ||
      workload?.metadata?.labels ||
      {}
    );
  }

  return workload?.spec?.template?.metadata?.labels || workload?.metadata?.labels || {};
}

function getWorkloadReplicas(workload: any): number {
  if (!workload || typeof workload !== "object") return 0;

  if (workload.kind === "Deployment" || workload.kind === "StatefulSet" || workload.kind === "ReplicaSet" || workload.kind === "DaemonSet") {
    return typeof workload?.spec?.replicas === "number" ? workload.spec.replicas : 1;
  }

  if (workload.kind === "Job") {
    return typeof workload?.spec?.parallelism === "number" ? workload.spec.parallelism : 1;
  }

  if (workload.kind === "CronJob") {
    return typeof workload?.spec?.jobTemplate?.spec?.parallelism === "number" ? workload.spec.jobTemplate.spec.parallelism : 1;
  }

  if (workload.kind === "Pod") {
    return 1;
  }

  return 0;
}

function hasSelectorContent(selector: any): boolean {
  if (!selector || typeof selector !== "object") return false;

  if (Object.keys(selector).length === 0) return false;

  const keys = Object.keys(selector);
  if (keys.includes("matchLabels") || keys.includes("matchExpressions")) {
    const matchLabels = selector.matchLabels || {};
    const matchExpressions = Array.isArray(selector.matchExpressions) ? selector.matchExpressions : [];
    return Object.keys(matchLabels).length > 0 || matchExpressions.length > 0;
  }

  return true;
}

function selectorMatches(selector: any, labels: Record<string, string> | undefined): boolean {
  if (!selector || typeof selector !== "object") return false;

  const selectorObject = selector.matchLabels || selector.matchExpressions ? selector : { matchLabels: selector };
  const matchLabels = selectorObject.matchLabels || {};
  const matchExpressions = Array.isArray(selectorObject.matchExpressions) ? selectorObject.matchExpressions : [];

  if (Object.keys(matchLabels).length === 0 && matchExpressions.length === 0) {
    return true;
  }

  if (!labels || typeof labels !== "object") {
    return false;
  }

  for (const [key, value] of Object.entries(matchLabels)) {
    if (labels[key] !== String(value)) {
      return false;
    }
  }

  for (const expression of matchExpressions) {
    if (!expression || typeof expression !== "object") {
      return false;
    }

    const key = String(expression.key || "");
    const operator = String(expression.operator || "");
    const actualValue = labels[key];
    const values = Array.isArray(expression.values) ? expression.values.map((item: any) => String(item)) : [];

    switch (operator) {
      case "In":
        if (!key || !values.length || !actualValue || !values.includes(actualValue)) return false;
        break;
      case "NotIn":
        if (!key || actualValue && values.includes(actualValue)) return false;
        break;
      case "Exists":
        if (!key || !(key in labels)) return false;
        break;
      case "DoesNotExist":
        if (!key || key in labels) return false;
        break;
      case "Gt":
        if (!key || actualValue === undefined || Number(actualValue) <= Number(values[0] || 0)) return false;
        break;
      case "Lt":
        if (!key || actualValue === undefined || Number(actualValue) >= Number(values[0] || 0)) return false;
        break;
      default:
        return false;
    }
  }

  return true;
}

function collectManifest(resources: any[]) {
  const manifest = {
    resources: [] as any[],
    workloads: [] as any[],
    services: [] as any[],
    ingresses: [] as any[],
    networkPolicies: [] as any[],
    podDisruptionBudgets: [] as any[],
    roles: [] as any[],
    clusterRoles: [] as any[],
    roleBindings: [] as any[],
    clusterRoleBindings: [] as any[],
  };

  resources.forEach((document) => {
    if (!document || typeof document !== "object") return;

    manifest.resources.push(document);

    switch (document.kind) {
      case "Deployment":
      case "StatefulSet":
      case "DaemonSet":
      case "Job":
      case "CronJob":
      case "Pod":
        manifest.workloads.push(document);
        break;
      case "Service":
        manifest.services.push(document);
        break;
      case "Ingress":
        manifest.ingresses.push(document);
        break;
      case "NetworkPolicy":
        manifest.networkPolicies.push(document);
        break;
      case "PodDisruptionBudget":
        manifest.podDisruptionBudgets.push(document);
        break;
      case "Role":
        manifest.roles.push(document);
        break;
      case "ClusterRole":
        manifest.clusterRoles.push(document);
        break;
      case "RoleBinding":
        manifest.roleBindings.push(document);
        break;
      case "ClusterRoleBinding":
        manifest.clusterRoleBindings.push(document);
        break;
      default:
        break;
    }
  });

  return manifest;
}

function analyzeService(document: any, manifest: ReturnType<typeof collectManifest>): Check[] {
  const checks: Check[] = [];
  const serviceType = document?.spec?.type || "ClusterIP";

  if (serviceType === "ClusterIP") {
    checks.push({
      title: "Service exposure",
      severity: "pass",
      description: `Service ${getResourceName(document)} uses type ClusterIP, which only exposes the service inside the cluster.`,
    });
  } else if (serviceType === "NodePort") {
    checks.push({
      title: "Service exposure",
      severity: "warning",
      description: `Service ${getResourceName(document)} exposes a NodePort, which makes the service reachable on each node's IP and port.`,
      recommendation: "Prefer an internal Service or an Ingress/LB pattern where node-level exposure is not required.",
    });
  } else if (serviceType === "LoadBalancer") {
    checks.push({
      title: "Service exposure",
      severity: "warning",
      description: `Service ${getResourceName(document)} uses type LoadBalancer, which creates external reachability depending on the cloud provider or ingress controller.`,
      recommendation: "Confirm the external exposure is intentional and protected with firewall, ingress, and TLS controls where appropriate.",
    });
  } else {
    checks.push({
      title: "Service exposure",
      severity: "pass",
      description: `Service ${getResourceName(document)} uses service type ${serviceType}.`,
    });
  }

  const selector = document?.spec?.selector;
  if (selector && hasSelectorContent(selector)) {
    const matchingWorkloads = manifest.workloads.filter((workload) => {
      const labels = getWorkloadLabels(workload);
      const sameNamespace = getResourceNamespace(workload) === getResourceNamespace(document);
      return sameNamespace && selectorMatches(selector, labels);
    });

    const candidateWorkloads = manifest.workloads.filter(
      (workload) => getResourceNamespace(workload) === getResourceNamespace(document)
    );
    const labeledCandidates = candidateWorkloads.filter(
      (workload) => Object.keys(getWorkloadLabels(workload)).length > 0
    );

    if (matchingWorkloads.length > 0) {
      checks.push({
        title: "Service selector relationship",
        severity: "pass",
        description: `Service ${getResourceName(document)} appears to select ${matchingWorkloads.length} workload(s) in the supplied manifest.`,
      });
    } else if (candidateWorkloads.length === 0) {
      checks.push({
        title: "Service selector relationship",
        severity: "warning",
        description: `Service ${getResourceName(document)} defines a selector but no workload is present in the supplied manifest to verify the relationship.`,
        recommendation: "Unable to verify from supplied manifests. Add the target workload or confirm the Service selector matches the workload labels.",
      });
    } else if (labeledCandidates.length === 0) {
      checks.push({
        title: "Service selector relationship",
        severity: "warning",
        description: `Service ${getResourceName(document)} defines a selector but none of the workloads in the supplied manifest expose enough label data to verify the match.`,
        recommendation: "Unable to verify from supplied manifests. Confirm the workload labels and Service selector align before relying on the routing target.",
      });
    } else {
      checks.push({
        title: "Service selector relationship",
        severity: "warning",
        description: `Service ${getResourceName(document)} declares selector ${JSON.stringify(selector)} but no workload in the supplied manifest matches it.`,
        recommendation: "Verify that the Service selector matches the labels on the target workload before exposing traffic.",
      });
    }
  }

  return checks;
}

function analyzeIngress(document: any, manifest: ReturnType<typeof collectManifest>): Check[] {
  const checks: Check[] = [];
  const hostNames = [] as string[];
  const paths = [] as string[];

  const rules = Array.isArray(document?.spec?.rules) ? document.spec.rules : [];

  rules.forEach((rule: any) => {
    if (rule?.host) hostNames.push(rule.host);

    const rulePaths = Array.isArray(rule?.http?.paths)
      ? rule.http.paths
          .map((pathObj: any) => pathObj?.path || "/")
          .filter(Boolean)
      : [];

    paths.push(...rulePaths);
  });

  if (rules.length === 0 && document?.spec?.defaultBackend) {
    checks.push({
      title: "Ingress backend",
      severity: "pass",
      description: `Ingress ${getResourceName(document)} defines a default backend.`,
    });
  }

  if (hostNames.length > 0) {
    checks.push({
      title: "Ingress hosts",
      severity: "pass",
      description: `Ingress ${getResourceName(document)} exposes hosts: ${hostNames.join(", ")}.`,
    });
  } else {
    checks.push({
      title: "Ingress hosts",
      severity: "warning",
      description: `Ingress ${getResourceName(document)} does not define explicit host names.`,
      recommendation: "Define hostnames when routing external traffic through the ingress.",
    });
  }

  if (paths.length > 0) {
    checks.push({
      title: "Ingress paths",
      severity: "pass",
      description: `Ingress ${getResourceName(document)} defines paths: ${paths.join(", ")}.`,
    });
  }

  const tlsHosts = Array.isArray(document?.spec?.tls)
    ? document.spec.tls.flatMap((tlsEntry: any) => Array.isArray(tlsEntry?.hosts) ? tlsEntry.hosts : [])
    : [];

  if (hostNames.length > 0) {
    const hasTls = tlsHosts.length > 0;
    const externalHosts = hostNames.filter((host) => !host.includes("localhost") && !(host.includes("cluster.local") || host.includes("svc.cluster.local")));

    if (externalHosts.length > 0 && !hasTls) {
      checks.push({
        title: "Ingress TLS",
        severity: "warning",
        description: `Ingress ${getResourceName(document)} exposes external HTTP host(s) without TLS configuration in the supplied manifest.`,
        recommendation: "Configure TLS for externally exposed HTTP endpoints.",
      });
    } else {
      checks.push({
        title: "Ingress TLS",
        severity: "pass",
        description: `Ingress ${getResourceName(document)} includes TLS configuration or no externally exposed HTTP host was identified.`,
      });
    }
  }

  const backendRefs = [] as string[];

  rules.forEach((rule: any) => {
    if (Array.isArray(rule?.http?.paths)) {
      rule.http.paths.forEach((pathObj: any) => {
        const serviceName = pathObj?.backend?.service?.name;
        if (serviceName) backendRefs.push(serviceName);
      });
    }

    if (rule?.http?.paths?.length === 0 && rule?.http?.defaultBackend?.service?.name) {
      backendRefs.push(rule.http.defaultBackend.service.name);
    }
  });

  if (document?.spec?.defaultBackend?.service?.name) {
    backendRefs.push(document.spec.defaultBackend.service.name);
  }

  const uniqueRefs = Array.from(new Set(backendRefs));
  if (uniqueRefs.length > 0) {
    const missing = uniqueRefs.filter((serviceName) => !manifest.services.some((service) => service.metadata?.name === serviceName && (service.metadata?.namespace || "<none>") === (document.metadata?.namespace || "<none>")));

    if (missing.length > 0) {
      checks.push({
        title: "Ingress backend service",
        severity: "warning",
        description: `Ingress ${getResourceName(document)} references Service(s) ${missing.join(", ")} that were not found in the supplied manifest.`,
        recommendation: "Verify the referenced Service exists in the supplied manifest and points to the intended workload.",
      });
    } else {
      checks.push({
        title: "Ingress backend service",
        severity: "pass",
        description: `Ingress ${getResourceName(document)} references Services that are present in the supplied manifest.`,
      });
    }
  }

  return checks;
}

function analyzeNetworkPolicy(document: any, manifest: ReturnType<typeof collectManifest>): Check[] {
  const checks: Check[] = [];

  checks.push({
    title: "NetworkPolicy detected",
    severity: "pass",
    description: `NetworkPolicy ${getResourceName(document)} in namespace ${getResourceNamespace(document)} was detected.`,
  });

  const podSelector = document?.spec?.podSelector || {};
  const hasPodSelector = hasSelectorContent(podSelector);
  if (hasPodSelector) {
    checks.push({
      title: "NetworkPolicy pod selector",
      severity: "pass",
      description: `NetworkPolicy ${getResourceName(document)} defines a podSelector: ${JSON.stringify(podSelector)}.`,
    });
  } else {
    checks.push({
      title: "NetworkPolicy pod selector",
      severity: "warning",
      description: `NetworkPolicy ${getResourceName(document)} does not define a specific podSelector in the supplied manifest. Empty podSelector semantics would apply to all pods in the namespace.`,
      recommendation: "Define a podSelector that matches the intended workload so the policy scope is explicit and reviewable.",
    });
  }

  const ingressRules = Array.isArray(document?.spec?.ingress) ? document.spec.ingress : [];
  const egressRules = Array.isArray(document?.spec?.egress) ? document.spec.egress : [];

  if (ingressRules.length > 0 || egressRules.length > 0) {
    checks.push({
      title: "NetworkPolicy rules",
      severity: "pass",
      description: `NetworkPolicy ${getResourceName(document)} defines ${ingressRules.length} ingress rule(s) and ${egressRules.length} egress rule(s).`,
    });
  } else {
    checks.push({
      title: "NetworkPolicy rules",
      severity: "warning",
      description: `NetworkPolicy ${getResourceName(document)} does not define ingress or egress rules in the supplied manifest.`,
      recommendation: "Add explicit ingress and egress rules that match the workload communication model.",
    });
  }

  const matchingWorkloads = manifest.workloads.filter((workload) => {
    const workloadLabels = getWorkloadLabels(workload);
    const workloadNamespace = getResourceNamespace(workload);
    const policyNamespace = getResourceNamespace(document);

    if (workloadNamespace !== policyNamespace) return false;
    if (!hasPodSelector) return true;

    return selectorMatches(podSelector, workloadLabels);
  });

  if (matchingWorkloads.length > 0) {
    checks.push({
      title: "Policy workload match",
      severity: "pass",
      description: `NetworkPolicy ${getResourceName(document)} appears to select ${matchingWorkloads.length} workload(s).`,
    });
  } else if (manifest.workloads.some((workload) => getResourceNamespace(workload) === getResourceNamespace(document))) {
    checks.push({
      title: "Policy workload match",
      severity: "warning",
      description: `NetworkPolicy ${getResourceName(document)} in namespace ${getResourceNamespace(document)} does not appear to select any workload in the supplied manifest.`,
      recommendation: "Verify the policy's podSelector matches the target workload labels before relying on it for traffic isolation.",
    });
  } else {
    checks.push({
      title: "Policy workload match",
      severity: "warning",
      description: `NetworkPolicy ${getResourceName(document)} defines a podSelector, but no workload in the same namespace is present in the supplied manifest to verify confinement.`,
      recommendation: "Unable to verify from supplied manifests. Add the target workloads or confirm the podSelector matches the intended workload labels.",
    });
  }

  return checks;
}

function analyzePdb(document: any, manifest: ReturnType<typeof collectManifest>): Check[] {
  const checks: Check[] = [];
  const minAvailable = document?.spec?.minAvailable;
  const maxUnavailable = document?.spec?.maxUnavailable;
  const selector = document?.spec?.selector || {};

  if (minAvailable !== undefined) {
    checks.push({
      title: "PDB minimum availability",
      severity: "pass",
      description: `PodDisruptionBudget ${getResourceName(document)} sets minAvailable to ${String(minAvailable)}.`,
    });
  } else if (maxUnavailable !== undefined) {
    checks.push({
      title: "PDB disruption limit",
      severity: "pass",
      description: `PodDisruptionBudget ${getResourceName(document)} sets maxUnavailable to ${String(maxUnavailable)}.`,
    });
  } else {
    checks.push({
      title: "PDB availability settings",
      severity: "warning",
      description: `PodDisruptionBudget ${getResourceName(document)} does not define minAvailable or maxUnavailable in the supplied manifest.`,
      recommendation: "Define a clear disruption budget to protect availability during voluntary disruptions.",
    });
  }

  if (selector && hasSelectorContent(selector)) {
    const matchingWorkloads = manifest.workloads.filter((workload) => {
      const workloadLabels = getWorkloadLabels(workload);
      const sameNamespace = getResourceNamespace(workload) === getResourceNamespace(document);
      return sameNamespace && selectorMatches(selector, workloadLabels);
    });

    const sameNamespaceWorkloads = manifest.workloads.filter(
      (workload) => getResourceNamespace(workload) === getResourceNamespace(document)
    );
    const labeledWorkloads = sameNamespaceWorkloads.filter(
      (workload) => Object.keys(getWorkloadLabels(workload)).length > 0
    );

    if (matchingWorkloads.length > 0) {
      checks.push({
        title: "PDB selector match",
        severity: "pass",
        description: `PodDisruptionBudget ${getResourceName(document)} appears to select ${matchingWorkloads.length} workload(s).`,
      });
    } else if (sameNamespaceWorkloads.length === 0) {
      checks.push({
        title: "PDB selector match",
        severity: "warning",
        description: `PodDisruptionBudget ${getResourceName(document)} defines a selector but no workload is present in the supplied manifest to verify the relationship.`,
        recommendation: "Unable to verify from supplied manifests. Confirm the selector matches the intended workload labels before relying on the disruption budget.",
      });
    } else if (labeledWorkloads.length === 0) {
      checks.push({
        title: "PDB selector match",
        severity: "warning",
        description: `PodDisruptionBudget ${getResourceName(document)} defines a selector but the workloads in the supplied manifest do not expose enough label information to confirm the match.`,
        recommendation: "Unable to verify from supplied manifests. Review the workload labels used by the selector to confirm the PDB is targeted correctly.",
      });
    } else {
      checks.push({
        title: "PDB selector match",
        severity: "warning",
        description: `PodDisruptionBudget ${getResourceName(document)} does not appear to select any workload in the supplied manifest.`,
        recommendation: "Verify the selector matches the target workload labels before relying on the disruption budget.",
      });
    }
  }

  return checks;
}

function analyzeRbac(document: any): Check[] {
  const checks: Check[] = [];
  const kind = document?.kind;
  const name = getResourceName(document);
  const namespace = getResourceNamespace(document);
  // RoleBinding/ClusterRoleBinding never have a `rules` field at all (only
  // `subjects` + `roleRef`) - only Role/ClusterRole do. Evaluating `rules`
  // for a binding always found it empty and returned early before the
  // binding-specific subjects logic below ever ran, producing a misleading
  // "does not define any rules" warning and making the dedicated
  // "no subjects" check unreachable for every binding.
  const isBindingKind = kind === "RoleBinding" || kind === "ClusterRoleBinding";

  if (!isBindingKind) {
    const rules = Array.isArray(document?.rules) ? document.rules : [];

    if (rules.length === 0) {
      checks.push({
        title: "RBAC rules",
        severity: "warning",
        description: `${kind} ${name} does not define any rules in the supplied manifest.`,
        recommendation: "Define the minimum allowed permissions explicitly for the role or cluster role.",
      });
      return checks;
    }

    rules.forEach((rule: any, index: number) => {
      const apiGroups = Array.isArray(rule?.apiGroups) ? rule.apiGroups.map(String) : [];
      const resources = Array.isArray(rule?.resources) ? rule.resources.map(String) : [];
      const verbs = Array.isArray(rule?.verbs) ? rule.verbs.map(String) : [];
      const ruleText = JSON.stringify(rule);

      const isWildcardRule =
        resources.includes("*") ||
        apiGroups.includes("*") ||
        verbs.includes("*");

      if (isWildcardRule) {
        // The core Kubernetes API group (Pods, Secrets, ConfigMaps,
        // ServiceAccounts, Namespaces, etc.) is represented as an empty
        // string, not "*" - so a rule granting resources:"*" and verbs:"*"
        // on the core group is just as unrestricted as apiGroups:"*" and
        // must escalate to critical the same way.
        const grantsAllApiGroups = apiGroups.includes("*") || apiGroups.includes("");

        checks.push({
          title: `${kind} rule ${index + 1}`,
          severity: grantsAllApiGroups && resources.includes("*") && verbs.includes("*") ? "critical" : "warning",
          description: `${kind} ${name} in namespace ${namespace} includes a broad wildcard rule: ${ruleText}.`,
          recommendation: "Limit RBAC permissions to the specific resources and verbs required by the workload or controller.",
        });
      } else {
        checks.push({
          title: `${kind} rule ${index + 1}`,
          severity: "pass",
          description: `${kind} ${name} grants explicit permissions: ${ruleText}.`,
        });
      }
    });
  }

  if (isBindingKind) {
    const subjects = Array.isArray(document?.subjects) ? document.subjects : [];

    if (subjects.length === 0) {
      checks.push({
        title: "RBAC subjects",
        severity: "warning",
        description: `${kind} ${name} does not declare any subjects.`,
        recommendation: "Bind the role to the intended subject so access is clearly scoped and reviewable.",
      });
    }

    subjects.forEach((subject: any) => {
      if (subject?.kind === "ServiceAccount") {
        const subjectNamespace = subject?.namespace || namespace;
        const bindingScope = kind === "ClusterRoleBinding" ? "cluster-wide" : "namespace-scoped";
        const severity = kind === "ClusterRoleBinding" ? "warning" : "pass";

        checks.push({
          title: "ServiceAccount binding",
          severity,
          description: `${kind} ${name} binds ${subject.kind} ${subject.name} in namespace ${subjectNamespace} with ${bindingScope} scope.`,
          recommendation: "Confirm that the ServiceAccount is intended to receive this access and avoid cluster-wide bindings unless necessary.",
        });
      }
    });
  }

  return checks;
}

function analyzeDeprecatedApi(document: any): Check[] {
  const checks: Check[] = [];
  const apiVersion = document?.apiVersion || "unknown";
  const kind = document?.kind || "unknown";

  const match = DEPRECATED_KUBERNETES_APIS.find((entry) => {
    if (entry.apiVersion !== apiVersion) return false;
    return entry.kinds.includes(kind) || entry.kinds.length === 0;
  });

  if (!match) return checks;

  checks.push({
    title: "Deprecated API version",
    severity: "warning",
    description: `${kind} ${getResourceName(document)} uses apiVersion ${apiVersion}. ${match.reason}`,
    recommendation: `Use ${match.replacement}`,
  });

  return checks;
}

function analyzeYaml(input: string): {
  resources: ResourceResult[];
  error?: string;
} {
  try {
    const docs: any[] = [];
    yaml.loadAll(input, (doc) => {
      if (doc !== undefined) docs.push(doc);
    });

    if (docs.length === 0) {
      return { resources: [], error: "The YAML input is empty or invalid." };
    }

    const manifest = collectManifest(docs);
    const resources: ResourceResult[] = [];

    docs.forEach((document, idx) => {
      if (!document || typeof document !== "object") {
        resources.push({
          apiVersion: "unknown",
          kind: "unknown",
          name: `<document-${idx + 1}>`,
          namespace: "<none>",
          checks: [
            {
              title: "Invalid document",
              severity: "critical",
              description: "YAML document is not a valid mapping/object.",
            },
          ],
        });
        return;
      }

      const apiVersion = document.apiVersion || "unknown";
      const kind = document.kind || "<unknown>";
      const name = getResourceName(document);
      const namespace = getResourceNamespace(document);
      const supportedKinds = [
        "Pod",
        "Deployment",
        "StatefulSet",
        "DaemonSet",
        "Job",
        "CronJob",
      ];

      let checks: Check[] = [];

      if (kind === "Deployment") {
        checks = [
          {
            title: "YAML syntax",
            severity: "pass",
            description: "The YAML document was parsed successfully.",
          },
          {
            title: "Deployment resource",
            severity: "pass",
            description: "A Kubernetes Deployment was detected.",
          },
          ...analyzeDeployment(document),
        ];
      } else if (supportedKinds.includes(kind)) {
        checks = [
          {
            title: "YAML syntax",
            severity: "pass",
            description: "The YAML document was parsed successfully.",
          },
          {
            title: "Detected resource",
            severity: "pass",
            description: `Detected ${kind} resource.`,
          },
          ...analyzeWorkload(document),
        ];
      } else if (kind === "Service") {
        checks = [
          {
            title: "YAML syntax",
            severity: "pass",
            description: "The YAML document was parsed successfully.",
          },
          {
            title: "Detected resource",
            severity: "pass",
            description: `Detected ${kind} resource.`,
          },
          ...analyzeService(document, manifest),
        ];
      } else if (kind === "Ingress") {
        checks = [
          {
            title: "YAML syntax",
            severity: "pass",
            description: "The YAML document was parsed successfully.",
          },
          {
            title: "Detected resource",
            severity: "pass",
            description: `Detected ${kind} resource.`,
          },
          ...analyzeIngress(document, manifest),
        ];
      } else if (kind === "NetworkPolicy") {
        checks = [
          {
            title: "YAML syntax",
            severity: "pass",
            description: "The YAML document was parsed successfully.",
          },
          {
            title: "Detected resource",
            severity: "pass",
            description: `Detected ${kind} resource.`,
          },
          ...analyzeNetworkPolicy(document, manifest),
        ];
      } else if (kind === "PodDisruptionBudget") {
        checks = [
          {
            title: "YAML syntax",
            severity: "pass",
            description: "The YAML document was parsed successfully.",
          },
          {
            title: "Detected resource",
            severity: "pass",
            description: `Detected ${kind} resource.`,
          },
          ...analyzePdb(document, manifest),
        ];
      } else if (kind === "Role" || kind === "ClusterRole" || kind === "RoleBinding" || kind === "ClusterRoleBinding") {
        checks = [
          {
            title: "YAML syntax",
            severity: "pass",
            description: "The YAML document was parsed successfully.",
          },
          {
            title: "Detected resource",
            severity: "pass",
            description: `Detected ${kind} resource.`,
          },
          ...analyzeRbac(document),
        ];
      } else if (kind === "<unknown>") {
        checks = [
          {
            title: "YAML syntax",
            severity: "pass",
            description: "The YAML document was parsed successfully.",
          },
          {
            title: "Document does not define a kind",
            severity: "warning",
            description: "This document has no kind and cannot be mapped to a Kubernetes resource type.",
            recommendation: "Add a valid Kubernetes kind to the YAML document.",
          },
        ];
      } else {
        checks = [
          {
            title: "YAML syntax",
            severity: "pass",
            description: "The YAML document was parsed successfully.",
          },
          {
            title: "Detected resource",
            severity: "pass",
            description: `Detected ${kind} resource.`,
          },
          {
            title: "Detailed analysis coming soon",
            severity: "warning",
            description: `Detailed ${kind} analysis is not available in this version.`,
            recommendation: "Support for this resource will be added in a future release.",
          },
        ];
      }

      const deprecatedChecks = analyzeDeprecatedApi(document);
      if (deprecatedChecks.length > 0) {
        checks = [...checks, ...deprecatedChecks];
      }

      resources.push({
        apiVersion,
        kind,
        name,
        namespace,
        checks,
      });
    });

    const workloadResources = resources.filter((resource) => [
      "Pod",
      "Deployment",
      "StatefulSet",
      "DaemonSet",
      "Job",
      "CronJob",
    ].includes(resource.kind));

    const workloadMatches = new Map<string, any[]>();
    const networkPolicies = manifest.networkPolicies || [];

    workloadResources.forEach((workload) => {
      const workloadDoc = manifest.workloads.find((candidate) => {
        return getResourceName(candidate) === workload.name && getResourceNamespace(candidate) === workload.namespace;
      });

      if (!workloadDoc) return;

      const matchingPolicies = networkPolicies.filter((policy) => {
        const policyNamespace = getResourceNamespace(policy);
        const podSelector = policy?.spec?.podSelector || {};

        if (policyNamespace !== workload.namespace) return false;
        if (!hasSelectorContent(podSelector)) return true;

        return selectorMatches(podSelector, getWorkloadLabels(workloadDoc));
      });

      workloadMatches.set(`${workload.namespace}/${workload.name}`, matchingPolicies);
    });

    resources.forEach((resource) => {
      if (!["Deployment", "StatefulSet", "DaemonSet", "Job", "CronJob", "Pod"].includes(resource.kind)) return;

      const workloadDoc = manifest.workloads.find((candidate) => {
        return getResourceName(candidate) === resource.name && getResourceNamespace(candidate) === resource.namespace;
      });
      const replicas = getWorkloadReplicas(workloadDoc);
      const applicablePolicies = workloadMatches.get(`${resource.namespace}/${resource.name}`) || [];

      if (replicas >= 2 && applicablePolicies.length === 0) {
        resource.checks.push({
          title: "NetworkPolicy coverage",
          severity: "warning",
          description: `Workload ${resource.kind} ${resource.name} in namespace ${resource.namespace} has multiple replicas but no matching NetworkPolicy was found in the supplied manifest.`,
          recommendation: "Define a NetworkPolicy that restricts ingress and egress to the expected traffic pattern for this workload.",
        });
      }

      const matchingPdbs = manifest.podDisruptionBudgets.filter((pdb) => {
        const selector = pdb?.spec?.selector || {};
        if (!hasSelectorContent(selector)) return false;
        if (getResourceNamespace(pdb) !== resource.namespace) return false;
        return selectorMatches(selector, getWorkloadLabels(workloadDoc));
      });

      if (replicas >= 2 && matchingPdbs.length === 0) {
        resource.checks.push({
          title: "PodDisruptionBudget coverage",
          severity: "warning",
          description: `Workload ${resource.kind} ${resource.name} in namespace ${resource.namespace} has multiple replicas but no matching PodDisruptionBudget was found in the supplied manifest.`,
          recommendation: "Consider configuring a PodDisruptionBudget for workloads that require availability during voluntary disruptions.",
        });
      }
    });

    const serviceResults = resources.filter((resource) => resource.kind === "Service");
    serviceResults.forEach((resource) => {
      const serviceDoc = manifest.services.find((doc) => getResourceName(doc) === resource.name && getResourceNamespace(doc) === resource.namespace);
      if (!serviceDoc) return;

      const selector = serviceDoc?.spec?.selector;
      if (selector && hasSelectorContent(selector)) {
        const candidateWorkloads = manifest.workloads.filter(
          (candidate) => getResourceNamespace(candidate) === getResourceNamespace(serviceDoc)
        );
        const labeledCandidates = candidateWorkloads.filter(
          (candidate) => Object.keys(getWorkloadLabels(candidate)).length > 0
        );
        const matches = candidateWorkloads.filter((candidate) => selectorMatches(selector, getWorkloadLabels(candidate)));

        if (matches.length > 0) {
          resource.checks.push({
            title: "Service selector validation",
            severity: "pass",
            description: `Service ${resource.name} in namespace ${resource.namespace} appears to match ${matches.length} workload(s) in the supplied manifest.`,
          });
        } else if (candidateWorkloads.length === 0) {
          resource.checks.push({
            title: "Service selector validation",
            severity: "warning",
            description: `Service ${resource.name} in namespace ${resource.namespace} defines a selector but there are no workloads in the same namespace available to verify the relationship.`,
            recommendation: "Unable to verify from supplied manifests. Add the workload or confirm the selector matches the pod labels.",
          });
        } else if (labeledCandidates.length === 0) {
          resource.checks.push({
            title: "Service selector validation",
            severity: "warning",
            description: `Service ${resource.name} in namespace ${resource.namespace} defines selector ${JSON.stringify(selector)}, but the workloads in the supplied manifest do not expose enough label data to verify the relationship.`,
            recommendation: "Unable to verify from supplied manifests. Confirm that the target workload labels and Service selector align before relying on the Service target.",
          });
        } else {
          resource.checks.push({
            title: "Service selector validation",
            severity: "warning",
            description: `Service ${resource.name} in namespace ${resource.namespace} declares selector ${JSON.stringify(selector)} but no workload in the supplied manifest matches it.`,
            recommendation: "Verify that the Service selector matches the labels on the target workload.",
          });
        }
      }
    });

    const ingressResults = resources.filter((resource) => resource.kind === "Ingress");
    ingressResults.forEach((resource) => {
      const ingressDoc = manifest.ingresses.find((doc) => getResourceName(doc) === resource.name && getResourceNamespace(doc) === resource.namespace);
      if (!ingressDoc) return;

      const rules = Array.isArray(ingressDoc?.spec?.rules) ? ingressDoc.spec.rules : [];
      const backendRefs = [] as string[];
      rules.forEach((rule: any) => {
        if (Array.isArray(rule?.http?.paths)) {
          rule.http.paths.forEach((pathObj: any) => {
            if (pathObj?.backend?.service?.name) backendRefs.push(pathObj.backend.service.name);
          });
        }
      });
      if (ingressDoc?.spec?.defaultBackend?.service?.name) backendRefs.push(ingressDoc.spec.defaultBackend.service.name);
      const uniqueBackendRefs = Array.from(new Set(backendRefs));
      uniqueBackendRefs.forEach((serviceName) => {
        const serviceExists = manifest.services.some((service) => getResourceName(service) === serviceName && getResourceNamespace(service) === getResourceNamespace(ingressDoc));
        if (!serviceExists) {
          resource.checks.push({
            title: "Ingress backend service",
            severity: "warning",
            description: `Ingress ${resource.name} in namespace ${resource.namespace} references Service ${serviceName}, but the referenced Service was not found in the supplied manifest.`,
            recommendation: "Verify that the Ingress backend service exists in the supplied manifest before exposing traffic through it.",
          });
        }
      });
    });

    // Note: ServiceAccount-binding findings for RoleBinding/ClusterRoleBinding
    // are produced directly by analyzeRbac (called per-document above) now
    // that its subjects logic is reachable - a separate manifest-level pass
    // here would duplicate the exact same "ServiceAccount binding" finding.

    return { resources };
  } catch (error) {
    return {
      resources: [],
      error: error instanceof Error ? error.message : "Unable to parse YAML.",
    };
  }
}

function severityLabel(severity: Severity) {
  if (severity === "pass") return "PASS";
  if (severity === "warning") return "WARNING";
  return "CRITICAL";
}

export default function KubernetesAnalyzer() {
  const [input, setInput] = useState(exampleYaml);
  const [resources, setResources] = useState<ResourceResult[]>([]);
  const [error, setError] = useState("");
  const [analyzed, setAnalyzed] = useState(false);

  function runAnalysis() {
    const result = analyzeYaml(input);

    setResources(result.resources);
    setError(result.error || "");
    setAnalyzed(true);
  }

  function loadExample() {
    setInput(exampleYaml);
    setResources([]);
    setError("");
    setAnalyzed(false);
  }

  function clearAll() {
    setInput("");
    setResources([]);
    setError("");
    setAnalyzed(false);
  }

  // Flatten checks for summary counts
  const allChecks = resources.flatMap((r) => r.checks || []);

  const passCount = allChecks.filter((check) => check.severity === "pass").length;
  const warningCount = allChecks.filter((check) => check.severity === "warning").length;
  const criticalCount = allChecks.filter((check) => check.severity === "critical").length;

  const resourcesCount = resources.length;

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <section className="mx-auto max-w-7xl px-6 py-16">
        <div className="mb-10">
          <p className="text-sm font-medium uppercase tracking-widest text-zinc-500">
            Kubernetes · SRE
          </p>
        </div>

        <div className="grid gap-8 lg:grid-cols-2">
          {/* Input */}
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="font-semibold">
                  Kubernetes YAML
                </h2>

                <p className="mt-1 text-xs text-zinc-500">
                  Paste a Deployment manifest
                </p>
              </div>

              <button
                onClick={loadExample}
                className="text-sm text-zinc-400 hover:text-white"
              >
                Load example
              </button>
            </div>

            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              spellCheck={false}
              aria-label="Kubernetes manifest YAML input"
              placeholder="Paste Kubernetes YAML here..."
              className="min-h-[560px] w-full resize-y rounded-xl border border-zinc-700 bg-zinc-950 p-5 font-mono text-sm leading-6 text-zinc-200 outline-none focus:border-zinc-400"
            />

            <div className="mt-4 flex flex-wrap gap-3">
              <button
                onClick={runAnalysis}
                className="rounded-lg bg-white px-5 py-3 font-medium text-zinc-950 hover:bg-zinc-200"
              >
                Analyze Manifest
              </button>

              <button
                onClick={clearAll}
                className="rounded-lg border border-zinc-700 px-5 py-3 font-medium text-zinc-300 hover:border-zinc-500 hover:text-white"
              >
                Clear
              </button>
            </div>

            {error && (
              <div className="mt-5 rounded-xl border border-red-900/60 bg-red-950/20 p-5">
                <p className="font-medium text-red-400">
                  Analysis failed
                </p>

                <p className="mt-2 break-all font-mono text-sm text-red-300/80">
                  {error}
                </p>
              </div>
            )}
          </div>

          {/* Results */}
          <div>
            {!analyzed ? (
              <div className="flex min-h-[400px] items-center justify-center rounded-2xl border border-zinc-800 bg-zinc-900/30 p-8 text-center">
                <div>
                  <p className="text-xl font-semibold">
                    Ready to analyze
                  </p>

                  <p className="mt-3 max-w-md text-sm leading-6 text-zinc-500">
                    Paste a Kubernetes Deployment and run the
                    analyzer to check common production issues.
                  </p>
                </div>
              </div>
            ) : (
              <>
                {!error && (
                  <>
                    {/* Summary */}
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <div className="rounded-xl border border-emerald-500/40 bg-emerald-950/30 p-5">
                        <p className="text-xs uppercase tracking-widest text-emerald-400">
                          Passed
                        </p>

                        <p className="mt-2 text-3xl font-bold text-emerald-400">
                          {passCount}
                        </p>
                      </div>

                      <div className="rounded-xl border border-amber-500/40 bg-amber-950/30 p-5">
                        <p className="text-xs uppercase tracking-widest text-amber-400">
                          Warnings
                        </p>

                        <p className="mt-2 text-3xl font-bold text-amber-400">
                          {warningCount}
                        </p>
                      </div>

                      <div className="rounded-xl border border-red-500/40 bg-red-950/30 p-5">
                        <p className="text-xs uppercase tracking-widest text-red-400">
                          Critical
                        </p>

                        <p className="mt-2 text-3xl font-bold text-red-400">
                          {criticalCount}
                        </p>
                      </div>
                    </div>

                    {/* Checks grouped by resource */}
                                        <div className="mt-5 space-y-6">
                                          <div className="text-sm text-zinc-400">Resources analyzed: {resourcesCount}</div>

                                          {resources.map((resource, rIdx) => (
                                            <div key={`${resource.kind}-${resource.name}-${rIdx}`}>
                                              <div className="mb-3 flex items-baseline justify-between">
                                                <h2 className="text-lg font-semibold">
                                                  {resource.kind} / {resource.name}
                                                </h2>

                                                <div className="text-xs text-zinc-500">{resource.namespace !== '<none>' ? resource.namespace : 'no namespace'}</div>
                                              </div>

                                              <div className="space-y-3">
                                                {resource.checks.map((check, index) => (
                                                  <div
                                                    key={`${resource.kind}-${resource.name}-${check.title}-${index}`}
                                                    className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5"
                                                  >
                                                    <div className="flex items-start justify-between gap-4">
                                                      <div>
                                                        <h3 className="font-semibold">{check.title}</h3>

                                                        <p className="mt-2 text-sm leading-6 text-zinc-400">
                                                          {check.description}
                                                        </p>
                                                      </div>

                                                      <span
                                                        className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-medium ${
                                                          check.severity === "pass"
                                                            ? "border-emerald-500/40 bg-emerald-950/30 text-emerald-400"
                                                            : check.severity === "warning"
                                                              ? "border-amber-500/40 bg-amber-950/30 text-amber-400"
                                                              : "border-red-500/40 bg-red-950/30 text-red-400"
                                                        }`}
                                                      >
                                                        {severityLabel(check.severity)}
                                                      </span>
                                                    </div>

                                                    {check.recommendation && (
                                                      <div className="mt-4 border-t border-zinc-800 pt-4">
                                                        <p className="text-xs uppercase tracking-widest text-zinc-600">Recommendation</p>

                                                        <p className="mt-2 text-sm leading-6 text-zinc-300">{check.recommendation}</p>
                                                      </div>
                                                    )}
                                                  </div>
                                                ))}
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                  </>
                )}
              </>
            )}
          </div>
        </div>

        <section className="mt-16 border-t border-zinc-800 pt-10">
          <h2 className="text-2xl font-semibold">
            What OpsForge checks
          </h2>

          <div className="mt-8 grid gap-4 md:grid-cols-3">
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
              <h3 className="font-semibold">
                Reliability
              </h3>

              <p className="mt-2 text-sm leading-6 text-zinc-400">
                Replica count and health probes that help
                workloads survive failures.
              </p>
            </div>

            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
              <h3 className="font-semibold">
                Security
              </h3>

              <p className="mt-2 text-sm leading-6 text-zinc-400">
                Checks for non-root execution and privileged
                containers.
              </p>
            </div>

            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
              <h3 className="font-semibold">
                Resource Management
              </h3>

              <p className="mt-2 text-sm leading-6 text-zinc-400">
                Detects missing CPU and memory requests and
                limits.
              </p>
            </div>
          </div>
        </section>

        <section className="mt-8 rounded-xl border border-amber-900/50 bg-amber-950/10 p-5">
          <div className="font-semibold text-amber-400">
            Important
          </div>

          <p className="mt-2 text-sm leading-6 text-zinc-400">
            This analyzer provides practical static checks.
            It does not replace Kubernetes admission policies,
            security scanners, or testing in a real cluster.
          </p>
        </section>
      </section>
    </div>
  );
}