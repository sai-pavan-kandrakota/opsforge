@AGENTS.md

## Project overview

OpsForge is a Next.js 16 (App Router) + React 19 + TypeScript + Tailwind CSS 4
site providing a collection of client-side DevOps static-analysis tools (e.g.
Terraform, Dockerfile, GitHub Actions, Helm, Kubernetes, AWS IAM analyzers,
plus generators/validators for cron, Kubernetes YAML, CIDR, JSON, YAML). Each
tool lives under `app/tools/<tool-name>/` as either a single `page.tsx` or a
`page.tsx` + `ClientComponent.tsx` pair, and is a self-contained client
component with no backend — all parsing and analysis logic (regex/string-based
HCL/YAML/Dockerfile parsing) runs in the browser. Shared layout pieces live in
`app/components/`.

## Working rules

- Read relevant code completely before editing.
- Investigate and identify the exact root cause before implementing a fix.
- Make the smallest safe change.
- Do not modify unrelated files.
- Do not refactor working code unless explicitly requested.
- Preserve existing behavior outside the approved fix.
- Do not change UI/JSX for logic-only fixes unless necessary.
- Do not invent requirements or validation outside the task scope.

## Investigation workflow

By default:
1. Investigate first without modifying code.
2. Confirm bugs with reproduction, code tracing, or tests.
3. Report only confirmed issues.
4. Wait for approval before implementation unless explicitly told to
   implement immediately.

## Response style

Keep responses concise. Do not produce long investigation reports, full test
matrices, or repeat unchanged code unless specifically requested or a
failure/regression requires detailed evidence.

Default completion report:
- Root cause
- Files/functions affected
- Change made
- Test summary
- Known limitations
- git status

## Verification

For code changes run when applicable:

```
npx.cmd tsc --noEmit
npm.cmd run build
git diff --check
git status
```

## Git safety

- Never commit unless explicitly instructed.
- Never push unless explicitly instructed.
- Before a commit, inspect the diff and ensure only intended files changed.
- Do not stage unrelated files.
