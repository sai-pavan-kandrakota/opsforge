"use client";

import { useMemo, useState } from "react";


type Severity = "PASS" | "WARNING" | "CRITICAL";

type Finding = {
  title: string;
  severity: Severity;
  description: string;
  recommendation?: string;
};

const exampleDockerfile = `FROM node:20

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

ENV API_KEY=example-secret

EXPOSE 3000

CMD ["npm", "start"]`;

function analyzeDockerfile(dockerfile: string): Finding[] {
  const findings: Finding[] = [];
  const lines = dockerfile.split("\n");

  const hasFrom = /^\s*FROM\s+/im.test(dockerfile);
  const hasUser = /^\s*USER\s+/im.test(dockerfile);
  const hasHealthcheck = /^\s*HEALTHCHECK\s+/im.test(dockerfile);
  const hasCopy = /^\s*COPY\s+/im.test(dockerfile);
  const hasAdd = /^\s*ADD\s+/im.test(dockerfile);
  const hasRun = /^\s*RUN\s+/im.test(dockerfile);
  const hasMultiStage = /^\s*FROM\s+.+\s+AS\s+/im.test(dockerfile);
  const hasAptInstall = /apt-get\s+install/i.test(dockerfile);
  const hasAptCleanup =
    /rm\s+-rf\s+\/var\/lib\/apt\/lists/i.test(dockerfile);
  const hasSecret =
    /^\s*(ENV|ARG)\s+[A-Z0-9_]*(KEY|TOKEN|SECRET|PASSWORD)[A-Z0-9_]*/im.test(
      dockerfile
    );

  const fromMatches = [
    ...dockerfile.matchAll(/^\s*FROM\s+([^\s]+)(?:\s+AS\s+\S+)?/gim),
  ];

  const usesLatest = fromMatches.some((match) => {
    const image = match[1];
    return image.endsWith(":latest") || !image.includes(":");
  });

  if (!hasFrom) {
    findings.push({
      title: "Missing FROM instruction",
      severity: "CRITICAL",
      description: "No base image was found in the Dockerfile.",
      recommendation: "Add a FROM instruction using a trusted, pinned base image.",
    });
  } else {
    findings.push({
      title: "Base image configured",
      severity: "PASS",
      description: "A Docker base image is defined.",
    });
  }

  if (usesLatest) {
    findings.push({
      title: "Mutable base image tag",
      severity: "WARNING",
      description:
        "The Dockerfile uses an unpinned image or the mutable latest tag.",
      recommendation:
        "Use a specific version or digest, for example node:20.19.4 or an image digest.",
    });
  } else if (hasFrom) {
    findings.push({
      title: "Base image version pinned",
      severity: "PASS",
      description: "The base image uses an explicit version tag.",
    });
  }

  if (hasSecret) {
    findings.push({
      title: "Potential secret in ENV/ARG",
      severity: "CRITICAL",
      description:
        "An ENV or ARG variable appears to contain a key, token, secret, or password.",
      recommendation:
        "Never bake secrets into Docker images. Inject secrets at runtime using your platform's secret-management mechanism.",
    });
  } else {
    findings.push({
      title: "No obvious embedded secrets",
      severity: "PASS",
      description:
        "No obvious secret-like ENV or ARG variables were detected.",
    });
  }

  if (!hasUser) {
    findings.push({
      title: "Container may run as root",
      severity: "WARNING",
      description: "No USER instruction was found.",
      recommendation:
        "Create and use a non-root application user whenever possible.",
    });
  } else {
    findings.push({
      title: "Non-root user configured",
      severity: "PASS",
      description: "A USER instruction was detected.",
    });
  }

  if (!hasHealthcheck) {
    findings.push({
      title: "Healthcheck missing",
      severity: "WARNING",
      description: "No HEALTHCHECK instruction was found.",
      recommendation:
        "Add a healthcheck where appropriate so container orchestration can detect unhealthy containers.",
    });
  } else {
    findings.push({
      title: "Healthcheck configured",
      severity: "PASS",
      description: "A Docker HEALTHCHECK instruction was detected.",
    });
  }

  if (hasAdd) {
    findings.push({
      title: "ADD instruction detected",
      severity: "WARNING",
      description:
        "ADD was found in the Dockerfile. It has additional behavior beyond copying files.",
      recommendation:
        "Prefer COPY unless you specifically need ADD functionality such as extracting a local archive.",
    });
  } else if (hasCopy) {
    findings.push({
      title: "COPY used for files",
      severity: "PASS",
      description: "COPY is used for transferring application files.",
    });
  }

  if (hasAptInstall && !hasAptCleanup) {
    findings.push({
      title: "APT cache cleanup missing",
      severity: "WARNING",
      description:
        "apt-get install was detected without cleanup of the package lists.",
      recommendation:
        "Clean /var/lib/apt/lists in the same RUN layer to reduce image size.",
    });
  }

  if (hasMultiStage) {
    findings.push({
      title: "Multi-stage build detected",
      severity: "PASS",
      description: "Multiple build stages are being used.",
    });
  } else if (hasRun) {
    findings.push({
      title: "Multi-stage build opportunity",
      severity: "WARNING",
      description:
        "The Dockerfile contains build commands but does not appear to use multiple stages.",
      recommendation:
        "Consider a multi-stage build to keep compilers and build dependencies out of the final image.",
    });
  }

  const runCount = lines.filter((line) =>
    /^\s*RUN\s+/i.test(line)
  ).length;

  if (runCount > 8) {
    findings.push({
      title: "Many RUN layers",
      severity: "WARNING",
      description: `The Dockerfile contains ${runCount} RUN instructions.`,
      recommendation:
        "Review whether related commands can safely be combined to reduce unnecessary image layers.",
    });
  } else {
    findings.push({
      title: "RUN layer count reasonable",
      severity: "PASS",
      description: `${runCount} RUN instruction${
        runCount === 1 ? "" : "s"
      } detected.`,
    });
  }

  return findings;
}

export default function DockerfileAnalyzerPage() {
  const [dockerfile, setDockerfile] = useState(exampleDockerfile);
  const [analyzed, setAnalyzed] = useState(true);

  const findings = useMemo(
    () => (analyzed ? analyzeDockerfile(dockerfile) : []),
    [dockerfile, analyzed]
  );

  const passed = findings.filter((f) => f.severity === "PASS").length;
  const warnings = findings.filter((f) => f.severity === "WARNING").length;
  const critical = findings.filter((f) => f.severity === "CRITICAL").length;

  function runAnalysis() {
    setAnalyzed(true);
  }

  function clear() {
    setDockerfile("");
    setAnalyzed(false);
  }

  function loadExample() {
    setDockerfile(exampleDockerfile);
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
            Dockerfile Analyzer
          </h1>

          <p className="mt-4 max-w-3xl text-zinc-400">
            Review Dockerfiles for security, reliability, image-size, and
            production-readiness issues.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-medium">Dockerfile</h2>

              <button
                onClick={loadExample}
                className="text-sm text-zinc-400 transition hover:text-white"
              >
                Load example
              </button>
            </div>

            <textarea
              value={dockerfile}
              onChange={(e) => {
                setDockerfile(e.target.value);
                setAnalyzed(false);
              }}
              spellCheck={false}
              className="min-h-[520px] w-full resize-y rounded-xl border border-zinc-800 bg-black p-4 font-mono text-sm leading-6 text-zinc-200 outline-none transition focus:border-zinc-500"
              placeholder="Paste your Dockerfile here..."
            />

            <div className="mt-4 flex gap-3">
              <button
                onClick={runAnalysis}
                className="rounded-lg bg-white px-5 py-2.5 text-sm font-medium text-black transition hover:bg-zinc-200"
              >
                Analyze Dockerfile
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
              <SummaryCard
                label="PASSED"
                value={passed}
                type="pass"
              />

              <SummaryCard
                label="WARNINGS"
                value={warnings}
                type="warning"
              />

              <SummaryCard
                label="CRITICAL"
                value={critical}
                type="critical"
              />
            </div>

            <div className="mt-4 space-y-3">
              {!analyzed ? (
                <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-6 text-sm text-zinc-400">
                  Paste a Dockerfile and click{" "}
                  <span className="text-white">Analyze Dockerfile</span>.
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
              text="Detects embedded secrets, root execution, and risky container configuration."
            />

            <InfoCard
              title="Image Hygiene"
              text="Checks base-image pinning, ADD usage, layers, and build practices."
            />

            <InfoCard
              title="Production Readiness"
              text="Looks for healthchecks and build patterns that improve reliability."
            />
          </div>

          <div className="mt-6 rounded-xl border border-amber-900/60 bg-amber-950/20 p-5">
            <div className="font-medium text-amber-400">Important</div>

            <p className="mt-2 text-sm leading-6 text-zinc-400">
              OpsForge provides practical static analysis. It does not replace
              dedicated container security scanners, image vulnerability
              scanners, or production testing.
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

      <div className={`mt-2 text-3xl font-semibold ${textClass}`}>
        {value}
      </div>
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

      <p className="mt-3 text-sm leading-6 text-zinc-400">
        {finding.description}
      </p>

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