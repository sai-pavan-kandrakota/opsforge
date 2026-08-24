"use client";

import { useMemo, useState } from "react";

type Severity = "PASS" | "WARNING" | "CRITICAL";
type Category = "Security" | "Reliability" | "Build Efficiency" | "Governance";

type Finding = {
  title: string;
  severity: Severity;
  category: Category;
  description: string;
  recommendation?: string;
};

const exampleDockerfile = `FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
USER node
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD ["node", "healthcheck.js"]
EXPOSE 3000
CMD ["node", "server.js"]`;

function makeFinding(
  title: string,
  severity: Severity,
  category: Category,
  description: string,
  recommendation?: string
): Finding {
  return { title, severity, category, description, recommendation };
}

function isLikelyRuntimeVariableReference(value: string): boolean {
  if (!value) return false;
  const normalized = value.trim();
  if (!normalized) return false;

  return /(?:\$\{?[A-Z_][A-Z0-9_]*(?:\.[A-Z_][A-Z0-9_]*)?\}?|\$\w+|\$\{[^}]+\}|var\.|local\.|data\.|file\(|secretmanager|secretsmanager|aws_ssm_parameter|ssm:|vault:|env\.|\${\w+})/i.test(
    normalized
  );
}

function isLikelySensitiveKey(key: string): boolean {
  return /(password|passwd|passphrase|token|api[_-]?key|access[_-]?key|secret[_-]?key|private[_-]?key|client[_-]?secret|secret|credentials?|aws_secret_access_key|aws_access_key_id)/i.test(
    key
  );
}

function isLikelyLiteralSecret(value: string): boolean {
  if (!value) return false;
  const trimmed = value.trim().replace(/^['"]|['"]$/g, "");

  if (!trimmed || trimmed === "${" || trimmed.startsWith("$") || trimmed.includes("${")) {
    return false;
  }

  if (
    /(?:secretmanager|secretsmanager|aws_ssm_parameter|ssm:|vault:|file\(|\$\{?\w+\}?)/i.test(
      trimmed
    )
  ) {
    return false;
  }

  if (/BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY/i.test(trimmed)) {
    return true;
  }

  if (/AKIA[0-9A-Z]{16}|ASIA[0-9A-Z]{16}/.test(trimmed)) {
    return true;
  }

  if (/\b(?:password|token|secret|api[_-]?key|access[_-]?key|private[_-]?key|client[_-]?secret)\s*[:=]/i.test(trimmed)) {
    return true;
  }

  return trimmed.length >= 8 && /[A-Za-z0-9_\-+/=]{8,}/.test(trimmed);
}

// Returns `dockerfileText` with every full-line comment (a line whose first
// non-whitespace character is `#`) replaced by an empty line, while leaving
// every other line — including real instructions, and any `#` that appears
// after content on a non-comment line, which Docker itself does not treat
// as a comment — completely untouched. Line count and newline-separated
// structure are preserved, so this single representation can be consumed
// either as a whole string (for substring/pattern checks) or re-split into
// lines (for line-by-line checks) without any consumer needing its own
// comment-handling logic.
function stripDockerfileComments(dockerfileText: string): string {
  return dockerfileText
    .split(/\r?\n/)
    .map((line) => (/^\s*#/.test(line) ? "" : line))
    .join("\n");
}

function detectMalformedDockerfile(dockerfile: string): boolean {
  const trimmed = dockerfile.trim();
  if (!trimmed) return true;

  const openBrackets = (trimmed.match(/\[/g) || []).length;
  const closeBrackets = (trimmed.match(/\]/g) || []).length;
  const openBraces = (trimmed.match(/\{/g) || []).length;
  const closeBraces = (trimmed.match(/\}/g) || []).length;
  const openParens = (trimmed.match(/\(/g) || []).length;
  const closeParens = (trimmed.match(/\)/g) || []).length;
  const doubleQuotes = (trimmed.match(/"/g) || []).length;
  const singleQuotes = (trimmed.match(/'/g) || []).length;

  if (
    openBrackets !== closeBrackets ||
    openBraces !== closeBraces ||
    openParens !== closeParens ||
    doubleQuotes % 2 !== 0 ||
    singleQuotes % 2 !== 0
  ) {
    return true;
  }

  const likelyIncompleteRun = /\bRUN\b.*(?:&&\s*|\\)\s*$/.test(trimmed);
  return likelyIncompleteRun;
}

export function analyzeDockerfile(dockerfile: string): Finding[] {
  const findings: Finding[] = [];
  const text = dockerfile || "";
  const normalized = text.trim();
  const lines = text.split(/\r?\n/);
  const commentSafeText = stripDockerfileComments(text);
  const commentSafeLines = commentSafeText.split(/\r?\n/);

  if (!normalized) {
    findings.push(
      makeFinding(
        "Empty Dockerfile",
        "WARNING",
        "Governance",
        "The supplied Dockerfile is empty. There is no content to review.",
        "Add the Dockerfile instructions needed to build the image and then rerun analysis."
      )
    );
    return findings;
  }

  if (detectMalformedDockerfile(commentSafeText)) {
    findings.push(
      makeFinding(
        "Dockerfile appears malformed",
        "WARNING",
        "Governance",
        "Unable to fully verify this Dockerfile from the supplied content because it appears incomplete or malformed.",
        "Review missing instruction terminators, unbalanced quotes, or incomplete shell commands before building the image."
      )
    );
  }

  const fromMatches = [...text.matchAll(/^\s*FROM\s+(?:--platform=\S+\s+)?([^\s]+)(?:\s+AS\s+\S+)?/gim)];
  const hasFrom = fromMatches.length > 0;
  const finalStageText = fromMatches.length > 0
    ? text.slice(fromMatches[fromMatches.length - 1].index ?? 0)
    : text;
  const hasUser = /^\s*USER\s+/im.test(finalStageText);
  const hasHealthcheck = /^\s*HEALTHCHECK\s+/im.test(text);
  const hasCopy = /^\s*COPY\s+/im.test(text);
  const hasAdd = /^\s*ADD\s+/im.test(text);
  const hasRun = /^\s*RUN\s+/im.test(text);
  const hasMultiStage = /^\s*FROM\s+.+\s+AS\s+/im.test(text);
  const hasWorkdir = /^\s*WORKDIR\s+/im.test(text);
  const hasEntrypoint = /^\s*(?:ENTRYPOINT|CMD)\s+/im.test(text);
  const runCount = lines.filter((line) => /^\s*RUN\s+/i.test(line)).length;

  const firstFromImage = fromMatches[0]?.[1]?.trim() || "";
  const hasPinnedVersion = /:(\d+|\d+\.\d+|\d+\.\d+\.\d+)|@sha256:/i.test(firstFromImage);
  const hasLatestTag = /:latest\b/i.test(firstFromImage) || (!/[:@]/.test(firstFromImage) && !/^\$/.test(firstFromImage));
  const isMinimalImage = /(?:distroless|slim|alpine|minimal)/i.test(firstFromImage);

  if (!hasFrom) {
    findings.push(
      makeFinding(
        "Missing FROM instruction",
        "CRITICAL",
        "Security",
        "No base image was found in the Dockerfile.",
        "Add a trusted base image before attempting to build or deploy this artifact."
      )
    );
  } else {
    if (hasLatestTag || !hasPinnedVersion) {
      findings.push(
        makeFinding(
          "Base image tag is mutable or unpinned",
          "WARNING",
          "Security",
          isMinimalImage
            ? "The Dockerfile uses a minimal base image, which is generally favorable, but it is not pinned to a specific tag or digest."
            : "The base image is not pinned to a specific tag or digest, which increases drift and makes rebuilds less deterministic.",
          "Use a version-pinned base image or digest, for example node:20.19.4 or a stable image digest."
        )
      );
    } else {
      findings.push(
        makeFinding(
          "Base image is version pinned",
          "PASS",
          "Security",
          "The Dockerfile uses an explicit base image tag or digest.",
          "Continue using pinned images to improve reproducibility and reduce unexpected upstream changes."
        )
      );
    }
  }

  const userInstructions = [...finalStageText.matchAll(/^\s*USER\s+([^\s]+).*$/gim)].map((match) => match[1].trim());
  const lastUser = userInstructions[userInstructions.length - 1] || "";

  if (!hasUser) {
    findings.push(
      makeFinding(
        "No USER instruction configured",
        "WARNING",
        "Security",
        "The Dockerfile does not explicitly set a non-root user.",
        "Add a dedicated non-root user and switch the runtime to that user with USER."
      )
    );
  } else if (/^(?:root|0|0:0|root:root)$/i.test(lastUser)) {
    findings.push(
      makeFinding(
        "Container runs as root",
        "CRITICAL",
        "Security",
        "The Dockerfile sets the runtime user to root, which increases the blast radius of a container compromise.",
        "Run the image as a non-root user, such as USER appuser or USER 1000:1000."
      )
    );
  } else {
    findings.push(
      makeFinding(
        "Non-root user configured",
        "PASS",
        "Security",
        "The Dockerfile uses a non-root USER declaration.",
        "Keep the runtime user non-root to reduce privilege escalation risk."
      )
    );
  }

  if (/--privileged|--cap-add\s*=\s*(?:ALL|SYS_ADMIN|NET_ADMIN|SYS_PTRACE|DAC_READ_SEARCH|SYS_MODULE)|--security-opt\s*=\s*seccomp:unconfined/i.test(commentSafeText)) {
    findings.push(
      makeFinding(
        "Privileged container configuration detected",
        "CRITICAL",
        "Security",
        "The Dockerfile or container command includes privileged or highly permissive runtime configuration.",
        "Avoid privileged mode and reduce Linux capabilities unless there is a specific operational need."
      )
    );
  }

  if (/\/var\/run\/docker\.sock|docker\.sock|\/var\/run\/podman\.sock/i.test(commentSafeText)) {
    findings.push(
      makeFinding(
        "Docker socket exposure",
        "CRITICAL",
        "Security",
        "The Dockerfile references a host Docker socket, which can expose the host runtime to a container with broad control.",
        "Remove the Docker socket mount unless the workload requires it and use a restricted orchestration interface instead."
      )
    );
  }

  if (/openssh-server|sshd|service\s+ssh|ssh\s+start|apt-get\s+install\s+.*ssh|apk\s+add\s+.*openssh/i.test(commentSafeText)) {
    findings.push(
      makeFinding(
        "SSH server is installed or started",
        "WARNING",
        "Security",
        "The Dockerfile appears to install or enable SSH, which increases attack surface and may not be necessary in a production container image.",
        "Prefer a minimal runtime image and use your platform's secure access model instead of exposing SSH inside the container."
      )
    );
  }

  if (/\bsudo\b/i.test(commentSafeText)) {
    findings.push(
      makeFinding(
        "Sudo usage detected",
        "WARNING",
        "Security",
        "The Dockerfile uses sudo, which can obscure least-privilege boundaries and encourages unnecessary root-like behavior.",
        "Prefer direct non-root execution or explicit least-privilege user and group configuration."
      )
    );
  }

  const secretLines: string[] = [];
  for (const line of commentSafeLines) {
    const envMatch = /^\s*(?:ARG|ENV)\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (envMatch) {
      const [, key, value] = envMatch;
      const cleaned = value.trim().replace(/^['"]|['"]$/g, "");
      if (isLikelySensitiveKey(key) && !isLikelyRuntimeVariableReference(cleaned) && isLikelyLiteralSecret(cleaned)) {
        secretLines.push(`${key}=${cleaned}`);
      }
      continue;
    }

    const runMatch = /(?:password|passwd|passphrase|token|api[_-]?key|access[_-]?key|secret[_-]?key|private[_-]?key|client[_-]?secret|aws_secret_access_key|aws_access_key_id|credentials?)[\s:=]+['"]?([^'"\s]+)['"]?/i.exec(line);
    if (runMatch && !isLikelyRuntimeVariableReference(runMatch[1])) {
      const candidate = runMatch[1].trim();
      if (candidate && candidate.length >= 6 && !/^(?:\$|\{)/.test(candidate)) {
        secretLines.push(candidate);
      }
    }

    if (/AKIA[0-9A-Z]{16}|ASIA[0-9A-Z]{16}/.test(line)) {
      secretLines.push("AWS access key literal");
    }

    if (/BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY/i.test(line)) {
      secretLines.push("private key literal");
    }
  }

  if (secretLines.length > 0) {
    findings.push(
      makeFinding(
        "Hardcoded secret detected",
        "CRITICAL",
        "Security",
        "The Dockerfile contains a literal secret or credential value that appears to be embedded in the image.",
        "Use runtime secret injection, external secret managers, or build arguments that are provided at deploy time rather than hardcoding credentials in the Dockerfile."
      )
    );
  } else {
    findings.push(
      makeFinding(
        "No obvious hardcoded secrets",
        "PASS",
        "Security",
        "No obvious literal credentials were detected in ENV, ARG, or RUN instructions.",
        "Keep secrets outside the Dockerfile and prefer secret-manager integrations or runtime injection."
      )
    );
  }

  const aptInstall = /apt-get\s+(?:install|update)/i.test(text);
  const aptUpgrade = /apt-get\s+(?:upgrade|dist-upgrade)/i.test(text);
  const apkInstall = /apk\s+add/i.test(text);
  const yumInstall = /yum\s+install/i.test(text);
  const aptCleanup = /rm\s+-rf\s+\/var\/lib\/apt\/lists|apt-get\s+clean|apt-get\s+autoremove/i.test(text);
  const apkCleanup = /rm\s+-rf\s+\/var\/cache\/apk|apk\s+cache\s+clean/i.test(text);
  const yumCleanup = /yum\s+clean\s+all|rm\s+-rf\s+\/var\/cache\/yum/i.test(text);

  if (aptInstall || apkInstall || yumInstall) {
    const cleanupSeen = aptCleanup || apkCleanup || yumCleanup;
    if (!cleanupSeen) {
      findings.push(
        makeFinding(
          "Package cache cleanup is missing",
          "WARNING",
          "Build Efficiency",
          "A package installation step was detected without cleanup of package caches or apt lists.",
          "Clean package manager caches in the same layer to keep the image smaller and reduce unnecessary build artifacts."
        )
      );
    } else {
      findings.push(
        makeFinding(
          "Package cache cleanup present",
          "PASS",
          "Build Efficiency",
          "Package manager caches or package lists are being cleaned up after installation.",
          "Continue to keep package caches out of the final image to improve efficiency."
        )
      );
    }
  }

  if (aptUpgrade) {
    findings.push(
      makeFinding(
        "Apt upgrade or dist-upgrade detected",
        "WARNING",
        "Security",
        "The Dockerfile appears to upgrade packages during build rather than installing a stable, reproducible set of versions.",
        "Prefer deterministic package installation and pin packages to known good versions where practical."
      )
    );
  }

  if (hasMultiStage) {
    findings.push(
      makeFinding(
        "Multi-stage build detected",
        "PASS",
        "Build Efficiency",
        "The Dockerfile uses multiple build stages to separate compilation from the runtime artifact.",
        "Keep this approach to reduce final image size and remove build-only dependencies."
      )
    );
  } else if (hasRun) {
    findings.push(
      makeFinding(
        "Multi-stage build opportunity",
        "WARNING",
        "Build Efficiency",
        "The Dockerfile contains build operations but does not appear to split the build environment from the runtime image.",
        "Consider using a multi-stage build so compilers, package managers, and source files are not included in the final image."
      )
    );
  }

  if (hasAdd) {
    findings.push(
      makeFinding(
        "ADD instruction detected",
        "WARNING",
        "Build Efficiency",
        "ADD is present in the Dockerfile and can introduce archive extraction or remote-fetch behavior that may be unnecessary.",
        "Prefer COPY for local-file transfers and reserve ADD only when extracting archives or fetching remote content is actually needed."
      )
    );
  } else if (hasCopy) {
    findings.push(
      makeFinding(
        "COPY is used for file transfer",
        "PASS",
        "Build Efficiency",
        "The Dockerfile uses COPY for file transfer, which is the safer and more explicit default.",
        "Continue using COPY for local application files to keep the Dockerfile easier to reason about."
      )
    );
  }

  if (!hasWorkdir && (hasRun || hasCopy)) {
    findings.push(
      makeFinding(
        "WORKDIR is missing",
        "WARNING",
        "Reliability",
        "The Dockerfile contains build or copy instructions but does not declare an explicit WORKDIR.",
        "Set a stable WORKDIR to ensure runtime commands execute in the expected filesystem location."
      )
    );
  } else if (hasWorkdir) {
    findings.push(
      makeFinding(
        "WORKDIR configured",
        "PASS",
        "Reliability",
        "The Dockerfile declares a WORKDIR and keeps the runtime path predictable.",
        "Keep the application working directory explicit to reduce path-related surprises."
      )
    );
  }

  if (!hasHealthcheck) {
    findings.push(
      makeFinding(
        "Healthcheck missing",
        "WARNING",
        "Reliability",
        "No HEALTHCHECK instruction was found in the Dockerfile.",
        "Add a lightweight healthcheck where appropriate so orchestrators can detect unhealthy containers."
      )
    );
  } else {
    findings.push(
      makeFinding(
        "Healthcheck configured",
        "PASS",
        "Reliability",
        "A HEALTHCHECK instruction is present and can help detect unhealthy container runtime states.",
        "Keep the healthcheck lightweight, deterministic, and aligned to the application's dependency checks."
      )
    );
  }

  if (hasEntrypoint) {
    findings.push(
      makeFinding(
        "ENTRYPOINT or CMD configured",
        "PASS",
        "Reliability",
        "The Dockerfile defines an entry command for the container image.",
        "Keep the entrypoint and default command explicit so the runtime behavior is predictable."
      )
    );
  }

  if (runCount > 8) {
    findings.push(
      makeFinding(
        "Many RUN instructions",
        "WARNING",
        "Build Efficiency",
        `The Dockerfile contains ${runCount} RUN steps, which can create unnecessary layers and make builds harder to reason about.`,
        "Consolidate related commands into fewer RUN instructions to reduce image size and improve layer efficiency."
      )
    );
  }

  const copyFromMatches = [...text.matchAll(/^\s*COPY\s+--from=\S+\s+/gim)];
  if (copyFromMatches.length > 0) {
    findings.push(
      makeFinding(
        "COPY --from is used",
        "PASS",
        "Build Efficiency",
        "The Dockerfile uses COPY --from to reuse artifacts from another stage.",
        "Keep using staged artifacts to avoid leaking build dependencies into the final image."
      )
    );
  }

  const suspiciousPattern = /(?:FROM\s+.*:latest|FROM\s+[^\s:]+\s*$|RUN\s+.*(?:curl|wget).*https?:\/\/|npm\s+install|pip\s+install|apk\s+add)/i.test(text);
  if (!hasMultiStage && suspiciousPattern && hasRun) {
    findings.push(
      makeFinding(
        "Build layer efficiency could be improved",
        "WARNING",
        "Build Efficiency",
        "The Dockerfile includes build operations and may not be structured for efficient layer reuse or minimal runtime images.",
        "Group related package installs together, copy dependency manifests before source code, and consider using a multi-stage build."
      )
    );
  }

  return findings;
}

export default function DockerfileAnalyzerPage() {
  const [dockerfile, setDockerfile] = useState(exampleDockerfile);
  const [analyzed, setAnalyzed] = useState(true);

  const { findings, analysisError } = useMemo(() => {
    if (!analyzed) {
      return { findings: [] as Finding[], analysisError: null as string | null };
    }

    try {
      return { findings: analyzeDockerfile(dockerfile), analysisError: null as string | null };
    } catch (error) {
      return {
        findings: [] as Finding[],
        analysisError:
          error instanceof Error
            ? error.message
            : "Unexpected error while analyzing this Dockerfile.",
      };
    }
  }, [dockerfile, analyzed]);

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
    <div className="min-h-screen bg-zinc-950 text-white">
      <div className="mx-auto max-w-7xl px-6 py-12">
        <div className="mb-10">
          <div className="text-sm uppercase tracking-[0.2em] text-zinc-500">
            DevOps Security Tool
          </div>
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
              aria-label="Dockerfile input"
              className="min-h-[520px] w-full resize-y rounded-xl border border-zinc-800 bg-zinc-950 p-4 font-mono text-sm leading-6 text-zinc-200 outline-none transition focus:border-zinc-500"
              placeholder="Paste your Dockerfile here..."
            />

            <div className="mt-4 flex flex-wrap gap-3">
              <button
                onClick={runAnalysis}
                className="rounded-lg bg-white px-5 py-2.5 text-sm font-medium text-zinc-950 transition hover:bg-zinc-200"
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
            {analysisError ? (
              <div className="rounded-xl border border-red-900/60 bg-red-950/20 p-5">
                <p className="font-medium text-red-400">Analysis failed</p>
                <p className="mt-2 break-all font-mono text-sm text-red-300/80">{analysisError}</p>
                <p className="mt-3 text-sm text-zinc-400">
                  This does not mean the Dockerfile is safe — the analyzer could not complete. Adjust the input and try again.
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
                  Paste a Dockerfile and click{" "}
                  <span className="text-white">Analyze Dockerfile</span>.
                </div>
              ) : analysisError ? null : (
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
              text="Detects embedded secrets, root execution, risky privileged patterns, and socket exposure."
            />

            <InfoCard
              title="Build Efficiency"
              text="Checks multi-stage builds, cache cleanup, COPY/ADD usage, and layer efficiency."
            />

            <InfoCard
              title="Reliability"
              text="Looks for healthchecks, explicit workdirs, and safer container runtime behavior."
            />
          </div>

          <div className="mt-6 rounded-xl border border-amber-900/60 bg-amber-950/20 p-5">
            <div className="font-medium text-amber-400">Important</div>

            <p className="mt-2 text-sm leading-6 text-zinc-400">
              OpsForge provides practical static analysis for the Dockerfile as supplied. It does not replace dedicated container security scanners, image vulnerability scanners, or production testing.
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

  const categoryClass =
    finding.category === "Security"
      ? "text-zinc-300"
      : finding.category === "Reliability"
      ? "text-sky-300"
      : finding.category === "Build Efficiency"
      ? "text-violet-300"
      : "text-emerald-300";

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="font-medium">{finding.title}</div>
          <div className={`mt-2 text-[10px] uppercase tracking-[0.18em] ${categoryClass}`}>
            {finding.category}
          </div>
        </div>

        <span
          className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-medium ${badgeClass}`}
        >
          {finding.severity}
        </span>
      </div>

      <p className="mt-3 text-sm leading-6 text-zinc-400 break-words">{finding.description}</p>

      {finding.recommendation && (
        <div className="mt-4 border-t border-zinc-800 pt-4">
          <div className="text-xs uppercase tracking-widest text-zinc-600">
            Recommendation
          </div>

          <p className="mt-2 text-sm leading-6 text-zinc-300">{finding.recommendation}</p>
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