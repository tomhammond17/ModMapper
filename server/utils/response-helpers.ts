/**
 * Response helper utilities for standardizing API responses.
 *
 * Provides consistent JSON response formatting across all routes.
 */

import type { Response } from "express";

/**
 * Standard API response format
 */
interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

/**
 * Send a successful JSON response.
 *
 * @param res - Express response object
 * @param data - Response payload
 * @param status - HTTP status code (default: 200)
 *
 * @example
 * jsonSuccess(res, { users: [...] });
 * jsonSuccess(res, { id: "123" }, 201);
 */
export function jsonSuccess<T>(
  res: Response,
  data: T,
  status: number = 200
): void {
  res.status(status).json({
    success: true,
    data,
  } as ApiResponse<T>);
}

/**
 * Send an error JSON response.
 *
 * @param res - Express response object
 * @param message - Error message
 * @param status - HTTP status code (default: 400)
 *
 * @example
 * jsonError(res, "Invalid file type");
 * jsonError(res, "Not found", 404);
 * jsonError(res, "Server error", 500);
 */
export function jsonError(
  res: Response,
  message: string,
  status: number = 400
): void {
  res.status(status).json({
    success: false,
    message,
  } as ApiResponse);
}

/**
 * Send a validation error response (400).
 *
 * @param res - Express response object
 * @param message - Validation error message
 *
 * @example
 * jsonValidationError(res, "Email is required");
 */
export function jsonValidationError(res: Response, message: string): void {
  jsonError(res, message, 400);
}

/**
 * Send a not found error response (404).
 *
 * @param res - Express response object
 * @param resource - Name of the resource that wasn't found
 *
 * @example
 * jsonNotFound(res, "Document");
 */
export function jsonNotFound(res: Response, resource: string): void {
  jsonError(res, `${resource} not found`, 404);
}

/**
 * Send an unauthorized error response (401).
 *
 * @param res - Express response object
 * @param message - Optional custom message
 *
 * @example
 * jsonUnauthorized(res);
 * jsonUnauthorized(res, "Session expired");
 */
export function jsonUnauthorized(
  res: Response,
  message: string = "Unauthorized"
): void {
  jsonError(res, message, 401);
}

/**
 * Send a forbidden error response (403).
 *
 * @param res - Express response object
 * @param message - Optional custom message
 *
 * @example
 * jsonForbidden(res);
 * jsonForbidden(res, "Pro subscription required");
 */
export function jsonForbidden(
  res: Response,
  message: string = "Forbidden"
): void {
  jsonError(res, message, 403);
}

/**
 * Send a server error response (500).
 *
 * @param res - Express response object
 * @param message - Optional custom message
 *
 * @example
 * jsonServerError(res);
 * jsonServerError(res, "Database connection failed");
 */
export function jsonServerError(
  res: Response,
  message: string = "Internal server error"
): void {
  jsonError(res, message, 500);
}
