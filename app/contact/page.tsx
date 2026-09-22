import type { Metadata } from "next";

import SiteFooter from "@/app/components/SiteFooter";
import SiteHeader from "@/app/components/SiteHeader";

export const metadata: Metadata = {
  title: "Contact OpsForge",
  description:
    "Reach OpsForge with bug reports, tool suggestions, feedback, and security disclosures.",
};

export default function ContactPage() {
  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      <SiteHeader />

      <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="mb-8 rounded-2xl border border-zinc-800 bg-zinc-900/80 p-6">
          <h1 className="text-3xl font-bold text-white">Contact OpsForge</h1>
          <p className="mt-3 text-zinc-400">We welcome bug reports, tool suggestions, feedback, and security notices.</p>
        </div>

        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-6">
          <h2 className="text-xl font-semibold text-white">How to reach us</h2>
          <p className="mt-3 text-zinc-400">We welcome bug reports, tool suggestions, feedback, and security notices.</p>

          <div className="mt-4 space-y-3">
            <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-4 text-sm">
              <div className="font-medium text-white">Contact email</div>
              <a href="mailto:saipavaneducation@gmail.com" className="mt-1 inline-block text-zinc-400 transition hover:text-white">
                saipavaneducation@gmail.com
              </a>
            </div>

            <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-4 text-sm">
              <div className="font-medium text-white">Report a bug</div>
              <div className="mt-1 text-zinc-400">Open an issue in the project repository or email us with the details.</div>
            </div>

            <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-4 text-sm">
              <div className="font-medium text-white">Security disclosure</div>
              <div className="mt-1 text-zinc-400">If you discover a security issue, please send the details to the contact email above.</div>
            </div>
          </div>
        </section>
      </div>

      <SiteFooter />
    </main>
  );
}
