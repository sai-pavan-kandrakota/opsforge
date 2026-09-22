"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

import SiteFooter from "@/app/components/SiteFooter";

const categoryOrder = [
  "NETWORKING",
  "DEVELOPER",
  "KUBERNETES",
  "CONTAINERS",
  "CI/CD",
  "INFRASTRUCTURE AS CODE",
  "AWS / SECURITY",
  "SRE",
] as const;

const tools = [
  {
    name: "CIDR Calculator",
    category: "NETWORKING",
    description: "Calculate IP ranges, subnet masks, hosts, and subnets.",
    href: "/tools/cidr-calculator",
  },
  {
    name: "JSON Formatter",
    category: "DEVELOPER",
    description: "Format, validate, and minify JSON instantly.",
    href: "/tools/json-formatter",
  },
  {
    name: "Cron Generator",
    category: "DEVELOPER",
    description: "Create and understand cron expressions.",
    href: "/tools/cron-generator",
  },
  {
    name: "YAML Validator",
    category: "KUBERNETES",
    description: "Validate and format YAML configuration files.",
    href: "/tools/yaml-validator",
  },
  {
    name: "Kubernetes Generator",
    category: "KUBERNETES",
    description: "Generate Kubernetes manifests faster.",
    href: "/tools/kubernetes-generator",
  },
  {
    name: "Kubernetes Manifest Analyzer",
    category: "KUBERNETES",
    description:
      "Review Kubernetes manifests for reliability, security, and production-readiness issues.",
    href: "/tools/kubernetes-analyzer",
  },
  {
    name: "Dockerfile Analyzer",
    category: "CONTAINERS",
    description:
      "Analyze Dockerfiles for security, reliability, and production-readiness issues.",
    href: "/tools/dockerfile-analyzer",
  },
  {
    name: "GitHub Actions Analyzer",
    category: "CI/CD",
    description: "Review GitHub Actions workflows for security, reliability, performance, and CI/CD best practices.",
    href: "/tools/github-actions-analyzer",
  },
  {
    name: "Terraform Analyzer",
    category: "INFRASTRUCTURE AS CODE",
    description:
      "Analyze Terraform configuration for security, reliability, maintainability, and production-readiness issues.",
    href: "/tools/terraform-analyzer",
  },
  {
    name: "Helm Analyzer",
    category: "KUBERNETES",
    description: "Review Helm charts for Kubernetes security, reliability, configuration, and production-readiness issues.",
    href: "/tools/helm-analyzer",
  },
  {
    name: "AWS IAM Policy Analyzer",
    category: "AWS / SECURITY",
    description: "Review IAM policies for excessive permissions and security risks.",
    href: "/tools/aws-iam-analyzer",
  },
  {
    name: "SRE Incident Analyzer",
    category: "SRE",
    description: "Classify incidents deterministically and generate an evidence-based troubleshooting plan.",
    href: "/tools/ai-sre-assistant",
  },
] as const;

const comingSoonTools = [
  "Docker Compose Analyzer",
  "Kubernetes RBAC Analyzer",
  "Terraform Cost Analyzer",
  "AWS Security Group Analyzer",
  "Log Analyzer",
];

export default function Home() {
  const [query, setQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  function closeMenu() {
    setIsMenuOpen(false);
  }

  // Pressing "/" anywhere outside a form control focuses the tool search
  // input, mirroring the shortcut hint shown next to it. preventDefault()
  // only runs on the branch that actually activates the shortcut, so
  // typing "/" inside any input/textarea/select/contenteditable element
  // (including the search box itself) is completely unaffected.
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "/") return;

      const target = event.target as HTMLElement | null;
      const tagName = target?.tagName;
      const isEditableTarget =
        tagName === "INPUT" ||
        tagName === "TEXTAREA" ||
        tagName === "SELECT" ||
        Boolean(target?.isContentEditable);

      if (isEditableTarget) return;

      event.preventDefault();
      searchInputRef.current?.focus();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const filteredCategories = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return categoryOrder
      .map((category) => {
        const categoryTools = tools.filter((tool) => {
          if (tool.category !== category) {
            return false;
          }

          if (!normalizedQuery) {
            return true;
          }

          const searchableText = `${tool.name} ${tool.description} ${tool.category}`.toLowerCase();
          return searchableText.includes(normalizedQuery);
        });

        return {
          category,
          tools: categoryTools,
        };
      })
      .filter((category) => category.tools.length > 0);
  }, [query]);

  const totalMatchCount = filteredCategories.reduce(
    (count, category) => count + category.tools.length,
    0,
  );

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800/80 bg-zinc-950/90 backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white font-mono text-sm font-bold text-zinc-950 shadow-lg shadow-white/10">
              O
            </div>
            <div>
              <span className="text-lg font-semibold tracking-tight text-white">
                OpsForge
              </span>
            </div>
          </div>

          <nav className="hidden items-center gap-8 text-sm text-zinc-400 md:flex">
            <a href="#tools" className="transition hover:text-white">
              Tools
            </a>
            <a href="#coming-soon" className="transition hover:text-white">
              Coming Soon
            </a>
          </nav>

          <button
            type="button"
            onClick={() => setIsMenuOpen((open) => !open)}
            aria-label={isMenuOpen ? "Close menu" : "Open menu"}
            aria-expanded={isMenuOpen}
            aria-controls="homepage-mobile-nav"
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
            id="homepage-mobile-nav"
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
              <a
                href="#tools"
                onClick={closeMenu}
                className="rounded-lg px-3 py-2 transition hover:bg-zinc-900 hover:text-white"
              >
                Tools
              </a>
              <a
                href="#coming-soon"
                onClick={closeMenu}
                className="rounded-lg px-3 py-2 transition hover:bg-zinc-900 hover:text-white"
              >
                Coming Soon
              </a>
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

      <section className="mx-auto max-w-6xl px-4 pb-20 pt-16 sm:px-6 lg:px-8 lg:pt-24">
        <div className="mx-auto max-w-4xl text-center">
          <div className="mb-6 inline-flex items-center rounded-full border border-zinc-700 bg-zinc-900/80 px-3 py-1.5 text-xs font-medium uppercase tracking-[0.2em] text-zinc-300">
            DevOps · Cloud · Kubernetes · SRE
          </div>

          <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl lg:text-7xl">
            Find what&apos;s actually wrong with your infrastructure.
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-base leading-7 text-zinc-400 sm:text-lg">
            OpsForge is a set of practical analyzers for DevOps and SRE work: analyze, validate,
            and troubleshoot Kubernetes manifests, Terraform configurations, Dockerfiles, GitHub
            Actions workflows, Helm charts, and AWS IAM policies — plus a deterministic incident
            analyzer for triaging production issues. Everything runs locally in your browser;
            nothing is sent to a server.
          </p>

          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <a
              href="#tools"
              className="inline-flex items-center justify-center rounded-xl bg-white px-5 py-3 text-sm font-medium text-zinc-950 transition hover:bg-zinc-200"
            >
              Explore the tools
            </a>
            <a
              href="#coming-soon"
              className="inline-flex items-center justify-center rounded-xl border border-zinc-700 bg-zinc-900/80 px-5 py-3 text-sm font-medium text-zinc-200 transition hover:border-zinc-500 hover:text-white"
            >
              See roadmap
            </a>
          </div>

          <div className="mx-auto mt-10 max-w-2xl">
            <div className="flex items-center rounded-2xl border border-zinc-700 bg-zinc-900/80 px-4 py-3 shadow-[0_20px_70px_rgba(0,0,0,0.35)] ring-1 ring-white/5 focus-within:border-zinc-500 sm:px-5">
              <span className="mr-3 text-lg text-zinc-500" aria-hidden="true">⌕</span>
              <input
                ref={searchInputRef}
                type="text"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search tools by name, description, or category..."
                aria-label="Search tools"
                className="w-full bg-transparent text-sm text-white outline-none placeholder:text-zinc-500 sm:text-base"
              />
              <span className="hidden rounded-md border border-zinc-700 px-2 py-1 text-[10px] font-medium uppercase tracking-[0.2em] text-zinc-500 sm:inline-block">
                /
              </span>
            </div>
          </div>
 
          {/* What is OpsForge? */}
          <div className="mx-auto mt-8 max-w-3xl text-center">
            <h2 className="text-lg font-semibold text-white">What is OpsForge?</h2>
            <p className="mt-3 text-sm text-zinc-400">
              OpsForge provides practical, browser-based DevOps and SRE tools that work where
              engineers work — in the browser. Many OpsForge tools run entirely locally in your
              browser and perform static analysis of configuration, YAML, Terraform, Dockerfiles,
              GitHub Actions workflows, and IAM policies without sending your configuration to a
              backend.
            </p>
          </div>
 
          {/* Built for DevOps & SRE */}
          <div className="mx-auto mt-8 max-w-4xl">
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-6">
              <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-zinc-400">Built for DevOps &amp; SRE</h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-3">
                <div>
                  <h3 className="font-semibold text-white">Kubernetes</h3>
                  <p className="mt-1 text-sm text-zinc-400">Kubernetes tools and a Kubernetes analyzer for manifests and Helm charts.</p>
                </div>
                <div>
                  <h3 className="font-semibold text-white">Terraform</h3>
                  <p className="mt-1 text-sm text-zinc-400">Terraform analyzer and infrastructure as code checks to improve reliability and security.</p>
                </div>
                <div>
                  <h3 className="font-semibold text-white">CI/CD &amp; Containers</h3>
                  <p className="mt-1 text-sm text-zinc-400">GitHub Actions analyzer and Dockerfile analyzer for safer CI/CD and container builds.</p>
                </div>
              </div>
              <div className="mt-4 grid gap-4 sm:grid-cols-3">
                <div>
                  <h3 className="font-semibold text-white">AWS &amp; Security</h3>
                  <p className="mt-1 text-sm text-zinc-400">IAM policy analyzer and security-focused checks for cloud resources.</p>
                </div>
                <div>
                  <h3 className="font-semibold text-white">Networking &amp; YAML</h3>
                  <p className="mt-1 text-sm text-zinc-400">CIDR calculations, YAML and JSON validation tools for configuration hygiene.</p>
                </div>
                <div>
                  <h3 className="font-semibold text-white">SRE Troubleshooting</h3>
                  <p className="mt-1 text-sm text-zinc-400">A local SRE assistant provides structured investigations and remediation checklists.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Structured data (JSON-LD) for the site as WebSite and WebApplication */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@graph": [
              {
                "@type": "WebSite",
                "name": "OpsForge",
                "url": "https://opsforge-mu.vercel.app",
                "description": "Free online DevOps and SRE tools for Kubernetes, Terraform, Docker, GitHub Actions, AWS IAM, networking, YAML, JSON, and incident troubleshooting.",
              },
              {
                "@type": "WebApplication",
                "name": "OpsForge",
                "applicationCategory": "DeveloperApplication",
                "operatingSystem": "Web",
                "description": "Browser-based tools for DevOps, SRE, Kubernetes, Terraform, CI/CD, and cloud engineers.",
                "offers": {
                  "@type": "Offer",
                  "price": "0",
                  "priceCurrency": "USD",
                  "eligibleRegion": "Worldwide",
                  "availability": "https://schema.org/InStock"
                }
              }
            ]
          }),
        }}
      />

      <section id="tools" className="mx-auto max-w-7xl px-4 pb-20 sm:px-6 lg:px-8">
        <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.25em] text-zinc-500">
              Toolkit
            </p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight text-white">
              Searchable platform tools
            </h2>
          </div>
          <div className="text-sm text-zinc-400">
            {query ? `${totalMatchCount} match${totalMatchCount === 1 ? "" : "es"}` : `${tools.length} tools`}
          </div>
        </div>

        {filteredCategories.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-zinc-700 bg-zinc-900/50 px-6 py-12 text-center">
            <p className="text-lg font-medium text-white">No tools match your search.</p>
            <p className="mt-2 text-sm text-zinc-400">
              Try another keyword, category, or tool name.
            </p>
          </div>
        ) : (
          <div className="space-y-10">
            {filteredCategories.map(({ category, tools: categoryTools }) => (
              <div key={category}>
                <div className="mb-4 flex items-center justify-between gap-3">
                  <h3 className="text-xs font-medium uppercase tracking-[0.25em] text-zinc-500">
                    {category}
                  </h3>
                  <span className="h-px flex-1 bg-zinc-800" />
                </div>

                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {categoryTools.map((tool) => (
                    <Link
                      key={tool.name}
                      href={tool.href}
                      className="group block rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5 transition duration-200 hover:-translate-y-1 hover:border-zinc-600 hover:bg-zinc-900"
                    >
                      <div className="mb-8 flex items-center justify-between">
                        <span className="rounded-full border border-zinc-700 bg-zinc-950 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.2em] text-zinc-400">
                          {category}
                        </span>
                        <span className="text-xl text-zinc-500 transition group-hover:translate-x-1 group-hover:text-white" aria-hidden="true">
                          →
                        </span>
                      </div>

                      <h4 className="text-xl font-semibold text-white">{tool.name}</h4>
                      <p className="mt-3 text-sm leading-6 text-zinc-400">{tool.description}</p>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section id="coming-soon" className="border-y border-zinc-800 bg-zinc-900/40">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <p className="text-xs font-medium uppercase tracking-[0.25em] text-zinc-500">
              Coming Soon
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              More power for platform engineering teams
            </h2>
          </div>

          <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            {comingSoonTools.map((tool) => (
              <div
                key={tool}
                className="rounded-2xl border border-zinc-800 bg-zinc-950/80 p-4 text-sm text-zinc-300 shadow-inner shadow-zinc-950/20"
              >
                <span className="inline-flex rounded-full border border-zinc-700 bg-zinc-900 px-2 py-1 text-[10px] font-medium uppercase tracking-[0.2em] text-zinc-500">
                  Soon
                </span>
                <p className="mt-3 font-medium text-white">{tool}</p>
              </div>
            ))}
          </div>

          <div className="mt-10 max-w-xl rounded-2xl border border-zinc-800 bg-zinc-950/60 p-6">
            <h3 className="text-lg font-semibold text-white">Want to know when new tools ship?</h3>
            <p className="mt-2 text-sm text-zinc-400">
              Early access sign-up isn&apos;t available yet. Check back on this page for updates as
              new analyzers launch.
            </p>
          </div>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
