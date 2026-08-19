import Link from "next/link";
import type { Metadata } from "next";

import ClientComponent from "./ClientComponent";

export const metadata: Metadata = {
  title: "Terraform Security Analyzer | AWS & IaC Best Practices",
  description:
    "Review Terraform for IAM wildcards, public exposure, S3 and RDS risks, secrets, provider pinning, and infrastructure security issues in the browser."
};

export default function Page() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-6xl px-4 py-8 md:px-6">
        <header className="mb-6">
          <p className="text-xs uppercase tracking-[0.25em] text-teal-300/80">Infrastructure as code</p>
          <h1 className="mt-3 text-3xl font-bold text-white md:text-4xl">Terraform Security Analyzer</h1>
        </header>

        <div className="mb-8 rounded-xl border border-slate-800 bg-slate-900/70 p-5 text-sm text-slate-300 md:text-base">
          <p>
            Use this Terraform security analyzer to review infrastructure as code before it reaches AWS or shared
            environments. It helps platform teams, SREs, and DevOps engineers spot public exposure, wildcard IAM
            permissions, unencrypted resources, hardcoded secrets, missing tags, weak provider versions, and backend
            gaps. The checks run entirely in the browser, so you can review a snippet quickly without a backend or
            external service.
          </p>
        </div>

        <section className="mb-8 rounded-xl border border-slate-800 bg-slate-900/60 p-5">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">What it checks</h2>
          <ul className="grid gap-2 text-sm text-slate-300 md:grid-cols-2">
            <li>• IAM wildcard permissions and broad access patterns</li>
            <li>• security group exposure and public ingress rules</li>
            <li>• S3 public access and encryption posture</li>
            <li>• RDS exposure, encryption, and backup issues</li>
            <li>• hardcoded secrets and sensitive values</li>
            <li>• provider and module version pinning</li>
            <li>• resource tags and state/backend configuration</li>
            <li>• lifecycle, deletion protection, and high-availability signals</li>
          </ul>
        </section>

        <ClientComponent />

        <section className="mt-8 rounded-xl border border-slate-800 bg-slate-900/60 p-5">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">Related tools</h2>
          <div className="flex flex-wrap gap-3">
            <Link href="/tools/aws-iam-analyzer" className="rounded-full border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 transition hover:border-teal-500 hover:text-white">
              AWS IAM Analyzer
            </Link>
            <Link href="/tools/kubernetes-analyzer" className="rounded-full border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 transition hover:border-teal-500 hover:text-white">
              Kubernetes Analyzer
            </Link>
            <Link href="/tools/dockerfile-analyzer" className="rounded-full border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 transition hover:border-teal-500 hover:text-white">
              Dockerfile Analyzer
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
