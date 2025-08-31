# Technical Stack

> Last Updated: 2025-08-31
> Version: 1.0.0

## Application Framework

- **Framework:** Hono on Cloudflare Workers
- **Runtime:** Edge Runtime (V8 Isolates)
- **Architecture:** Functional hierarchy (Data -> Calculations -> Actions)

## Database

- **Primary Database:** ArangoDB (document/graph database)
- **Secondary Database:** Cloudflare D1 (SQLite for auth/relational data)
- **Database Hosting:** ArangoDB Cloud + Cloudflare D1

## JavaScript

- **Language:** TypeScript with JSX (Server-Side Rendering)
- **Node Version:** 22 LTS
- **Package Manager:** pnpm
- **Import Strategy:** node
- **Build Tool:** Vite

## CSS Framework

- **Framework:** TailwindCSS v4.0+
- **Configuration:** Modern CSS with container queries support

## UI Components

- **Primary Library:** HTMX v2 (hypermedia interactions)
- **Secondary Library:** AlpineJS v3 (client-side reactivity)
- **Rendering:** Server-Side Rendering with progressive enhancement

## Design System

- **Fonts Provider:** Google Fonts (self-hosted for performance)
- **Icon Library:** HeroIcons
- **Design Approach:** Mobile-first, progressive enhancement

## Hosting & Infrastructure

- **Application Hosting:** Cloudflare Workers
- **Asset Hosting:** Cloudflare R2
- **CDN:** Cloudflare (global edge network)
- **Deployment:** Wrangler (Cloudflare CLI)

## Authentication & Security

- **Auth Strategy:** JWE tokens
- **Token Storage:** HTTP-only cookies (secure, samesite=lax)
- **Validation:** Zod v4 for runtime type validation

## Background Services

- **Background Jobs:** Cloudflare Queues
- **Email Services:** Cloudflare Email routing/sending
- **AI/ML Services:** Cloudflare Workers AI

## Development Tools

- **Testing Framework:** Vitest with @cloudflare/vitest-pool-workers
- **Development Server:** Vite dev server with HMR
- **Code Repository:** [TBD]

## Performance Optimizations

- **Edge Computing:** Global edge deployment via Cloudflare Workers
- **Zero Cold Start:** V8 Isolates architecture
- **Asset Optimization:** Cloudflare R2 with automatic compression
- **Database Optimization:** ArangoDB for complex queries, D1 for simple relational data