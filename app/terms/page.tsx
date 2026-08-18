"use client";

import Link from "next/link";

export default function TermsPage() {
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
          <h1 className="text-3xl font-bold text-white">Terms of Use</h1>
          <p className="mt-3 text-slate-300">Please read these terms carefully before using OpsForge.</p>
        </div>

        <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-6">
          <h2 className="text-xl font-semibold text-white">Scope</h2>
          <p className="mt-3 text-slate-300">
            The tools and content on OpsForge are provided for informational and engineering assistance.
            Use of the site constitutes acceptance of these terms.
          </p>
        </section>

        <section className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/80 p-6">
          <h3 className="text-lg font-semibold text-white">No professional advice</h3>
          <p className="mt-3 text-slate-300">
            The site does not provide legal, security, or professional operational advice. Generated
            or analyzed configuration must be reviewed and validated by qualified personnel before
            use in production.
          </p>
        </section>

        <section className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/80 p-6">
          <h3 className="text-lg font-semibold text-white">User responsibility</h3>
          <p className="mt-3 text-slate-300">
            Users are responsible for validating outputs and ensuring configuration meets organizational
            policies. Do not rely solely on OpsForge for security or compliance decisions.
          </p>
        </section>

        <section className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/80 p-6">
          <h3 className="text-lg font-semibold text-white">No warranties</h3>
          <p className="mt-3 text-slate-300">All tools are provided "as is" without warranties of any kind.</p>
        </section>

        <section className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/80 p-6">
          <h3 className="text-lg font-semibold text-white">Limitation of liability</h3>
          <p className="mt-3 text-slate-300">
            To the maximum extent permitted by applicable law, OpsForge is not liable for any direct,
            indirect, incidental, special, or consequential damages arising from use of the site or
            reliance on its output.
          </p>
        </section>

        <section className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/80 p-6">
          <h3 className="text-lg font-semibold text-white">Acceptable use</h3>
          <p className="mt-3 text-slate-300">Do not use the site to submit illegal content or to harm others' systems or data.</p>
        </section>

        <div className="mt-8 text-sm text-slate-400">
          <p>These terms may be updated as the project evolves.</p>
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
