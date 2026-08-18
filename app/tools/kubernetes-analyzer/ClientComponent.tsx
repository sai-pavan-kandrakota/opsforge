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

    const securityContext =
      container?.securityContext ||
      podSpec?.securityContext;

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

function analyzeYaml(input: string): {
  checks: Check[];
  error?: string;
} {
  try {
    const document: any = yaml.load(input);

    if (!document || typeof document !== "object") {
      return {
        checks: [],
        error: "The YAML document is empty or invalid.",
      };
    }

    if (document.kind !== "Deployment") {
      return {
        checks: [
          {
            title: "YAML syntax",
            severity: "pass",
            description:
              "The YAML syntax is valid.",
          },
          {
            title: "Kubernetes resource type",
            severity: "warning",
            description:
              `This analyzer currently focuses on Deployments. Detected "${document.kind || "unknown"}".`,
            recommendation:
              "Use a Kubernetes Deployment manifest for the full analyzer checks.",
          },
        ],
      };
    }

    const checks = [
      {
        title: "YAML syntax",
        severity: "pass" as Severity,
        description:
          "The YAML document was parsed successfully.",
      },
      {
        title: "Deployment resource",
        severity: "pass" as Severity,
        description:
          "A Kubernetes Deployment was detected.",
      },
      ...analyzeDeployment(document),
    ];

    return { checks };
  } catch (error) {
    return {
      checks: [],
      error:
        error instanceof Error
          ? error.message
          : "Unable to parse YAML.",
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
  const [checks, setChecks] = useState<Check[]>([]);
  const [error, setError] = useState("");
  const [analyzed, setAnalyzed] = useState(false);

  function runAnalysis() {
    const result = analyzeYaml(input);

    setChecks(result.checks);
    setError(result.error || "");
    setAnalyzed(true);
  }

  function loadExample() {
    setInput(exampleYaml);
    setChecks([]);
    setError("");
    setAnalyzed(false);
  }

  function clearAll() {
    setInput("");
    setChecks([]);
    setError("");
    setAnalyzed(false);
  }

  const passCount = checks.filter(
    (check) => check.severity === "pass"
  ).length;

  const warningCount = checks.filter(
    (check) => check.severity === "warning"
  ).length;

  const criticalCount = checks.filter(
    (check) => check.severity === "critical"
  ).length;

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

                    {/* Checks */}
                    <div className="mt-5 space-y-3">
                      {checks.map((check, index) => (
                        <div
                          key={`${check.title}-${index}`}
                          className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5"
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <h3 className="font-semibold">
                                {check.title}
                              </h3>

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
                              <p className="text-xs uppercase tracking-widest text-zinc-600">
                                Recommendation
                              </p>

                              <p className="mt-2 text-sm leading-6 text-zinc-300">
                                {check.recommendation}
                              </p>
                            </div>
                          )}
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