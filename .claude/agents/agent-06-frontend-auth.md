# Agent 6: Frontend Auth & Billing UI

## Mission
Build React components for authentication (login, signup, verify) and billing (pricing, usage dashboard, upgrade modal). Create auth context for state management.

## Branch
```bash
git checkout -b feature/frontend-auth develop
```

## Dependencies
- Agents 1-2 (Backend Stripe & Usage) should be merged first
- Backend auth endpoints already exist from Phase 2

---

## Tasks

### 1. Create API Endpoints Helper (`client/src/lib/api.ts`)

Update or create the API endpoints configuration:

```typescript
const API_BASE = '/api/v1';

export const apiEndpoints = {
  auth: {
    signup: `${API_BASE}/auth/signup`,
    login: `${API_BASE}/auth/login`,
    logout: `${API_BASE}/auth/logout`,
    me: `${API_BASE}/auth/me`,
    magicLink: `${API_BASE}/auth/magic-link`,
    verifyEmail: (token: string) => `${API_BASE}/auth/verify-email/${token}`,
    verify: (token: string) => `${API_BASE}/auth/verify/${token}`,
  },
  billing: {
    checkout: `${API_BASE}/billing/checkout`,
    portal: `${API_BASE}/billing/portal`,
    usage: `${API_BASE}/billing/usage`,
  },
};

// Fetch helper with credentials
export async function apiFetch(url: string, options: RequestInit = {}) {
  const response = await fetch(url, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Request failed' }));
    throw new Error(error.message || `HTTP ${response.status}`);
  }

  return response.json();
}
```

### 2. Create Auth Context (`client/src/lib/auth-context.tsx`)

```typescript
import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { apiEndpoints, apiFetch } from './api';

interface User {
  id: string;
  email: string;
  emailVerified: boolean;
}

interface Subscription {
  tier: 'free' | 'pro';
  status: 'active' | 'canceled' | 'past_due' | 'trialing';
  currentPeriodEnd?: string;
}

interface AuthContextType {
  user: User | null;
  subscription: Subscription | null;
  loading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  requestMagicLink: (email: string) => Promise<string>;
  refetch: () => Promise<void>;
  isPro: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchUser = useCallback(async () => {
    try {
      setError(null);
      const data = await apiFetch(apiEndpoints.auth.me);
      setUser(data.user);
      setSubscription(data.subscription);
    } catch (err) {
      setUser(null);
      setSubscription(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  const login = async (email: string, password: string) => {
    setError(null);
    try {
      await apiFetch(apiEndpoints.auth.login, {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      await fetchUser();
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  };

  const signup = async (email: string, password: string) => {
    setError(null);
    try {
      await apiFetch(apiEndpoints.auth.signup, {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      await fetchUser();
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  };

  const logout = async () => {
    await apiFetch(apiEndpoints.auth.logout, { method: 'POST' });
    setUser(null);
    setSubscription(null);
  };

  const requestMagicLink = async (email: string): Promise<string> => {
    const data = await apiFetch(apiEndpoints.auth.magicLink, {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
    return data.message;
  };

  const isPro = subscription?.tier === 'pro' && subscription?.status === 'active';

  return (
    <AuthContext.Provider value={{
      user,
      subscription,
      loading,
      error,
      login,
      signup,
      logout,
      requestMagicLink,
      refetch: fetchUser,
      isPro,
    }}>
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

### 3. Create Protected Route Component (`client/src/components/protected-route.tsx`)

```typescript
import { useAuth } from '@/lib/auth-context';
import { useLocation } from 'wouter';
import { useEffect } from 'react';
import { Loader2 } from 'lucide-react';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requirePro?: boolean;
}

export function ProtectedRoute({ children, requirePro = false }: ProtectedRouteProps) {
  const { user, loading, isPro } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!loading) {
      if (!user) {
        setLocation('/login');
      } else if (requirePro && !isPro) {
        setLocation('/pricing');
      }
    }
  }, [user, loading, isPro, requirePro, setLocation]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user || (requirePro && !isPro)) {
    return null;
  }

  return <>{children}</>;
}
```

### 4. Create Login Page (`client/src/pages/auth/login.tsx`)

```typescript
import { useState } from 'react';
import { useLocation, Link } from 'wouter';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Mail, Lock, Wand2 } from 'lucide-react';

export function LoginPage() {
  const [, setLocation] = useLocation();
  const { login, requestMagicLink } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [useMagicLink, setUseMagicLink] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [magicLinkSent, setMagicLinkSent] = useState(false);

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      await login(email, password);
      setLocation('/');
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      await requestMagicLink(email);
      setMagicLinkSent(true);
    } catch (err: any) {
      setError(err.message || 'Failed to send magic link');
    } finally {
      setLoading(false);
    }
  };

  if (magicLinkSent) {
    return (
      <div className="flex items-center justify-center min-h-screen p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <Mail className="w-12 h-12 mx-auto text-primary mb-4" />
            <CardTitle>Check Your Email</CardTitle>
            <CardDescription>
              We sent a magic link to <strong>{email}</strong>
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center text-muted-foreground">
            <p>Click the link in your email to log in.</p>
            <p className="mt-2 text-sm">The link expires in 15 minutes.</p>
          </CardContent>
          <CardFooter className="justify-center">
            <Button variant="ghost" onClick={() => setMagicLinkSent(false)}>
              Use a different email
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Log In</CardTitle>
          <CardDescription>
            {useMagicLink
              ? 'Enter your email to receive a magic link'
              : 'Enter your credentials to continue'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={useMagicLink ? handleMagicLink : handlePasswordLogin} className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  className="pl-10"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
            </div>

            {!useMagicLink && (
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="password"
                    type="password"
                    placeholder="Your password"
                    className="pl-10"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>
              </div>
            )}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : useMagicLink ? (
                <Wand2 className="w-4 h-4 mr-2" />
              ) : null}
              {loading ? 'Please wait...' : useMagicLink ? 'Send Magic Link' : 'Log In'}
            </Button>
          </form>

          <div className="mt-4">
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={() => setUseMagicLink(!useMagicLink)}
            >
              {useMagicLink ? 'Use password instead' : 'Use magic link instead'}
            </Button>
          </div>
        </CardContent>
        <CardFooter className="justify-center">
          <p className="text-sm text-muted-foreground">
            Don't have an account?{' '}
            <Link href="/signup" className="text-primary hover:underline">
              Sign up
            </Link>
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}
```

### 5. Create Signup Page (`client/src/pages/auth/signup.tsx`)

```typescript
import { useState } from 'react';
import { useLocation, Link } from 'wouter';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Mail, Lock, CheckCircle } from 'lucide-react';

export function SignupPage() {
  const [, setLocation] = useLocation();
  const { signup } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    setLoading(true);

    try {
      await signup(email, password);
      setLocation('/');
    } catch (err: any) {
      setError(err.message || 'Signup failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Create Account</CardTitle>
          <CardDescription>
            Sign up to save documents and access Pro features
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  className="pl-10"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="password"
                  type="password"
                  placeholder="At least 8 characters"
                  className="pl-10"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <div className="relative">
                <CheckCircle className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="confirmPassword"
                  type="password"
                  placeholder="Confirm your password"
                  className="pl-10"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
              </div>
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {loading ? 'Creating account...' : 'Create Account'}
            </Button>
          </form>

          <div className="mt-4 text-xs text-muted-foreground text-center">
            By signing up, you agree to our Terms of Service and Privacy Policy.
          </div>
        </CardContent>
        <CardFooter className="justify-center">
          <p className="text-sm text-muted-foreground">
            Already have an account?{' '}
            <Link href="/login" className="text-primary hover:underline">
              Log in
            </Link>
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}
```

### 6. Create Verify Page (`client/src/pages/auth/verify.tsx`)

```typescript
import { useEffect, useState } from 'react';
import { useLocation, useRoute } from 'wouter';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle, XCircle } from 'lucide-react';
import { apiEndpoints, apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

export function VerifyPage() {
  const [, setLocation] = useLocation();
  const [, params] = useRoute('/verify/:token');
  const { refetch } = useAuth();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const verify = async () => {
      if (!params?.token) {
        setStatus('error');
        setMessage('Invalid verification link');
        return;
      }

      try {
        const response = await apiFetch(apiEndpoints.auth.verify(params.token));
        setStatus('success');
        setMessage(response.message || 'Verification successful!');
        await refetch();
        // Auto-redirect after 2 seconds
        setTimeout(() => setLocation('/'), 2000);
      } catch (err: any) {
        setStatus('error');
        setMessage(err.message || 'Verification failed');
      }
    };

    verify();
  }, [params?.token, refetch, setLocation]);

  return (
    <div className="flex items-center justify-center min-h-screen p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          {status === 'loading' && <Loader2 className="w-12 h-12 mx-auto animate-spin text-primary" />}
          {status === 'success' && <CheckCircle className="w-12 h-12 mx-auto text-green-500" />}
          {status === 'error' && <XCircle className="w-12 h-12 mx-auto text-destructive" />}
          <CardTitle className="mt-4">
            {status === 'loading' && 'Verifying...'}
            {status === 'success' && 'Verified!'}
            {status === 'error' && 'Verification Failed'}
          </CardTitle>
        </CardHeader>
        <CardContent className="text-center">
          <p className="text-muted-foreground">{message}</p>
          {status !== 'loading' && (
            <Button className="mt-4" onClick={() => setLocation('/')}>
              Go to Home
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
```

### 7. Create Billing Components

**Tier Badge (`client/src/components/billing/tier-badge.tsx`):**

```typescript
import { Badge } from '@/components/ui/badge';
import { Crown, User } from 'lucide-react';

interface TierBadgeProps {
  tier: 'free' | 'pro';
  className?: string;
}

export function TierBadge({ tier, className }: TierBadgeProps) {
  if (tier === 'pro') {
    return (
      <Badge className={`bg-gradient-to-r from-amber-500 to-orange-500 ${className}`}>
        <Crown className="w-3 h-3 mr-1" />
        Pro
      </Badge>
    );
  }

  return (
    <Badge variant="secondary" className={className}>
      <User className="w-3 h-3 mr-1" />
      Free
    </Badge>
  );
}
```

**Usage Dashboard (`client/src/components/billing/usage-dashboard.tsx`):**

```typescript
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { apiEndpoints, apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { TierBadge } from './tier-badge';
import { Zap, FileText, Infinity } from 'lucide-react';

export function UsageDashboard() {
  const { isPro } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ['usage'],
    queryFn: () => apiFetch(apiEndpoints.billing.usage),
  });

  if (isLoading || !data) {
    return null;
  }

  const { tier, usage, periodEnd } = data;
  const conversionPercent = usage.conversions.unlimited
    ? 0
    : (usage.conversions.used / usage.conversions.limit) * 100;
  const tokenPercent = usage.tokens.unlimited
    ? 0
    : (usage.tokens.used / usage.tokens.limit) * 100;

  const periodEndDate = new Date(periodEnd).toLocaleDateString();

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-lg">Usage This Month</CardTitle>
        <TierBadge tier={tier} />
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Conversions */}
        <div>
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="flex items-center gap-2">
              <FileText className="w-4 h-4" />
              Conversions
            </span>
            <span className="font-medium">
              {usage.conversions.used}
              {usage.conversions.unlimited ? (
                <Infinity className="w-4 h-4 inline ml-1" />
              ) : (
                ` / ${usage.conversions.limit}`
              )}
            </span>
          </div>
          {!usage.conversions.unlimited && (
            <Progress value={conversionPercent} className="h-2" />
          )}
        </div>

        {/* Tokens */}
        <div>
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="flex items-center gap-2">
              <Zap className="w-4 h-4" />
              AI Tokens
            </span>
            <span className="font-medium">
              {usage.tokens.used.toLocaleString()}
              {usage.tokens.unlimited ? (
                <Infinity className="w-4 h-4 inline ml-1" />
              ) : (
                ` / ${usage.tokens.limit.toLocaleString()}`
              )}
            </span>
          </div>
          {!usage.tokens.unlimited && (
            <Progress value={tokenPercent} className="h-2" />
          )}
        </div>

        <p className="text-xs text-muted-foreground">
          Resets on {periodEndDate}
        </p>

        {tier === 'free' && (
          <Button className="w-full" asChild>
            <a href="/pricing">Upgrade to Pro</a>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
```

### 8. Create User Menu Component (`client/src/components/user-menu.tsx`)

```typescript
import { useAuth } from '@/lib/auth-context';
import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { TierBadge } from './billing/tier-badge';
import { User, LogOut, CreditCard, Settings } from 'lucide-react';
import { apiEndpoints, apiFetch } from '@/lib/api';

export function UserMenu() {
  const { user, subscription, logout, loading } = useAuth();

  if (loading) return null;

  if (!user) {
    return (
      <div className="flex gap-2">
        <Button variant="ghost" asChild>
          <Link href="/login">Log In</Link>
        </Button>
        <Button asChild>
          <Link href="/signup">Sign Up</Link>
        </Button>
      </div>
    );
  }

  const handlePortal = async () => {
    try {
      const data = await apiFetch(apiEndpoints.billing.portal, { method: 'POST' });
      window.location.href = data.portalUrl;
    } catch (err) {
      console.error('Failed to open billing portal', err);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="flex items-center gap-2">
          <User className="w-4 h-4" />
          <span className="hidden sm:inline">{user.email}</span>
          <TierBadge tier={subscription?.tier || 'free'} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>
          <div className="flex flex-col">
            <span>{user.email}</span>
            {!user.emailVerified && (
              <span className="text-xs text-muted-foreground">Email not verified</span>
            )}
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        {subscription?.tier === 'pro' && (
          <DropdownMenuItem onClick={handlePortal}>
            <CreditCard className="w-4 h-4 mr-2" />
            Manage Billing
          </DropdownMenuItem>
        )}

        {subscription?.tier === 'free' && (
          <DropdownMenuItem asChild>
            <Link href="/pricing">
              <CreditCard className="w-4 h-4 mr-2" />
              Upgrade to Pro
            </Link>
          </DropdownMenuItem>
        )}

        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={logout}>
          <LogOut className="w-4 h-4 mr-2" />
          Log Out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

### 9. Update App.tsx with Routes

```typescript
import { AuthProvider } from '@/lib/auth-context';
import { LoginPage } from '@/pages/auth/login';
import { SignupPage } from '@/pages/auth/signup';
import { VerifyPage } from '@/pages/auth/verify';
import { ProtectedRoute } from '@/components/protected-route';
import { Switch, Route } from 'wouter';

function App() {
  return (
    <AuthProvider>
      <Switch>
        <Route path="/login" component={LoginPage} />
        <Route path="/signup" component={SignupPage} />
        <Route path="/verify/:token" component={VerifyPage} />
        <Route path="/">
          {/* Main app content */}
        </Route>
      </Switch>
    </AuthProvider>
  );
}
```

---

## Testing Checklist

- [ ] Login page renders correctly
- [ ] Signup page creates account
- [ ] Magic link flow works
- [ ] Auth context provides user state
- [ ] Protected routes redirect to login
- [ ] User menu shows correct tier
- [ ] Usage dashboard shows stats
- [ ] Logout clears session

---

## Files Created

| File | Description |
|------|-------------|
| `client/src/lib/auth-context.tsx` | Auth state management |
| `client/src/components/protected-route.tsx` | Route protection |
| `client/src/pages/auth/login.tsx` | Login page |
| `client/src/pages/auth/signup.tsx` | Signup page |
| `client/src/pages/auth/verify.tsx` | Verification page |
| `client/src/components/billing/tier-badge.tsx` | Tier indicator |
| `client/src/components/billing/usage-dashboard.tsx` | Usage stats |
| `client/src/components/user-menu.tsx` | User dropdown |

---

## Commit Message Template
```
feat(frontend): implement auth and billing UI components

- Add auth context with login/signup/logout
- Add login and signup pages with magic link support
- Add email verification page
- Add protected route component
- Add usage dashboard and tier badge
- Add user menu with billing portal

Co-Authored-By: Claude <noreply@anthropic.com>
```
