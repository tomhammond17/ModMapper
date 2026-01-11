# ModMapper - Remaining Premium Features Implementation

This document outlines all remaining tasks for implementing premium features in ModMapper. Phases 1 and 2 are complete. This covers Phases 3-9.

---

## Agentic Implementation Plan

**An 8-agent implementation plan has been created to execute Phases 3-9.**

### Quick Reference
- **Plan File:** `.claude/plans/atomic-honking-sonnet.md`
- **Agent Prompts:** `.claude/agents/agent-01-stripe.md` through `agent-08-testing.md`

### Current Progress
| Agent | Phase | Status | Branch |
|-------|-------|--------|--------|
| 1 | Stripe Integration | **COMPLETE** | `feature/stripe-integration` |
| 2 | Usage Tracking | **COMPLETE** | `feature/usage-tracking` |
| 3 | Document Storage | **COMPLETE** | `feature/document-storage` |
| 4 | Version Control | **COMPLETE** | `feature/version-control` |
| 5 | Export Templates | **COMPLETE** | `feature/export-templates` |
| 6 | Frontend Auth UI | **COMPLETE** | `develop` |
| 7 | Frontend Features | **COMPLETE** | `develop` |
| 8 | Testing | **COMPLETE** | `develop` |

---

**Status:** 8 of 8 agents complete (100% done) - All phases implemented

---

## Phase 3: Stripe Integration & Subscription Management

**Status:** COMPLETE
**Implemented in:** `server/services/stripe.ts`, `server/services/billing.ts`, `server/routes/billing.ts`
**Dependencies:** Phase 2 (Authentication)
**Complexity:** High

### Overview
Integrate Stripe for payment processing and subscription management. Handle Pro tier upgrades, downgrades, and payment webhooks.

### Tasks

#### 3.1 Install Stripe Dependencies
```bash
npm install stripe
npm install -D @types/stripe
```

#### 3.2 Create Stripe Service (`server/services/stripe.ts`)

**Purpose:** Centralize all Stripe API interactions

**Key Functions:**
```typescript
// Initialize Stripe client
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16',
});

// Create or retrieve Stripe customer for user
export async function getOrCreateStripeCustomer(userId: string, email: string): Promise<string>

// Create Stripe Checkout Session for Pro subscription
export async function createCheckoutSession(
  userId: string,
  email: string,
  priceId: string,
  successUrl: string,
  cancelUrl: string
): Promise<string>

// Create Stripe Customer Portal session
export async function createPortalSession(
  customerId: string,
  returnUrl: string
): Promise<string>

// Verify Stripe webhook signature
export function verifyWebhookSignature(
  payload: string | Buffer,
  signature: string,
  secret: string
): Stripe.Event
```

**Implementation Notes:**
- Store Stripe customer ID in `subscriptionsTable.stripeCustomerId`
- Use `stripe.customers.create()` if customer doesn't exist
- Use `stripe.checkout.sessions.create()` for payment flow
- Use `stripe.billingPortal.sessions.create()` for customer portal

#### 3.3 Create Subscription Service (`server/services/subscription.ts`)

**Purpose:** Manage subscription state in database

**Key Functions:**
```typescript
// Get user's current subscription
export async function getSubscription(userId: string): Promise<Subscription | null>

// Upgrade user to Pro tier
export async function upgradeSubscription(
  userId: string,
  stripeSubscriptionId: string,
  currentPeriodStart: Date,
  currentPeriodEnd: Date
): Promise<void>

// Downgrade user to Free tier (at end of period)
export async function scheduleDowngrade(userId: string): Promise<void>

// Immediately downgrade to Free (subscription canceled/failed)
export async function immediateDowngrade(userId: string): Promise<void>

// Update subscription status
export async function updateSubscriptionStatus(
  userId: string,
  status: SubscriptionStatus
): Promise<void>
```

**Implementation Notes:**
- Always wrap in transactions where multiple updates occur
- Use `eq()` from drizzle-orm for queries
- Update `subscriptionsTable` with Stripe data
- Set `cancelAtPeriodEnd: true` for scheduled downgrades

#### 3.4 Create Billing Routes (`server/routes/billing.ts`)

**Endpoints:**

```typescript
// POST /api/v1/billing/checkout
// Create Stripe checkout session for Pro subscription
// Protected: requireAuth + loadSubscription
app.post("/api/v1/billing/checkout", requireAuth, loadSubscription, async (req, res) => {
  // 1. Verify user is on Free tier (don't allow if already Pro)
  // 2. Create/get Stripe customer
  // 3. Create checkout session with STRIPE_PRO_PRICE_ID
  // 4. Return { success: true, checkoutUrl }
})

// POST /api/v1/billing/webhook
// Handle Stripe webhook events (NOT AUTHENTICATED - uses signature)
app.post("/api/v1/billing/webhook",
  express.raw({ type: 'application/json' }), // Use raw body for signature
  async (req, res) => {
    // 1. Verify webhook signature
    // 2. Handle events (see webhook events section below)
    // 3. Return 200 immediately (don't make Stripe wait)
  }
)

// POST /api/v1/billing/portal
// Create Stripe Customer Portal session
// Protected: requireAuth + loadSubscription + requirePro
app.post("/api/v1/billing/portal", requireAuth, loadSubscription, requirePro, async (req, res) => {
  // 1. Get Stripe customer ID from subscription
  // 2. Create portal session
  // 3. Return { success: true, portalUrl }
})

// GET /api/v1/billing/usage
// Get current month's usage stats
// Protected: requireAuth + loadSubscription
app.get("/api/v1/billing/usage", requireAuth, loadSubscription, async (req, res) => {
  // This will be implemented in Phase 4
  // For now, return placeholder: { tier, conversions, tokens }
})
```

**Webhook Events to Handle:**

```typescript
switch (event.type) {
  case 'checkout.session.completed':
    // User completed payment
    // 1. Get user ID from metadata
    // 2. Get subscription ID from session
    // 3. Call upgradeSubscription()
    break;

  case 'customer.subscription.updated':
    // Subscription changed (renewed, plan changed)
    // 1. Get user from customer ID
    // 2. Update current period dates
    // 3. Update status if changed
    break;

  case 'customer.subscription.deleted':
    // Subscription canceled by customer
    // 1. Get user from customer ID
    // 2. Call immediateDowngrade()
    break;

  case 'invoice.payment_failed':
    // Payment failed (card declined, etc)
    // 1. Get user from customer ID
    // 2. Set status to 'past_due'
    // 3. Send email notification (optional)
    break;

  case 'invoice.payment_succeeded':
    // Payment succeeded (renewal)
    // 1. Get user from customer ID
    // 2. Ensure status is 'active'
    // 3. Update current period dates
    break;
}
```

#### 3.5 Stripe Dashboard Setup

**Manual Steps:**

1. **Create Product:**
   - Go to: https://dashboard.stripe.com/products
   - Click "Add product"
   - Name: "ModMapper Pro"
   - Description: "Unlimited conversions, document storage, folders, version control, and custom export templates"
   - Pricing model: Recurring
   - Price: $9.99 USD / month (or your chosen price)
   - Save and copy the Price ID (starts with `price_`)
   - Add to `.env` as `STRIPE_PRO_PRICE_ID=price_xxx`

2. **Create Webhook Endpoint:**
   - Go to: https://dashboard.stripe.com/webhooks
   - Click "Add endpoint"
   - Endpoint URL: `https://yourdomain.com/api/v1/billing/webhook`
   - Events to listen to:
     - `checkout.session.completed`
     - `customer.subscription.updated`
     - `customer.subscription.deleted`
     - `invoice.payment_failed`
     - `invoice.payment_succeeded`
   - Save and copy the Signing Secret (starts with `whsec_`)
   - Add to `.env` as `STRIPE_WEBHOOK_SECRET=whsec_xxx`

3. **Get API Keys:**
   - Go to: https://dashboard.stripe.com/apikeys
   - For development: Copy "Test mode" secret key (starts with `sk_test_`)
   - For production: Copy "Live mode" secret key (starts with `sk_live_`)
   - Add to `.env` as `STRIPE_SECRET_KEY=sk_xxx`

#### 3.6 Testing Checklist

- [ ] Checkout flow creates Stripe customer
- [ ] Checkout flow upgrades subscription to Pro
- [ ] Webhook correctly processes checkout.session.completed
- [ ] Webhook correctly processes subscription updates
- [ ] Webhook correctly processes subscription cancellation
- [ ] Customer portal allows subscription management
- [ ] Payment failure sets status to past_due
- [ ] Payment success activates subscription
- [ ] Use Stripe test cards: 4242 4242 4242 4242 (success), 4000 0000 0000 0002 (decline)

---

## Phase 4: Usage Tracking & Tier Enforcement

**Status:** COMPLETE
**Implemented in:** `server/services/usage.ts`, `server/middleware/usage.ts`, `shared/schema.ts` (usage tables)
**Dependencies:** Phase 3 (Subscription Management)
**Complexity:** Medium

### Overview
Track user conversions and AI tokens per month. Enforce Free tier limits (10 conversions, 200K tokens). Block conversions when limits reached. Display usage stats to users.

### Tasks

#### 4.1 Create Usage Service (`server/services/usage.ts`)

**Purpose:** Track and retrieve usage data

**Key Functions:**
```typescript
// Get current month's usage for user
export async function getMonthlyUsage(userId: string): Promise<UsageTracking>

// Track a conversion (CSV/JSON/XML)
export async function trackConversion(
  userId: string,
  sourceFormat: string,
  targetFormat: string,
  tokensUsed: number = 0
): Promise<void>

// Increment usage counters
async function incrementUsage(
  userId: string,
  conversions: number,
  tokens: number
): Promise<void>

// Check if user has exceeded limits
export async function checkUsageLimits(
  userId: string,
  tier: SubscriptionTier,
  sourceFormat: string
): Promise<{ allowed: boolean; reason?: string }>

// Reset monthly usage (for cron job - future)
export async function resetMonthlyUsage(month: string): Promise<void>
```

**Implementation Details:**

```typescript
// Get or create usage record for current month
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

// Check limits based on tier
export async function checkUsageLimits(
  userId: string,
  tier: SubscriptionTier,
  sourceFormat: string
): Promise<{ allowed: boolean; reason?: string }> {
  const limits = TIER_LIMITS[tier];
  const usage = await getMonthlyUsage(userId);

  // For CSV/JSON/XML conversions (non-PDF)
  if (sourceFormat !== 'pdf') {
    if (limits.conversionsPerMonth !== Infinity &&
        usage.conversionsUsed >= limits.conversionsPerMonth) {
      return {
        allowed: false,
        reason: `Free tier limit of ${limits.conversionsPerMonth} conversions/month reached. Upgrade to Pro for unlimited conversions.`
      };
    }
  }

  // For PDF conversions (token-based)
  if (sourceFormat === 'pdf') {
    if (limits.tokensPerMonth !== Infinity &&
        usage.tokensUsed >= limits.tokensPerMonth) {
      return {
        allowed: false,
        reason: `Free tier limit of ${limits.tokensPerMonth.toLocaleString()} AI tokens/month reached. Upgrade to Pro for 1M tokens/month.`
      };
    }
  }

  return { allowed: true };
}

// Track conversion and log it
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
  const tokensToAdd = tokensUsed;

  if (conversionsToAdd > 0 || tokensToAdd > 0) {
    await incrementUsage(userId, conversionsToAdd, tokensToAdd);
  }
}
```

#### 4.2 Create Usage Middleware (`server/middleware/usage.ts`)

**Purpose:** Check limits before conversion, track after success

**Key Middleware:**

```typescript
// Check if user can perform conversion (BEFORE processing)
export async function checkUsageLimits(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!req.user || !req.subscription) {
    // If not authenticated, allow (for backward compatibility)
    return next();
  }

  const sourceFormat = req.body.format || req.file?.mimetype;
  const tier = req.subscription.tier;

  const { allowed, reason } = await checkLimits(req.user.id, tier, sourceFormat);

  if (!allowed) {
    return res.status(402).json({
      success: false,
      error: 'USAGE_LIMIT_EXCEEDED',
      message: reason,
      upgradeUrl: tier === 'free' ? '/pricing' : null,
    });
  }

  next();
}

// Track usage after successful conversion (AFTER processing)
export function trackUsageAfterSuccess(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (!req.user) {
    return next();
  }

  // Intercept res.json to track usage on success
  const originalJson = res.json.bind(res);
  res.json = function(data: any) {
    // Only track if status is 200 and conversion succeeded
    if (res.statusCode === 200 && data.success) {
      const sourceFormat = req.body.format || 'csv';
      const targetFormat = req.body.targetFormat;
      const tokensUsed = data.metadata?.tokensUsed || 0;

      // Track asynchronously (don't wait for it)
      trackConversion(req.user!.id, sourceFormat, targetFormat, tokensUsed)
        .catch(err => log.error('Failed to track conversion', { error: err }));
    }

    return originalJson(data);
  };

  next();
}
```

#### 4.3 Update Parse Routes

**Update `server/routes.ts`:**

Add middleware to conversion endpoints:

```typescript
import { requireAuth, optionalAuth, loadSubscription } from './middleware/auth';
import { checkUsageLimits, trackUsageAfterSuccess } from './middleware/usage';

// Apply to all parse endpoints
app.post("/api/v1/parse",
  optionalAuth,           // Attach user if logged in
  loadSubscription,       // Load subscription if authenticated
  checkUsageLimits,       // Check limits
  trackUsageAfterSuccess, // Track after success
  parseFileLimiter,
  upload.single("file"),
  async (req, res) => {
    // Existing parse logic
  }
);

app.post("/api/v1/parse-pdf-stream",
  optionalAuth,
  loadSubscription,
  checkUsageLimits,
  trackUsageAfterSuccess,
  parsePDFLimiter,
  upload.single("file"),
  async (req, res) => {
    // Existing PDF parse logic
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
    // Existing PDF hints logic
  }
);
```

#### 4.4 Implement Usage Dashboard Endpoint

**Update `server/routes/billing.ts`:**

```typescript
app.get("/api/v1/billing/usage", requireAuth, loadSubscription, async (req, res) => {
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

#### 4.5 Error Response Format

When limits are exceeded, return:

```json
{
  "success": false,
  "error": "USAGE_LIMIT_EXCEEDED",
  "message": "Free tier limit of 10 conversions/month reached. Upgrade to Pro for unlimited conversions.",
  "upgradeUrl": "/pricing",
  "usage": {
    "conversions": { "used": 10, "limit": 10 },
    "tokens": { "used": 150000, "limit": 200000 }
  }
}
```

#### 4.6 Testing Checklist

- [ ] Free tier user blocked at 10 conversions
- [ ] Free tier user blocked at 200K tokens (PDF)
- [ ] Pro tier user has unlimited conversions
- [ ] Pro tier user blocked at 1M tokens (PDF)
- [ ] Usage stats accurate in `/billing/usage` endpoint
- [ ] Conversion logs created for each conversion
- [ ] Monthly usage resets on first of month (manual test)

---

## Phase 5: Document Storage with Folders

**Status:** COMPLETE
**Implemented in:** `server/services/folders.ts`, `server/storage.ts`, `server/routes/folders.ts`, `shared/schema.ts` (folders table)
**Dependencies:** Phase 4 (Usage Tracking)
**Complexity:** Medium-High

### Overview
Implement persistent document storage for Pro users. Create hierarchical folder structure with materialized paths. Allow users to organize documents into folders.

### Tasks

#### 5.1 Create Folder Service (`server/services/folders.ts`)

**Purpose:** Manage folder hierarchy with materialized paths

**Key Functions:**

```typescript
// Create a new folder
export async function createFolder(
  userId: string,
  name: string,
  parentId?: string
): Promise<Folder>

// Get all folders for user (as tree structure)
export async function getFolders(userId: string): Promise<Folder[]>

// Get folder by ID (with ownership check)
export async function getFolder(folderId: string, userId: string): Promise<Folder | null>

// Move folder to new parent
export async function moveFolder(
  folderId: string,
  userId: string,
  newParentId?: string
): Promise<void>

// Rename folder
export async function renameFolder(
  folderId: string,
  userId: string,
  newName: string
): Promise<void>

// Delete folder (and all contents)
export async function deleteFolder(folderId: string, userId: string): Promise<void>

// Get folder breadcrumb path
export async function getFolderPath(folderId: string, userId: string): Promise<Folder[]>
```

**Materialized Path Implementation:**

```typescript
// When creating folder, build path from parent
export async function createFolder(
  userId: string,
  name: string,
  parentId?: string
): Promise<Folder> {
  const db = getDb();

  let path = '/';

  if (parentId) {
    const parent = await getFolder(parentId, userId);
    if (!parent) {
      throw new Error('Parent folder not found');
    }
    path = `${parent.path}${parent.id}/`;
  }

  const [folder] = await db
    .insert(foldersTable)
    .values({
      userId,
      name,
      parentId,
      path,
    })
    .returning();

  return folder;
}

// When moving folder, update path of folder and all descendants
export async function moveFolder(
  folderId: string,
  userId: string,
  newParentId?: string
): Promise<void> {
  const db = getDb();

  const folder = await getFolder(folderId, userId);
  if (!folder) throw new Error('Folder not found');

  // Prevent moving folder into itself
  if (newParentId === folderId) {
    throw new Error('Cannot move folder into itself');
  }

  // Calculate new path
  let newPath = '/';
  if (newParentId) {
    const newParent = await getFolder(newParentId, userId);
    if (!newParent) throw new Error('Parent folder not found');

    // Prevent circular reference
    if (newParent.path.includes(`/${folderId}/`)) {
      throw new Error('Cannot move folder into its own descendant');
    }

    newPath = `${newParent.path}${newParent.id}/`;
  }

  // Update folder's path
  await db
    .update(foldersTable)
    .set({ parentId: newParentId, path: newPath, updatedAt: new Date() })
    .where(and(eq(foldersTable.id, folderId), eq(foldersTable.userId, userId)));

  // Update all descendant paths
  const oldPath = `${folder.path}${folderId}/`;
  const descendants = await db
    .select()
    .from(foldersTable)
    .where(and(
      eq(foldersTable.userId, userId),
      sql`${foldersTable.path} LIKE ${oldPath + '%'}`
    ));

  for (const descendant of descendants) {
    const updatedPath = descendant.path.replace(oldPath, `${newPath}${folderId}/`);
    await db
      .update(foldersTable)
      .set({ path: updatedPath, updatedAt: new Date() })
      .where(eq(foldersTable.id, descendant.id));
  }
}
```

#### 5.2 Update Storage Service (`server/storage.ts`)

**Add folder support to document operations:**

```typescript
// Update saveDocument to accept folderId
async saveDocument(
  doc: InsertModbusDocument,
  userId?: string,
  folderId?: string
): Promise<ModbusDocument>

// Add folder filtering to getAllDocuments
async getAllDocuments(
  userId?: string,
  folderId?: string,
  options?: PaginationOptions
): Promise<ModbusDocument[]>

// Update getDocument with ownership check
async getDocument(id: string, userId?: string): Promise<ModbusDocument | null>

// Update deleteDocument with ownership check
async deleteDocument(id: string, userId?: string): Promise<void>
```

**PostgreSQL Implementation:**

```typescript
class PostgresStorage implements IStorage {
  async saveDocument(
    doc: InsertModbusDocument,
    userId?: string,
    folderId?: string
  ): Promise<ModbusDocument> {
    const db = getDb();

    const [saved] = await db
      .insert(documentsTable)
      .values({
        filename: doc.filename,
        sourceFormat: doc.sourceFormat,
        registers: doc.registers,
        userId,
        folderId,
      })
      .returning();

    return this.mapToDocument(saved);
  }

  async getAllDocuments(
    userId?: string,
    folderId?: string,
    options: PaginationOptions = {}
  ): Promise<ModbusDocument[]> {
    const db = getDb();
    const { limit = 50, offset = 0, sortBy = 'createdAt', sortOrder = 'desc' } = options;

    const conditions = [];
    if (userId) conditions.push(eq(documentsTable.userId, userId));
    if (folderId) {
      conditions.push(eq(documentsTable.folderId, folderId));
    } else if (userId) {
      // If userId specified but no folderId, get root-level documents only
      conditions.push(isNull(documentsTable.folderId));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const docs = await db
      .select()
      .from(documentsTable)
      .where(where)
      .orderBy(sortOrder === 'asc' ? asc(documentsTable[sortBy]) : desc(documentsTable[sortBy]))
      .limit(limit)
      .offset(offset);

    return docs.map(this.mapToDocument);
  }
}
```

#### 5.3 Create Folder Routes (`server/routes/folders.ts`)

**Endpoints:**

```typescript
import { requireAuth, loadSubscription, requirePro } from '../middleware/auth';

export function registerFolderRoutes(app: Express): void {
  // GET /api/v1/folders - List all folders for user
  app.get("/api/v1/folders", requireAuth, loadSubscription, requirePro, async (req, res) => {
    const folders = await getFolders(req.user!.id);
    res.json({ success: true, folders });
  });

  // POST /api/v1/folders - Create new folder
  app.post("/api/v1/folders", requireAuth, loadSubscription, requirePro, async (req, res) => {
    const { name, parentId } = req.body;

    if (!name || name.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'Folder name is required',
      });
    }

    const folder = await createFolder(req.user!.id, name.trim(), parentId);
    res.json({ success: true, folder });
  });

  // GET /api/v1/folders/:id - Get folder details
  app.get("/api/v1/folders/:id", requireAuth, loadSubscription, requirePro, async (req, res) => {
    const folder = await getFolder(req.params.id, req.user!.id);

    if (!folder) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'Folder not found',
      });
    }

    res.json({ success: true, folder });
  });

  // PATCH /api/v1/folders/:id - Update folder (rename or move)
  app.patch("/api/v1/folders/:id", requireAuth, loadSubscription, requirePro, async (req, res) => {
    const { name, parentId } = req.body;
    const folderId = req.params.id;

    if (name) {
      await renameFolder(folderId, req.user!.id, name.trim());
    }

    if (parentId !== undefined) {
      await moveFolder(folderId, req.user!.id, parentId);
    }

    const folder = await getFolder(folderId, req.user!.id);
    res.json({ success: true, folder });
  });

  // DELETE /api/v1/folders/:id - Delete folder and contents
  app.delete("/api/v1/folders/:id", requireAuth, loadSubscription, requirePro, async (req, res) => {
    await deleteFolder(req.params.id, req.user!.id);
    res.json({ success: true, message: 'Folder deleted' });
  });

  // GET /api/v1/folders/:id/path - Get breadcrumb path
  app.get("/api/v1/folders/:id/path", requireAuth, loadSubscription, requirePro, async (req, res) => {
    const path = await getFolderPath(req.params.id, req.user!.id);
    res.json({ success: true, path });
  });
}
```

#### 5.4 Update Document Routes

**Add folder support to existing routes:**

```typescript
// POST /api/v1/parse - Add optional folderId
app.post("/api/v1/parse",
  optionalAuth,
  loadSubscription,
  checkUsageLimits,
  trackUsageAfterSuccess,
  async (req, res) => {
    // ... existing parse logic ...

    // Save to folder if Pro user and folderId provided
    if (req.user && req.subscription?.tier === 'pro' && req.body.folderId) {
      await storage.saveDocument(result, req.user.id, req.body.folderId);
    }
  }
);

// GET /api/v1/documents - Add optional folderId filter
app.get("/api/v1/documents",
  requireAuth,
  loadSubscription,
  async (req, res) => {
    const folderId = req.query.folderId as string | undefined;
    const documents = await storage.getAllDocuments(req.user!.id, folderId);
    res.json({ success: true, documents });
  }
);

// GET /api/v1/documents/:id - Add ownership check
app.get("/api/v1/documents/:id",
  requireAuth,
  loadSubscription,
  async (req, res) => {
    const document = await storage.getDocument(req.params.id, req.user!.id);
    if (!document) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'Document not found',
      });
    }
    res.json({ success: true, document });
  }
);

// DELETE /api/v1/documents/:id - Add ownership check
app.delete("/api/v1/documents/:id",
  requireAuth,
  loadSubscription,
  async (req, res) => {
    await storage.deleteDocument(req.params.id, req.user!.id);
    res.json({ success: true, message: 'Document deleted' });
  }
);
```

#### 5.5 Register Routes

**Update `server/index.ts`:**

```typescript
import { registerFolderRoutes } from './routes/folders';

// After auth routes
registerFolderRoutes(app);
```

#### 5.6 Testing Checklist

- [ ] Free tier users cannot create folders (403 error)
- [ ] Pro users can create folders
- [ ] Pro users can rename folders
- [ ] Pro users can move folders
- [ ] Pro users can delete folders (cascades to documents)
- [ ] Cannot move folder into itself
- [ ] Cannot move folder into its own descendant
- [ ] Materialized paths update correctly on move
- [ ] Documents can be saved to folders
- [ ] Documents can be filtered by folder
- [ ] Folder breadcrumb path works correctly

---

## Phase 6: Version Control System

**Status:** COMPLETE
**Implemented in:** `server/services/versions.ts`, `server/routes/versions.ts`, `shared/schema.ts` (version fields on documents)
**Dependencies:** Phase 5 (Document Storage)
**Complexity:** Medium

### Overview
Track document versions over time. Allow Pro users to create new versions when re-uploading a file, view version history, compare versions, and restore old versions.

### Tasks

#### 6.1 Create Version Service (`server/services/versions.ts`)

**Purpose:** Manage document versioning

**Key Functions:**

```typescript
// Create a new version of a document
export async function createVersion(
  documentId: string,
  userId: string,
  registers: ModbusRegister[]
): Promise<ModbusDocument>

// Get all versions of a document
export async function getVersionHistory(
  documentId: string,
  userId: string
): Promise<ModbusDocument[]>

// Get specific version
export async function getVersion(
  documentId: string,
  versionNumber: number,
  userId: string
): Promise<ModbusDocument | null>

// Compare two versions (returns diff)
export async function compareVersions(
  documentId: string,
  version1: number,
  version2: number,
  userId: string
): Promise<VersionComparison>

interface VersionComparison {
  added: ModbusRegister[];
  removed: ModbusRegister[];
  modified: Array<{
    old: ModbusRegister;
    new: ModbusRegister;
  }>;
}
```

**Implementation Details:**

```typescript
export async function createVersion(
  documentId: string,
  userId: string,
  registers: ModbusRegister[]
): Promise<ModbusDocument> {
  const db = getDb();

  // Get current latest version
  const [current] = await db
    .select()
    .from(documentsTable)
    .where(and(
      eq(documentsTable.id, documentId),
      eq(documentsTable.userId, userId),
      eq(documentsTable.isLatestVersion, true)
    ))
    .limit(1);

  if (!current) {
    throw new Error('Document not found');
  }

  // Mark current as not latest
  await db
    .update(documentsTable)
    .set({ isLatestVersion: false })
    .where(eq(documentsTable.id, documentId));

  // Create new version
  const [newVersion] = await db
    .insert(documentsTable)
    .values({
      userId,
      folderId: current.folderId,
      filename: current.filename,
      sourceFormat: current.sourceFormat,
      registers,
      versionNumber: current.versionNumber + 1,
      isLatestVersion: true,
      parentDocumentId: documentId, // Link to original
    })
    .returning();

  return mapToDocument(newVersion);
}

export async function getVersionHistory(
  documentId: string,
  userId: string
): Promise<ModbusDocument[]> {
  const db = getDb();

  // Get all versions (including the original and all children)
  const versions = await db
    .select()
    .from(documentsTable)
    .where(and(
      eq(documentsTable.userId, userId),
      or(
        eq(documentsTable.id, documentId),
        eq(documentsTable.parentDocumentId, documentId)
      )
    ))
    .orderBy(desc(documentsTable.versionNumber));

  return versions.map(mapToDocument);
}

export async function compareVersions(
  documentId: string,
  version1: number,
  version2: number,
  userId: string
): Promise<VersionComparison> {
  const v1 = await getVersion(documentId, version1, userId);
  const v2 = await getVersion(documentId, version2, userId);

  if (!v1 || !v2) {
    throw new Error('Version not found');
  }

  const added: ModbusRegister[] = [];
  const removed: ModbusRegister[] = [];
  const modified: Array<{ old: ModbusRegister; new: ModbusRegister }> = [];

  const v1Map = new Map(v1.registers.map(r => [r.address, r]));
  const v2Map = new Map(v2.registers.map(r => [r.address, r]));

  // Find added and modified
  for (const [address, newReg] of v2Map) {
    const oldReg = v1Map.get(address);
    if (!oldReg) {
      added.push(newReg);
    } else if (JSON.stringify(oldReg) !== JSON.stringify(newReg)) {
      modified.push({ old: oldReg, new: newReg });
    }
  }

  // Find removed
  for (const [address, oldReg] of v1Map) {
    if (!v2Map.has(address)) {
      removed.push(oldReg);
    }
  }

  return { added, removed, modified };
}
```

#### 6.2 Create Version Routes (`server/routes/versions.ts`)

**Endpoints:**

```typescript
export function registerVersionRoutes(app: Express): void {
  // GET /api/v1/documents/:id/versions - List all versions
  app.get("/api/v1/documents/:id/versions",
    requireAuth,
    loadSubscription,
    requirePro,
    async (req, res) => {
      const versions = await getVersionHistory(req.params.id, req.user!.id);
      res.json({ success: true, versions });
    }
  );

  // POST /api/v1/documents/:id/versions - Create new version
  app.post("/api/v1/documents/:id/versions",
    requireAuth,
    loadSubscription,
    requirePro,
    async (req, res) => {
      const { registers } = req.body;

      if (!registers || !Array.isArray(registers)) {
        return res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: 'Registers array is required',
        });
      }

      const version = await createVersion(req.params.id, req.user!.id, registers);
      res.json({ success: true, version });
    }
  );

  // GET /api/v1/documents/:id/versions/:versionNumber
  app.get("/api/v1/documents/:id/versions/:versionNumber",
    requireAuth,
    loadSubscription,
    requirePro,
    async (req, res) => {
      const version = await getVersion(
        req.params.id,
        parseInt(req.params.versionNumber, 10),
        req.user!.id
      );

      if (!version) {
        return res.status(404).json({
          success: false,
          error: 'NOT_FOUND',
          message: 'Version not found',
        });
      }

      res.json({ success: true, version });
    }
  );

  // GET /api/v1/documents/:id/versions/compare?v1=1&v2=2
  app.get("/api/v1/documents/:id/versions/compare",
    requireAuth,
    loadSubscription,
    requirePro,
    async (req, res) => {
      const v1 = parseInt(req.query.v1 as string, 10);
      const v2 = parseInt(req.query.v2 as string, 10);

      if (!v1 || !v2) {
        return res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: 'Both v1 and v2 query parameters are required',
        });
      }

      const comparison = await compareVersions(req.params.id, v1, v2, req.user!.id);
      res.json({ success: true, comparison });
    }
  );
}
```

#### 6.3 Update Parse Routes

**Auto-create versions when re-uploading:**

```typescript
app.post("/api/v1/parse",
  optionalAuth,
  loadSubscription,
  checkUsageLimits,
  trackUsageAfterSuccess,
  async (req, res) => {
    // ... existing parse logic ...

    // If Pro user is re-uploading same filename in same folder
    if (req.user && req.subscription?.tier === 'pro') {
      const folderId = req.body.folderId;
      const existingDocs = await storage.getAllDocuments(req.user.id, folderId);
      const duplicate = existingDocs.find(d => d.filename === result.filename);

      if (duplicate) {
        // Ask user if they want to create a new version
        return res.json({
          success: true,
          message: 'Document with this filename already exists',
          action: 'VERSION_PROMPT',
          existingDocumentId: duplicate.id,
          registers: result.registers,
        });
      }

      // Otherwise, save as new document
      await storage.saveDocument(result, req.user.id, folderId);
    }
  }
);

// New endpoint to confirm version creation
app.post("/api/v1/documents/:id/create-version",
  requireAuth,
  loadSubscription,
  requirePro,
  async (req, res) => {
    const { registers } = req.body;
    const version = await createVersion(req.params.id, req.user!.id, registers);
    res.json({ success: true, version });
  }
);
```

#### 6.4 Register Routes

**Update `server/index.ts`:**

```typescript
import { registerVersionRoutes } from './routes/versions';

// After folder routes
registerVersionRoutes(app);
```

#### 6.5 Testing Checklist

- [ ] Free tier users cannot access version endpoints (403)
- [ ] Pro users can create new versions
- [ ] Version numbers increment correctly
- [ ] Only one version marked as isLatestVersion
- [ ] Version history returns all versions in order
- [ ] Compare versions shows correct diffs
- [ ] Re-uploading same filename prompts for version creation

---

## Phase 7: Custom Export Templates

**Status:** COMPLETE
**Implemented in:** `server/services/templates.ts`, `server/routes/templates.ts`, `server/exporters.ts`, `shared/schema.ts` (export_templates table)
**Dependencies:** Phase 5 (Document Storage)
**Complexity:** High

### Overview
Allow Pro users to create custom export templates with field mapping, reordering, and format-specific settings. Save and reuse templates. Apply templates during export.

### Tasks

#### 7.1 Create Template Service (`server/services/templates.ts`)

**Purpose:** Manage export templates

**Key Functions:**

```typescript
// Create new template
export async function createTemplate(
  userId: string,
  name: string,
  format: 'csv' | 'json' | 'xml',
  config: TemplateConfig
): Promise<ExportTemplate>

// Get all templates for user (optionally filtered by format)
export async function getTemplates(
  userId: string,
  format?: string
): Promise<ExportTemplate[]>

// Get single template
export async function getTemplate(
  templateId: string,
  userId: string
): Promise<ExportTemplate | null>

// Update template
export async function updateTemplate(
  templateId: string,
  userId: string,
  updates: Partial<Pick<ExportTemplate, 'name' | 'config' | 'isDefault'>>
): Promise<ExportTemplate>

// Delete template
export async function deleteTemplate(
  templateId: string,
  userId: string
): Promise<void>

// Apply template to registers
export function applyTemplate(
  registers: ModbusRegister[],
  template: TemplateConfig
): ModbusRegister[]
```

**Template Application:**

```typescript
export function applyTemplate(
  registers: ModbusRegister[],
  template: TemplateConfig
): ModbusRegister[] {
  let processed = [...registers];

  // Apply field filtering
  if (template.showFields && template.showFields.length > 0) {
    processed = processed.map(reg => {
      const filtered: any = {};
      for (const field of template.showFields!) {
        if (field in reg) {
          filtered[field] = reg[field as keyof ModbusRegister];
        }
      }
      return filtered as ModbusRegister;
    });
  }

  // Apply field mapping (rename fields)
  if (template.fieldMapping) {
    processed = processed.map(reg => {
      const mapped: any = { ...reg };
      for (const [oldName, newName] of Object.entries(template.fieldMapping!)) {
        if (oldName in mapped && newName) {
          mapped[newName] = mapped[oldName];
          if (newName !== oldName) {
            delete mapped[oldName];
          }
        }
      }
      return mapped as ModbusRegister;
    });
  }

  // Apply field ordering (for CSV)
  if (template.fieldOrder && template.fieldOrder.length > 0) {
    // This will be handled by the CSV exporter
  }

  return processed;
}
```

#### 7.2 Update Export Service (`server/exporters.ts`)

**Add template support to exporters:**

```typescript
// Update CSV exporter
export function exportToCSV(
  registers: ModbusRegister[],
  template?: TemplateConfig
): string {
  if (registers.length === 0) {
    return '';
  }

  // Get field order from template or use defaults
  const fieldOrder = template?.fieldOrder || ['address', 'name', 'datatype', 'description', 'writable'];
  const delimiter = template?.csv?.delimiter || ',';
  const includeHeader = template?.csv?.includeHeader !== false;
  const customHeaders = template?.csv?.customHeaders;

  // Build header row
  const headers = customHeaders || fieldOrder;
  const headerRow = includeHeader
    ? headers.map(h => sanitizeCSVCell(h)).join(delimiter) + '\n'
    : '';

  // Build data rows
  const rows = registers.map(reg => {
    return fieldOrder
      .map(field => {
        const value = reg[field as keyof ModbusRegister];
        return sanitizeCSVCell(value);
      })
      .join(delimiter);
  }).join('\n');

  return headerRow + rows;
}

// Update JSON exporter
export function exportToJSON(
  registers: ModbusRegister[],
  template?: TemplateConfig
): string {
  const rootKey = template?.json?.rootKey || 'registers';
  const prettyPrint = template?.json?.prettyPrint !== false;

  const data = { [rootKey]: registers };

  return prettyPrint
    ? JSON.stringify(data, null, 2)
    : JSON.stringify(data);
}

// Update XML exporter
export function exportToXML(
  registers: ModbusRegister[],
  template?: TemplateConfig
): string {
  const rootElement = template?.xml?.rootElement || 'ModbusRegisters';
  const itemElement = template?.xml?.itemElement || 'Register';
  const useAttributes = template?.xml?.useAttributes || false;

  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  xml += `<${rootElement}>\n`;

  for (const reg of registers) {
    if (useAttributes) {
      // Use attributes
      xml += `  <${itemElement}`;
      for (const [key, value] of Object.entries(reg)) {
        xml += ` ${key}="${escapeXML(String(value))}"`;
      }
      xml += ` />\n`;
    } else {
      // Use child elements
      xml += `  <${itemElement}>\n`;
      for (const [key, value] of Object.entries(reg)) {
        xml += `    <${key}>${escapeXML(String(value))}</${key}>\n`;
      }
      xml += `  </${itemElement}>\n`;
    }
  }

  xml += `</${rootElement}>`;
  return xml;
}
```

#### 7.3 Create Template Routes (`server/routes/templates.ts`)

**Endpoints:**

```typescript
export function registerTemplateRoutes(app: Express): void {
  // GET /api/v1/templates - List templates
  app.get("/api/v1/templates",
    requireAuth,
    loadSubscription,
    requirePro,
    async (req, res) => {
      const format = req.query.format as string | undefined;
      const templates = await getTemplates(req.user!.id, format);
      res.json({ success: true, templates });
    }
  );

  // POST /api/v1/templates - Create template
  app.post("/api/v1/templates",
    requireAuth,
    loadSubscription,
    requirePro,
    async (req, res) => {
      const { name, format, config } = req.body;

      // Validation
      if (!name || !format || !config) {
        return res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: 'name, format, and config are required',
        });
      }

      if (!['csv', 'json', 'xml'].includes(format)) {
        return res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: 'format must be csv, json, or xml',
        });
      }

      const template = await createTemplate(req.user!.id, name, format, config);
      res.json({ success: true, template });
    }
  );

  // GET /api/v1/templates/:id - Get template
  app.get("/api/v1/templates/:id",
    requireAuth,
    loadSubscription,
    requirePro,
    async (req, res) => {
      const template = await getTemplate(req.params.id, req.user!.id);

      if (!template) {
        return res.status(404).json({
          success: false,
          error: 'NOT_FOUND',
          message: 'Template not found',
        });
      }

      res.json({ success: true, template });
    }
  );

  // PATCH /api/v1/templates/:id - Update template
  app.patch("/api/v1/templates/:id",
    requireAuth,
    loadSubscription,
    requirePro,
    async (req, res) => {
      const updates = req.body;
      const template = await updateTemplate(req.params.id, req.user!.id, updates);
      res.json({ success: true, template });
    }
  );

  // DELETE /api/v1/templates/:id - Delete template
  app.delete("/api/v1/templates/:id",
    requireAuth,
    loadSubscription,
    requirePro,
    async (req, res) => {
      await deleteTemplate(req.params.id, req.user!.id);
      res.json({ success: true, message: 'Template deleted' });
    }
  );

  // POST /api/v1/export - Export with template
  app.post("/api/v1/export",
    requireAuth,
    loadSubscription,
    requirePro,
    async (req, res) => {
      const { documentId, templateId, format } = req.body;

      // Get document
      const document = await storage.getDocument(documentId, req.user!.id);
      if (!document) {
        return res.status(404).json({
          success: false,
          error: 'NOT_FOUND',
          message: 'Document not found',
        });
      }

      // Get template if specified
      let template: ExportTemplate | null = null;
      if (templateId) {
        template = await getTemplate(templateId, req.user!.id);
        if (!template) {
          return res.status(404).json({
            success: false,
            error: 'NOT_FOUND',
            message: 'Template not found',
          });
        }
      }

      // Apply template transformations
      let registers = document.registers;
      if (template) {
        registers = applyTemplate(registers, template.config);
      }

      // Export to format
      let content: string;
      let mimeType: string;
      let extension: string;

      const exportFormat = format || template?.format || 'json';

      switch (exportFormat) {
        case 'csv':
          content = exportToCSV(registers, template?.config);
          mimeType = 'text/csv';
          extension = 'csv';
          break;
        case 'xml':
          content = exportToXML(registers, template?.config);
          mimeType = 'application/xml';
          extension = 'xml';
          break;
        case 'json':
        default:
          content = exportToJSON(registers, template?.config);
          mimeType = 'application/json';
          extension = 'json';
          break;
      }

      res.setHeader('Content-Type', mimeType);
      res.setHeader('Content-Disposition', `attachment; filename="${document.filename}.${extension}"`);
      res.send(content);
    }
  );
}
```

#### 7.4 Create Default Templates

**Seed some default templates:**

```typescript
// server/services/templates.ts

export async function createDefaultTemplates(userId: string): Promise<void> {
  // Standard Modbus CSV
  await createTemplate(userId, 'Standard Modbus CSV', 'csv', {
    fieldOrder: ['address', 'name', 'datatype', 'writable', 'description'],
    csv: {
      delimiter: ',',
      includeHeader: true,
    },
  });

  // Compact JSON
  await createTemplate(userId, 'Compact JSON', 'json', {
    showFields: ['address', 'name', 'datatype'],
    json: {
      rootKey: 'registers',
      prettyPrint: false,
    },
  });

  // RSLogix XML
  await createTemplate(userId, 'RSLogix XML', 'xml', {
    fieldMapping: {
      address: 'Address',
      name: 'TagName',
      datatype: 'DataType',
      writable: 'Writable',
    },
    xml: {
      rootElement: 'RSLogixExport',
      itemElement: 'Tag',
      useAttributes: true,
    },
  });
}
```

#### 7.5 Register Routes

**Update `server/index.ts`:**

```typescript
import { registerTemplateRoutes } from './routes/templates';

// After version routes
registerTemplateRoutes(app);
```

#### 7.6 Testing Checklist

- [ ] Free tier users cannot create templates (403)
- [ ] Pro users can create templates
- [ ] Pro users can update templates
- [ ] Pro users can delete templates
- [ ] Field mapping works (rename fields)
- [ ] Field filtering works (show only specified fields)
- [ ] Field ordering works (CSV)
- [ ] CSV delimiter customization works
- [ ] JSON root key customization works
- [ ] XML element names customization works
- [ ] Template application during export works

---

## Phase 8: Frontend UI Components

**Status:** COMPLETE
**Implemented in:** `client/src/contexts/auth-context.tsx`, `client/src/components/auth/*`, `client/src/components/billing/*`, `client/src/components/folders/*`, `client/src/components/versions/*`, `client/src/components/templates/*`, `client/src/pages/*`
**Dependencies:** Phases 2-7 (Backend complete)
**Complexity:** High

### Overview
Build React components for all premium features: authentication, billing, folders, versions, templates. Update existing pages to integrate premium features.

### Tasks

#### 8.1 Auth UI (`client/src/pages/auth/`)

**Components to create:**

```
client/src/pages/auth/
  ├── login.tsx          # Login page (email/password + magic link)
  ├── signup.tsx         # Signup page
  ├── verify.tsx         # Email verification page
  └── index.ts           # Exports

client/src/lib/
  └── auth-context.tsx   # Auth context provider

client/src/components/
  └── protected-route.tsx  # Route wrapper requiring auth
```

**Login Page (`login.tsx`):**

```typescript
import { useState } from 'react';
import { useLocation, useRouter } from 'wouter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { apiEndpoints } from '@/lib/api';

export function LoginPage() {
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [usePasswordless, setUsePasswordless] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await fetch(apiEndpoints.auth.login, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (data.success) {
        setLocation('/');
      } else {
        setError(data.message || 'Login failed');
      }
    } catch (err) {
      setError('An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await fetch(apiEndpoints.auth.magicLink, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email }),
      });

      const data = await response.json();
      alert(data.message);
    } catch (err) {
      setError('An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Log In</CardTitle>
          <CardDescription>
            {usePasswordless ? 'Enter your email to receive a magic link' : 'Enter your credentials'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={usePasswordless ? handleMagicLink : handleLogin} className="space-y-4">
            {error && (
              <div className="bg-destructive/15 text-destructive px-4 py-2 rounded">
                {error}
              </div>
            )}

            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            {!usePasswordless && (
              <div>
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
            )}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Loading...' : usePasswordless ? 'Send Magic Link' : 'Log In'}
            </Button>

            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={() => setUsePasswordless(!usePasswordless)}
            >
              {usePasswordless ? 'Use password instead' : 'Use magic link instead'}
            </Button>

            <div className="text-center text-sm text-muted-foreground">
              Don't have an account?{' '}
              <a href="/signup" className="text-primary hover:underline">
                Sign up
              </a>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
```

**Auth Context (`auth-context.tsx`):**

```typescript
import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { apiEndpoints } from '@/lib/api';

interface User {
  id: string;
  email: string;
  emailVerified: boolean;
}

interface Subscription {
  tier: 'free' | 'pro';
  status: string;
  currentPeriodEnd?: string;
}

interface AuthContextType {
  user: User | null;
  subscription: Subscription | null;
  loading: boolean;
  logout: () => Promise<void>;
  refetch: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchUser = async () => {
    try {
      const response = await fetch(apiEndpoints.auth.me, {
        credentials: 'include',
      });

      if (response.ok) {
        const data = await response.json();
        setUser(data.user);
        setSubscription(data.subscription);
      } else {
        setUser(null);
        setSubscription(null);
      }
    } catch (err) {
      setUser(null);
      setSubscription(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUser();
  }, []);

  const logout = async () => {
    await fetch(apiEndpoints.auth.logout, {
      method: 'POST',
      credentials: 'include',
    });
    setUser(null);
    setSubscription(null);
  };

  return (
    <AuthContext.Provider value={{ user, subscription, loading, logout, refetch: fetchUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
```

**Protected Route:**

```typescript
import { useAuth } from '@/lib/auth-context';
import { useLocation } from 'wouter';
import { useEffect } from 'react';

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!loading && !user) {
      setLocation('/login');
    }
  }, [user, loading, setLocation]);

  if (loading) {
    return <div>Loading...</div>;
  }

  if (!user) {
    return null;
  }

  return <>{children}</>;
}
```

#### 8.2 Subscription UI (`client/src/components/billing/`)

**Components to create:**

```
client/src/components/billing/
  ├── pricing-page.tsx        # Pricing comparison (Free vs Pro)
  ├── upgrade-modal.tsx       # Modal prompting upgrade
  ├── usage-dashboard.tsx     # Current usage stats
  ├── tier-badge.tsx          # Visual tier indicator
  └── index.ts
```

**Usage Dashboard:**

```typescript
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { apiEndpoints } from '@/lib/api';

export function UsageDashboard() {
  const { data } = useQuery({
    queryKey: ['usage'],
    queryFn: async () => {
      const response = await fetch(apiEndpoints.billing.usage, {
        credentials: 'include',
      });
      return response.json();
    },
  });

  if (!data) return null;

  const { tier, usage } = data;
  const conversionPercent = usage.conversions.unlimited
    ? 0
    : (usage.conversions.used / usage.conversions.limit) * 100;
  const tokenPercent = usage.tokens.unlimited
    ? 0
    : (usage.tokens.used / usage.tokens.limit) * 100;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Usage This Month</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <div className="flex justify-between text-sm mb-2">
            <span>Conversions</span>
            <span>
              {usage.conversions.used} {usage.conversions.unlimited ? '' : `/ ${usage.conversions.limit}`}
            </span>
          </div>
          {!usage.conversions.unlimited && (
            <Progress value={conversionPercent} />
          )}
        </div>

        <div>
          <div className="flex justify-between text-sm mb-2">
            <span>AI Tokens</span>
            <span>
              {usage.tokens.used.toLocaleString()} {usage.tokens.unlimited ? '' : `/ ${usage.tokens.limit.toLocaleString()}`}
            </span>
          </div>
          {!usage.tokens.unlimited && (
            <Progress value={tokenPercent} />
          )}
        </div>

        {tier === 'free' && (
          <Button onClick={() => window.location.href = '/pricing'} className="w-full">
            Upgrade to Pro
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
```

#### 8.3 Folder UI (`client/src/components/folders/`)

**Components needed:**
- Folder tree component (with drag-drop)
- Create folder dialog
- Rename folder dialog
- Delete folder confirmation
- Breadcrumb navigation

#### 8.4 Document Library UI (`client/src/pages/library.tsx`)

**Features:**
- List documents with filtering by folder
- Upload to specific folder
- Document cards with metadata
- Search and sort
- Bulk operations

#### 8.5 Version Control UI (`client/src/components/versions/`)

**Components needed:**
- Version history panel
- Create version button
- Version comparison viewer (side-by-side diff)
- Restore version action

#### 8.6 Template Editor UI (`client/src/pages/templates/`)

**Features:**
- Template list page
- Template editor with live preview
- Field mapping interface (drag-drop reordering)
- Field visibility toggles
- Format-specific settings panel
- Save/update/delete templates

#### 8.7 Update Home Page

**Add to `client/src/pages/home.tsx`:**
- Check authentication status
- Show usage stats for authenticated users
- Add "Save to Library" button for Pro users (after conversion)
- Add "Use Template" dropdown for Pro users
- Show upgrade prompts for Free users hitting limits

#### 8.8 Navigation Updates

**Update navigation component:**
- Add "Library" link (authenticated only)
- Add "Templates" link (Pro only)
- Add user menu with:
  - Email
  - Tier badge
  - Usage stats summary
  - Billing portal link
  - Logout button

---

## Phase 9: Testing & Polish

**Status:** COMPLETE
**Implemented in:** `server/__tests__/services/*`, `server/__tests__/middleware/*`, `client/src/components/*/__tests__/*`
**Dependencies:** Phase 8 (Frontend complete)
**Complexity:** Medium

### Overview
Comprehensive testing, security audit, performance optimization, and UI polish.

### Tasks

#### 9.1 Backend Tests

Create tests in `server/__tests__/`:

```
server/__tests__/
  ├── auth.test.ts           # Registration, login, magic links
  ├── subscription.test.ts   # Stripe checkout, webhooks
  ├── usage.test.ts          # Tracking, limits, enforcement
  ├── folders.test.ts        # CRUD, materialized paths, permissions
  ├── versions.test.ts       # Version creation, history, comparison
  └── templates.test.ts      # Template CRUD, application
```

**Example test structure:**

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../index';

describe('Auth API', () => {
  describe('POST /api/v1/auth/signup', () => {
    it('should create user and free subscription', async () => {
      const response = await request(app)
        .post('/api/v1/auth/signup')
        .send({ email: 'test@example.com', password: 'password123' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.user.email).toBe('test@example.com');
    });

    it('should reject duplicate email', async () => {
      // Create first user
      await request(app)
        .post('/api/v1/auth/signup')
        .send({ email: 'test@example.com', password: 'password123' });

      // Try to create duplicate
      const response = await request(app)
        .post('/api/v1/auth/signup')
        .send({ email: 'test@example.com', password: 'password456' });

      expect(response.status).toBe(409);
      expect(response.body.error).toBe('USER_EXISTS');
    });

    it('should reject weak password', async () => {
      const response = await request(app)
        .post('/api/v1/auth/signup')
        .send({ email: 'test@example.com', password: 'short' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('VALIDATION_ERROR');
    });
  });
});
```

#### 9.2 Frontend Tests

Create component tests in `client/src/components/__tests__/`:

```
client/src/components/__tests__/
  ├── login.test.tsx
  ├── usage-dashboard.test.tsx
  ├── folder-tree.test.tsx
  └── template-editor.test.tsx
```

#### 9.3 Integration Tests

Test full user flows:

```typescript
describe('E2E: Pro Subscription Flow', () => {
  it('should complete full upgrade flow', async () => {
    // 1. Signup
    // 2. Login
    // 3. Create Stripe checkout
    // 4. Simulate webhook (checkout.session.completed)
    // 5. Verify tier upgraded to Pro
    // 6. Verify can access Pro features
  });
});

describe('E2E: Usage Limits', () => {
  it('should block Free user at 10 conversions', async () => {
    // 1. Create Free user
    // 2. Perform 10 conversions
    // 3. Attempt 11th conversion
    // 4. Verify 402 error with upgrade prompt
  });
});
```

#### 9.4 Security Audit

**Manual checklist:**

- [ ] SQL injection prevention (Drizzle ORM parameterized queries)
- [ ] XSS prevention (React escapes by default)
- [ ] CSRF protection (sameSite cookies)
- [ ] Rate limiting on all auth endpoints
- [ ] Password strength requirements (min 8 chars)
- [ ] Email validation
- [ ] Stripe webhook signature verification
- [ ] User data isolation (all queries filter by userId)
- [ ] Folder ownership checks
- [ ] Document ownership checks
- [ ] Template ownership checks
- [ ] Pro feature gating (requirePro middleware)

**Tools to use:**
- `npm audit` for dependency vulnerabilities
- OWASP ZAP for web vulnerability scanning

#### 9.5 Performance Testing

**Database queries:**
- [ ] All queries have appropriate indexes
- [ ] No N+1 query problems
- [ ] Pagination works efficiently with large datasets
- [ ] Folder tree queries use materialized path (no recursion)

**Frontend performance:**
- [ ] Large document lists virtualized
- [ ] Images lazy loaded
- [ ] Bundle size < 500KB gzipped
- [ ] Initial load < 2s on 3G

**Load testing:**
```bash
# Use Apache Bench or Artillery
ab -n 1000 -c 10 http://localhost:5000/api/v1/auth/me
```

#### 9.6 UI Polish

**Consistency:**
- [ ] All buttons use shadcn/ui components
- [ ] Consistent spacing (use Tailwind spacing scale)
- [ ] Consistent colors (use CSS variables from theme)
- [ ] Loading states for all async operations
- [ ] Error messages user-friendly
- [ ] Success notifications after actions

**Accessibility:**
- [ ] All forms have labels
- [ ] Focus indicators visible
- [ ] Keyboard navigation works
- [ ] Color contrast meets WCAG AA
- [ ] Screen reader friendly (ARIA labels)

**Empty states:**
- [ ] Empty folder: "No documents yet. Upload your first file!"
- [ ] No templates: "Create your first template to customize exports"
- [ ] Usage at 0: Clear progress bars

**Responsive design:**
- [ ] Mobile-friendly navigation
- [ ] Forms work on small screens
- [ ] Tables scroll horizontally on mobile
- [ ] Touch targets > 44px

#### 9.7 Documentation

**Update existing docs:**
- [ ] Update README with premium features
- [ ] Update API documentation
- [ ] Document environment variables
- [ ] Add Stripe setup instructions
- [ ] Add deployment guide

**Create new docs:**
- [ ] User guide for Pro features
- [ ] Template creation guide
- [ ] Folder organization best practices

---

## Environment Setup Checklist

Before starting Phase 3, ensure you have:

- [ ] Stripe test account created
- [ ] Stripe API keys (test mode)
- [ ] Stripe webhook endpoint configured
- [ ] Stripe Pro product/price created
- [ ] SMTP service configured (SendGrid/Mailgun/etc)
- [ ] PostgreSQL database running
- [ ] All environment variables in `.env`

**Generate secrets:**
```bash
# Session secret
openssl rand -base64 64

# Magic link secret
openssl rand -base64 64
```

---

## Deployment Checklist

When ready for production:

- [ ] Switch Stripe to live mode (sk_live_...)
- [ ] Update Stripe webhook URL to production domain
- [ ] Use production SMTP credentials
- [ ] Set NODE_ENV=production
- [ ] Set secure ALLOWED_ORIGINS
- [ ] Use strong SESSION_SECRET and MAGIC_LINK_SECRET
- [ ] Enable HTTPS
- [ ] Set up SSL certificate
- [ ] Configure CDN for static assets
- [ ] Set up database backups
- [ ] Set up monitoring (Sentry, DataDog, etc)
- [ ] Set up uptime monitoring
- [ ] Test Stripe webhooks with production URL

---

## Success Metrics

Track these metrics after launch:

**Business Metrics:**
- Free → Pro conversion rate
- Monthly recurring revenue (MRR)
- Churn rate
- Average revenue per user (ARPU)

**Usage Metrics:**
- Monthly active users (MAU)
- Average conversions per user
- Average AI tokens used per user
- Most popular export formats
- Template adoption rate (% of Pro users creating templates)

**Technical Metrics:**
- API response times (p50, p95, p99)
- Error rates
- Database query performance
- Stripe webhook success rate

---

## Future Enhancements (Post-MVP)

After completing all 9 phases, consider:

1. **OAuth Integration** - Google, Microsoft SSO
2. **API Keys** - Programmatic access for power users
3. **Batch Upload** - Upload multiple files at once
4. **Team Accounts** - Share folders with teammates
5. **Advanced Templates** - Conditional logic, formulas
6. **Export History** - Track all exports
7. **Webhooks** - Notify external systems on events
8. **White-labeling** - Remove branding (Enterprise tier)
9. **Advanced Analytics** - Usage charts, trends over time
10. **Mobile App** - React Native companion app

---

## Questions & Decisions Needed

Before starting Phase 3, clarify:

1. **Pricing:** What's the monthly price for Pro tier? ($9.99? $19.99?)
2. **Trial Period:** Should Pro have a 14-day free trial?
3. **Annual Plans:** Offer discounted annual pricing? (e.g., $99/year saves 17%)
4. **Refund Policy:** What's the refund window? (30 days?)
5. **Student Pricing:** Special pricing for .edu emails?
6. **Document Retention:** How long to keep documents for canceled Pro users? (30 days grace period?)
7. **Folder Limits:** Maximum folder nesting depth? (10 levels?)
8. **File Size Limits:** Maximum file size per upload? (Current: 10MB, change for Pro?)
9. **Storage Limits:** Pro users get unlimited document storage, or cap at X documents?
10. **Email Provider:** Which SMTP service? (SendGrid recommended for reliability)

---

## Getting Help

If you encounter issues:

- **Stripe Docs:** https://stripe.com/docs
- **Drizzle ORM Docs:** https://orm.drizzle.team/docs
- **React Query Docs:** https://tanstack.com/query/latest/docs
- **shadcn/ui Components:** https://ui.shadcn.com

For specific errors, check the detailed error logs in:
- `server/logger.ts` logs
- Browser console for frontend errors
- Stripe dashboard for webhook events

---

**Ready to continue?** Start with Phase 3: Stripe Integration!
