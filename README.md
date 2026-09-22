# OpsForge

OpsForge is a browser-based toolkit for DevOps and SRE work. It provides a
set of practical, self-contained utilities and static analyzers for
Kubernetes, Terraform, Dockerfiles, GitHub Actions, Helm, AWS IAM, and
day-to-day CI/CD and networking tasks — built with Next.js, React, and
TypeScript.

## What it provides

OpsForge provides browser-based utilities and analyzers for DevOps, Cloud,
Kubernetes, Terraform, CI/CD, containers, AWS, and SRE workflows. Each tool
is a focused, single-purpose page: paste input (or fill in a form), get
results immediately, with no sign-up and no server round trip for the
analysis itself.

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
