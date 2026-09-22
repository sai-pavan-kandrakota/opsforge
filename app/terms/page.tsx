import type { Metadata } from "next";

import SiteFooter from "@/app/components/SiteFooter";
import SiteHeader from "@/app/components/SiteHeader";

export const metadata: Metadata = {
  title: "Terms of Service - OpsForge",
  description:
    "Terms of use for OpsForge, including the no-professional-advice disclaimer, user responsibility for validating output, and limitation of liability.",
};

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      <SiteHeader />

      <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="mb-8 rounded-2xl border border-zinc-800 bg-zinc-900/80 p-6">
          <h1 className="text-3xl font-bold text-white">Terms of Use</h1>
          <p className="mt-3 text-zinc-400">Please read these terms carefully before using OpsForge.</p>
        </div>

        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-6">
          <h2 className="text-xl font-semibold text-white">Scope</h2>
          <p className="mt-3 text-zinc-400">
            The tools and content on OpsForge are provided for informational and engineering assistance.
            Use of the site constitutes acceptance of these terms.
          </p>
        </section>

        <section className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900/80 p-6">
          <h2 className="text-lg font-semibold text-white">No professional advice</h2>
          <p className="mt-3 text-zinc-400">
            The site does not provide legal, security, or professional operational advice. Generated
            or analyzed configuration must be reviewed and validated by qualified personnel before
            use in production.
          </p>
        </section>

        <section className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900/80 p-6">
          <h2 className="text-lg font-semibold text-white">User responsibility</h2>
          <p className="mt-3 text-zinc-400">
            Users are responsible for validating outputs and ensuring configuration meets organizational
            policies. Do not rely solely on OpsForge for security or compliance decisions.
          </p>
        </section>

        <section className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900/80 p-6">
          <h2 className="text-lg font-semibold text-white">No warranties</h2>
          <p className="mt-3 text-zinc-400">All tools are provided &quot;as is&quot; without warranties of any kind.</p>
        </section>

        <section className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900/80 p-6">
          <h2 className="text-lg font-semibold text-white">Limitation of liability</h2>
          <p className="mt-3 text-zinc-400">
            To the maximum extent permitted by applicable law, OpsForge is not liable for any direct,
            indirect, incidental, special, or consequential damages arising from use of the site or
            reliance on its output.
          </p>
        </section>

        <section className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900/80 p-6">
          <h2 className="text-lg font-semibold text-white">Acceptable use</h2>
          <p className="mt-3 text-zinc-400">Do not use the site to submit illegal content or to harm others&apos; systems or data.</p>
        </section>

        <div className="mt-8 text-sm text-zinc-500">
          <p>These terms may be updated as the project evolves.</p>
        </div>
      </div>

      <SiteFooter />
    </main>
  );
}
