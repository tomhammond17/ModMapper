# Agent 2: Usage Tracking & Tier Enforcement

## Mission
Implement usage tracking for conversions and AI tokens. Enforce Free tier limits (10 conversions/month, 200K tokens). Block operations when limits exceeded with upgrade prompts.

## Branch
```bash
git checkout -b feature/usage-tracking develop
```

## Dependencies
- Agent 1 (Stripe Integration) must be merged to develop first
- Subscription service must exist in `server/services/subscription.ts`

---

## Tasks

### 1. Create Usage Service (`server/services/usage.ts`)

Create a new file with these functions:

```typescript
import { and, eq, sql } from 'drizzle-orm';
import { getDb } from '../db';
import { usageTrackingTable, conversionLogsTable, TIER_LIMITS } from '@shared/schema';

// Get current month's usage for user
export async function getMonthlyUsage(userId: string): Promise<UsageTracking> {
  const month = new Date().toISOString().slice(0, 7); // "YYYY-MM"
  const db = getDb();

  let [usage] = await db
    .select()
    .from(usageTrackingTable)
    .where(and(
      eq(usageTrackingTable.userId, userId),
      eq(usageTrackingTable.month, month)
    ))
    .limit(1);

  if (!usage) {
    // Create new record for this month
    [usage] = await db
      .insert(usageTrackingTable)
      .values({
        userId,
        month,
        conversionsUsed: 0,
        tokensUsed: 0,
      })
      .returning();
  }

  return usage;
}

// Check if user has exceeded limits
export async function checkUsageLimits(
  userId: string,
  tier: 'free' | 'pro',
  sourceFormat: string
): Promise<{ allowed: boolean; reason?: string; usage?: object }>

// Track a conversion
export async function trackConversion(
  userId: string,
  sourceFormat: string,
  targetFormat: string,
  tokensUsed?: number
): Promise<void>

// Increment usage counters
async function incrementUsage(
  userId: string,
  conversions: number,
  tokens: number
): Promise<void>
```

**Implementation Details:**

```typescript
export async function checkUsageLimits(
  userId: string,
  tier: 'free' | 'pro',
  sourceFormat: string
): Promise<{ allowed: boolean; reason?: string; usage?: object }> {
  const limits = TIER_LIMITS[tier];
  const usage = await getMonthlyUsage(userId);

  // For non-PDF conversions
  if (sourceFormat !== 'pdf') {
    if (limits.conversionsPerMonth !== Infinity &&
        usage.conversionsUsed >= limits.conversionsPerMonth) {
      return {
        allowed: false,
        reason: `Free tier limit of ${limits.conversionsPerMonth} conversions/month reached. Upgrade to Pro for unlimited conversions.`,
        usage: {
          conversions: { used: usage.conversionsUsed, limit: limits.conversionsPerMonth },
          tokens: { used: usage.tokensUsed, limit: limits.tokensPerMonth }
        }
      };
    }
  }

  // For PDF conversions (token-based)
  if (sourceFormat === 'pdf') {
    if (limits.tokensPerMonth !== Infinity &&
        usage.tokensUsed >= limits.tokensPerMonth) {
      return {
        allowed: false,
        reason: `Free tier limit of ${limits.tokensPerMonth.toLocaleString()} AI tokens/month reached. Upgrade to Pro for 1M tokens/month.`,
        usage: {
          conversions: { used: usage.conversionsUsed, limit: limits.conversionsPerMonth },
          tokens: { used: usage.tokensUsed, limit: limits.tokensPerMonth }
        }
      };
    }
  }

  return { allowed: true };
}

export async function trackConversion(
  userId: string,
  sourceFormat: string,
  targetFormat: string,
  tokensUsed: number = 0
): Promise<void> {
  const db = getDb();

  // Log individual conversion
  await db.insert(conversionLogsTable).values({
    userId,
    sourceFormat,
    targetFormat,
    tokensUsed: tokensUsed > 0 ? tokensUsed : null,
  });

  // Update monthly aggregates
  const isNonPdfConversion = sourceFormat !== 'pdf';
  const conversionsToAdd = isNonPdfConversion ? 1 : 0;

  if (conversionsToAdd > 0 || tokensUsed > 0) {
    await incrementUsage(userId, conversionsToAdd, tokensUsed);
  }
}
```

### 2. Create Usage Middleware (`server/middleware/usage.ts`)

Create a new file:

```typescript
import { Request, Response, NextFunction } from 'express';
import { checkUsageLimits as checkLimits, trackConversion } from '../services/usage';
import { log } from '../logger';

// Check limits BEFORE conversion
export async function checkUsageLimits(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  // Skip if not authenticated (backward compatibility for anonymous users)
  if (!req.user || !req.subscription) {
    return next();
  }

  // Determine source format from request
  const sourceFormat = getSourceFormat(req);
  const tier = req.subscription.tier;

  const { allowed, reason, usage } = await checkLimits(req.user.id, tier, sourceFormat);

  if (!allowed) {
    res.status(402).json({
      success: false,
      error: 'USAGE_LIMIT_EXCEEDED',
      message: reason,
      upgradeUrl: tier === 'free' ? '/pricing' : null,
      usage,
    });
    return;
  }

  next();
}

// Track usage AFTER successful conversion
export function trackUsageAfterSuccess(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (!req.user) {
    return next();
  }

  // Intercept res.json to track on success
  const originalJson = res.json.bind(res);
  res.json = function(data: any) {
    if (res.statusCode === 200 && data.success) {
      const sourceFormat = getSourceFormat(req);
      const targetFormat = req.body.targetFormat || 'json';
      const tokensUsed = data.metadata?.tokensUsed || 0;

      trackConversion(req.user!.id, sourceFormat, targetFormat, tokensUsed)
        .catch(err => log.error('Failed to track conversion', { error: err }));
    }
    return originalJson(data);
  };

  next();
}

function getSourceFormat(req: Request): string {
  // Check file mimetype
  if (req.file) {
    if (req.file.mimetype === 'application/pdf') return 'pdf';
    if (req.file.mimetype === 'text/csv') return 'csv';
    if (req.file.mimetype === 'application/json') return 'json';
    if (req.file.mimetype === 'application/xml' || req.file.mimetype === 'text/xml') return 'xml';
  }

  // Fallback to body format or filename extension
  return req.body.format || 'csv';
}
```

### 3. Update Parse Routes (`server/routes.ts`)

Add usage middleware to conversion endpoints:

```typescript
import { optionalAuth, loadSubscription } from './middleware/auth';
import { checkUsageLimits, trackUsageAfterSuccess } from './middleware/usage';

// Apply to parse endpoint
app.post("/api/v1/parse",
  optionalAuth,           // Attach user if logged in
  loadSubscription,       // Load subscription if authenticated
  checkUsageLimits,       // Check limits before processing
  trackUsageAfterSuccess, // Track after success
  parseFileLimiter,
  upload.single("file"),
  async (req, res) => {
    // Existing parse logic
  }
);

// Apply to PDF endpoints
app.post("/api/v1/parse-pdf-stream",
  optionalAuth,
  loadSubscription,
  checkUsageLimits,
  trackUsageAfterSuccess,
  parsePDFLimiter,
  upload.single("file"),
  async (req, res) => {
    // Existing logic
  }
);

app.post("/api/v1/parse-pdf-with-hints",
  optionalAuth,
  loadSubscription,
  checkUsageLimits,
  trackUsageAfterSuccess,
  parsePDFLimiter,
  upload.single("file"),
  async (req, res) => {
    // Existing logic
  }
);
```

### 4. Add Usage Endpoint to Billing Routes

Update `server/routes/billing.ts`:

```typescript
import { getMonthlyUsage } from '../services/usage';
import { TIER_LIMITS } from '@shared/schema';

// GET /api/v1/billing/usage
router.get('/usage', requireAuth, loadSubscription, async (req, res) => {
  try {
    const userId = req.user!.id;
    const tier = req.subscription?.tier || 'free';
    const limits = TIER_LIMITS[tier];
    const usage = await getMonthlyUsage(userId);

    const currentPeriodEnd = req.subscription?.currentPeriodEnd ||
      new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1);

    res.json({
      success: true,
      tier,
      usage: {
        conversions: {
          used: usage.conversionsUsed,
          limit: limits.conversionsPerMonth === Infinity ? null : limits.conversionsPerMonth,
          unlimited: limits.conversionsPerMonth === Infinity,
        },
        tokens: {
          used: usage.tokensUsed,
          limit: limits.tokensPerMonth === Infinity ? null : limits.tokensPerMonth,
          unlimited: limits.tokensPerMonth === Infinity,
        },
      },
      periodEnd: currentPeriodEnd.toISOString(),
    });
  } catch (error) {
    log.error('Failed to fetch usage', { error });
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: 'Failed to fetch usage data',
    });
  }
});
```

---

## Testing Checklist

- [ ] Server starts without errors
- [ ] GET `/api/v1/billing/usage` returns usage stats
- [ ] Free user at 0 conversions can parse files
- [ ] Free user at 10 conversions gets 402 error
- [ ] Pro user has unlimited conversions
- [ ] Token usage tracked for PDF conversions
- [ ] Conversion logs created in database
- [ ] Anonymous users can still convert (no limits enforced)

## Test Scenarios

1. **Fresh Free User:**
   - Create account → usage shows 0/10 conversions, 0/200K tokens
   - Convert CSV → usage shows 1/10 conversions
   - Convert 9 more → blocked on 11th attempt

2. **Free User PDF Conversion:**
   - Convert PDF → tokens increment
   - Exceed 200K tokens → blocked

3. **Pro User:**
   - Upgrade subscription
   - Convert unlimited times
   - Token limit at 1M

---

## Files Created/Modified

| File | Action |
|------|--------|
| `server/services/usage.ts` | Create |
| `server/middleware/usage.ts` | Create |
| `server/routes.ts` | Modify (add middleware) |
| `server/routes/billing.ts` | Modify (add usage endpoint) |

## Completion Criteria

1. Usage tracking works for authenticated users
2. Free tier limits enforced with clear error messages
3. Pro tier has higher/unlimited limits
4. Usage endpoint returns accurate data
5. Existing anonymous conversion still works

---

## Commit Message Template
```
feat(usage): implement usage tracking and tier enforcement

- Add usage service for tracking conversions and tokens
- Add usage middleware for limit checking
- Apply middleware to parse endpoints
- Add usage dashboard endpoint
- Enforce Free tier limits (10 conversions, 200K tokens)

Co-Authored-By: Claude <noreply@anthropic.com>
```
