# ModMapper Code Simplification Report

Generated: 2026-01-10

## Executive Summary

After systematic evaluation using the code-simplifier plugin, the ModMapper codebase has significant opportunities for simplification:

| Category | Current Lines | Potential Savings | New Lines | Reduction |
|----------|---------------|-------------------|-----------|-----------|
| High-Priority Files (3) | 1,907 | ~530 | ~1,377 | -28% |
| Backend Services (8) | 2,561 | ~440-550 | ~2,100 | -18% |
| **Total Evaluated** | **4,468** | **~970-1,080** | **~3,477** | **-22%** |

---

## High-Priority Files

### 1. server/pdf-parser/index.ts (634 lines)

**Summary:** PDF parsing orchestrator with batch processing and LLM integration.

**Key Issues:**
| Issue | Impact | Lines Saved |
|-------|--------|-------------|
| Duplicated batch processing logic | High | ~60 |
| Duplicated page range formatting (3x) | Low | ~9 |
| Verbose progress update boilerplate | Medium | ~30 |
| Complex page filtering logic | Medium | ~5 |
| Two 200+ line functions | High | N/A (restructure) |

**Recommendations:**
1. Extract `processBatchesInParallel()` helper
2. Create `formatPageRange()` utility
3. Implement progress emitter helper
4. Define named constants for magic numbers (5, 2 thresholds)
5. Consider splitting into: `pipeline.ts`, `batch-processor.ts`, `progress.ts`

**Estimated Reduction:** 634 → ~520 lines (-18%)

---

### 2. server/routes.ts (604 lines)

**Summary:** Express API routes for file parsing, SSE streaming, and document CRUD.

**Key Issues:**
| Issue | Impact | Lines Saved |
|-------|--------|-------------|
| Duplicated SSE handler setup | High | ~30 |
| JSON response patterns (13x) | Medium | ~40-50 |
| Legacy route redirects (4x) | Medium | ~25 |
| Document storage/result creation (5x) | Medium | ~30 |
| Query string bug in redirects | Bug | Fix needed |

**Recommendations:**
1. Extract `createPdfSSEHandler()` helper
2. Create `jsonError()` and `jsonSuccess()` response helpers
3. Consolidate legacy redirects with factory function
4. Extract `storeAndBuildResult()` helper
5. Fix query string handling inconsistency

**Estimated Reduction:** 604 → ~460 lines (-24%)

---

### 3. client/src/components/pdf-viewer.tsx (669 lines)

**Summary:** Full-featured PDF viewing dialog with thumbnails, zoom, search, and page selection.

**Key Issues:**
| Issue | Impact | Lines Saved |
|-------|--------|-------------|
| Can extract `usePdfDocument` hook | High | ~60 |
| Can extract `useThumbnailRenderer` hook | High | ~70 |
| Can extract `usePdfSearch` hook | Medium | ~35 |
| Can extract `ThumbnailItem` component | Medium | ~60 |
| Can extract `PdfViewerToolbar` component | Medium | ~65 |
| Nested ternary (lines 478-492) | Low | ~5 |
| Dead `handleClose` callback | Low | 3 |

**Recommendations:**
1. Extract 3 custom hooks for PDF logic, thumbnails, and search
2. Extract `ThumbnailItem` and `PdfViewerToolbar` sub-components
3. Replace nested ternary with helper function
4. Remove unused `handleClose` callback

**Estimated Reduction:** 669 → ~200-250 lines (-65%) - HIGHEST IMPACT

---

## Backend Services Analysis

### Cross-Service Patterns (8 files, 2,561 lines total)

**Pattern 1: Database Availability Guard (~18 occurrences)**
```typescript
// Current (repeated ~18 times)
if (!isDatabaseAvailable()) {
  throw new Error('Database not available');
}
const db = getDb();
```

**Suggested Utility:**
```typescript
// server/utils/db-helpers.ts
export function requireDb() {
  if (!isDatabaseAvailable()) throw new Error('Database not available');
  return getDb();
}
```
**Savings:** ~35-40 lines

---

**Pattern 2: Error Logging Wrapper (~24 occurrences)**
```typescript
// Current
try { /* operation */ }
catch (error) {
  log.error('Failed to X', { error, userId });
  throw error;
}
```

**Suggested Utility:**
```typescript
export async function withErrorLogging<T>(
  log: Logger, operation: string, context: Record<string, any>, fn: () => Promise<T>
): Promise<T> {
  return fn().catch(error => { log.error(`Failed to ${operation}`, { error, ...context }); throw error; });
}
```
**Savings:** ~50-60 lines

---

**Pattern 3: Row-to-Entity Mapping (~13 occurrences)**

Each service has repeated inline mapping from DB rows. Extract to single functions:
- `mapToTemplate()` - 5 occurrences in templates.ts
- `mapToFolder()` - 4 occurrences in folders.ts
- `mapToUser()` - 4 occurrences in auth.ts

**Savings:** ~40-50 lines

---

### Individual Service Analysis

| Service | Lines | Top Issues | Savings |
|---------|-------|------------|---------|
| **templates.ts** | 467 | Row mapping (5x), DB guard (6x), field validation loops | ~50-60 |
| **folders.ts** | 418 | Row mapping (4x), DB guard (8x), path query pattern | ~50-60 |
| **versions.ts** | 336 | DB guard (5x), version family query (3x), any types | ~40-50 |
| **subscription.ts** | 324 | DB guard (7x), mapping (2x), 6 similar update functions | ~80-100 |
| **usage.ts** | 285 | DB guard (3x), limit-checking duplication | ~50-70 |
| **email.ts** | 268 | HTML template duplication (3x), transporter guards | ~90-110 |
| **auth.ts** | 234 | User mapping (4x), redundant getById/getByEmail | ~40-50 |
| **stripe.ts** | 229 | Mock fallback pattern (4x), lazy init checks | ~30-40 |

**Total Service Savings:** ~440-550 lines

---

## Priority Refactoring Backlog

### Tier 1: High Impact, Low Risk
1. **Create `server/utils/service-helpers.ts`**
   - `requireDb()` - eliminate 18 guard patterns
   - `withErrorLogging()` - standardize error handling
   - **Est. effort:** 1 hour | **Impact:** 85-100 lines

2. **Refactor `pdf-viewer.tsx`**
   - Extract 3 custom hooks
   - Extract 2 sub-components
   - **Est. effort:** 2-3 hours | **Impact:** 400+ lines (65% reduction)

3. **Create response helpers for routes.ts**
   - `jsonError()`, `jsonSuccess()`
   - **Est. effort:** 30 min | **Impact:** 40-50 lines

### Tier 2: Medium Impact, Low Risk
4. **Extract row mapping functions in services**
   - templates.ts, folders.ts, auth.ts
   - **Est. effort:** 1 hour | **Impact:** 40-50 lines

5. **Consolidate SSE handler in routes.ts**
   - Extract `createPdfSSEHandler()`
   - **Est. effort:** 30 min | **Impact:** 30 lines

6. **Refactor email.ts template system**
   - Extract shared styles
   - Create template factory
   - **Est. effort:** 1-2 hours | **Impact:** 90-110 lines

### Tier 3: Medium Impact, Medium Risk
7. **Refactor pdf-parser/index.ts**
   - Extract batch processing logic
   - Split file if >500 lines remains
   - **Est. effort:** 2 hours | **Impact:** 115 lines

8. **Consolidate subscription.ts update functions**
   - Create generic update builder
   - **Est. effort:** 1 hour | **Impact:** 50-60 lines

### Tier 4: Low Priority
9. Fix legacy route query string handling (bug fix)
10. Replace `any` types in versions.ts
11. Standardize null handling (`||` vs `??`)

---

## Proposed New Files

```
server/utils/
├── service-helpers.ts    # requireDb(), withErrorLogging()
├── response-helpers.ts   # jsonError(), jsonSuccess()
├── query-helpers.ts      # ownershipCondition()
└── format-helpers.ts     # formatPageRange()

client/src/hooks/
├── use-pdf-document.ts   # PDF loading and cleanup
├── use-thumbnails.ts     # Thumbnail rendering
└── use-pdf-search.ts     # PDF text search

client/src/components/pdf-viewer/
├── index.tsx             # Main PdfViewer (slimmed)
├── ThumbnailItem.tsx     # Individual thumbnail
├── PdfViewerToolbar.tsx  # Navigation controls
└── SelectionFooter.tsx   # Selection summary
```

---

## Verification Plan

After each refactoring:
1. Run `npm test -- --run` - all 356 tests must pass
2. Run `npm run check` - TypeScript must compile
3. Run `npm run dev` - verify application works
4. Manual testing of affected features

---

## Summary

The ModMapper codebase is moderately well-organized but has clear opportunities for simplification:

- **Highest impact:** `pdf-viewer.tsx` (65% reduction possible)
- **Cross-cutting wins:** Service helper utilities (100+ lines across all services)
- **Bug found:** Query string handling in legacy redirects

**Recommended approach:** Start with Tier 1 items (service helpers, pdf-viewer refactor) for maximum impact with minimal risk.
