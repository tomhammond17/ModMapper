import { useEffect } from "react";
import { useSearch } from "wouter";
import { PricingCard } from "@/components/billing/pricing-card";
import { UsageDashboard } from "@/components/billing/usage-dashboard";
import { useAuth } from "@/contexts/auth-context";
import { useToast } from "@/hooks/use-toast";

const FREE_FEATURES = [
  "10 conversions per month",
  "200K AI tokens for PDF parsing",
  "CSV, JSON, XML, PDF support",
  "Instant file conversion",
  "Basic export options",
];

const PRO_FEATURES = [
  "Unlimited conversions",
  "1M AI tokens per month",
  "All file format support",
  "Document storage with folders",
  "Version control & history",
  "Custom export templates",
  "Priority support",
];

export default function PricingPage() {
  const { isAuthenticated, refetch } = useAuth();
  const { toast } = useToast();
  const search = useSearch();
  const params = new URLSearchParams(search);

  useEffect(() => {
    if (params.get("success") === "true") {
      toast({
        title: "Welcome to Pro!",
        description: "Your subscription is now active. Enjoy unlimited access!",
      });
      refetch();
    } else if (params.get("canceled") === "true") {
      toast({
        title: "Checkout canceled",
        description: "You can upgrade anytime.",
      });
    }
  }, [params, toast, refetch]);

  return (
    <div className="min-h-screen bg-background">
      <div className="container max-w-6xl mx-auto px-4 py-16">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold mb-4">Simple, transparent pricing</h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Start free and upgrade when you need more. No hidden fees, cancel anytime.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto mb-12">
          <PricingCard
            tier="free"
            price="$0"
            description="Perfect for trying out ModMapper"
            features={FREE_FEATURES}
          />
          <PricingCard
            tier="pro"
            price="$9.99"
            description="For power users and teams"
            features={PRO_FEATURES}
            highlighted
          />
        </div>

        {isAuthenticated && (
          <div className="max-w-md mx-auto">
            <UsageDashboard />
          </div>
        )}

        <div className="mt-16 text-center">
          <h2 className="text-2xl font-semibold mb-4">Frequently Asked Questions</h2>
          <div className="max-w-2xl mx-auto text-left space-y-6">
            <div>
              <h3 className="font-medium mb-2">What counts as a conversion?</h3>
              <p className="text-muted-foreground text-sm">
                Each file you parse (CSV, JSON, XML, or PDF) counts as one conversion.
                Exporting to different formats from the same parsed file doesn't count as additional conversions.
              </p>
            </div>
            <div>
              <h3 className="font-medium mb-2">What are AI tokens?</h3>
              <p className="text-muted-foreground text-sm">
                AI tokens are used when parsing PDF files. The number of tokens depends on the
                PDF's content and complexity. Free users get 200K tokens/month, Pro users get 1M.
              </p>
            </div>
            <div>
              <h3 className="font-medium mb-2">Can I cancel anytime?</h3>
              <p className="text-muted-foreground text-sm">
                Yes, you can cancel your Pro subscription at any time. You'll keep Pro access
                until the end of your billing period.
              </p>
            </div>
            <div>
              <h3 className="font-medium mb-2">What happens to my documents if I downgrade?</h3>
              <p className="text-muted-foreground text-sm">
                Your documents remain stored for 30 days after downgrading. You can export them
                during this period. After 30 days, they'll be deleted.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
