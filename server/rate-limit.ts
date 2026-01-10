import rateLimit from "express-rate-limit";

/**
 * Rate limiting configuration for API endpoints.
 * Different limits for different endpoint types based on their cost/resource usage.
 */

// General API rate limit - 100 requests per 15 minutes per IP
export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: {
    success: false,
    message: "Too many requests. Please try again later.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Strict rate limit for PDF parsing endpoints (expensive Claude API calls)
// 10 requests per 15 minutes per IP
export const pdfParseLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  message: {
    success: false,
    message: "Too many PDF parsing requests. Please wait before trying again.",
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Use default IP-based key generator (handles IPv6 properly)
});

// Standard file parsing (CSV, JSON, XML) - more lenient than PDF
// 30 requests per 15 minutes per IP
export const fileParseLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30,
  message: {
    success: false,
    message: "Too many file parsing requests. Please wait before trying again.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Document operations (list, get, delete) - fairly lenient
// 200 requests per 15 minutes per IP
export const documentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  message: {
    success: false,
    message: "Too many requests. Please try again later.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

