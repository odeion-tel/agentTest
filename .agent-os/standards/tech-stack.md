# Tech Stack

## Context

Global tech stack defaults for Agent OS projects, overridable in project-specific `.agent-os/product/tech-stack.md`.

- App Framework: Hono on Cloudflare Workers
- Language: TypeScript (with JSX for SSR)
- Primary Database: ArangoDB
- Auth / Relational Database: Cloudflare D1
- ArangoDB Querying: AQL
- D1 ORM: Drizzle
- Validation: Zod ^v4
- Schemas: Zod ^v4
- Build Tool: Vite
- Package Manager: pnpm
- Node Version: 22 LTS
- Import Strategy: Node.js modules

## Frontend

- Frontend App State: HTMX ^v2
- Frontend Page State: AlpineJS ^v3
- CSS Framework: TailwindCSS ^v4.0+
- Font Provider: Google Fonts
- Font Loading: Self-hosted for performance
- Icons: HeroIcons

## Authenication and Authorisation

- AuthZ: JWE(Auth and refresh token, http-only, secure, samesite=lax)

## Hosting and Infrastructure

- Application Hosting: Cloudflare Workers
- Queues / Background Jobs: Cloudflare Queues
- AI Inference / ML Services: Cloudflare Workers AI
- Email Delivery: Cloudflare Email (Workers email routing / sending)
- Asset Storage: Cloudflare R2
- CDN / Edge Delivery: Cloudflare

## Tooling and Ops

- Tests: Run before deployment
- Hono Testing: Vitest with @cloudflare/vitest-pool-workers
- Deployment / DevOps : Wrangler (Cloudflare CLI)
- pnpm over npm

- Production Environment: main branch
- Staging Environment: staging branch
