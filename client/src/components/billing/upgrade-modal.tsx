import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, Loader2, Zap } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface UpgradeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reason?: string;
}

const proFeatures = [
  "Unlimited conversions",
  "1M AI tokens/month for PDF parsing",
  "Document storage with folders",
  "Version control for documents",
  "Custom export templates",
  "Priority support",
];

export function UpgradeModal({ open, onOpenChange, reason }: UpgradeModalProps) {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  const checkoutMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/v1/billing/checkout", {
        successUrl: `${window.location.origin}/?upgraded=true`,
        cancelUrl: window.location.href,
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

  const handleUpgrade = () => {
    setIsLoading(true);
    checkoutMutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            <DialogTitle>Upgrade to Pro</DialogTitle>
          </div>
          <DialogDescription>
            {reason || "Unlock unlimited access and premium features."}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <div className="flex items-baseline gap-2 mb-4">
            <span className="text-3xl font-bold">$9.99</span>
            <span className="text-muted-foreground">/month</span>
            <Badge variant="secondary">Save 17% yearly</Badge>
          </div>

          <ul className="space-y-2">
            {proFeatures.map((feature, index) => (
              <li key={index} className="flex items-center gap-2 text-sm">
                <Check className="h-4 w-4 text-primary" />
                {feature}
              </li>
            ))}
          </ul>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="sm:flex-1">
            Maybe Later
          </Button>
          <Button onClick={handleUpgrade} disabled={isLoading} className="sm:flex-1">
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Upgrade Now
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
