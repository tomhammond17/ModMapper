import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Mock the auth context
let mockIsAuthenticated = true;
let mockIsPro = false;

vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({
    isAuthenticated: mockIsAuthenticated,
    isPro: mockIsPro,
  }),
}));

// Mock wouter
vi.mock("wouter", () => ({
  useLocation: () => ["/", vi.fn()],
}));

// Mock fetch
const mockUsageData = {
  success: true,
  tier: "free",
  conversions: { used: 5, limit: 10 },
  tokens: { used: 100000, limit: 200000 },
  month: "2024-01",
};

global.fetch = vi.fn();

// Create a fresh query client for each test
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe("UsageDashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsAuthenticated = true;
    mockIsPro = false;
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockUsageData),
    });
  });

  describe("rendering", () => {
    it("should not render if not authenticated", async () => {
      mockIsAuthenticated = false;

      const { UsageDashboard } = await import("../usage-dashboard");
      const { container } = render(<UsageDashboard />, { wrapper: createWrapper() });

      expect(container).toBeEmptyDOMElement();
    });

    it("should show loading skeleton while fetching", async () => {
      const { UsageDashboard } = await import("../usage-dashboard");
      const { container } = render(<UsageDashboard />, { wrapper: createWrapper() });

      // Loading state shows skeleton placeholders (animate-pulse divs)
      const skeletons = container.querySelectorAll(".animate-pulse");
      expect(skeletons.length).toBeGreaterThan(0);
    });

    it("should display usage data after loading", async () => {
      const { UsageDashboard } = await import("../usage-dashboard");
      render(<UsageDashboard />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText("Conversions")).toBeInTheDocument();
      });

      expect(screen.getByText(/5.*\/.*10/)).toBeInTheDocument();
    });
  });

  describe("usage display", () => {
    it("should format token counts correctly", async () => {
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          ...mockUsageData,
          tokens: { used: 150000, limit: 200000 },
        }),
      });

      const { UsageDashboard } = await import("../usage-dashboard");
      render(<UsageDashboard />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText(/150K.*\/.*200K/)).toBeInTheDocument();
      });
    });

    it("should show unlimited for pro tier", async () => {
      mockIsPro = true;
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          tier: "pro",
          conversions: { used: 100, limit: -1 },
          tokens: { used: 500000, limit: 1000000 },
          month: "2024-01",
        }),
      });

      const { UsageDashboard } = await import("../usage-dashboard");
      render(<UsageDashboard />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText(/Unlimited/)).toBeInTheDocument();
      });
    });
  });

  describe("upgrade prompt", () => {
    it("should show upgrade button when near limit", async () => {
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          ...mockUsageData,
          conversions: { used: 9, limit: 10 }, // 90% used
        }),
      });

      const { UsageDashboard } = await import("../usage-dashboard");
      render(<UsageDashboard />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /upgrade to pro/i })).toBeInTheDocument();
      });
    });

    it("should not show upgrade button for pro users", async () => {
      mockIsPro = true;
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          ...mockUsageData,
          tier: "pro",
          conversions: { used: 100, limit: -1 },
        }),
      });

      const { UsageDashboard } = await import("../usage-dashboard");
      render(<UsageDashboard />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText("Conversions")).toBeInTheDocument();
      });

      expect(screen.queryByRole("button", { name: /upgrade to pro/i })).not.toBeInTheDocument();
    });
  });
});
