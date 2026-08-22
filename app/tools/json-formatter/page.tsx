"use client";

import { useState } from "react";

const sampleJson = `{
  "name": "OpsForge",
  "type": "DevOps Toolkit",
  "version": 1,
  "features": [
    "CIDR Calculator",
    "JSON Formatter",
    "Cron Generator"
  ],
  "active": true
}`;

export default function JsonFormatter() {
  const [input, setInput] = useState(sampleJson);
  const [formatted, setFormatted] = useState("");
  const [minified, setMinified] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");

  function formatJson() {
    try {
      const parsed = JSON.parse(input);

      setFormatted(JSON.stringify(parsed, null, 2));
      setMinified(JSON.stringify(parsed));
      setError("");
    } catch (err) {
      setFormatted("");
      setMinified("");

      if (err instanceof SyntaxError) {
        setError(err.message);
      } else {
        setError("Invalid JSON.");
      }
    }
  }

  async function copyText(text: string, type: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(type);

      setTimeout(() => {
        setCopied("");
      }, 1500);
    } catch {
      setError("Unable to copy to clipboard.");
    }
  }

  function clearAll() {
    setInput("");
    setFormatted("");
    setMinified("");
    setError("");
    setCopied("");
  }

  function loadExample() {
    setInput(sampleJson);
    setFormatted("");
    setMinified("");
    setError("");
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      {/* Header */}
      <header className="border-b border-zinc-800">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
          <a
            href="/"
            className="flex items-center gap-3"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white font-bold text-zinc-950">
              O
            </div>

            <span className="text-xl font-semibold">
              OpsForge
            </span>
          </a>

          <a
            href="/"
            className="text-sm text-zinc-400 transition hover:text-white"
          >
            ← All tools
          </a>
        </div>
      </header>

      {/* Main */}
      <section className="mx-auto max-w-6xl px-6 py-16">
        <div className="mb-10">
          <p className="text-sm font-medium uppercase tracking-widest text-zinc-500">
            Developer Tool
          </p>

          <h1 className="mt-3 text-4xl font-bold tracking-tight sm:text-5xl">
            JSON Formatter
          </h1>

          <p className="mt-4 max-w-2xl text-lg leading-8 text-zinc-400">
            Format, validate, pretty-print, and minify JSON
            directly in your browser.
          </p>
        </div>

        {/* Input */}
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
          <div className="mb-3 flex items-center justify-between">
            <label
              htmlFor="json-input"
              className="text-sm font-medium text-zinc-300"
            >
              JSON Input
            </label>

            <button
              onClick={loadExample}
              className="text-sm text-zinc-400 transition hover:text-white"
            >
              Load example
            </button>
          </div>

          <textarea
            id="json-input"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder='Paste JSON here...'
            spellCheck={false}
            className="min-h-[320px] w-full resize-y rounded-xl border border-zinc-700 bg-zinc-950 p-5 font-mono text-sm leading-6 text-zinc-200 outline-none transition placeholder:text-zinc-600 focus:border-zinc-400"
          />

          <div className="mt-4 flex flex-wrap gap-3">
            <button
              onClick={formatJson}
              className="rounded-lg bg-white px-5 py-3 font-medium text-zinc-950 transition hover:bg-zinc-200"
            >
              Format JSON
            </button>

            <button
              onClick={clearAll}
              className="rounded-lg border border-zinc-700 px-5 py-3 font-medium text-zinc-300 transition hover:border-zinc-500 hover:text-white"
            >
              Clear
            </button>
          </div>

          {error && (
            <div role="alert" className="mt-5 rounded-lg border border-red-900/60 bg-red-950/20 p-4">
              <p className="text-sm font-medium text-red-400">
                Invalid JSON
              </p>

              <p className="mt-1 break-all font-mono text-sm text-red-300/80">
                {error}
              </p>
            </div>
          )}
        </div>

        {/* Results */}
        {formatted && (
          <div className="mt-8 grid gap-6 lg:grid-cols-2">
            {/* Pretty */}
            <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/60">
              <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-4">
                <div>
                  <h2 className="font-semibold">
                    Formatted JSON
                  </h2>

                  <p className="mt-1 text-xs text-zinc-500">
                    Pretty printed
                  </p>
                </div>

                <button
                  onClick={() =>
                    copyText(formatted, "formatted")
                  }
                  className="rounded-md border border-zinc-700 px-3 py-2 text-sm text-zinc-300 transition hover:border-zinc-500 hover:text-white"
                >
                  {copied === "formatted"
                    ? "Copied!"
                    : "Copy"}
                </button>
              </div>

              <pre className="max-h-[500px] overflow-auto p-5 font-mono text-sm leading-6 text-zinc-300">
                {formatted}
              </pre>
            </div>

            {/* Minified */}
            <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/60">
              <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-4">
                <div>
                  <h2 className="font-semibold">
                    Minified JSON
                  </h2>

                  <p className="mt-1 text-xs text-zinc-500">
                    Compact version
                  </p>
                </div>

                <button
                  onClick={() =>
                    copyText(minified, "minified")
                  }
                  className="rounded-md border border-zinc-700 px-3 py-2 text-sm text-zinc-300 transition hover:border-zinc-500 hover:text-white"
                >
                  {copied === "minified"
                    ? "Copied!"
                    : "Copy"}
                </button>
              </div>

              <pre className="max-h-[500px] overflow-auto whitespace-pre-wrap break-all p-5 font-mono text-sm leading-6 text-zinc-300">
                {minified}
              </pre>
            </div>
          </div>
        )}

        {/* Information */}
        <section className="mt-16 border-t border-zinc-800 pt-10">
          <h2 className="text-2xl font-semibold">
            What is JSON formatting?
          </h2>

          <p className="mt-4 max-w-3xl leading-7 text-zinc-400">
            JSON formatting makes structured data easier to read
            and inspect by adding consistent indentation and
            line breaks. This tool validates your JSON before
            formatting it, so syntax errors are reported instead
            of silently producing incorrect output.
          </p>

          <div className="mt-8 grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
              <h3 className="font-semibold">
                Pretty Print
              </h3>

              <p className="mt-2 text-sm leading-6 text-zinc-400">
                Converts compact JSON into an easy-to-read
                structure with indentation.
              </p>
            </div>

            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
              <h3 className="font-semibold">
                Minify
              </h3>

              <p className="mt-2 text-sm leading-6 text-zinc-400">
                Removes unnecessary whitespace to produce a
                compact JSON representation.
              </p>
            </div>
          </div>
        </section>
      </section>

      <footer className="border-t border-zinc-800">
        <div className="mx-auto flex max-w-7xl justify-between px-6 py-8 text-sm text-zinc-500">
          <span>© 2026 OpsForge</span>
          <span>DevOps · Cloud · SRE</span>
        </div>
      </footer>
    </main>
  );
}