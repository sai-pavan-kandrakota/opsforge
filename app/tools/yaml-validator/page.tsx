"use client";

import { useState } from "react";
import * as yaml from "js-yaml";

const kubernetesExample = `apiVersion: apps/v1
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
          image: nginx:1.27
          ports:
            - containerPort: 80`;

const githubActionsExample = `name: CI

on:
  push:
    branches:
      - main

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Run tests
        run: npm test`;

export default function YamlValidator() {
  const [input, setInput] = useState(kubernetesExample);
  const [formatted, setFormatted] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  function validateYaml() {
    try {
      const parsed = yaml.load(input);

      const formattedYaml = yaml.dump(parsed, {
        indent: 2,
        lineWidth: -1,
        noRefs: true,
      });

      setFormatted(formattedYaml);
      setError("");
    } catch (err) {
      setFormatted("");

      if (err instanceof yaml.YAMLException) {
        setError(err.message);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Invalid YAML.");
      }
    }
  }

  async function copyFormatted() {
    if (!formatted) return;

    try {
      await navigator.clipboard.writeText(formatted);
      setCopied(true);

      setTimeout(() => {
        setCopied(false);
      }, 1500);
    } catch {
      setCopied(false);
    }
  }

  function clearAll() {
    setInput("");
    setFormatted("");
    setError("");
    setCopied(false);
  }

  function loadExample(example: string) {
    setInput(example);
    setFormatted("");
    setError("");
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      {/* Header */}
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
            className="text-sm text-zinc-400 transition hover:text-white"
          >
            ← All tools
          </a>
        </div>
      </header>

      {/* Main */}
      <section className="mx-auto max-w-6xl px-6 py-16">
        <div className="mb-10">
          <p className="text-sm font-medium uppercase tracking-widest text-zinc-500">
            DevOps Tool
          </p>

          <h1 className="mt-3 text-4xl font-bold tracking-tight sm:text-5xl">
            YAML Validator
          </h1>

          <p className="mt-4 max-w-2xl text-lg leading-8 text-zinc-400">
            Validate and format YAML configuration files
            directly in your browser.
          </p>
        </div>

        {/* Input */}
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <label
              htmlFor="yaml-input"
              className="text-sm font-medium text-zinc-300"
            >
              YAML Input
            </label>

            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => loadExample(kubernetesExample)}
                className="text-sm text-zinc-400 transition hover:text-white"
              >
                Kubernetes example
              </button>

              <button
                onClick={() => loadExample(githubActionsExample)}
                className="text-sm text-zinc-400 transition hover:text-white"
              >
                GitHub Actions example
              </button>
            </div>
          </div>

          <textarea
            id="yaml-input"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Paste YAML here..."
            spellCheck={false}
            className={`min-h-[380px] w-full resize-y rounded-xl border bg-zinc-950 p-5 font-mono text-sm leading-6 text-zinc-200 outline-none transition placeholder:text-zinc-600 ${
              error
                ? "border-red-900 focus:border-red-500"
                : "border-zinc-700 focus:border-zinc-400"
            }`}
          />

          <div className="mt-4 flex flex-wrap gap-3">
            <button
              onClick={validateYaml}
              className="rounded-lg bg-white px-5 py-3 font-medium text-zinc-950 transition hover:bg-zinc-200"
            >
              Validate YAML
            </button>

            <button
              onClick={clearAll}
              className="rounded-lg border border-zinc-700 px-5 py-3 font-medium text-zinc-300 transition hover:border-zinc-500 hover:text-white"
            >
              Clear
            </button>
          </div>

          {/* Status */}
          {error && (
            <div role="alert" className="mt-5 rounded-xl border border-red-900/60 bg-red-950/20 p-5">
              <div className="flex items-center gap-3">
                <div className="h-2.5 w-2.5 rounded-full bg-red-500" />

                <p className="font-medium text-red-400">
                  Invalid YAML
                </p>
              </div>

              <p className="mt-3 break-all font-mono text-sm leading-6 text-red-300/80">
                {error}
              </p>
            </div>
          )}

          {formatted && !error && (
            <div role="status" className="mt-5 rounded-xl border border-emerald-900/60 bg-emerald-950/20 p-5">
              <div className="flex items-center gap-3">
                <div className="h-2.5 w-2.5 rounded-full bg-emerald-500" />

                <p className="font-medium text-emerald-400">
                  Valid YAML
                </p>
              </div>

              <p className="mt-2 text-sm text-zinc-400">
                The YAML syntax is valid and has been successfully parsed.
              </p>
            </div>
          )}
        </div>

        {/* Formatted output */}
        {formatted && !error && (
          <section className="mt-8 overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/60">
            <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-4">
              <div>
                <h2 className="font-semibold">
                  Formatted YAML
                </h2>

                <p className="mt-1 text-xs text-zinc-500">
                  Normalized YAML output
                </p>
              </div>

              <button
                onClick={copyFormatted}
                className="rounded-md border border-zinc-700 px-3 py-2 text-sm text-zinc-300 transition hover:border-zinc-500 hover:text-white"
              >
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>

            <pre className="max-h-[600px] overflow-auto p-5 font-mono text-sm leading-6 text-zinc-300">
              {formatted}
            </pre>
          </section>
        )}

        {/* Why YAML validation matters */}
        <section className="mt-16 border-t border-zinc-800 pt-10">
          <h2 className="text-2xl font-semibold">
            Why validate YAML?
          </h2>

          <p className="mt-4 max-w-3xl leading-7 text-zinc-400">
            YAML is sensitive to indentation and structure.
            A small formatting mistake can cause a Kubernetes
            deployment, CI/CD pipeline, Helm configuration, or
            automation job to fail.
          </p>

          <div className="mt-8 grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
              <h3 className="font-semibold">
                Kubernetes
              </h3>

              <p className="mt-2 text-sm leading-6 text-zinc-400">
                Validate manifests before applying them to a
                cluster.
              </p>
            </div>

            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
              <h3 className="font-semibold">
                CI/CD
              </h3>

              <p className="mt-2 text-sm leading-6 text-zinc-400">
                Catch YAML syntax problems before they break
                your automation pipeline.
              </p>
            </div>
          </div>
        </section>
      </section>

      {/* Footer */}
      <footer className="border-t border-zinc-800">
        <div className="mx-auto flex max-w-7xl justify-between px-6 py-8 text-sm text-zinc-500">
          <span>© 2026 OpsForge</span>
          <span>DevOps · Cloud · SRE</span>
        </div>
      </footer>
    </main>
  );
}