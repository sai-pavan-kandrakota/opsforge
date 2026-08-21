import Link from "next/link";
import type { Metadata } from "next";

import SiteFooter from "@/app/components/SiteFooter";
import SiteHeader from "@/app/components/SiteHeader";

import ClientComponent from "./ClientComponent";

export const metadata: Metadata = {
  title: "Dockerfile Security Scanner | Container Best Practices",
  description:
    "Audit Dockerfiles for root-user risk, hardcoded secrets, package hygiene, multi-stage builds, and container security issues directly in the browser."
};

export default function Page() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <SiteHeader />

      <div className="mx-auto max-w-6xl px-4 py-8 md:px-6">
        <header className="mb-6">
          <p className="text-xs uppercase tracking-[0.25em] text-teal-300/80">Container security</p>
          <h1 className="mt-3 text-3xl font-bold text-white md:text-4xl">Dockerfile Security Scanner</h1>
        </header>

        <div className="mb-8 rounded-xl border border-slate-800 bg-slate-900/70 p-5 text-sm text-slate-300 md:text-base">
          <p>
            Use this Dockerfile security scanner to audit container build files before shipping images. It helps
            developers, platform engineers, and SREs review base image choices, root-user risk, package cleanup,
            secrets exposure, health checks, and basic build hygiene. The analysis runs in the browser and is
            designed for fast local review rather than deep runtime or registry inspection.
          </p>
        </div>

        <section className="mb-8 rounded-xl border border-slate-800 bg-slate-900/60 p-5">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">What it checks</h2>
          <ul className="grid gap-2 text-sm text-slate-300 md:grid-cols-2">
            <li>• base image tags and pinned-version patterns</li>
            <li>• USER root and non-root security posture</li>
            <li>• hardcoded secrets and sensitive literals</li>
            <li>• Docker socket and privilege-related risks</li>
            <li>• package installation, cleanup, and upgrade patterns</li>
            <li>• HEALTHCHECK coverage and runtime health readiness</li>
            <li>• multi-stage builds and COPY/ADD efficiency</li>
            <li>• basic image build and cache hygiene</li>
          </ul>
        </section>

        <ClientComponent />

        <section className="mt-8 rounded-xl border border-slate-800 bg-slate-900/60 p-5">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">Related tools</h2>
          <div className="flex flex-wrap gap-3">
            <Link href="/tools/kubernetes-analyzer" className="rounded-full border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 transition hover:border-teal-500 hover:text-white">
              Kubernetes Analyzer
            </Link>
            <Link href="/tools/helm-analyzer" className="rounded-full border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 transition hover:border-teal-500 hover:text-white">
              Helm Analyzer
            </Link>
            <Link href="/tools/github-actions-analyzer" className="rounded-full border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 transition hover:border-teal-500 hover:text-white">
              GitHub Actions Analyzer
            </Link>
          </div>
        </section>
      </div>

      <SiteFooter />
    </main>
  );
}
