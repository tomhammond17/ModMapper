import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/lib/theme-provider";
import { AuthProvider } from "@/contexts/auth-context";
import { AppHeader } from "@/components/layout/app-header";
import { ProtectedRoute } from "@/components/auth/protected-route";

// Pages
import Home from "@/pages/home";
import Login from "@/pages/login";
import Signup from "@/pages/signup";
import Pricing from "@/pages/pricing";
import Documents from "@/pages/documents";
import Templates from "@/pages/templates";
import TemplateEditorPage from "@/pages/template-editor";
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <Switch>
        {/* Public routes */}
        <Route path="/" component={Home} />
        <Route path="/login" component={Login} />
        <Route path="/signup" component={Signup} />
        <Route path="/pricing" component={Pricing} />

        {/* Protected routes (require auth) */}
        <Route path="/documents">
          <ProtectedRoute>
            <Documents />
          </ProtectedRoute>
        </Route>

        {/* Pro-only routes */}
        <Route path="/templates">
          <ProtectedRoute requirePro>
            <Templates />
          </ProtectedRoute>
        </Route>
        <Route path="/templates/:id">
          {(params) => (
            <ProtectedRoute requirePro>
              <TemplateEditorPage params={params} />
            </ProtectedRoute>
          )}
        </Route>

        <Route component={NotFound} />
      </Switch>
    </div>
  );
}

function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <TooltipProvider>
            <Toaster />
            <Router />
          </TooltipProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
