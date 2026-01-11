import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { UserMenu } from "@/components/auth/user-menu";
import { ThemeToggle } from "@/components/theme-toggle";
import { useAuth } from "@/contexts/auth-context";
import { FileText, Menu } from "lucide-react";
import { cn } from "@/lib/utils";

interface AppHeaderProps {
  minimal?: boolean;
}

export function AppHeader({ minimal = false }: AppHeaderProps) {
  const [location] = useLocation();
  const { isAuthenticated, isPro } = useAuth();

  const navLinks = [
    { href: "/", label: "Convert" },
    { href: "/documents", label: "Documents", requireAuth: true },
    { href: "/templates", label: "Templates", requirePro: true },
    { href: "/pricing", label: "Pricing" },
  ];

  const visibleLinks = navLinks.filter((link) => {
    if (link.requirePro) return isPro;
    if (link.requireAuth) return isAuthenticated;
    return true;
  });

  if (minimal) {
    return (
      <div className="flex items-center justify-between flex-1">
        <nav className="flex items-center gap-1">
          {visibleLinks.map((link) => (
            <Link key={link.href} href={link.href}>
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  location === link.href && "bg-muted"
                )}
              >
                {link.label}
              </Button>
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <UserMenu />
        </div>
      </div>
    );
  }

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-14 items-center">
        <Link href="/" className="flex items-center gap-2 mr-6">
          <FileText className="h-6 w-6 text-primary" />
          <span className="font-bold text-lg">ModMapper</span>
        </Link>

        <nav className="hidden md:flex items-center gap-1 flex-1">
          {visibleLinks.map((link) => (
            <Link key={link.href} href={link.href}>
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  location === link.href && "bg-muted"
                )}
              >
                {link.label}
              </Button>
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2 ml-auto">
          <ThemeToggle />
          <UserMenu />
        </div>
      </div>
    </header>
  );
}
