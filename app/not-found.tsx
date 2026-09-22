import type { Metadata } from "next";
import Link from "next/link";

import SiteFooter from "@/app/components/SiteFooter";
import SiteHeader from "@/app/components/SiteHeader";

export const metadata: Metadata = {
  title: "Page Not Found - OpsForge",
  description: "The page you're looking for doesn't exist. Browse the full OpsForge toolkit instead.",
};

export default function NotFound() {
  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      <SiteHeader />

      <div className="mx-auto flex max-w-3xl flex-col items-center px-4 py-24 text-center sm:px-6">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-zinc-500">404</p>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">Page not found</h1>
        <p className="mt-4 max-w-md text-sm leading-6 text-zinc-400">
          The page you are looking for does not exist or may have moved. Head back to the homepage
          to find the tool you need.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/"
            className="rounded-lg bg-white px-5 py-2.5 text-sm font-medium text-zinc-950 transition hover:bg-zinc-200"
          >
            Back to all tools
          </Link>
        </div>
      </div>

      <SiteFooter />
    </main>
  );
}
