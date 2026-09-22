import Link from "next/link";
import type { Metadata } from "next";

import SiteFooter from "@/app/components/SiteFooter";
import SiteHeader from "@/app/components/SiteHeader";

import ClientComponent from "./ClientComponent";

export const metadata: Metadata = {
  title: "AWS IAM Policy Analyzer | Least-Privilege & Wildcard Review",
  description:
    "Analyze IAM policies for wildcard actions, overly broad resources, and least-privilege risks before permissions are applied in AWS."
};

export default function Page() {
  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      <SiteHeader />

      <div className="mx-auto max-w-6xl px-4 py-8 md:px-6">
        <header className="mb-6">
          <p className="text-xs uppercase tracking-[0.25em] text-teal-300/80">IAM security</p>
          <h1 className="mt-3 text-3xl font-bold text-white md:text-4xl">AWS IAM Policy Analyzer</h1>
        </header>

        <div className="mb-8 rounded-xl border border-zinc-800 bg-zinc-900/60 p-5 text-sm text-zinc-400 md:text-base">
          <p>
            Use this AWS IAM policy analyzer to review permission documents for the common patterns that lead to
            overly broad access. It is useful for engineers and security reviewers who need to spot wildcard actions,
            wildcard resources, and least-privilege gaps before policies are applied. The browser-side review is
            intentionally conservative and focuses on explicit policy text rather than live AWS state.
          </p>
        </div>

        <section className="mb-8 rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.2em] text-zinc-500">What it checks</h2>
          <ul className="grid gap-2 text-sm text-zinc-400 md:grid-cols-2">
            <li>• IAM policy JSON structure and versioning</li>
            <li>• Action = &quot;*&quot; and wildcard action patterns</li>
            <li>• Resource = &quot;*&quot; and wildcard resource use</li>
            <li>• broad permissions that merit review</li>
            <li>• least-privilege concerns in statements</li>
            <li>• explicit policy risk signals from supplied JSON</li>
          </ul>
        </section>

        <ClientComponent />

        <section className="mt-8 rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.2em] text-zinc-500">Related tools</h2>
          <div className="flex flex-wrap gap-3">
            <Link href="/tools/terraform-analyzer" className="rounded-full border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-300 transition hover:border-teal-500 hover:text-white">
              Terraform Analyzer
            </Link>
            <Link href="/tools/kubernetes-analyzer" className="rounded-full border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-300 transition hover:border-teal-500 hover:text-white">
              Kubernetes Analyzer
            </Link>
            <Link href="/tools/github-actions-analyzer" className="rounded-full border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-300 transition hover:border-teal-500 hover:text-white">
              GitHub Actions Analyzer
            </Link>
          </div>
        </section>
      </div>

      <SiteFooter />
    </main>
  );
}
