import type { Metadata } from "next";

import SiteFooter from "@/app/components/SiteFooter";
import SiteHeader from "@/app/components/SiteHeader";

const today = new Date().toISOString().split("T")[0];

export const metadata: Metadata = {
  title: "Privacy Policy - OpsForge",
  description:
    "How OpsForge handles data: most tools process pasted configuration locally in your browser, no user accounts are required, and this policy explains what may be collected.",
};

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      <SiteHeader />

      <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="mb-8 rounded-2xl border border-zinc-800 bg-zinc-900/80 p-6">
          <h1 className="text-3xl font-bold text-white">Privacy Policy</h1>
          <p className="mt-3 text-zinc-400">Last updated: {today}</p>
        </div>

        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-6">
          <h2 className="text-xl font-semibold text-white">Overview</h2>
          <p className="mt-3 text-zinc-400">
            OpsForge provides browser-based DevOps and SRE tools that help engineers validate
            configuration, troubleshoot incidents, and review CI/CD and infrastructure-as-code
            artifacts. This privacy policy describes how OpsForge handles data today.
          </p>
        </section>

        <section className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900/80 p-6">
          <h2 className="text-lg font-semibold text-white">Local processing</h2>
          <p className="mt-3 text-zinc-400">
            Many OpsForge tools perform static analysis locally in your browser. When you paste
            configuration into a tool, the analysis runs on your device in the browser's JavaScript
            environment and does not intentionally transmit your pasted content to a remote backend.
          </p>
          <p className="mt-3 text-zinc-400">
            Please be aware that the site may still make standard network requests to load resources
            (fonts, scripts) and that hosting infrastructure may collect standard request logs. Do not
            assume absolute privacy of any content you paste; do not paste sensitive secrets in any
            public or shared environment.
          </p>
        </section>

        <section className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900/80 p-6">
          <h2 className="text-lg font-semibold text-white">No accounts</h2>
          <p className="mt-3 text-zinc-400">OpsForge currently does not require user accounts or sign-in.</p>
        </section>

        <section className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900/80 p-6">
          <h2 className="text-lg font-semibold text-white">What we may collect</h2>
          <ul className="mt-3 list-disc pl-5 text-zinc-400">
            <li>Standard web server logs (IP addresses, user-agent, request timestamps).</li>
            <li>Performance metrics or error reports if enabled in the future.</li>
            <li>Aggregated, non-identifying usage statistics if analytics are enabled in the future.</li>
          </ul>
          <p className="mt-3 text-zinc-400">
            OpsForge does not currently store pasted configuration or analysis input by design, but
            product features and hosting configurations may change over time. Any change to this
            behavior will be reflected in an updated privacy policy.
          </p>
        </section>

        <section className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900/80 p-6">
          <h2 className="text-lg font-semibold text-white">Third-party services and hosting</h2>
          <p className="mt-3 text-zinc-400">
            OpsForge may use standard hosting infrastructure and third-party services to serve the
            site. Those services may collect logs and performance data as part of normal hosting
            operations. This policy does not grant access to your infrastructure or private data.
          </p>
        </section>

        <section className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900/80 p-6">
          <h2 className="text-lg font-semibold text-white">Policy updates</h2>
          <p className="mt-3 text-zinc-400">
            This policy may be updated as the product evolves. The "Last updated" date at the top
            will indicate the most recent change.
          </p>
        </section>

        <div className="mt-8 text-sm text-zinc-500">
          <p>If you have privacy concerns, please contact the project via the Contact page.</p>
        </div>
      </div>

      <SiteFooter />
    </main>
  );
}
