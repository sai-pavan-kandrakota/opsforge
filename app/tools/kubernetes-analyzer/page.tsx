import Link from "next/link";
import type { Metadata } from "next";

import SiteFooter from "@/app/components/SiteFooter";
import SiteHeader from "@/app/components/SiteHeader";

import ClientComponent from "./ClientComponent";

export const metadata: Metadata = {
  title: "Kubernetes YAML Analyzer | Security Scanner & Manifest Checker",
  description:
    "Review Kubernetes manifests for security settings, pod hardening, service exposure, and production-readiness issues directly in the browser."
};

export default function Page() {
  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      <SiteHeader />

      <div className="mx-auto max-w-6xl px-4 py-8 md:px-6">
        <header className="mb-6">
          <p className="text-xs uppercase tracking-[0.25em] text-teal-300/80">Kubernetes YAML</p>
          <h1 className="mt-3 text-3xl font-bold text-white md:text-4xl">Kubernetes Manifest Analyzer</h1>
        </header>

        <div className="mb-8 rounded-xl border border-zinc-800 bg-zinc-900/60 p-5 text-sm text-zinc-400 md:text-base">
          <p>
            Use this Kubernetes YAML analyzer to review manifests before deployment. It helps DevOps engineers,
            platform teams, and SREs spot risky security settings, weak pod defaults, missing probes, resource
            issues, and production-readiness gaps in a single static pass. Paste one or more YAML documents and
            inspect the findings in the browser without sending data anywhere. The analysis is designed for faster
            pre-deploy checks and team review, not live cluster assessment.
          </p>
        </div>

        <section className="mb-8 rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.2em] text-zinc-500">What it checks</h2>
          <ul className="grid gap-2 text-sm text-zinc-400 md:grid-cols-2">
            <li>• securityContext and pod hardening patterns</li>
            <li>• privileged containers and host-level access risks</li>
            <li>• hostPath, hostNetwork, and namespace concerns</li>
            <li>• readiness and liveness probe coverage</li>
            <li>• resource requests and limits</li>
            <li>• Services, Ingress, and NetworkPolicy exposure</li>
            <li>• PodDisruptionBudget and workload availability checks</li>
            <li>• RBAC and deprecated API patterns</li>
          </ul>
        </section>

        <ClientComponent />

        <section className="mt-8 rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.2em] text-zinc-500">Related tools</h2>
          <div className="flex flex-wrap gap-3">
            <Link href="/tools/helm-analyzer" className="rounded-full border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-300 transition hover:border-teal-500 hover:text-white">
              Helm Analyzer
            </Link>
            <Link href="/tools/dockerfile-analyzer" className="rounded-full border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-300 transition hover:border-teal-500 hover:text-white">
              Dockerfile Analyzer
            </Link>
            <Link href="/tools/terraform-analyzer" className="rounded-full border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-300 transition hover:border-teal-500 hover:text-white">
              Terraform Analyzer
            </Link>
          </div>
        </section>
      </div>

      <SiteFooter />
    </main>
  );
}
