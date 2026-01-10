# Modbus Document Converter

## Overview

A web application for converting Modbus configuration files between CSV, XML, and JSON formats. The tool follows a conversion workflow inspired by Convertio and CloudConvert: upload → process → download. It's designed for industrial automation use cases where engineers need to transform register configuration files between different formats.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter (lightweight client-side routing)
- **State Management**: TanStack React Query for server state, React useState for local state
- **UI Components**: shadcn/ui component library built on Radix UI primitives
- **Styling**: Tailwind CSS with custom design tokens defined in CSS variables
- **Theme**: Light/dark mode support with system preference detection

### Backend Architecture
- **Runtime**: Node.js with Express
- **Language**: TypeScript (ESM modules)
- **Build Tool**: esbuild for server bundling, Vite for client
- **File Handling**: Multer for multipart file uploads
- **API Pattern**: REST endpoints under `/api` prefix

### Data Flow
1. User uploads CSV/JSON/XML file via drag-and-drop or file picker
2. Backend parses file content and normalizes register data
3. Frontend displays parsed registers in editable table
4. User selects target format and downloads converted file

### Data Model
The core data structure is `ModbusRegister`:
- `address`: Integer register address
- `name`: Register identifier string
- `datatype`: Enum (INT16, UINT16, INT32, UINT32, FLOAT32, FLOAT64, STRING, BOOL, COIL)
- `description`: Human-readable description
- `writable`: Boolean flag for read/write access

### Storage Strategy
- **Current**: In-memory storage (`MemStorage` class) for documents
- **Schema Ready**: Drizzle ORM configured with PostgreSQL schema for future persistence
- Documents are stored temporarily with UUID identifiers

### Build & Development
- Development: `npm run dev` runs Vite dev server with HMR
- Production: `npm run build` creates optimized bundles in `dist/`
- Database: `npm run db:push` syncs Drizzle schema to PostgreSQL

## External Dependencies

### Database
- **PostgreSQL**: Configured via `DATABASE_URL` environment variable
- **ORM**: Drizzle ORM with Zod schema validation
- **Session Store**: connect-pg-simple for session persistence (available but not currently active)

### UI Libraries
- **Radix UI**: Complete set of accessible primitives (dialog, select, tabs, etc.)
- **Lucide React**: Icon library
- **Embla Carousel**: Carousel functionality
- **Recharts**: Charting library (available for data visualization)

### Utilities
- **Zod**: Schema validation for API contracts
- **date-fns**: Date formatting
- **class-variance-authority**: Component variant management
- **xlsx**: Excel file processing capability

### AI Integration (Referenced in Attached Assets)
The attached Python files reference OpenAI and Anthropic APIs for PDF text extraction and AI-powered Modbus register parsing. This functionality is not yet integrated into the TypeScript application but represents planned capability for extracting register tables from PDF technical manuals.