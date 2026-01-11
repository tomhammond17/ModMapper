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
  // Parsing
  parse: `${API_BASE}/parse`,
  parsePdfStream: `${API_BASE}/parse-pdf-stream`,
  parsePdfWithHints: `${API_BASE}/parse-pdf-with-hints`,
  analyzePdf: `${API_BASE}/analyze-pdf`,

  // Documents
  documents: `${API_BASE}/documents`,
  document: (id: string) => `${API_BASE}/documents/${id}`,
  documentVersions: (id: string) => `${API_BASE}/documents/${id}/versions`,

  // Auth
  auth: {
    signup: `${API_BASE}/auth/signup`,
    login: `${API_BASE}/auth/login`,
    logout: `${API_BASE}/auth/logout`,
    magicLink: `${API_BASE}/auth/magic-link`,
    me: `${API_BASE}/auth/me`,
  },

  // Billing
  billing: {
    checkout: `${API_BASE}/billing/checkout`,
    portal: `${API_BASE}/billing/portal`,
    status: `${API_BASE}/billing/status`,
    usage: `${API_BASE}/billing/usage`,
  },

  // Folders
  folders: `${API_BASE}/folders`,
  folder: (id: string) => `${API_BASE}/folders/${id}`,

  // Templates
  templates: `${API_BASE}/templates`,
  template: (id: string) => `${API_BASE}/templates/${id}`,

  // Misc
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
