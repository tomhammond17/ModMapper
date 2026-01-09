/**
 * API client configuration and endpoints
 */

const API_VERSION = "v1";
const API_BASE = `/api/${API_VERSION}`;

/**
 * Centralized API endpoints with versioning
 * All API calls should use these constants for easy version management
 */
export const apiEndpoints = {
  parse: `${API_BASE}/parse`,
  parsePdfStream: `${API_BASE}/parse-pdf-stream`,
  parsePdfWithHints: `${API_BASE}/parse-pdf-with-hints`,
  analyzePdf: `${API_BASE}/analyze-pdf`,
  documents: `${API_BASE}/documents`,
  document: (id: string) => `${API_BASE}/documents/${id}`,
  health: `${API_BASE}/health`,
} as const;

/**
 * Legacy API endpoints (deprecated, for backward compatibility)
 * @deprecated Use apiEndpoints instead
 */
export const legacyApiEndpoints = {
  parse: "/api/parse",
  parsePdfStream: "/api/parse-pdf-stream",
  parsePdfWithHints: "/api/parse-pdf-with-hints",
  analyzePdf: "/api/analyze-pdf",
  documents: "/api/documents",
  document: (id: string) => `/api/documents/${id}`,
  health: "/api/health",
} as const;
