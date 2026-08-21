import Link from "next/link";

export default function SiteHeader() {
  return (
    <header className="border-b border-slate-800/80 bg-slate-950/90">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white font-mono text-sm font-bold text-slate-950 shadow-lg shadow-white/10">
            O
          </div>
          <div>
            <Link href="/" className="text-lg font-semibold tracking-tight text-white">
              OpsForge
            </Link>
          </div>
        </div>

        <nav className="hidden items-center gap-6 text-sm text-slate-400 md:flex">
          <Link href="/" className="transition hover:text-white">
            Home
          </Link>
          <Link href="/#tools" className="transition hover:text-white">
            Tools
          </Link>
          <Link href="/about" className="transition hover:text-white">
            About
          </Link>
          <Link href="/contact" className="transition hover:text-white">
            Contact
          </Link>
        </nav>
      </div>
    </header>
  );
}
