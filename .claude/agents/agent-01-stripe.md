# Agent 1: Stripe Integration & Subscription Management

## Mission
Implement Stripe payment processing for ModMapper Pro subscriptions. Create checkout flow, webhook handlers, and customer portal integration.

## Branch
```bash
git checkout -b feature/stripe-integration develop
```

## Prerequisites
- Stripe test account created
- Environment variables set:
  - `STRIPE_SECRET_KEY=sk_test_...`
  - `STRIPE_WEBHOOK_SECRET=whsec_...`
  - `STRIPE_PRO_PRICE_ID=price_...`

If Stripe is not yet configured, create mock implementations that log actions and return success responses for testing.

---

## Tasks

### 1. Install Stripe Dependency
```bash
npm install stripe
```

### 2. Create Stripe Service (`server/services/stripe.ts`)

Create a new file with these functions:

```typescript
import Stripe from 'stripe';

// Initialize Stripe client (lazy initialization for when API key not available)
let stripeClient: Stripe | null = null;

function getStripe(): Stripe {
  if (!stripeClient) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
      throw new Error('STRIPE_SECRET_KEY not configured');
    }
    stripeClient = new Stripe(key, { apiVersion: '2023-10-16' });
  }
  return stripeClient;
}

// Get or create Stripe customer for user
export async function getOrCreateStripeCustomer(
  userId: string,
  email: string
): Promise<string>

// Create Stripe Checkout Session for Pro subscription
export async function createCheckoutSession(
  userId: string,
  email: string,
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
  signature: string
): Stripe.Event
```

**Implementation Notes:**
- Store Stripe customer ID in `subscriptionsTable.stripeCustomerId`
- Use `stripe.customers.create()` if customer doesn't exist
- Include `metadata: { userId }` in checkout session for webhook handling
- Handle case where Stripe is not configured (development mode)

### 3. Create Subscription Service (`server/services/subscription.ts`)

Create a new file with these functions:

```typescript
import { eq } from 'drizzle-orm';
import { getDb } from '../db';
import { subscriptionsTable } from '@shared/schema';

// Get user's current subscription
export async function getSubscription(userId: string): Promise<Subscription | null>

// Upgrade user to Pro tier
export async function upgradeSubscription(
  userId: string,
  stripeSubscriptionId: string,
  stripeCustomerId: string,
  currentPeriodStart: Date,
  currentPeriodEnd: Date
): Promise<void>

// Schedule downgrade at end of period
export async function scheduleDowngrade(userId: string): Promise<void>

// Immediately downgrade to Free (cancellation/failure)
export async function immediateDowngrade(userId: string): Promise<void>

// Update subscription status
export async function updateSubscriptionStatus(
  userId: string,
  status: 'active' | 'canceled' | 'past_due' | 'trialing'
): Promise<void>

// Update subscription period dates
export async function updateSubscriptionPeriod(
  userId: string,
  periodStart: Date,
  periodEnd: Date
): Promise<void>
```

### 4. Create Billing Routes (`server/routes/billing.ts`)

Create a new file with these endpoints:

```typescript
import { Router } from 'express';
import { requireAuth, loadSubscription, requirePro } from '../middleware/auth';
import * as stripe from '../services/stripe';
import * as subscription from '../services/subscription';

const router = Router();

// POST /api/v1/billing/checkout
// Create Stripe checkout session for Pro subscription
router.post('/checkout', requireAuth, loadSubscription, async (req, res) => {
  // 1. Verify user is on Free tier
  // 2. Create/get Stripe customer
  // 3. Create checkout session
  // 4. Return { success: true, checkoutUrl }
});

// POST /api/v1/billing/webhook
// Handle Stripe webhook events (raw body, signature verification)
router.post('/webhook',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    // 1. Verify webhook signature
    // 2. Handle event types (see below)
    // 3. Return 200 immediately
  }
);

// POST /api/v1/billing/portal
// Create Stripe Customer Portal session
router.post('/portal', requireAuth, loadSubscription, requirePro, async (req, res) => {
  // 1. Get Stripe customer ID from subscription
  // 2. Create portal session
  // 3. Return { success: true, portalUrl }
});

export default router;
```

**Webhook Events to Handle:**
- `checkout.session.completed` → upgradeSubscription()
- `customer.subscription.updated` → updateSubscriptionPeriod()
- `customer.subscription.deleted` → immediateDowngrade()
- `invoice.payment_failed` → updateSubscriptionStatus('past_due')
- `invoice.payment_succeeded` → updateSubscriptionStatus('active')

### 5. Register Routes in `server/index.ts`

Add the billing routes:
```typescript
import billingRoutes from './routes/billing';

// After auth routes
app.use('/api/v1/billing', billingRoutes);
```

### 6. Handle Raw Body for Webhooks

The Stripe webhook needs raw body for signature verification. Update `server/index.ts`:

```typescript
// Register webhook route BEFORE json body parser
app.use('/api/v1/billing/webhook', express.raw({ type: 'application/json' }));

// Then apply JSON parser for other routes
app.use(express.json());
```

---

## Testing Checklist

- [ ] `npm install stripe` completes without errors
- [ ] Server starts without errors (`npm run dev`)
- [ ] POST `/api/v1/billing/checkout` returns checkout URL (or mock response)
- [ ] POST `/api/v1/billing/webhook` accepts Stripe events
- [ ] POST `/api/v1/billing/portal` returns portal URL for Pro users
- [ ] Free users cannot access portal (403)
- [ ] Webhook updates subscription in database

## Stripe Test Cards
- Success: `4242 4242 4242 4242`
- Decline: `4000 0000 0000 0002`

## Development Mode (No Stripe Keys)

If `STRIPE_SECRET_KEY` is not set, implement mock mode:
```typescript
export async function createCheckoutSession(...): Promise<string> {
  if (!process.env.STRIPE_SECRET_KEY) {
    console.log('[MOCK] Would create checkout session for user:', userId);
    return 'https://example.com/mock-checkout';
  }
  // Real implementation
}
```

---

## Files Created/Modified

| File | Action |
|------|--------|
| `server/services/stripe.ts` | Create |
| `server/services/subscription.ts` | Create |
| `server/routes/billing.ts` | Create |
| `server/index.ts` | Modify (add routes) |
| `package.json` | Modify (add stripe) |

## Completion Criteria

1. All endpoints respond correctly
2. Subscription upgrades work via webhook
3. No TypeScript errors (`npm run check`)
4. Server starts and runs without errors
5. Existing functionality unaffected

---

## Commit Message Template
```
feat(billing): implement Stripe integration for Pro subscriptions

- Add Stripe service for checkout and portal sessions
- Add subscription service for tier management
- Add billing routes (checkout, webhook, portal)
- Handle webhook events for subscription lifecycle

Co-Authored-By: Claude <noreply@anthropic.com>
```
