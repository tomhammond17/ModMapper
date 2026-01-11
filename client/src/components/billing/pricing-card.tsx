import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface PricingCardProps {
  tier: "free" | "pro";
  price: string;
  description: string;
  features: string[];
  highlighted?: boolean;
}

export function PricingCard({ tier, price, description, features, highlighted = false }: PricingCardProps) {
  const { isAuthenticated, isPro } = useAuth();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  const checkoutMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/v1/billing/checkout", {
        successUrl: `${window.location.origin}/pricing?success=true`,
        cancelUrl: `${window.location.origin}/pricing?canceled=true`,
      });
      return res.json();
    },
    onSuccess: (data) => {
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      }
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to start checkout",
        variant: "destructive",
      });
      setIsLoading(false);
    },
  });

  const portalMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/v1/billing/portal");
      return res.json();
    },
    onSuccess: (data) => {
      if (data.portalUrl) {
        window.location.href = data.portalUrl;
      }
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to open billing portal",
        variant: "destructive",
      });
      setIsLoading(false);
    },
  });

  const handleClick = () => {
    if (!isAuthenticated) {
      window.location.href = "/signup";
      return;
    }

    setIsLoading(true);

    if (tier === "pro" && !isPro) {
      checkoutMutation.mutate();
    } else if (tier === "pro" && isPro) {
      portalMutation.mutate();
    }
  };

  const getButtonText = () => {
    if (!isAuthenticated) {
      return tier === "pro" ? "Get Started" : "Sign Up Free";
    }
    if (tier === "free") {
      return isPro ? "Current Plan" : "Current Plan";
    }
    return isPro ? "Manage Subscription" : "Upgrade to Pro";
  };

  const isCurrentPlan = (tier === "free" && !isPro) || (tier === "pro" && isPro);

  return (
    <Card className={cn(
      "relative flex flex-col",
      highlighted && "border-primary shadow-lg"
    )}>
      {highlighted && (
        <Badge className="absolute -top-3 left-1/2 -translate-x-1/2">
          Most Popular
        </Badge>
      )}
      <CardHeader>
        <CardTitle className="text-xl capitalize">{tier}</CardTitle>
        <CardDescription>{description}</CardDescription>
        <div className="mt-4">
          <span className="text-4xl font-bold">{price}</span>
          {tier === "pro" && <span className="text-muted-foreground">/month</span>}
        </div>
      </CardHeader>
      <CardContent className="flex-1">
        <ul className="space-y-3">
          {features.map((feature, index) => (
            <li key={index} className="flex items-start gap-2">
              <Check className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <span className="text-sm">{feature}</span>
            </li>
          ))}
        </ul>
      </CardContent>
      <CardFooter>
        <Button
          className="w-full"
          variant={highlighted ? "default" : "outline"}
          onClick={handleClick}
          disabled={isLoading || (tier === "free" && isAuthenticated)}
        >
          {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {getButtonText()}
        </Button>
      </CardFooter>
    </Card>
  );
}
