import { useLocation } from "wouter";
import { useAuth } from "@/contexts/auth-context";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { User, LogOut, CreditCard, FolderOpen, FileText, Settings } from "lucide-react";

export function UserMenu() {
  const { user, subscription, isAuthenticated, logout } = useAuth();
  const [, setLocation] = useLocation();

  if (!isAuthenticated || !user) {
    return (
      <div className="flex items-center gap-2">
        <Button variant="ghost" onClick={() => setLocation("/login")}>
          Sign In
        </Button>
        <Button onClick={() => setLocation("/signup")}>
          Get Started
        </Button>
      </div>
    );
  }

  const handleLogout = async () => {
    await logout();
    setLocation("/");
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="flex items-center gap-2">
          <User className="h-4 w-4" />
          <span className="hidden sm:inline">{user.email}</span>
          {subscription?.tier === "pro" && (
            <Badge variant="default" className="ml-1">Pro</Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium">{user.email}</p>
            <p className="text-xs text-muted-foreground">
              {subscription?.tier === "pro" ? "Pro Plan" : "Free Plan"}
            </p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => setLocation("/documents")}>
          <FolderOpen className="mr-2 h-4 w-4" />
          Documents
        </DropdownMenuItem>
        {subscription?.tier === "pro" && (
          <DropdownMenuItem onClick={() => setLocation("/templates")}>
            <FileText className="mr-2 h-4 w-4" />
            Templates
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={() => setLocation("/pricing")}>
          <CreditCard className="mr-2 h-4 w-4" />
          {subscription?.tier === "pro" ? "Manage Subscription" : "Upgrade to Pro"}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleLogout}>
          <LogOut className="mr-2 h-4 w-4" />
          Sign Out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
