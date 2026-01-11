import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface TierBadgeProps {
  tier: "free" | "pro";
  className?: string;
}

export function TierBadge({ tier, className }: TierBadgeProps) {
  if (tier === "pro") {
    return (
      <Badge
        className={cn("bg-primary hover:bg-primary", className)}
      >
        Pro
      </Badge>
    );
  }

  return (
    <Badge
      variant="secondary"
      className={cn(className)}
    >
      Free
    </Badge>
  );
}
