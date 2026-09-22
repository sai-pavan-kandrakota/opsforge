import type { Metadata } from "next";

import SiteFooter from "@/app/components/SiteFooter";
import SiteHeader from "@/app/components/SiteHeader";

export const metadata: Metadata = {
  title: "About OpsForge - DevOps & SRE Tools",
  description:
    "OpsForge is a browser-based toolkit for DevOps, Cloud, Kubernetes, Terraform, CI/CD, containers, AWS, and SRE engineers, providing practical utilities that reduce friction without unnecessary complexity.",
};

export default function AboutPage() {
  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      <SiteHeader />

      <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="mb-8 rounded-2xl border border-zinc-800 bg-zinc-900/80 p-6">
          <h1 className="text-3xl font-bold text-white">About OpsForge</h1>
          <p className="mt-3 text-zinc-400">
            OpsForge is a browser-based toolkit for DevOps, Cloud, Kubernetes, Terraform, CI/CD,
            containers, AWS, and SRE engineers. Our goal is to provide practical engineering utilities
            that reduce friction and help teams move faster without unnecessary complexity.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-6">
            <h2 className="text-xl font-semibold text-white">What OpsForge is</h2>
            <p className="mt-3 text-zinc-400">
              OpsForge provides small, focused, browser-based tools engineers can use instantly. Many
              OpsForge tools perform processing locally in your browser and run static analyzers on
              pasted configuration (YAML, Terraform, Dockerfiles, GitHub Actions, IAM policies, etc.)
              so that you can get quick, actionable feedback without installing extra tooling.
            </p>
            <p className="mt-3 text-zinc-400">
              While the tools are useful for day-to-day engineering, OpsForge is not a replacement for
              enterprise security scanners, cloud provider tools, or formal audits. Use these tools
              as a practical first pass and always validate results with your organization's
              security processes.
            </p>
          </section>

          <section className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-6">
            <h2 className="text-xl font-semibold text-white">Who it is for</h2>
            <p className="mt-3 text-zinc-400">
              OpsForge is aimed at DevOps engineers, SREs, platform engineers, cloud engineers, and
              anyone who manages infrastructure, CI/CD pipelines, or Kubernetes deployments.
            </p>
            <ul className="mt-3 list-disc pl-5 text-zinc-400">
              <li>Platform and infrastructure engineers</li>
              <li>SREs and on-call responders</li>
              <li>Dev teams validating CI/CD and deployment artifacts</li>
            </ul>
          </section>

          <section className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-6">
            <h2 className="text-xl font-semibold text-white">What we are building</h2>
            <p className="mt-3 text-zinc-400">
              A collection of focused, browser-first tools that make common platform tasks easier:
              analyzers for Kubernetes manifests, Helm templates, Terraform, Dockerfiles, GitHub
              Actions workflows, and AWS IAM policies, plus utilities for CIDR calculation, YAML and
              JSON validation, and more.
            </p>
          </section>

          <section className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-6">
            <h2 className="text-xl font-semibold text-white">Current tool categories</h2>
            <ul className="mt-3 list-disc pl-5 text-zinc-400">
              <li>Networking (CIDR Calculator)</li>
              <li>Developer utilities (JSON Formatter, Cron Generator)</li>
              <li>Kubernetes (YAML Validator, Kubernetes Generator, Manifest Analyzer, Helm Analyzer)</li>
              <li>Containers (Dockerfile Analyzer)</li>
              <li>CI/CD (GitHub Actions Analyzer)</li>
              <li>Infrastructure as Code (Terraform Analyzer)</li>
              <li>AWS &amp; Security (AWS IAM Policy Analyzer)</li>
              <li>SRE troubleshooting (SRE Incident Analyzer)</li>
            </ul>
          </section>
        </div>

        <div className="mt-8 text-sm text-zinc-500">
          <p>
            OpsForge evolves with contributions and feedback. If you have a tool request or find a
            bug, please share it via the Contact page.
          </p>
        </div>
      </div>

      <SiteFooter />
    </main>
  );
}
