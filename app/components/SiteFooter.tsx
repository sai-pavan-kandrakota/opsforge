import Link from "next/link";

export default function SiteFooter() {
  return (
    <footer className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
        <div className="text-sm text-zinc-600">© 2026 OpsForge. Built for engineers.</div>
        <nav className="flex flex-wrap items-center gap-4 text-sm">
          <Link href="/" className="text-zinc-500 hover:text-white">
            Home
          </Link>
          <Link href="/about" className="text-zinc-500 hover:text-white">
            About
          </Link>
          <Link href="/contact" className="text-zinc-500 hover:text-white">
            Contact
          </Link>
          <Link href="/privacy" className="text-zinc-500 hover:text-white">
            Privacy
          </Link>
          <Link href="/terms" className="text-zinc-500 hover:text-white">
            Terms
          </Link>
        </nav>
      </div>
    </footer>
  );
}
