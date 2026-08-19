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

function analyzeDeployment(document: any): Check[] {
  const checks: Check[] = [];

  const spec = document?.spec;
  const template = spec?.template;
  const podSpec = template?.spec;
  const containers = podSpec?.containers || [];

  if (typeof spec?.replicas === "number" && spec.replicas >= 2) {
    checks.push({
      title: "Multiple replicas configured",
      severity: "pass",
      description: `Deployment is configured with ${spec.replicas} replicas.`,
    });
  } else {
    checks.push({
      title: "High availability",
      severity: "warning",
      description:
        "The Deployment does not have at least 2 replicas.",
      recommendation:
        "Consider using multiple replicas for better availability.",
    });
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

  containers.forEach((container: any, index: number) => {
    const containerName =
      container?.name || `container-${index + 1}`;

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
      !image.includes(":")
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
  });

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

  containers.forEach((container: any, index: number) => {
    const containerName = container?.name || `container-${index + 1}`;

    const image = container?.image || "";

    if (!image) {
      checks.push({
        title: `${containerName}: image missing`,
        severity: "critical",
        description: "The container does not specify a container image.",
        recommendation: "Set a valid container image.",
      });
    } else if (
      image.endsWith(":latest") ||
      image === "latest" ||
      !image.includes(":")
    ) {
      checks.push({
        title: `${containerName}: mutable image tag`,
        severity: "warning",
        description: `Container uses "${image}", which may change over time.`,
        recommendation: "Use a fixed image version or digest.",
      });
    } else {
      checks.push({
        title: `${containerName}: fixed image version`,
        severity: "pass",
        description: `Container uses image "${image}".`,
      });
    }

    const resources = container?.resources;

    if (resources?.requests && resources?.limits) {
      checks.push({
        title: `${containerName}: resource requests and limits`,
        severity: "pass",
        description: "CPU and memory resource configuration is present.",
      });
    } else {
      checks.push({
        title: `${containerName}: resources missing`,
        severity: "warning",
        description: "Resource requests and/or limits are not configured.",
        recommendation:
          "Define CPU and memory requests and limits to improve scheduling and resource control.",
      });
    }

    const securityContext = getEffectiveSecurityContext(container, podSpec);

    if (securityContext?.runAsNonRoot === true) {
      checks.push({
        title: `${containerName}: non-root execution`,
        severity: "pass",
        description: "The workload explicitly requires non-root execution.",
      });
    } else {
      checks.push({
        title: `${containerName}: non-root execution`,
        severity: "warning",
        description: "The container does not explicitly require non-root execution.",
        recommendation: "Consider setting securityContext.runAsNonRoot: true.",
      });
    }

    if (typeof securityContext?.runAsUser === "number") {
      if (securityContext.runAsUser === 0) {
        const rootSeverity =
          securityContext?.privileged === true || securityContext?.allowPrivilegeEscalation === true
            ? "critical"
            : "warning";

        checks.push({
          title: `${containerName}: runAsUser`,
          severity: rootSeverity,
          description: "The container is explicitly configured to run as UID 0.",
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
        description: "The container does not explicitly define a user ID.",
        recommendation: "Set securityContext.runAsUser to a non-root UID when possible.",
      });
    }

    if (securityContext?.privileged === true) {
      checks.push({
        title: `${containerName}: privileged container`,
        severity: "critical",
        description: "The container is configured as privileged.",
        recommendation: "Remove privileged mode unless it is explicitly required.",
      });
    } else {
      checks.push({
        title: `${containerName}: privileged mode`,
        severity: "pass",
        description: "The container is not explicitly configured as privileged.",
      });
    }

    if (securityContext?.allowPrivilegeEscalation === true) {
      checks.push({
        title: `${containerName}: allowPrivilegeEscalation`,
        severity: "critical",
        description: "The container explicitly sets allowPrivilegeEscalation: true.",
        recommendation:
          "Set securityContext.allowPrivilegeEscalation: false unless the workload explicitly requires privilege escalation.",
      });
    } else if (securityContext?.allowPrivilegeEscalation === false) {
      checks.push({
        title: `${containerName}: allowPrivilegeEscalation`,
        severity: "pass",
        description: "The container explicitly disables privilege escalation.",
      });
    } else {
      checks.push({
        title: `${containerName}: allowPrivilegeEscalation`,
        severity: "warning",
        description: "The container does not explicitly define allowPrivilegeEscalation.",
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
        description: "A readiness probe is configured.",
      });
    } else {
      checks.push({
        title: `${containerName}: readiness probe`,
        severity: "warning",
        description: "No readiness probe is configured.",
        recommendation:
          "Add a readiness probe so Kubernetes can determine when the application is ready to receive traffic.",
      });
    }

    if (container?.livenessProbe) {
      checks.push({
        title: `${containerName}: liveness probe`,
        severity: "pass",
        description: "A liveness probe is configured.",
      });
    } else {
      checks.push({
        title: `${containerName}: liveness probe`,
        severity: "warning",
        description: "No liveness probe is configured.",
        recommendation: "Add a liveness probe so Kubernetes can detect unhealthy containers.",
      });
    }
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
      const name = document?.metadata?.name || "<unnamed>";
      const namespace = document?.metadata?.namespace || "<none>";

      // Supported kinds for V2.1
      const supportedKinds = [
        "Pod",
        "Deployment",
        "StatefulSet",
        "DaemonSet",
        "Job",
        "CronJob",
      ];

      if (kind === "Deployment") {
        const baseChecks: Check[] = [
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
        ];

        const deploymentChecks = analyzeDeployment(document);

        resources.push({
          apiVersion,
          kind,
          name,
          namespace,
          checks: [...baseChecks, ...deploymentChecks],
        });
      } else if (supportedKinds.includes(kind)) {
        const checks = analyzeWorkload(document);

        resources.push({
          apiVersion,
          kind,
          name,
          namespace,
          checks: [
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
            ...checks,
          ],
        });
      } else {
        // Unsupported resource kinds: detect and note coming soon
        resources.push({
          apiVersion,
          kind,
          name,
          namespace,
          checks: [
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
          ],
        });
      }
    });

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
    <main className="min-h-screen bg-zinc-950 text-white">
      <header className="border-b border-zinc-800">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
          <a
            href="/"
            className="flex items-center gap-3"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white font-bold text-zinc-950">
              O
            </div>

            <span className="text-xl font-semibold">
              OpsForge
            </span>
          </a>

          <a
            href="/"
            className="text-sm text-zinc-400 hover:text-white"
          >
            ← All tools
          </a>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-6 py-16">
        <div className="mb-10">
          <p className="text-sm font-medium uppercase tracking-widest text-zinc-500">
            Kubernetes · SRE
          </p>

          <h1 className="mt-3 text-4xl font-bold tracking-tight sm:text-5xl">
            Kubernetes Manifest Analyzer
          </h1>

          <p className="mt-4 max-w-3xl text-lg leading-8 text-zinc-400">
            Review Kubernetes Deployments for common reliability,
            security, and production-readiness issues.
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
              placeholder="Paste Kubernetes YAML here..."
              className="min-h-[560px] w-full resize-y rounded-xl border border-zinc-700 bg-zinc-950 p-5 font-mono text-sm leading-6 text-zinc-200 outline-none focus:border-zinc-400"
            />

            <div className="mt-4 flex gap-3">
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
                    <div className="grid grid-cols-3 gap-3">
                      <div className="rounded-xl border border-emerald-900/60 bg-emerald-950/20 p-5">
                        <p className="text-xs uppercase tracking-widest text-emerald-500">
                          Passed
                        </p>

                        <p className="mt-2 text-3xl font-bold text-emerald-400">
                          {passCount}
                        </p>
                      </div>

                      <div className="rounded-xl border border-amber-900/60 bg-amber-950/20 p-5">
                        <p className="text-xs uppercase tracking-widest text-amber-500">
                          Warnings
                        </p>

                        <p className="mt-2 text-3xl font-bold text-amber-400">
                          {warningCount}
                        </p>
                      </div>

                      <div className="rounded-xl border border-red-900/60 bg-red-950/20 p-5">
                        <p className="text-xs uppercase tracking-widest text-red-500">
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
                                                <h3 className="text-lg font-semibold">
                                                  {resource.kind} / {resource.name}
                                                </h3>

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
                                                        <h4 className="font-semibold">{check.title}</h4>

                                                        <p className="mt-2 text-sm leading-6 text-zinc-400">
                                                          {check.description}
                                                        </p>
                                                      </div>

                                                      <span
                                                        className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-medium ${
                                                          check.severity === "pass"
                                                            ? "border-emerald-900 bg-emerald-950/40 text-emerald-400"
                                                            : check.severity === "warning"
                                                              ? "border-amber-900 bg-amber-950/40 text-amber-400"
                                                              : "border-red-900 bg-red-950/40 text-red-400"
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
          <h3 className="font-semibold text-amber-400">
            Important
          </h3>

          <p className="mt-2 text-sm leading-6 text-zinc-400">
            This analyzer provides practical static checks.
            It does not replace Kubernetes admission policies,
            security scanners, or testing in a real cluster.
          </p>
        </section>
      </section>

      <footer className="border-t border-zinc-800">
        <div className="mx-auto flex max-w-7xl justify-between px-6 py-8 text-sm text-zinc-500">
          <span>© 2026 OpsForge</span>
          <span>DevOps · Cloud · SRE</span>
        </div>
      </footer>
    </main>
  );
}