"use client";

import { useState } from "react";
import Link from "next/link";

export default function SiteHeader() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  function closeMenu() {
    setIsMenuOpen(false);
  }

  return (
    <header className="border-b border-zinc-800/80 bg-zinc-950/90">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white font-mono text-sm font-bold text-zinc-950 shadow-lg shadow-white/10">
            O
          </div>
          <div>
            <Link href="/" className="text-lg font-semibold tracking-tight text-white">
              OpsForge
            </Link>
          </div>
        </div>

        <nav className="hidden items-center gap-6 text-sm text-zinc-500 md:flex">
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

        <button
          type="button"
          onClick={() => setIsMenuOpen((open) => !open)}
          aria-label={isMenuOpen ? "Close menu" : "Open menu"}
          aria-expanded={isMenuOpen}
          aria-controls="mobile-nav"
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-700 text-zinc-300 transition hover:border-zinc-500 hover:text-white md:hidden"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-5 w-5"
            aria-hidden="true"
          >
            {isMenuOpen ? (
              <path d="M18 6 6 18M6 6l12 12" />
            ) : (
              <path d="M4 6h16M4 12h16M4 18h16" />
            )}
          </svg>
        </button>
      </div>

      {isMenuOpen ? (
        <nav
          id="mobile-nav"
          className="border-t border-zinc-800/80 px-4 py-3 text-sm text-zinc-400 md:hidden sm:px-6"
        >
          <div className="flex flex-col gap-1">
            <Link
              href="/"
              onClick={closeMenu}
              className="rounded-lg px-3 py-2 transition hover:bg-zinc-900 hover:text-white"
            >
              Home
            </Link>
            <Link
              href="/#tools"
              onClick={closeMenu}
              className="rounded-lg px-3 py-2 transition hover:bg-zinc-900 hover:text-white"
            >
              Tools
            </Link>
            <Link
              href="/about"
              onClick={closeMenu}
              className="rounded-lg px-3 py-2 transition hover:bg-zinc-900 hover:text-white"
            >
              About
            </Link>
            <Link
              href="/contact"
              onClick={closeMenu}
              className="rounded-lg px-3 py-2 transition hover:bg-zinc-900 hover:text-white"
            >
              Contact
            </Link>
          </div>
        </nav>
      ) : null}
    </header>
  );
}
