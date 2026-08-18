"use client";

import Link from "next/link";

export default function AboutPage() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800/80 bg-slate-950/90">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white font-mono text-sm font-bold text-slate-950 shadow-lg shadow-white/10">O</div>
            <div>
              <Link href="/" className="text-lg font-semibold tracking-tight text-white">OpsForge</Link>
            </div>
          </div>

          <nav className="hidden items-center gap-6 text-sm text-slate-400 md:flex">
            <Link href="/" className="transition hover:text-white">Home</Link>
            <Link href="/about" className="transition hover:text-white">About</Link>
            <Link href="/privacy" className="transition hover:text-white">Privacy</Link>
            <Link href="/terms" className="transition hover:text-white">Terms</Link>
            <Link href="/contact" className="transition hover:text-white">Contact</Link>
          </nav>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="mb-8 rounded-2xl border border-slate-800 bg-slate-900/80 p-6">
          <h1 className="text-3xl font-bold text-white">About OpsForge</h1>
          <p className="mt-3 text-slate-300">
            OpsForge is a browser-based toolkit for DevOps, Cloud, Kubernetes, Terraform, CI/CD,
            containers, AWS, and SRE engineers. Our goal is to provide practical engineering utilities
            that reduce friction and help teams move faster without unnecessary complexity.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-6">
            <h2 className="text-xl font-semibold text-white">What OpsForge is</h2>
            <p className="mt-3 text-slate-300">
              OpsForge provides small, focused, browser-based tools engineers can use instantly. Many
              OpsForge tools perform processing locally in your browser and run static analyzers on
              pasted configuration (YAML, Terraform, Dockerfiles, GitHub Actions, IAM policies, etc.)
              so that you can get quick, actionable feedback without installing extra tooling.
            </p>
            <p className="mt-3 text-slate-300">
              While the tools are useful for day-to-day engineering, OpsForge is not a replacement for
              enterprise security scanners, cloud provider tools, or formal audits. Use these tools
              as a practical first pass and always validate results with your organization's
              security processes.
            </p>
          </section>

          <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-6">
            <h2 className="text-xl font-semibold text-white">Who it is for</h2>
            <p className="mt-3 text-slate-300">
              OpsForge is aimed at DevOps engineers, SREs, platform engineers, cloud engineers, and
              anyone who manages infrastructure, CI/CD pipelines, or Kubernetes deployments.
            </p>
            <ul className="mt-3 list-disc pl-5 text-slate-300">
              <li>Platform and infrastructure engineers</li>
              <li>SREs and on-call responders</li>
              <li>Dev teams validating CI/CD and deployment artifacts</li>
            </ul>
          </section>

          <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-6">
            <h2 className="text-xl font-semibold text-white">What we are building</h2>
            <p className="mt-3 text-slate-300">
              A collection of focused, browser-first tools that make common platform tasks easier:
              analyzers for Kubernetes manifests, Helm templates, Terraform, Dockerfiles, GitHub
              Actions workflows, and AWS IAM policies, plus utilities for CIDR calculation, YAML and
              JSON validation, and more.
            </p>
          </section>

          <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-6">
            <h2 className="text-xl font-semibold text-white">Current tool categories</h2>
            <ul className="mt-3 list-disc pl-5 text-slate-300">
              <li>Networking (CIDR Calculator)</li>
              <li>Developer utilities (JSON Formatter, Cron Generator)</li>
              <li>Kubernetes (YAML Validator, Kubernetes Generator, Manifest Analyzer, Helm Analyzer)</li>
              <li>Containers (Dockerfile Analyzer)</li>
              <li>CI/CD (GitHub Actions Analyzer)</li>
              <li>Infrastructure as Code (Terraform Analyzer)</li>
              <li>AWS &amp; Security (AWS IAM Policy Analyzer)</li>
              <li>SRE troubleshooting (AI SRE Assistant)</li>
            </ul>
          </section>
        </div>

        <div className="mt-8 text-sm text-slate-400">
          <p>
            OpsForge evolves with contributions and feedback. If you have a tool request or find a
            bug, please share it via the Contact page.
          </p>
        </div>
      </div>

      <footer className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
          <div className="text-sm text-slate-500">© 2026 OpsForge. Built for engineers.</div>
          <nav className="flex gap-4 text-sm">
            <Link href="/about" className="text-slate-400 hover:text-white">About</Link>
            <Link href="/privacy" className="text-slate-400 hover:text-white">Privacy</Link>
            <Link href="/terms" className="text-slate-400 hover:text-white">Terms</Link>
            <Link href="/contact" className="text-slate-400 hover:text-white">Contact</Link>
          </nav>
        </div>
      </footer>
    </main>
  );
}
