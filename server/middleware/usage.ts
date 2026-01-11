import type { Request, Response, NextFunction } from 'express';
import { checkUsageLimits, trackConversion } from '../services/usage';
import { createLogger } from '../logger';

const log = createLogger('usage-middleware');

/**
 * Middleware to check usage limits before conversion
 * Must be used after requireAuth and loadSubscription
 */
export function checkUsageLimitsMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Skip if no user (let auth middleware handle it)
  if (!req.user) {
    next();
    return;
  }

  // Get source format from request
  const sourceFormat = getSourceFormat(req);
  const tier = req.subscription?.tier || 'free';

  checkUsageLimits(req.user.id, tier, sourceFormat)
    .then((result) => {
      if (!result.allowed) {
        log.info('Usage limit exceeded', {
          userId: req.user!.id,
          tier,
          sourceFormat,
          reason: result.reason,
        });

        res.status(429).json({
          success: false,
          error: 'USAGE_LIMIT_EXCEEDED',
          message: result.reason,
          usage: result.usage,
        });
        return;
      }

      // Store source format for tracking after success
      (req as any).sourceFormat = sourceFormat;
      next();
    })
    .catch((error) => {
      log.error('Failed to check usage limits', { error, userId: req.user!.id });
      // Allow on error to prevent blocking users
      next();
    });
}

/**
 * Middleware to track usage after successful conversion
 * Wraps res.json to capture successful responses
 */
export function trackUsageAfterSuccess(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Skip if no user
  if (!req.user) {
    next();
    return;
  }

  const originalJson = res.json.bind(res);

  res.json = function (body: any): Response {
    // Only track successful conversions
    if (res.statusCode >= 200 && res.statusCode < 300 && body?.success !== false) {
      const sourceFormat = (req as any).sourceFormat || getSourceFormat(req);
      const targetFormat = getTargetFormat(req, body);
      const tokensUsed = body?.tokensUsed || body?.usage?.totalTokens || 0;

      trackConversion(req.user!.id, sourceFormat, targetFormat, tokensUsed)
        .catch((error) => {
          log.error('Failed to track conversion', { error, userId: req.user!.id });
        });
    }

    return originalJson(body);
  };

  next();
}

/**
 * Combined middleware for checking limits and tracking usage
 */
export function usageMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // First set up tracking
  trackUsageAfterSuccess(req, res, () => {
    // Then check limits
    checkUsageLimitsMiddleware(req, res, next);
  });
}

/**
 * Extract source format from request
 */
function getSourceFormat(req: Request): string {
  // Check file extension
  if (req.file?.originalname) {
    const ext = req.file.originalname.split('.').pop()?.toLowerCase();
    if (ext) return ext;
  }

  // Check explicit format in body
  if (req.body?.format) {
    return req.body.format.toLowerCase();
  }

  // Check content type
  const contentType = req.headers['content-type'];
  if (contentType?.includes('pdf')) return 'pdf';
  if (contentType?.includes('json')) return 'json';
  if (contentType?.includes('xml')) return 'xml';
  if (contentType?.includes('csv')) return 'csv';

  // Check URL path for format hints
  if (req.path.includes('pdf')) return 'pdf';

  return 'unknown';
}

/**
 * Extract target format from request or response
 */
function getTargetFormat(req: Request, body: any): string {
  // Check explicit format in body
  if (req.body?.targetFormat) {
    return req.body.targetFormat.toLowerCase();
  }

  // Check query parameter
  if (req.query?.format) {
    return String(req.query.format).toLowerCase();
  }

  // Infer from response content
  if (body?.document?.format) {
    return body.document.format.toLowerCase();
  }

  return 'json'; // Default target format
}
