"use client";

import { useState } from "react";


type IncidentSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
type IncidentCategory =
  | "Kubernetes"
  | "AWS"
  | "CI/CD"
  | "Networking"
  | "Application"
  | "Database"
  | "Infrastructure"
  | "Observability"
  | "Unknown";

type IncidentAnalysis = {
  classification: IncidentCategory[];
  severity: IncidentSeverity;
  confidence: "Low" | "Medium" | "High";
  causes: string[];
  investigation: string[];
  commands: string[];
  mitigation: string[];
  followUp: string[];
};

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
Prometheus alerts: container_cpu_usage_seconds_total spikes and OOMKill events appear.
`,
  githubActions: `GitHub Actions deployment job failed during the production rollout.
The workflow reports: Error: failed to login to GHCR, and the deployment script exited with code 1.
The same job had a successful build step and then failed during image push.
` ,
};

const defaultAnalysis = (): IncidentAnalysis => ({
  classification: ["Unknown"],
  severity: "LOW",
  confidence: "Low",
  causes: ["Hypothesis: the incident is still ambiguous and needs more evidence before a root cause is assigned."],
  investigation: [
    "1. Confirm the blast radius and whether the issue is isolated to one workload, region, namespace, or deployment stage.",
    "2. Check recent changes, deployment history, and release notes for the period immediately before the incident started.",
    "3. Review logs, metrics, and traces for a consistent error pattern or dependency failure.",
    "4. Capture the current failing state before making adjustments or triggering rollback or mitigation steps.",
  ],
  commands: [
    "kubectl get pods -A",
    "kubectl get events -A --sort-by=.lastTimestamp | tail -n 50",
    "kubectl logs -l app=your-service --tail=200",
  ],
  mitigation: [
    "Mitigation: isolate the impact by routing traffic away from the failing instance or workload if that can be done safely.",
    "Mitigation: verify the health of dependencies and recent deployment changes before attempting any rollback.",
  ],
  followUp: [
    "Follow-up: identify which deployment, config change, or dependency update aligns with the incident timeline.",
    "Follow-up: preserve evidence and correlate logs, metrics, and traces before making changes that are difficult to reverse.",
  ],
});

function analyzeIncident(input: string): IncidentAnalysis {
  const text = (input || "").trim();

  if (!text) {
    return {
      classification: ["Unknown"],
      severity: "LOW",
      confidence: "Low",
      causes: [
        "Hypothesis: there is no incident input yet, so a root cause cannot be determined without logs, alerts, or deployment context.",
      ],
      investigation: [
        "1. Paste a Kubernetes error, AWS error, app log, monitoring alert, or deployment failure to perform a structured triage.",
        "2. Check recent changes and deployment activity for the affected service or environment.",
        "3. Review relevant metrics and recent logs to confirm scope and symptoms.",
      ],
      commands: [
        "kubectl get pods -A",
        "kubectl get events -A --sort-by=.lastTimestamp | tail -n 50",
        "kubectl logs -l app=your-service --tail=200",
      ],
      mitigation: [
        "Mitigation: preserve evidence and narrow the blast radius before making changes.",
        "Mitigation: confirm whether the failing component is isolated to one deployment, environment, or dependency.",
      ],
      followUp: [
        "Follow-up: correlate the incident with recent deployments, config changes, alerts, and dependency health.",
        "Follow-up: separate mitigation from root-cause investigation to avoid masking the actual issue.",
      ],
    };
  }

  const lower = text.toLowerCase();
  const categories: IncidentCategory[] = [];

  const hasKubernetes =
    /crashloopbackoff|imagepullbackoff|errimagepull|oomkilled|pending pod|readiness probe|liveness probe|kubectl|helm|ingress|deployment failed|scheduler|node pressure|failed mount|evicted|back-off restarting failed container/.test(
      lower
    );
  const hasAws =
    /accessdenied|aws|iam|s3|eks|alb|load balancer|throttl|timeout|unavailable|sts:|role|not authorized|service unavailable/.test(
      lower
    );
  const hasCicd =
    /github actions|workflow|docker build|image push|deployment failure|rollout failure|failed step|pipeline|ci\/cd|cicd|unable to authenticate|login failed/.test(
      lower
    );
  const hasNetworking =
    /502|503|504|connection refused|timeout|dns|tls|certificate|handshake|gateway|ingress|upstream/.test(
      lower
    );
  const hasApplication =
    /http 500|exception|traceback|connection pool|dependency failure|config error|panic|segmentation fault|timeout|error:/.test(
      lower
    );
  const hasDatabase =
    /postgres|mysql|redis|database|db connection|connection pool|sqlstate|replication|deadlock|lock timeout/.test(
      lower
    );
  const hasInfrastructure =
    /cpu|memory|oom|node pressure|disk full|network saturation|autoscaling|quota|resource limit|kubelet/.test(
      lower
    );
  const hasObservability =
    /alert|prometheus|grafana|trace|latency|logs|metrics|slo|error rate|spike/.test(
      lower
    );

  if (hasKubernetes) categories.push("Kubernetes");
  if (hasAws) categories.push("AWS");
  if (hasCicd) categories.push("CI/CD");
  if (hasNetworking) categories.push("Networking");
  if (hasApplication) categories.push("Application");
  if (hasDatabase) categories.push("Database");
  if (hasInfrastructure) categories.push("Infrastructure");
  if (hasObservability) categories.push("Observability");
  if (categories.length === 0) categories.push("Unknown");

  const severityScore = {
    CRITICAL: /outage|critical|unavailable|full outage|production down|namespace stuck|all pods|panic|data loss|secrets issue|access denied/.test(lower)
      ? 3
      : 0,
    HIGH: /502|503|504|oomkilled|crashloopbackoff|failed rollout|deployment failure|imagepullbackoff|errimagepull|service unavailable|latency spike|cpu spike|memory spike|authorization failed/.test(lower)
      ? 2
      : 0,
    MEDIUM: /warning|timeout|partial outage|high cpu|memory high|slow|error rate|ingress|readiness|liveness|gating/.test(lower)
      ? 1
      : 0,
  };

  const totalScore = severityScore.CRITICAL + severityScore.HIGH + severityScore.MEDIUM;
  let severity: IncidentSeverity = "LOW";
  if (totalScore >= 3) severity = "CRITICAL";
  else if (totalScore >= 2) severity = "HIGH";
  else if (totalScore >= 1) severity = "MEDIUM";

  const confidence: "Low" | "Medium" | "High" =
    hasKubernetes || hasAws || hasCicd || hasNetworking || hasApplication || hasDatabase
      ? (/[0-9]{1,4}.*(minutes|minutes ago|seconds|error|failed|back-off|oom)/.test(lower) ? "High" : "Medium")
      : "Low";

  const causes: string[] = [];

  if (hasKubernetes) {
    causes.push("Hypothesis: a Kubernetes workload, image, or readiness/liveness issue is preventing pods from becoming healthy.");
  }
  if (hasAws) {
    causes.push("Hypothesis: an AWS service dependency, IAM permission, network policy, or upstream dependency is blocking the workload.");
  }
  if (hasCicd) {
    causes.push("Hypothesis: the deployment pipeline or artifact/image publication step failed and introduced a bad revision or invalid configuration.");
  }
  if (hasNetworking) {
    causes.push("Hypothesis: a gateway, ingress, TLS, DNS, or upstream service problem is returning intermittent 5xx responses or connection failures.");
  }
  if (hasApplication) {
    causes.push("Hypothesis: the application is failing in code, dependency initialization, configuration, or request handling.");
  }
  if (causes.length === 0) {
    causes.push("Hypothesis: the incident is likely caused by a dependency, recent change, or configuration issue that needs more evidence to confirm.");
  }

  if (causes.length < 5) {
    causes.push("Hypothesis: a recent code, config, or infrastructure change may be correlated with the incident and should be reviewed near the incident start time.");
  }

  const investigation: string[] = [
    "1. Check recent changes first: review the deployment, config, image, artifact, and infrastructure changes that happened just before the incident began.",
    "2. Check blast radius: determine whether this is isolated to one workload, one namespace, one region, or multiple services and teams.",
    "3. Check metrics, logs, and traces: look for error rate spikes, request saturation, dependency latency, and the first failing request or pod state.",
    "4. Check dependency health: verify upstream services, DNS, ingress, storage, database, and cloud dependencies before making any broad changes.",
    "5. Check deployment history and rollback options: if the incident started after a recent deployment, prefer rollback or revision control if the correlation is strong and evidence supports it.",
    "6. Preserve evidence before remediation: capture pod events, logs, and alerts before attempting changes that could make the incident harder to debug.",
  ];

  const commands: string[] = [];

  if (hasKubernetes) {
    commands.push("kubectl get pods -A");
    commands.push("kubectl get events -A --sort-by=.lastTimestamp | tail -n 50");
    commands.push("kubectl describe pod <pod-name> -n <namespace>");
    commands.push("kubectl logs <pod-name> -n <namespace> --previous --tail=200");
    commands.push("kubectl rollout status deployment/<deployment-name> -n <namespace>");
    commands.push("kubectl get ingress -A");
    commands.push("kubectl get svc -A");
  }

  if (hasAws) {
    commands.push("aws sts get-caller-identity");
    commands.push("aws eks describe-cluster --name <cluster-name> --region <region>");
    commands.push("aws elbv2 describe-load-balancers --names <alb-name> --region <region>");
  }

  if (hasCicd) {
    commands.push("gh run view <run-id> --log-failed");
    commands.push("gh workflow view <workflow-name>");
    commands.push("docker build -t image-name .");
  }

  if (!commands.length) {
    commands.push("kubectl get pods -A");
    commands.push("kubectl get events -A --sort-by=.lastTimestamp | tail -n 50");
    commands.push("kubectl logs -l app=your-service --tail=200");
  }

  const mitigation: string[] = [];

  if (hasKubernetes) {
    mitigation.push("Mitigation: confirm whether the failing pods are crashing due to image issues, config problems, resource limits, or failing readiness checks before forcing a restart.");
    mitigation.push("Mitigation: review recent deployment revisions and, if strongly correlated, prefer a controlled rollback rather than ad hoc redeployments.");
  }
  if (hasNetworking) {
    mitigation.push("Mitigation: validate ingress, upstream health, TLS configuration, and DNS resolution before changing traffic routing or restarting services.");
  }
  if (hasCicd) {
    mitigation.push("Mitigation: isolate the failing workflow stages, verify the artifact or container image publication path, and prefer a reversible rollback to the last known good release.");
  }
  if (!mitigation.length) {
    mitigation.push("Mitigation: reduce scope by validating the specific failing dependency or deployment step and preserve logs and metrics before making changes.");
  }

  const followUp: string[] = [
    "Follow-up: document the symptom timeline, change history, and scope of impact before implementing any permanent fix.",
    "Follow-up: separate mitigation from root-cause investigation so the service can be stabilized without losing evidence.",
    "Follow-up: inspect alarms, dependency health, and recent deployment or config changes to confirm whether the incident was caused by a specific revision or external dependency.",
  ];

  return {
    classification: categories,
    severity,
    confidence,
    causes: causes.slice(0, 5),
    investigation,
    commands: commands.slice(0, 8),
    mitigation,
    followUp,
  };
}

export default function AiSreAssistantPage() {
  const [input, setInput] = useState(exampleInputs.crashLoop);
  const [analysis, setAnalysis] = useState<IncidentAnalysis>(() => {
    try {
      return analyzeIncident(exampleInputs.crashLoop);
    } catch (_error) {
      return defaultAnalysis();
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
    } catch (_error) {
      setError(
        "Analysis failed for this input. This does not mean the incident is resolved — the assistant could not process the pasted text. The previous result below is unchanged; try shortening or simplifying the input and analyze again.",
      );
    }
  };

  const handleClear = () => {
    setInput("");
    setError("");
    setAnalysis(defaultAnalysis());
  };

  const loadExample = (key: keyof typeof exampleInputs) => {
    setInput(exampleInputs[key]);

    try {
      const result = analyzeIncident(exampleInputs[key]);
      setError("");
      setAnalysis(result);
    } catch (_error) {
      setError("Could not generate the example analysis. Please try again.");
    }
  };

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="mb-8 rounded-2xl border border-slate-800 bg-slate-900/80 p-6 shadow-2xl shadow-slate-950/60 backdrop-blur-sm">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.25em] text-cyan-400">OpsForge</p>
          <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">AI SRE Assistant</h1>
          <p className="mt-3 max-w-3xl text-base text-slate-300">
            Troubleshoot production incidents with structured SRE diagnostics and actionable next steps.
          </p>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 shadow-xl shadow-slate-950/40">
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
                className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-medium text-slate-200 transition hover:border-cyan-500 hover:text-cyan-300"
              >
                {label}
              </button>
            ))}
          </div>

          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            spellCheck={false}
            className="h-[360px] w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 font-mono text-sm text-slate-100 outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/30"
            placeholder="Paste incident details, logs, alerts, application errors, deployment failures, or Kubernetes issues here..."
          />

          {error ? (
            <div className="mt-3 rounded-lg border border-rose-500/20 bg-rose-500/10 p-3 text-sm text-rose-200">
              {error}
            </div>
          ) : null}

          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleAnalyze}
              className="rounded-lg bg-cyan-500 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400"
            >
              Analyze Incident
            </button>
            <button
              type="button"
              onClick={handleClear}
              className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm font-medium text-slate-200 transition hover:border-slate-500 hover:text-white"
            >
              Clear
            </button>
          </div>
        </div>

        <section className="mt-8 rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-xl shadow-slate-950/40">
          <div className="mb-5 flex items-center justify-between gap-3">
            <h2 className="text-xl font-semibold text-white">Incident analysis</h2>
          </div>

          <div className="grid gap-4 lg:grid-cols-4">
            <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
              <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">Classification</div>
              <div className="mt-2 flex flex-wrap gap-2 text-sm text-cyan-200">
                {analysis.classification.map((item) => (
                  <span key={item} className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2 py-1">
                    {item}
                  </span>
                ))}
              </div>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
              <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">Severity</div>
              <div className="mt-3 text-xl font-bold text-white">{analysis.severity}</div>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
              <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">Confidence</div>
              <div className="mt-3 text-xl font-bold text-white">{analysis.confidence}</div>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
              <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">Scope</div>
              <div className="mt-3 text-sm text-slate-300">Based on the provided signals and keywords only.</div>
            </div>
          </div>

          <div className="mt-6 grid gap-4">
            <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
              <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">Likely causes</h3>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-slate-300">
                {analysis.causes.map((cause, index) => (
                  <li key={`${cause}-${index}`}>{cause}</li>
                ))}
              </ul>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
              <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">Investigation plan</h3>
              <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-6 text-slate-300">
                {analysis.investigation.map((step, index) => (
                  <li key={`${step}-${index}`}>{step}</li>
                ))}
              </ol>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
              <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">Useful commands</h3>
              <div className="mt-3 space-y-2">
                {analysis.commands.map((command, index) => (
                  <pre key={`${command}-${index}`} className="overflow-x-auto rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 font-mono text-xs text-cyan-200">
                    {command}
                  </pre>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
              <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">Immediate mitigation</h3>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-slate-300">
                {analysis.mitigation.map((item, index) => (
                  <li key={`${item}-${index}`}>{item}</li>
                ))}
              </ul>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
              <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">Follow-up / root-cause investigation</h3>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-slate-300">
                {analysis.followUp.map((item, index) => (
                  <li key={`${item}-${index}`}>{item}</li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <div className="mt-6 rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-4 text-sm text-cyan-100">
          OpsForge provides diagnostic suggestions, not definitive incident conclusions. Verify commands and recommendations against your environment before execution.
        </div>
      </div>
    </main>
  );
}
