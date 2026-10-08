# OpsForge

[![CI](https://github.com/sai-pavan-kandrakota/opsforge/actions/workflows/ci.yml/badge.svg)](https://github.com/sai-pavan-kandrakota/opsforge/actions/workflows/ci.yml)

**Live demo: [opsforge-mu.vercel.app](https://opsforge-mu.vercel.app/)**

OpsForge is a browser-based toolkit of 12 DevOps and SRE tools — static
analyzers for Kubernetes manifests, Terraform, Dockerfiles, GitHub Actions
workflows, Helm charts, and AWS IAM policies, plus everyday utilities like a
CIDR calculator, JSON formatter, YAML validator, and cron generator. It's
built for engineers and SREs who want a fast, no-setup way to check
configuration for common production-readiness and security issues before it
ships: paste a file (or fill in a form), get results immediately, with no
account and no server round trip for the analysis itself.

## Try it online

No installation needed to evaluate it — open
**[opsforge-mu.vercel.app](https://opsforge-mu.vercel.app/)**, pick a tool,
and paste in a real manifest, Dockerfile, workflow, or policy to see it work.

## Why OpsForge

- **One place for checks you'd otherwise run with separate tools or ad-hoc
  scripts** — Kubernetes, Terraform, Dockerfile, GitHub Actions, Helm, and
  AWS IAM, all surfaced in a consistent pass/warning/critical format.
- **Nothing to install to try it** — every tool is a page in the browser;
  `npm install` is only needed if you want to run it locally or read/modify
  the source.
- **Processing happens client-side** — pasted configuration is analyzed in
  your browser's JavaScript, not sent to a backend for the analysis itself
  (see [Privacy](#privacy) below for the full picture).
- **No account required** — paste and go.

## Tools

| Tool | Route |
|---|---|
| CIDR Calculator | `/tools/cidr-calculator` |
| JSON Formatter | `/tools/json-formatter` |
| Cron Generator | `/tools/cron-generator` |
| YAML Validator | `/tools/yaml-validator` |
| Kubernetes Generator | `/tools/kubernetes-generator` |
| Kubernetes Manifest Analyzer | `/tools/kubernetes-analyzer` |
| Dockerfile Analyzer | `/tools/dockerfile-analyzer` |
| GitHub Actions Analyzer | `/tools/github-actions-analyzer` |
| Terraform Analyzer | `/tools/terraform-analyzer` |
| Helm Analyzer | `/tools/helm-analyzer` |
| AWS IAM Policy Analyzer | `/tools/aws-iam-analyzer` |
| AI SRE Assistant | `/tools/ai-sre-assistant` |

## Key characteristics

- All 12 tools run their analysis/generation logic in the browser — pasted
  YAML, Terraform, Dockerfiles, GitHub Actions workflows, and IAM policies
  are parsed and checked client-side.
- No account or sign-in is currently required to use any tool.
- No tool sends the content you paste or type to an external API — there is
  no `fetch`, `XMLHttpRequest`, or third-party analytics call anywhere in
  the tool logic.
- Results (findings, generated YAML, formatted output) are produced locally
  by the application in your browser session.

## Getting started

```bash
npm install
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000).

## Production build

```bash
npm run build
npm run start
```

## Validation

```bash
npx tsc --noEmit
npm run lint
npm run build
```

## Architecture

- **Next.js (App Router)** + **React** + **TypeScript** + **Tailwind CSS**.
- Each tool lives under `app/tools/<tool-name>/` as a `page.tsx` +
  `ClientComponent.tsx` pair: `page.tsx` is a server component that sets
  page-specific metadata and renders the shared layout; `ClientComponent.tsx`
  is a client component holding the tool's interactive state and logic.
- Shared layout pieces (`SiteHeader`, `SiteFooter`) live in
  `app/components/` and are reused across the homepage, every tool page, and
  the informational pages (About, Contact, Privacy, Terms).

## Project structure

```
app/
  components/
    SiteHeader.tsx
    SiteFooter.tsx
  tools/
    <tool-name>/
      page.tsx            # server component: metadata + layout
      ClientComponent.tsx  # client component: interactive tool logic
  about/
  contact/
  privacy/
  terms/
  page.tsx                # homepage: searchable tool catalog
  layout.tsx
  sitemap.ts
  robots.ts
```

## Privacy

Most OpsForge tools are static analyzers or generators that process the
input you provide entirely within your browser's JavaScript environment —
pasted configuration is not intentionally transmitted to a backend for
analysis. Standard network requests still occur to load the site itself
(fonts, scripts, pages), and hosting infrastructure may keep standard
request logs. See the [Privacy Policy](/privacy) page in the app for the
current, authoritative description of data handling.
