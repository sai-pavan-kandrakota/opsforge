"use client";

import Link from "next/link";

const today = new Date().toISOString().split("T")[0];

export default function PrivacyPage() {
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

      <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="mb-8 rounded-2xl border border-slate-800 bg-slate-900/80 p-6">
          <h1 className="text-3xl font-bold text-white">Privacy Policy</h1>
          <p className="mt-3 text-slate-300">Last updated: {today}</p>
        </div>

        <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-6">
          <h2 className="text-xl font-semibold text-white">Overview</h2>
          <p className="mt-3 text-slate-300">
            OpsForge provides browser-based DevOps and SRE tools that help engineers validate
            configuration, troubleshoot incidents, and review CI/CD and infrastructure-as-code
            artifacts. This privacy policy describes how OpsForge handles data today.
          </p>
        </section>

        <section className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/80 p-6">
          <h3 className="text-lg font-semibold text-white">Local processing</h3>
          <p className="mt-3 text-slate-300">
            Many OpsForge tools perform static analysis locally in your browser. When you paste
            configuration into a tool, the analysis runs on your device in the browser's JavaScript
            environment and does not intentionally transmit your pasted content to a remote backend.
          </p>
          <p className="mt-3 text-slate-300">
            Please be aware that the site may still make standard network requests to load resources
            (fonts, scripts) and that hosting infrastructure may collect standard request logs. Do not
            assume absolute privacy of any content you paste; do not paste sensitive secrets in any
            public or shared environment.
          </p>
        </section>

        <section className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/80 p-6">
          <h3 className="text-lg font-semibold text-white">No accounts</h3>
          <p className="mt-3 text-slate-300">OpsForge currently does not require user accounts or sign-in.</p>
        </section>

        <section className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/80 p-6">
          <h3 className="text-lg font-semibold text-white">What we may collect</h3>
          <ul className="mt-3 list-disc pl-5 text-slate-300">
            <li>Standard web server logs (IP addresses, user-agent, request timestamps).</li>
            <li>Performance metrics or error reports if enabled in the future.</li>
            <li>Aggregated, non-identifying usage statistics if analytics are enabled in the future.</li>
          </ul>
          <p className="mt-3 text-slate-300">
            OpsForge does not currently store pasted configuration or analysis input by design, but
            product features and hosting configurations may change over time. Any change to this
            behavior will be reflected in an updated privacy policy.
          </p>
        </section>

        <section className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/80 p-6">
          <h3 className="text-lg font-semibold text-white">Third-party services and hosting</h3>
          <p className="mt-3 text-slate-300">
            OpsForge may use standard hosting infrastructure and third-party services to serve the
            site. Those services may collect logs and performance data as part of normal hosting
            operations. This policy does not grant access to your infrastructure or private data.
          </p>
        </section>

        <section className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/80 p-6">
          <h3 className="text-lg font-semibold text-white">Policy updates</h3>
          <p className="mt-3 text-slate-300">
            This policy may be updated as the product evolves. The "Last updated" date at the top
            will indicate the most recent change.
          </p>
        </section>

        <div className="mt-8 text-sm text-slate-400">
          <p>If you have privacy concerns, please contact the project via the Contact page.</p>
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
