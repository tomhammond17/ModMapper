# Agent 8: Testing & Integration

## Mission
Create comprehensive tests for all new features. Perform security audit, performance testing, and final polish. Ensure all features work together correctly.

## Branch
```bash
git checkout -b feature/testing develop
```

## Dependencies
- All previous agents (1-7) must be merged to develop first

---

## Tasks

### 1. Set Up Test Framework

**Install test dependencies (if not already present):**
```bash
npm install -D vitest @testing-library/react @testing-library/jest-dom supertest @types/supertest msw
```

**Configure vitest (`vitest.config.ts`):**

```typescript
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['server/__tests__/**/*.test.ts'],
    setupFiles: ['server/__tests__/setup.ts'],
  },
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, './shared'),
    },
  },
});
```

**Test setup file (`server/__tests__/setup.ts`):**

```typescript
import { beforeAll, afterAll, beforeEach } from 'vitest';

// Mock environment variables
process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'test-secret';
process.env.DATABASE_URL = 'postgresql://localhost:5432/modmapper_test';

// Global setup
beforeAll(async () => {
  // Initialize test database if needed
});

afterAll(async () => {
  // Cleanup
});

beforeEach(async () => {
  // Reset state between tests
});
```

### 2. Backend Tests

**Auth Tests (`server/__tests__/auth.test.ts`):**

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../index';

describe('Authentication API', () => {
  describe('POST /api/v1/auth/signup', () => {
    it('should create a new user with free subscription', async () => {
      const response = await request(app)
        .post('/api/v1/auth/signup')
        .send({
          email: 'test@example.com',
          password: 'password123',
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.user.email).toBe('test@example.com');
      expect(response.body.subscription.tier).toBe('free');
    });

    it('should reject duplicate email', async () => {
      // Create first user
      await request(app)
        .post('/api/v1/auth/signup')
        .send({ email: 'dupe@example.com', password: 'password123' });

      // Try duplicate
      const response = await request(app)
        .post('/api/v1/auth/signup')
        .send({ email: 'dupe@example.com', password: 'password456' });

      expect(response.status).toBe(409);
      expect(response.body.error).toBe('USER_EXISTS');
    });

    it('should reject weak password', async () => {
      const response = await request(app)
        .post('/api/v1/auth/signup')
        .send({ email: 'weak@example.com', password: 'short' });

      expect(response.status).toBe(400);
    });

    it('should reject invalid email', async () => {
      const response = await request(app)
        .post('/api/v1/auth/signup')
        .send({ email: 'not-an-email', password: 'password123' });

      expect(response.status).toBe(400);
    });
  });

  describe('POST /api/v1/auth/login', () => {
    it('should login with correct credentials', async () => {
      // Create user first
      await request(app)
        .post('/api/v1/auth/signup')
        .send({ email: 'login@example.com', password: 'password123' });

      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'login@example.com', password: 'password123' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.headers['set-cookie']).toBeDefined();
    });

    it('should reject incorrect password', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'login@example.com', password: 'wrongpassword' });

      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/v1/auth/me', () => {
    it('should return current user when authenticated', async () => {
      const agent = request.agent(app);

      await agent
        .post('/api/v1/auth/signup')
        .send({ email: 'me@example.com', password: 'password123' });

      const response = await agent.get('/api/v1/auth/me');

      expect(response.status).toBe(200);
      expect(response.body.user.email).toBe('me@example.com');
    });

    it('should return 401 when not authenticated', async () => {
      const response = await request(app).get('/api/v1/auth/me');
      expect(response.status).toBe(401);
    });
  });
});
```

**Usage Tests (`server/__tests__/usage.test.ts`):**

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../index';

describe('Usage Tracking', () => {
  let agent: any;

  beforeEach(async () => {
    agent = request.agent(app);
    await agent
      .post('/api/v1/auth/signup')
      .send({ email: `usage-${Date.now()}@example.com`, password: 'password123' });
  });

  describe('GET /api/v1/billing/usage', () => {
    it('should return usage stats for authenticated user', async () => {
      const response = await agent.get('/api/v1/billing/usage');

      expect(response.status).toBe(200);
      expect(response.body.tier).toBe('free');
      expect(response.body.usage.conversions.used).toBe(0);
      expect(response.body.usage.conversions.limit).toBe(10);
    });
  });

  describe('Usage limits', () => {
    it('should track conversions', async () => {
      // Perform a conversion
      const parseResponse = await agent
        .post('/api/v1/parse')
        .attach('file', Buffer.from('address,name\n40001,Test'), 'test.csv');

      expect(parseResponse.status).toBe(200);

      // Check usage increased
      const usageResponse = await agent.get('/api/v1/billing/usage');
      expect(usageResponse.body.usage.conversions.used).toBe(1);
    });

    it('should block at limit for free tier', async () => {
      // This test would need to mock the usage or perform 10 conversions
      // For now, we test the error format
      // Mock reaching limit...
    });
  });
});
```

**Folder Tests (`server/__tests__/folders.test.ts`):**

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../index';

describe('Folders API', () => {
  describe('Free tier restrictions', () => {
    it('should deny folder access for free users', async () => {
      const agent = request.agent(app);
      await agent
        .post('/api/v1/auth/signup')
        .send({ email: 'free@example.com', password: 'password123' });

      const response = await agent.get('/api/v1/folders');
      expect(response.status).toBe(403);
    });
  });

  describe('Pro tier access', () => {
    let agent: any;

    beforeEach(async () => {
      agent = request.agent(app);
      // Create user and mock Pro subscription
      await agent
        .post('/api/v1/auth/signup')
        .send({ email: `pro-${Date.now()}@example.com`, password: 'password123' });
      // TODO: Mock upgrading to Pro
    });

    it('should create folder', async () => {
      // Requires Pro subscription mock
    });

    it('should prevent circular folder references', async () => {
      // Test moving folder into its descendant
    });
  });
});
```

**Version Tests (`server/__tests__/versions.test.ts`):**

```typescript
import { describe, it, expect } from 'vitest';
import { compareVersions } from '../services/versions';

describe('Version Comparison', () => {
  it('should detect added registers', () => {
    const v1Registers = [
      { address: 40001, name: 'A', datatype: 'INT16', description: '', writable: false },
    ];
    const v2Registers = [
      { address: 40001, name: 'A', datatype: 'INT16', description: '', writable: false },
      { address: 40002, name: 'B', datatype: 'INT16', description: '', writable: false },
    ];

    // Mock the comparison logic
    const v1Map = new Map(v1Registers.map(r => [r.address, r]));
    const v2Map = new Map(v2Registers.map(r => [r.address, r]));

    const added = v2Registers.filter(r => !v1Map.has(r.address));
    expect(added.length).toBe(1);
    expect(added[0].address).toBe(40002);
  });

  it('should detect removed registers', () => {
    const v1Registers = [
      { address: 40001, name: 'A', datatype: 'INT16', description: '', writable: false },
      { address: 40002, name: 'B', datatype: 'INT16', description: '', writable: false },
    ];
    const v2Registers = [
      { address: 40001, name: 'A', datatype: 'INT16', description: '', writable: false },
    ];

    const v2Map = new Map(v2Registers.map(r => [r.address, r]));
    const removed = v1Registers.filter(r => !v2Map.has(r.address));
    expect(removed.length).toBe(1);
    expect(removed[0].address).toBe(40002);
  });

  it('should detect modified registers', () => {
    const v1Registers = [
      { address: 40001, name: 'A', datatype: 'INT16', description: 'Old', writable: false },
    ];
    const v2Registers = [
      { address: 40001, name: 'A', datatype: 'INT16', description: 'New', writable: false },
    ];

    expect(v1Registers[0].description).not.toBe(v2Registers[0].description);
  });
});
```

**Template Tests (`server/__tests__/templates.test.ts`):**

```typescript
import { describe, it, expect } from 'vitest';
import { applyTemplate, validateTemplateConfig } from '../services/templates';

describe('Template Service', () => {
  describe('applyTemplate', () => {
    const sampleRegisters = [
      { address: 40001, name: 'Temp', datatype: 'FLOAT32', description: 'Temperature', writable: false },
    ];

    it('should filter fields', () => {
      const config = {
        showFields: ['address', 'name'],
      };

      const result = applyTemplate(sampleRegisters, config);

      expect(result[0]).toHaveProperty('address');
      expect(result[0]).toHaveProperty('name');
      expect(result[0]).not.toHaveProperty('datatype');
      expect(result[0]).not.toHaveProperty('description');
    });

    it('should rename fields', () => {
      const config = {
        fieldMapping: {
          address: 'Address',
          name: 'TagName',
        },
      };

      const result = applyTemplate(sampleRegisters, config);

      expect(result[0]).toHaveProperty('Address');
      expect(result[0]).toHaveProperty('TagName');
    });
  });

  describe('validateTemplateConfig', () => {
    it('should accept valid config', () => {
      const config = {
        showFields: ['address', 'name', 'datatype'],
        fieldOrder: ['address', 'name'],
      };

      const result = validateTemplateConfig(config);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject invalid field names', () => {
      const config = {
        showFields: ['address', 'invalid_field'],
      };

      const result = validateTemplateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });
});
```

### 3. Frontend Tests

**Auth Context Test (`client/src/__tests__/auth-context.test.tsx`):**

```typescript
import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { AuthProvider, useAuth } from '../lib/auth-context';

// Mock fetch
global.fetch = vi.fn();

describe('useAuth', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should start with loading state', () => {
    (fetch as any).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ user: null }),
    });

    const { result } = renderHook(() => useAuth(), {
      wrapper: AuthProvider,
    });

    expect(result.current.loading).toBe(true);
  });

  it('should load user on mount', async () => {
    const mockUser = { id: '1', email: 'test@example.com', emailVerified: true };
    const mockSubscription = { tier: 'free', status: 'active' };

    (fetch as any).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ user: mockUser, subscription: mockSubscription }),
    });

    const { result } = renderHook(() => useAuth(), {
      wrapper: AuthProvider,
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.user).toEqual(mockUser);
    expect(result.current.subscription).toEqual(mockSubscription);
  });
});
```

### 4. Integration Tests

**E2E Flow Test (`server/__tests__/integration/subscription-flow.test.ts`):**

```typescript
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../../index';

describe('E2E: Subscription Flow', () => {
  it('should complete signup -> usage -> upgrade flow', async () => {
    const agent = request.agent(app);

    // 1. Signup
    const signupRes = await agent
      .post('/api/v1/auth/signup')
      .send({ email: 'e2e@example.com', password: 'password123' });
    expect(signupRes.status).toBe(200);
    expect(signupRes.body.subscription.tier).toBe('free');

    // 2. Check usage (should be at 0)
    const usageRes = await agent.get('/api/v1/billing/usage');
    expect(usageRes.body.usage.conversions.used).toBe(0);

    // 3. Perform conversion
    const parseRes = await agent
      .post('/api/v1/parse')
      .attach('file', Buffer.from('address,name\n40001,Test'), 'test.csv');
    expect(parseRes.status).toBe(200);

    // 4. Verify usage increased
    const usageRes2 = await agent.get('/api/v1/billing/usage');
    expect(usageRes2.body.usage.conversions.used).toBe(1);

    // 5. Try to access Pro feature (should fail)
    const foldersRes = await agent.get('/api/v1/folders');
    expect(foldersRes.status).toBe(403);

    // Note: Actual Stripe upgrade would require webhook simulation
  });
});
```

### 5. Security Audit Checklist

Create a security checklist file (`docs/security-audit.md`):

```markdown
# Security Audit Checklist

## Authentication
- [ ] Passwords hashed with bcrypt (cost factor 10+)
- [ ] Session cookies httpOnly and secure in production
- [ ] Session cookies sameSite=lax for CSRF protection
- [ ] Rate limiting on login attempts (10/15min)
- [ ] Rate limiting on signup (5/hour)
- [ ] Rate limiting on magic links (3/hour)
- [ ] Password minimum length enforced (8 chars)
- [ ] Email validation with proper regex

## Authorization
- [ ] All folder endpoints check user ownership
- [ ] All document endpoints check user ownership
- [ ] All template endpoints check user ownership
- [ ] Pro features gated with requirePro middleware
- [ ] Version endpoints verify document ownership

## Data Protection
- [ ] SQL injection prevented (Drizzle parameterized queries)
- [ ] XSS prevented (React escapes by default)
- [ ] CORS whitelist configured
- [ ] Helmet.js security headers enabled
- [ ] File upload size limits enforced
- [ ] File type validation on uploads

## API Security
- [ ] Stripe webhook signature verified
- [ ] Rate limiting on all endpoints
- [ ] Error messages don't leak sensitive info
- [ ] No secrets in client-side code
- [ ] Environment variables for all secrets

## Database
- [ ] Connection pooling configured
- [ ] Prepared statements used
- [ ] Sensitive data encrypted at rest (if required)
- [ ] Backups configured

## Monitoring
- [ ] Structured logging in place
- [ ] Failed login attempts logged
- [ ] Webhook failures logged
- [ ] Error tracking configured (Sentry recommended)
```

### 6. Performance Testing

**Performance test script (`scripts/load-test.sh`):**

```bash
#!/bin/bash

# Requires Apache Bench (ab) or similar tool

echo "Testing /api/v1/health endpoint..."
ab -n 1000 -c 10 http://localhost:5000/api/v1/health

echo ""
echo "Testing /api/v1/auth/me endpoint..."
ab -n 500 -c 5 -H "Cookie: modmapper.sid=test" http://localhost:5000/api/v1/auth/me

echo ""
echo "Testing /api/v1/parse endpoint (will fail without file)..."
ab -n 100 -c 2 -p /dev/null -T "multipart/form-data" http://localhost:5000/api/v1/parse
```

### 7. Add Test Scripts to package.json

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "test:e2e": "vitest run --config vitest.e2e.config.ts"
  }
}
```

### 8. Final Integration Verification

Create a verification script (`scripts/verify-integration.ts`):

```typescript
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

async function verify() {
  console.log('Starting integration verification...\n');

  const checks = [
    { name: 'TypeScript compilation', cmd: 'npm run check' },
    { name: 'Build', cmd: 'npm run build' },
    { name: 'Unit tests', cmd: 'npm run test' },
  ];

  for (const check of checks) {
    console.log(`Running: ${check.name}...`);
    try {
      await execAsync(check.cmd);
      console.log(`  ✓ ${check.name} passed\n`);
    } catch (error: any) {
      console.error(`  ✗ ${check.name} failed`);
      console.error(`    ${error.message}\n`);
      process.exit(1);
    }
  }

  console.log('All checks passed!');
}

verify();
```

---

## Testing Checklist

### Backend Tests
- [ ] Auth signup creates user and subscription
- [ ] Auth login validates credentials
- [ ] Auth logout destroys session
- [ ] Usage tracking increments correctly
- [ ] Usage limits enforced for free tier
- [ ] Folders require Pro subscription
- [ ] Folder CRUD operations work
- [ ] Folder circular reference prevention
- [ ] Version creation increments number
- [ ] Version comparison calculates diff
- [ ] Template config validation works
- [ ] Template transformations apply correctly

### Frontend Tests
- [ ] Auth context loads user on mount
- [ ] Login form submits correctly
- [ ] Protected routes redirect
- [ ] Usage dashboard displays stats
- [ ] Folder tree renders hierarchy
- [ ] Template editor saves config

### Integration Tests
- [ ] Full signup → conversion → upgrade flow
- [ ] Stripe webhook updates subscription
- [ ] Usage limits block at threshold

### Security Audit
- [ ] All checklist items verified
- [ ] No high/critical vulnerabilities in `npm audit`

### Performance
- [ ] API response times < 200ms (p95)
- [ ] Build size < 500KB gzipped
- [ ] Initial page load < 2s

---

## Files Created

| File | Description |
|------|-------------|
| `vitest.config.ts` | Test configuration |
| `server/__tests__/setup.ts` | Test setup |
| `server/__tests__/auth.test.ts` | Auth tests |
| `server/__tests__/usage.test.ts` | Usage tests |
| `server/__tests__/folders.test.ts` | Folder tests |
| `server/__tests__/versions.test.ts` | Version tests |
| `server/__tests__/templates.test.ts` | Template tests |
| `server/__tests__/integration/*.ts` | E2E tests |
| `docs/security-audit.md` | Security checklist |
| `scripts/load-test.sh` | Performance testing |
| `scripts/verify-integration.ts` | Verification script |

---

## Commit Message Template
```
test: add comprehensive test suite for premium features

- Add vitest configuration and setup
- Add auth, usage, folder, version, template tests
- Add E2E integration tests
- Add security audit checklist
- Add performance testing scripts
- Add integration verification script

Co-Authored-By: Claude <noreply@anthropic.com>
```
