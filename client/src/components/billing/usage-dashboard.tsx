import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/auth-context";
import { TierBadge } from "./tier-badge";
import { ArrowRight } from "lucide-react";

interface UsageData {
  success: boolean;
  tier: "free" | "pro";
  conversions: { used: number; limit: number };
  tokens: { used: number; limit: number };
  month: string;
}

export function UsageDashboard() {
  const { isAuthenticated, isPro } = useAuth();
  const [, setLocation] = useLocation();

  const { data, isLoading } = useQuery<UsageData>({
    queryKey: ["billing", "usage"],
    queryFn: async () => {
      const res = await fetch("/api/v1/billing/usage", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch usage");
      return res.json();
    },
    enabled: isAuthenticated,
  });

  if (!isAuthenticated) return null;

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-32" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-2 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-2 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  const conversionsUnlimited = data.conversions.limit === -1 || data.conversions.limit === Infinity;
  const tokensUnlimited = data.tokens.limit === -1 || data.tokens.limit === Infinity;

  const conversionPercent = conversionsUnlimited
    ? 0
    : Math.min((data.conversions.used / data.conversions.limit) * 100, 100);

  const tokenPercent = tokensUnlimited
    ? 0
    : Math.min((data.tokens.used / data.tokens.limit) * 100, 100);

  const isNearLimit = !isPro && (conversionPercent > 80 || tokenPercent > 80);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-lg">Usage This Month</CardTitle>
        <TierBadge tier={data.tier} />
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Conversions</span>
            <span className="font-medium">
              {data.conversions.used}
              {!conversionsUnlimited && ` / ${data.conversions.limit}`}
              {conversionsUnlimited && " (Unlimited)"}
            </span>
          </div>
          {!conversionsUnlimited && (
            <Progress
              value={conversionPercent}
              className={cn("h-2", conversionPercent > 80 && "bg-destructive/20")}
            />
          )}
        </div>

        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">AI Tokens (PDF)</span>
            <span className="font-medium">
              {formatTokens(data.tokens.used)}
              {!tokensUnlimited && ` / ${formatTokens(data.tokens.limit)}`}
              {tokensUnlimited && " (Unlimited)"}
            </span>
          </div>
          {!tokensUnlimited && (
            <Progress
              value={tokenPercent}
              className={cn("h-2", tokenPercent > 80 && "bg-destructive/20")}
            />
          )}
        </div>

        {isNearLimit && (
          <div className="pt-2">
            <p className="text-sm text-destructive mb-3">
              Running low on usage. Upgrade to Pro for unlimited access.
            </p>
            <Button
              onClick={() => setLocation("/pricing")}
              className="w-full"
              size="sm"
            >
              Upgrade to Pro
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function formatTokens(tokens: number): string {
  if (tokens >= 1000000) {
    return `${(tokens / 1000000).toFixed(1)}M`;
  }
  if (tokens >= 1000) {
    return `${(tokens / 1000).toFixed(0)}K`;
  }
  return tokens.toString();
}

function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}
