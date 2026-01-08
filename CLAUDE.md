# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Instructions

**IMPORTANT: Always follow these rules when working in this repository:**

1. **Start in Plan Mode:** At the beginning of every session, enter plan mode before doing any implementation work. Analyze the request, explore relevant code, and create a detailed plan.

2. **Ask Questions One at a Time:** When gathering requirements or clarifying the task, ask questions individually rather than in batches. Wait for the user's response before asking the next question.

3. **Seek Approval Before Modifying Code:** Never modify any code without explicit user approval. Present the proposed changes and wait for confirmation before making edits.

## Project Overview

ModMapper is a Modbus Document Converter - a full-stack TypeScript web application for converting Modbus register configuration files between formats (CSV, XML, JSON, PDF). Built for industrial automation engineers.

## Commands

```bash
# Development (runs server with HMR)
npm run dev

# Type checking
npm run check

# Production build (Vite client + esbuild server)
npm run build

# Run production build
npm run start

# Database migrations (if DATABASE_URL is set)
npm run db:push
```

**Note:** No test framework is currently configured.

## Architecture

### Tech Stack
- **Frontend:** React 18 + TypeScript, Vite, Wouter (routing), TanStack React Query, shadcn/ui, Tailwind CSS
- **Backend:** Node.js + Express, TypeScript (ESM), Multer (file uploads), Drizzle ORM
- **AI Integration:** Anthropic Claude API for PDF parsing

### Key Entry Points
- Frontend: `client/src/main.tsx` → `App.tsx` → `pages/home.tsx`
- Backend: `server/index.ts` (Express setup)
- Shared types: `shared/schema.ts` (Zod schemas)

### Code Organization
```
client/src/
  pages/home.tsx           # Main conversion workflow
  components/              # React components + shadcn/ui in ui/
  hooks/                   # Custom React hooks
  lib/                     # Utilities, query client, theme provider

server/
  index.ts                 # Express app entry, middleware
  routes.ts                # REST API endpoints
  parsers.ts               # CSV/JSON/XML parsing
  pdf-parser.ts            # Claude API PDF extraction with SSE streaming
  storage.ts               # In-memory document storage

shared/
  schema.ts                # Zod validation schemas, TypeScript types
```

### API Endpoints (all under /api)
- `POST /parse` - Parse CSV/JSON/XML/PDF files
- `POST /parse-pdf-stream` - Stream PDF parsing with SSE progress
- `POST /parse-pdf-with-hints` - Extract PDF with specific page ranges
- `GET /documents` - List documents
- `GET /documents/:id` - Get document
- `DELETE /documents/:id` - Delete document
- `GET /health` - Health check

### Core Data Model
```typescript
ModbusRegister {
  address: number,           // Register address
  name: string,              // Register identifier
  datatype: ModbusDataType,  // INT16, UINT16, INT32, UINT32, FLOAT32, FLOAT64, STRING, BOOL, COIL
  description: string,
  writable: boolean
}
```

### TypeScript Path Aliases
- `@/*` → `./client/src/*`
- `@shared/*` → `./shared/*`

## Environment Variables

- `PORT` - Server port (default 5000)
- `NODE_ENV` - development/production
- `DATABASE_URL` - PostgreSQL connection (optional, uses in-memory storage if not set)
- `ANTHROPIC_API_KEY` - Required for PDF parsing
- `PDF_CACHE_TTL_MINUTES` - How long cached PDF results remain valid (default: 30)
- `PDF_CACHE_MAX_ENTRIES` - Maximum cache entries before eviction (default: 100)

## Build Process

The `script/build.ts` script:
1. Cleans `/dist` directory
2. Builds client with Vite → `/dist/public`
3. Bundles server with esbuild → `/dist/index.cjs` (CommonJS, minified)

## Design System

Industrial aesthetic with professional utility focus. Design tokens defined as CSS variables in `client/src/index.css`:
- Primary: #2C5F9E (Industrial Blue)
- Secondary: #F39C12 (Warning Orange)
- Light/dark mode supported via theme-toggle component

## Suggested Improvements

See [improvements.md](improvements.md) for a prioritized list of suggested codebase improvements covering testing, security, architecture, performance, and code quality.
