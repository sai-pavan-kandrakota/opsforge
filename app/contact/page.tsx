"use client";

import Link from "next/link";

export default function ContactPage() {
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
          <h1 className="text-3xl font-bold text-white">Contact OpsForge</h1>
          <p className="mt-3 text-slate-300">We welcome bug reports, tool suggestions, feedback, and security notices.</p>
        </div>

        <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-6">
          <h2 className="text-xl font-semibold text-white">How to reach us</h2>
          <p className="mt-3 text-slate-300">We welcome bug reports, tool suggestions, feedback, and security notices.</p>

          <div className="mt-4 space-y-3">
            <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-4 text-sm">
              <div className="font-medium text-white">Contact email</div>
              <a href="mailto:saipavaneducation@gmail.com" className="mt-1 inline-block text-slate-300 transition hover:text-white">
                saipavaneducation@gmail.com
              </a>
            </div>

            <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-4 text-sm">
              <div className="font-medium text-white">Report a bug</div>
              <div className="mt-1 text-slate-300">Open an issue in the project repository or email us with the details.</div>
            </div>

            <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-4 text-sm">
              <div className="font-medium text-white">Security disclosure</div>
              <div className="mt-1 text-slate-300">If you discover a security issue, please send the details to the contact email above.</div>
            </div>
          </div>
        </section>
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
