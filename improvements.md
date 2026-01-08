# Suggested Improvements

This document outlines prioritized improvements for the ModMapper codebase, organized by category. Each suggestion includes the reasoning behind it and the specific files affected.

**Note:** See [completed_improvements.md](completed_improvements.md) for the log of implemented improvements.

---

## Priority Levels

- **High**: Significant impact on reliability, security, or maintainability. Recommended first.
- **Medium**: Improves code quality or performance. Address after high-priority items.
- **Low**: Nice-to-have enhancements. Address when time permits.

---

## 1. Testing (High Priority)

The project has Vitest configured with growing test coverage. Continue expanding tests to catch regressions.

| Issue | Suggestion | Reason | Files Affected |
|-------|------------|--------|----------------|
| ~~Limited test coverage~~ | ✅ DONE - Added 137 tests | - | - |
| ~~No PDF parser tests~~ | ✅ DONE - 51 tests added | - | - |
| ~~No API route tests~~ | ✅ DONE - 15 tests added | - | - |
| No frontend tests | React components and hooks need more coverage | UI bugs are hard to catch without tests | `client/src/` |
| No integration tests | End-to-end workflow not tested | User journeys could break silently | - |

**Remaining actions:**
- Add React component tests for critical paths (file upload, register editing)
- Consider E2E tests with Playwright for the full conversion workflow

---

## 2. Security (High Priority)

API security improvements to prevent abuse and protect against malicious inputs.

| Issue | Suggestion | Reason | Priority |
|-------|------------|--------|----------|
| ~~No rate limiting~~ | ✅ DONE | - | - |
| Weak file validation | Add deep content validation beyond MIME types | MIME types can be spoofed; magic bytes alone aren't sufficient | Medium |
| No CORS configuration | Add explicit CORS policy | Currently relies on defaults; should be explicit | Medium |
| No request throttling | Limit concurrent PDF processing per client | Prevents resource exhaustion from multiple large uploads | High |

**Recommended packages:**
- `helmet` - Security headers
- `cors` - CORS configuration

---

## 3. Architecture (Medium Priority)

Structural improvements to make the codebase more maintainable.

| Issue | Suggestion | Reason | Files Affected |
|-------|------------|--------|----------------|
| ~~Large PDF parser module~~ | ✅ DONE - Split into 6 modules | - | - |
| Duplicated format detection | Move to shared utility | Same logic exists in client and server | `client/src/hooks/use-file-upload.ts`, `server/parsers.ts` |
| ~~Unused GitHub client~~ | ✅ DONE - Removed | - | - |
| ~~No validation middleware~~ | ✅ DONE - Validation middleware created | - | - |
| ~~Hard-coded cache limits~~ | ✅ DONE - Configurable via env vars | - | - |

---

## 4. Performance (Medium Priority)

Optimizations for better user experience with large files and datasets.

| Issue | Suggestion | Reason | Files Affected |
|-------|------------|--------|----------------|
| ~~No response compression~~ | ✅ DONE | - | - |
| ~~Large register tables~~ | ✅ DONE - Virtual scrolling added | - | - |
| Memory-intensive PDF processing | Consider streaming approach | Large PDFs consume significant memory | `server/pdf-parser/` |
| ~~No SSE timeout~~ | ✅ DONE - 5 min timeout + heartbeat | - | - |

---

## 5. Code Quality (Medium Priority)

Improvements to code consistency and maintainability.

| Issue | Suggestion | Reason | Location |
|-------|------------|--------|----------|
| ~~Console.log in production~~ | ✅ DONE - Winston structured logging | - | - |
| Magic numbers | Extract to constants | Values like `80000`, `4`, `100` should be named | `server/pdf-parser/`, `server/cache.ts` |
| Inconsistent error messages | Standardize error format | Makes debugging and user feedback more predictable | Throughout server |
| Type assertions | Reduce `as` casts | Type assertions bypass TypeScript safety | `server/parsers.ts`, `server/pdf-parser/` |
| Unvalidated AI responses | Add Zod schema for Claude output | AI responses can be malformed; validation adds safety | `server/pdf-parser/llm-client.ts` |

**Recommended logging setup:**
```typescript
// Consider pino for structured logging
import pino from 'pino';
const logger = pino({ level: process.env.LOG_LEVEL || 'info' });
```

---

## 6. Developer Experience (Low Priority)

Improvements to make contributing easier.

| Issue | Suggestion | Reason |
|-------|------------|--------|
| No API documentation | Add OpenAPI/Swagger spec | Helps frontend development and API consumers |
| No pre-commit hooks | Add husky + lint-staged | Ensures code quality before commits |
| Package name mismatch | Update `package.json` name to "modmapper" | Current name "rest-express" is generic |
| No CONTRIBUTING.md | Add contribution guidelines | Helps new contributors understand standards |

---

## 7. Process Flow (Medium Priority)

Improvements to the overall user journey and workflow.

### ~~7.1 Multi-Step Wizard with Progress Indicator~~ ✅ DONE

Implemented visual workflow stepper showing: Upload → Configure → Process → Review

---

### 7.2 PDF Preview Before Extraction

**Current:** Users must know page numbers before uploading; no visual way to browse the PDF.

**Suggestion:** Add an embedded PDF viewer that lets users:
- Browse the PDF visually before extraction
- Click to select pages containing tables
- See a thumbnail strip of all pages
- Highlight pages the AI detected as potentially relevant

**Reason:** The current `PageIdentifier` requires users to already know page numbers. A visual preview makes this much more intuitive, especially for unfamiliar documents.

**Files:** `client/src/components/page-identifier.tsx`, new PDF viewer component

**Packages to consider:** `react-pdf`, `pdfjs-dist` (already installed on server)

---

### ~~7.3 Smart Page Suggestions~~ ✅ DONE

Implemented POST /api/analyze-pdf endpoint and PageSuggestions component to show AI-detected pages with scores before extraction.

---

### 7.4 Batch File Processing

**Current:** One file at a time only.

**Suggestion:** Allow uploading multiple files (e.g., multiple equipment manuals) and:
- Process them in sequence or parallel
- Merge results into a unified register map
- Tag registers by source file

**Reason:** Industrial engineers often have multiple manuals for a system. Batch processing saves significant time.

**Files:** `client/src/pages/home.tsx`, `client/src/components/upload-zone.tsx`, `server/routes.ts`

---

### 7.5 Save/Resume Session

**Current:** Page refresh loses all work; no persistence.

**Suggestion:** 
- Auto-save extraction state to localStorage
- Show "Resume previous session?" prompt on return
- Allow saving named projects for later

**Reason:** PDF extraction is time-consuming and uses API tokens. Losing progress is frustrating and wasteful.

**Files:** `client/src/pages/home.tsx`, new storage utility

---

### ~~7.6 Processing Cancellation~~ ✅ DONE

Implemented cancel button during PDF processing that aborts the SSE stream cleanly and cleans up server-side resources.

---

## 8. UI/UX Enhancements (Low-Medium Priority)

Frontend improvements for better user experience and productivity.

### 8.1 Core UX Issues

| Issue | Suggestion | Reason | Location |
|-------|------------|--------|----------|
| No error boundary | Add React error boundary | Prevents full app crash on component errors | `client/src/App.tsx` |
| Missing loading skeletons | Add skeleton components | Better perceived performance during loading | Various components |
| No mobile optimization | Collapsible columns, swipe gestures | Many engineers use tablets in the field | Various components |

---

### 8.2 Register Table Improvements

| Issue | Suggestion | Reason | Files |
|-------|------------|--------|-------|
| No keyboard navigation | Add arrow key navigation, Enter to edit, Escape to cancel | Power users expect keyboard shortcuts | `register-table.tsx` |
| No undo/redo | Add edit history with Ctrl+Z / Ctrl+Y | Users can accidentally delete registers | `pages/home.tsx` |
| No bulk editing | Multi-select rows, bulk delete, bulk datatype change | Editing 500 registers one-by-one is tedious | `register-table.tsx` |
| No drag-and-drop reorder | Allow manual register reordering | Users may want logical grouping | `register-table.tsx` |
| No inline validation | Highlight duplicate addresses, warn about gaps | Catches errors before export | `register-table.tsx` |

**Keyboard shortcuts to add:**
- `Ctrl+S` - Download current format
- `Ctrl+Z` / `Ctrl+Y` - Undo/Redo
- Arrow keys - Navigate table cells
- `Enter` - Edit selected cell
- `Escape` - Cancel edit
- `Delete` - Remove selected rows

---

### 8.3 Register Comparison/Diff View

**Current:** Re-extraction just silently merges registers.

**Suggestion:** When re-extracting from additional pages, show a diff view:
- New registers highlighted in green
- Changed registers highlighted in yellow  
- Registers that would be overwritten with option to keep/replace

**Reason:** Users need to understand what changed. Silent merging can hide problems or duplicates.

**Files:** `client/src/pages/home.tsx`, new diff component

---

### 8.4 Confidence Indicators Per Register

**Current:** Only overall extraction confidence is shown.

**Suggestion:** Show per-register confidence from AI extraction:
- Flag uncertain fields with warning icons
- Allow sorting by confidence to review low-confidence entries first
- Show source page number for each register

**Reason:** Helps users focus review on registers most likely to have errors.

**Files:** `server/pdf-parser/llm-client.ts`, `shared/schema.ts` (add confidence field), `register-table.tsx`

---

### 8.5 Export Format Customization

**Current:** Fixed output formats with no customization.

**Suggestion:** Add export options:
- Custom CSV column order
- Include/exclude specific fields
- Custom JSON structure templates
- PLC-specific formats (Siemens, Allen-Bradley, Schneider tag formats)

**Reason:** Different PLCs and systems expect different formats. Currently users must manually transform exported files.

**Files:** `client/src/components/download-section.tsx`, `client/src/components/preview-panel.tsx`

---

## Summary

### Completed ✅
1. ~~Add rate limiting to `/api/parse-pdf-*` endpoints~~
2. ~~Add tests for `pdf-parser.ts` helper functions~~
3. ~~Add API route tests with supertest~~
4. ~~Refactor `pdf-parser.ts` into smaller modules~~
5. ~~Add response compression~~
6. ~~Implement virtual scrolling for RegisterTable~~
7. ~~Remove unused GitHub client~~
8. ~~Add SSE timeout and heartbeat~~
9. ~~Make cache limits configurable~~

### Next Priority (Medium)
1. ~~Add structured logging (replace console.log)~~ ✅ DONE
2. ~~Add multi-step wizard with progress indicator~~ ✅ DONE
3. ~~Add smart page suggestions before extraction~~ ✅ DONE
4. ~~Add processing cancellation~~ ✅ DONE
5. ~~Add validation middleware~~ ✅ DONE

### When Time Permits (Low)
1. Add OpenAPI documentation
2. Add pre-commit hooks
3. Add React error boundary
4. Add keyboard shortcuts and bulk editing
5. Add save/resume session
6. Add batch file processing
7. Add export format customization
8. Add PDF preview before extraction
