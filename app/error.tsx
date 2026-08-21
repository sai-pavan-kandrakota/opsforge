"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function ErrorBoundary({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 px-6 py-16 text-center text-white">
      <p className="text-sm font-medium uppercase tracking-[0.2em] text-zinc-500">OpsForge</p>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">Something went wrong</h1>
      <p className="mt-4 max-w-md text-sm leading-6 text-zinc-400">
        This page hit an unexpected error while rendering. Your pasted input is never sent anywhere, so nothing was lost server-side — try again, or head back to the tool list.
      </p>

      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => retry()}
          className="rounded-lg bg-white px-5 py-2.5 text-sm font-medium text-zinc-950 transition hover:bg-zinc-200"
        >
          Try again
        </button>
        <Link
          href="/"
          className="rounded-lg border border-zinc-700 px-5 py-2.5 text-sm text-zinc-300 transition hover:border-zinc-500 hover:text-white"
        >
          Back to all tools
        </Link>
      </div>
    </main>
  );
}
