# ModMapper Premium Features - Implementation Roadmap

## Overview

This roadmap details the implementation plan for 3 core premium features:
1. **Usage Tracking & Tier Enforcement**
2. **Document Storage with Folders & Versions**
3. **Custom Export Templates**

**Estimated Total Time**: 4-6 weeks (single developer)

---

## Phase 1: Foundation - Database Schema & Migrations

**Duration**: 2-3 days
**Dependencies**: None
**Complexity**: Medium

### Tasks

1. **Update Drizzle Schema** (`shared/schema.ts`)
   - Add users table
   - Add magic_links table
   - Add sessions table
   - Add subscriptions table
   - Add usage_tracking table
   - Add conversion_logs table
   - Add folders table
   - Add export_templates table
   - Update documents table (add userId, folderId, version fields)

2. **Create Migration Files**
   ```bash
   npm run db:push
   ```

3. **Add Indexes**
   - userId indexes on all user-related tables
   - Composite indexes for common queries
   - Path index on folders for fast tree queries

4. **Update Schema Types**
   - Export TypeScript types from schema
   - Update existing code to use new types

### Deliverables
- [ ] Updated `shared/schema.ts` with all new tables
- [ ] Migration applied to database
- [ ] TypeScript types exported and documented

---

## Phase 2: Authentication System

**Duration**: 3-4 days
**Dependencies**: Phase 1
**Complexity**: High

### Tasks

1. **Install Dependencies**
   ```bash
   npm install passport passport-local bcrypt express-session connect-pg-simple nodemailer
   npm install -D @types/passport @types/passport-local @types/bcrypt @types/express-session @types/nodemailer
   ```

2. **Create Auth Service** (`server/services/auth.ts`)
   - User registration with email validation
   - Password hashing with bcrypt (10 rounds)
   - Login with passport-local strategy
   - Magic link generation and verification
   - Email verification flow

3. **Setup Email Service** (`server/services/email.ts`)
   - Configure nodemailer with SMTP
   - Create email templates (verification, magic link, password reset)
   - Test email delivery

4. **Session Management** (`server/middleware/session.ts`)
   - Configure express-session
   - Use connect-pg-simple for PostgreSQL session store
   - Set secure cookie options (httpOnly, secure in prod, sameSite)

5. **Auth Middleware** (`server/middleware/auth.ts`)
   - `requireAuth` - ensure user is logged in
   - `optionalAuth` - attach user if logged in
   - `loadSubscription` - attach user's subscription to request

6. **Auth Routes** (`server/routes/auth.ts`)
   - POST `/api/v1/auth/signup` - Create account
   - POST `/api/v1/auth/login` - Email/password login
   - POST `/api/v1/auth/logout` - Destroy session
   - POST `/api/v1/auth/magic-link` - Request magic link
   - GET `/api/v1/auth/verify/:token` - Verify magic link
   - GET `/api/v1/auth/me` - Get current user + subscription
   - POST `/api/v1/auth/verify-email/:token` - Email verification

7. **Environment Variables**
   ```bash
   SESSION_SECRET=<generate-random-string>
   MAGIC_LINK_SECRET=<generate-random-string>
   SMTP_HOST=smtp.sendgrid.net
   SMTP_PORT=587
   SMTP_USER=apikey
   SMTP_PASS=<sendgrid-api-key>
   FROM_EMAIL=noreply@modmapper.com
   APP_URL=http://localhost:5000
   ```

### Deliverables
- [ ] Auth service with registration, login, magic links
- [ ] Email service with templates
- [ ] Session management configured
- [ ] Auth middleware created
- [ ] Auth routes implemented and tested
- [ ] Environment variables documented in `.env.example`

---

## Phase 3: Stripe Integration & Subscription Management

**Duration**: 3-4 days
**Dependencies**: Phase 2
**Complexity**: High

### Tasks

1. **Install Dependencies**
   ```bash
   npm install stripe
   npm install -D @types/stripe
   ```

2. **Create Stripe Service** (`server/services/stripe.ts`)
   - Initialize Stripe client
   - Create customer
   - Create checkout session
   - Create portal session
   - Webhook signature verification

3. **Subscription Service** (`server/services/subscription.ts`)
   - Get user subscription
   - Create default free subscription on signup
   - Update subscription status
   - Handle downgrades (mark for end of period)
   - Handle upgrades (immediate)

4. **Billing Routes** (`server/routes/billing.ts`)
   - POST `/api/v1/billing/checkout` - Create Stripe checkout
   - POST `/api/v1/billing/webhook` - Handle Stripe webhooks
   - POST `/api/v1/billing/portal` - Create customer portal session
   - GET `/api/v1/billing/usage` - Get current usage stats

5. **Webhook Handler**
   - `checkout.session.completed` - Activate Pro subscription
   - `customer.subscription.updated` - Update subscription status
   - `customer.subscription.deleted` - Downgrade to Free
   - `invoice.payment_failed` - Mark subscription as past_due
   - `invoice.payment_succeeded` - Ensure subscription is active

6. **Stripe Dashboard Setup**
   - Create product: "ModMapper Pro"
   - Create price: $X/month recurring
   - Get price ID for environment variable
   - Configure webhook endpoint in Stripe dashboard
   - Get webhook signing secret

7. **Environment Variables**
   ```bash
   STRIPE_SECRET_KEY=sk_test_...
   STRIPE_WEBHOOK_SECRET=whsec_...
   STRIPE_PRO_PRICE_ID=price_...
   ```

### Deliverables
- [ ] Stripe service with checkout and webhooks
- [ ] Subscription service with tier management
- [ ] Billing routes implemented
- [ ] Webhook handler for all subscription events
- [ ] Stripe dashboard configured
- [ ] Payment flow tested end-to-end

---

## Phase 4: Usage Tracking & Tier Enforcement

**Duration**: 2-3 days
**Dependencies**: Phase 3
**Complexity**: Medium

### Tasks

1. **Usage Service** (`server/services/usage.ts`)
   - `getMonthlyUsage(userId)` - Get current month's usage
   - `trackConversion(userId, format, tokensUsed)` - Log conversion
   - `incrementUsage(userId, conversions, tokens)` - Update counters
   - `resetMonthlyUsage()` - Cron job helper (future)

2. **Usage Middleware** (`server/middleware/usage.ts`)
   - `checkUsageLimits` - Verify user hasn't exceeded limits
   - `trackUsage` - Record conversion after success
   - Attach usage context to request

3. **Tier Enforcement Logic**
   ```typescript
   Free Tier:
   - conversionsUsed < 10 (for CSV/JSON/XML)
   - tokensUsed < 200,000 (for PDF)

   Pro Tier:
   - conversionsUsed: unlimited (for CSV/JSON/XML)
   - tokensUsed < 1,000,000 (for PDF)
   ```

4. **Update Parse Routes**
   - Add `requireAuth` middleware
   - Add `checkUsageLimits` middleware
   - Add `trackUsage` middleware
   - Update response to include usage stats

5. **Usage Dashboard Data**
   - GET `/api/v1/billing/usage` returns:
     ```json
     {
       "tier": "free",
       "conversions": {
         "used": 7,
         "limit": 10,
         "unlimited": false
       },
       "tokens": {
         "used": 150000,
         "limit": 200000,
         "unlimited": false
       },
       "periodEnd": "2026-02-01T00:00:00Z"
     }
     ```

6. **Error Responses**
   - 402 Payment Required for limit exceeded
   - Include upgrade URL in error response
   - Clear messaging about limits

### Deliverables
- [ ] Usage service with tracking functions
- [ ] Usage middleware with enforcement
- [ ] Parse routes updated with usage tracking
- [ ] Usage dashboard endpoint
- [ ] Limit exceeded error handling

---

## Phase 5: Document Storage with Folders

**Duration**: 3-4 days
**Dependencies**: Phase 4
**Complexity**: Medium-High

### Tasks

1. **Folder Service** (`server/services/folders.ts`)
   - `createFolder(userId, name, parentId)` - Create folder
   - `getFolders(userId)` - Get folder tree
   - `moveFolder(folderId, newParentId)` - Move folder
   - `deleteFolder(folderId)` - Delete folder + contents
   - `getFolderPath(folderId)` - Get breadcrumb path

2. **Update Storage Service** (`server/storage.ts`)
   - Add `userId` to all operations
   - Add `folderId` optional parameter
   - Update `saveDocument` to support Pro users
   - Add folder filtering to `getAllDocuments`

3. **Folder Routes** (`server/routes/folders.ts`)
   - GET `/api/v1/folders` - Get folder tree
   - POST `/api/v1/folders` - Create folder (Pro only)
   - GET `/api/v1/folders/:id` - Get folder details
   - PATCH `/api/v1/folders/:id` - Rename/move folder (Pro only)
   - DELETE `/api/v1/folders/:id` - Delete folder (Pro only)

4. **Update Document Routes**
   - Add `folderId` query parameter to GET `/api/v1/documents`
   - Add `folderId` to POST `/api/v1/documents` (Pro only)
   - Enforce ownership checks (users can only see their own docs)

5. **Pro Feature Gates**
   - Add `requirePro` middleware
   - Apply to folder routes
   - Apply to document save operations

6. **Materialized Path Pattern**
   - Store path as `/parent1/parent2/folder3`
   - Use for fast tree queries
   - Update path on folder moves

### Deliverables
- [ ] Folder service with CRUD operations
- [ ] Updated storage service with user isolation
- [ ] Folder routes with Pro gating
- [ ] Updated document routes with folder support
- [ ] Ownership and permission checks

---

## Phase 6: Version Control System

**Duration**: 2-3 days
**Dependencies**: Phase 5
**Complexity**: Medium

### Tasks

1. **Version Service** (`server/services/versions.ts`)
   - `createVersion(documentId, userId, registers)` - Create new version
   - `getVersionHistory(documentId, userId)` - Get all versions
   - `getVersion(documentId, versionNumber, userId)` - Get specific version
   - `compareVersions(documentId, v1, v2, userId)` - Diff versions

2. **Version Routes** (`server/routes/versions.ts`)
   - GET `/api/v1/documents/:id/versions` - List versions (Pro only)
   - POST `/api/v1/documents/:id/versions` - Create new version (Pro only)
   - GET `/api/v1/documents/:id/versions/:versionNumber` - Get version (Pro only)
   - GET `/api/v1/documents/:id/versions/compare?v1=1&v2=2` - Compare (Pro only)

3. **Version Storage Strategy**
   - Store full snapshots (not diffs) for simplicity
   - Mark latest version with `isLatestVersion = true`
   - Link versions via `parentDocumentId`
   - Auto-increment `versionNumber`

4. **Update Document Save**
   - When re-uploading same file, create new version
   - Detect duplicate filename in same folder
   - Prompt user: "Create new version or replace?"

5. **Version Metadata**
   - Track createdAt timestamp
   - Store file size
   - Calculate register count changes

### Deliverables
- [ ] Version service with history tracking
- [ ] Version routes with Pro gating
- [ ] Version comparison logic
- [ ] Document save flow with versioning
- [ ] Version metadata tracking

---

## Phase 7: Custom Export Templates

**Duration**: 3-4 days
**Dependencies**: Phase 5
**Complexity**: High

### Tasks

1. **Template Service** (`server/services/templates.ts`)
   - `createTemplate(userId, name, format, config)` - Save template
   - `getTemplates(userId, format?)` - List templates
   - `getTemplate(templateId, userId)` - Get template
   - `updateTemplate(templateId, userId, updates)` - Update template
   - `deleteTemplate(templateId, userId)` - Delete template
   - `applyTemplate(registers, template)` - Transform registers

2. **Template Configuration Schema**
   ```typescript
   interface TemplateConfig {
     // Field mapping: old name → new name
     fieldMapping?: {
       address?: string;
       name?: string;
       datatype?: string;
       description?: string;
       writable?: string;
     };

     // Field visibility
     showFields?: string[];

     // Field ordering (for CSV)
     fieldOrder?: string[];

     // Format-specific settings
     csv?: {
       delimiter?: ',' | ';' | '\t';
       includeHeader?: boolean;
       customHeaders?: string[];
     };

     json?: {
       rootKey?: string;
       nested?: boolean; // Group by some field?
       prettyPrint?: boolean;
     };

     xml?: {
       rootElement?: string;
       itemElement?: string;
       useAttributes?: boolean; // vs child elements
     };
   }
   ```

3. **Export Service** (`server/services/export.ts`)
   - Update existing exporters to accept template config
   - `exportWithTemplate(registers, format, templateConfig)`
   - Apply field mapping
   - Apply field filtering
   - Apply field ordering
   - Apply format-specific transformations

4. **Template Routes** (`server/routes/templates.ts`)
   - GET `/api/v1/templates` - List templates (Pro only)
   - POST `/api/v1/templates` - Create template (Pro only)
   - GET `/api/v1/templates/:id` - Get template (Pro only)
   - PATCH `/api/v1/templates/:id` - Update template (Pro only)
   - DELETE `/api/v1/templates/:id` - Delete template (Pro only)
   - POST `/api/v1/export` - Export with template (Pro only)

5. **Default Templates**
   - Create system default templates for common formats
   - "Standard Modbus CSV"
   - "Compact JSON"
   - "RSLogix XML"

### Deliverables
- [ ] Template service with CRUD operations
- [ ] Template configuration schema
- [ ] Export service with template support
- [ ] Template routes with Pro gating
- [ ] Default template library

---

## Phase 8: Frontend UI Components

**Duration**: 5-7 days
**Dependencies**: Phases 2-7
**Complexity**: High

### Tasks

1. **Auth UI** (`client/src/pages/auth/`)
   - Login page
   - Signup page
   - Magic link request page
   - Email verification page
   - Auth context provider
   - Protected route wrapper

2. **Subscription UI** (`client/src/components/billing/`)
   - Pricing page
   - Upgrade modal
   - Usage dashboard component
   - Billing portal link
   - Tier badge component

3. **Folder UI** (`client/src/components/folders/`)
   - Folder tree component
   - Create folder dialog
   - Rename folder dialog
   - Delete folder confirmation
   - Move folder drag-and-drop
   - Breadcrumb navigation

4. **Document Library UI** (`client/src/pages/library.tsx`)
   - Document list with folder filtering
   - Upload to folder
   - Document cards with metadata
   - Search and filter
   - Bulk operations

5. **Version Control UI** (`client/src/components/versions/`)
   - Version history panel
   - Create version button
   - Version comparison viewer
   - Restore version action

6. **Template Editor UI** (`client/src/pages/templates/`)
   - Template list page
   - Template editor
   - Field mapping interface (drag-drop)
   - Field visibility toggles
   - Format-specific settings
   - Template preview

7. **Update Home Page**
   - Add auth check
   - Show usage stats for authenticated users
   - Add "Save to Library" option for Pro users
   - Add "Use Template" option for Pro users
   - Add upgrade prompts for Free users

8. **Navigation Updates**
   - Add "Library" link to nav (authenticated only)
   - Add "Templates" link to nav (Pro only)
   - Add user menu with logout
   - Add tier badge to user menu

### Deliverables
- [ ] Complete auth flow UI
- [ ] Pricing and billing UI
- [ ] Folder management UI
- [ ] Document library page
- [ ] Version control UI
- [ ] Template editor UI
- [ ] Updated home page with premium features
- [ ] Navigation with auth states

---

## Phase 9: Testing & Polish

**Duration**: 3-5 days
**Dependencies**: Phase 8
**Complexity**: Medium

### Tasks

1. **Backend Tests**
   - Auth service tests (registration, login, magic links)
   - Subscription service tests (tier changes, webhooks)
   - Usage tracking tests (limits, enforcement)
   - Folder service tests (CRUD, tree operations)
   - Version service tests (history, comparison)
   - Template service tests (application, transformations)

2. **API Integration Tests**
   - Auth flow (signup → login → logout)
   - Stripe checkout flow (mock webhooks)
   - Usage limit enforcement
   - Pro feature gating
   - Folder operations
   - Document save with versioning
   - Template export

3. **Frontend Tests**
   - Auth component tests
   - Folder tree component tests
   - Template editor tests
   - Usage dashboard tests

4. **Manual Testing Checklist**
   - [ ] Signup flow (email verification)
   - [ ] Login flow (email/password + magic link)
   - [ ] Stripe checkout (test mode)
   - [ ] Usage tracking accuracy
   - [ ] Free tier limits enforced
   - [ ] Pro features gated properly
   - [ ] Folder creation and navigation
   - [ ] Document upload to folders
   - [ ] Version creation and history
   - [ ] Template creation and export
   - [ ] Subscription cancellation flow

5. **Security Audit**
   - [ ] SQL injection prevention (Drizzle ORM handles this)
   - [ ] XSS prevention (React handles this)
   - [ ] CSRF protection (session cookies with sameSite)
   - [ ] Rate limiting on auth endpoints
   - [ ] Password strength requirements
   - [ ] Email validation
   - [ ] Stripe webhook signature verification
   - [ ] User data isolation (ownership checks)

6. **Performance Testing**
   - [ ] Database query performance (check indexes)
   - [ ] Large folder tree rendering
   - [ ] Document list pagination
   - [ ] Version history for large documents
   - [ ] Template transformation performance

7. **Polish**
   - Error messages user-friendly
   - Loading states for all async operations
   - Success notifications
   - Empty states for folders, templates
   - Responsive design check
   - Dark mode compatibility
   - Accessibility audit (keyboard navigation, ARIA labels)

### Deliverables
- [ ] Test suite with >70% coverage
- [ ] Manual testing checklist completed
- [ ] Security audit passed
- [ ] Performance benchmarks acceptable
- [ ] UI polish complete

---

## Environment Variables Summary

Add to `.env`:

```bash
# Database (required)
DATABASE_URL=postgresql://user:pass@localhost:5432/modmapper

# Auth (required)
SESSION_SECRET=<generate-64-char-random-string>
MAGIC_LINK_SECRET=<generate-64-char-random-string>

# Email (required for production)
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASS=<sendgrid-api-key>
FROM_EMAIL=noreply@modmapper.com

# Stripe (required for billing)
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRO_PRICE_ID=price_...

# App Config
APP_URL=http://localhost:5000
NODE_ENV=development

# Existing
ANTHROPIC_API_KEY=...
PORT=5000
```

---

## Dependencies to Install

```bash
# Backend
npm install passport passport-local bcrypt express-session connect-pg-simple nodemailer stripe

# Dev Dependencies
npm install -D @types/passport @types/passport-local @types/bcrypt @types/express-session @types/nodemailer
```

---

## Database Migrations

After updating schema, run:

```bash
npm run db:push
```

For production, consider creating proper migration files:

```bash
npx drizzle-kit generate:pg
npx drizzle-kit migrate
```

---

## Success Metrics

After implementation, track:

1. **Conversion Rate**: Free → Pro signups
2. **Activation Rate**: Users who create first document/folder
3. **Retention**: Monthly active users by tier
4. **Usage Patterns**:
   - Average conversions per user
   - Average tokens used per user
   - Most popular export formats
   - Template adoption rate
5. **Revenue Metrics**:
   - MRR (Monthly Recurring Revenue)
   - Churn rate
   - Average revenue per user (ARPU)

---

## Future Enhancements (Post-MVP)

1. **OAuth Integration** (Google, Microsoft)
2. **API Keys** for programmatic access
3. **Batch Upload** (upload multiple files at once)
4. **Team Accounts** (share folders with teammates)
5. **Advanced Templates** (conditional logic, formulas)
6. **Export History** (track all exports)
7. **Webhooks** (notify on conversion complete)
8. **White-labeling** (Enterprise tier)
9. **Advanced Analytics** (usage charts, trends)
10. **Mobile App** (React Native)

---

## Questions for Consideration

1. **Free Trial**: Should Pro tier have a 14-day free trial?
2. **Annual Pricing**: Offer discounted annual plans?
3. **Student/Educational**: Special pricing for students?
4. **API Rate Limits**: Separate limits for API vs UI usage?
5. **Document Retention**: How long to keep documents for canceled Pro users?
6. **Export Limits**: Should Free tier have limits on exports too?
7. **Folder Depth**: Maximum folder nesting level?
8. **Document Size**: Maximum file size per upload?

---

## Ready to Start?

This roadmap provides a complete path to implementing all 3 premium features. We can start with **Phase 1: Foundation** whenever you're ready.

Would you like to begin implementation now, or do you have any questions about the roadmap?
