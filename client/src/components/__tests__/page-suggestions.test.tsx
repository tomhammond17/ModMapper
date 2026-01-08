import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

describe("PageSuggestions", () => {
  const mockSuggestions = [
    { pageNum: 5, score: 12, hasTable: true, sectionTitle: "Register Map" },
    { pageNum: 8, score: 9, hasTable: true, sectionTitle: "Data Types" },
    { pageNum: 12, score: 6, hasTable: false, sectionTitle: "Parameters" },
  ];

  describe("rendering", () => {
    it("should render suggested pages list", async () => {
      const { PageSuggestions } = await import("../page-suggestions");
      render(
        <PageSuggestions
          suggestions={mockSuggestions}
          onSelectPages={() => {}}
          onDismiss={() => {}}
        />
      );

      expect(screen.getByText(/page 5/i)).toBeInTheDocument();
      expect(screen.getByText(/page 8/i)).toBeInTheDocument();
      expect(screen.getByText(/page 12/i)).toBeInTheDocument();
    });

    it("should display section titles", async () => {
      const { PageSuggestions } = await import("../page-suggestions");
      render(
        <PageSuggestions
          suggestions={mockSuggestions}
          onSelectPages={() => {}}
          onDismiss={() => {}}
        />
      );

      expect(screen.getByText(/Register Map/)).toBeInTheDocument();
      expect(screen.getByText(/Data Types/)).toBeInTheDocument();
    });

    it("should show table indicator for pages with tables", async () => {
      const { PageSuggestions } = await import("../page-suggestions");
      const { container } = render(
        <PageSuggestions
          suggestions={mockSuggestions}
          onSelectPages={() => {}}
          onDismiss={() => {}}
        />
      );

      // Should have table indicators for pages 5 and 8
      const tableIndicators = container.querySelectorAll("[data-has-table='true']");
      expect(tableIndicators.length).toBe(2);
    });
  });

  describe("selection", () => {
    it("should allow selecting individual pages", async () => {
      const { PageSuggestions } = await import("../page-suggestions");
      render(
        <PageSuggestions
          suggestions={mockSuggestions}
          onSelectPages={() => {}}
          onDismiss={() => {}}
        />
      );

      // Pages should be rendered as interactive elements
      const page5 = screen.getByText(/page 5/i);
      expect(page5).toBeInTheDocument();
      
      // The label should be clickable for selection
      const label = page5.closest("label");
      expect(label).toBeInTheDocument();
    });

    it("should call onSelectPages with selected page range", async () => {
      const { PageSuggestions } = await import("../page-suggestions");
      const onSelectPages = vi.fn();
      
      render(
        <PageSuggestions
          suggestions={mockSuggestions}
          onSelectPages={onSelectPages}
          onDismiss={() => {}}
        />
      );

      // Click the "Use Suggestions" button
      const useButton = screen.getByRole("button", { name: /use/i });
      fireEvent.click(useButton);

      expect(onSelectPages).toHaveBeenCalled();
    });
  });

  describe("dismiss", () => {
    it("should call onDismiss when dismissed", async () => {
      const { PageSuggestions } = await import("../page-suggestions");
      const onDismiss = vi.fn();
      
      render(
        <PageSuggestions
          suggestions={mockSuggestions}
          onSelectPages={() => {}}
          onDismiss={onDismiss}
        />
      );

      // Click dismiss button
      const dismissButton = screen.getByRole("button", { name: /skip|dismiss|manual/i });
      fireEvent.click(dismissButton);

      expect(onDismiss).toHaveBeenCalled();
    });
  });

  describe("empty state", () => {
    it("should show message when no suggestions", async () => {
      const { PageSuggestions } = await import("../page-suggestions");
      render(
        <PageSuggestions
          suggestions={[]}
          onSelectPages={() => {}}
          onDismiss={() => {}}
        />
      );

      expect(screen.getByText(/no.*suggestions|no.*pages.*found/i)).toBeInTheDocument();
    });
  });

  describe("loading state", () => {
    it("should show loading indicator when isLoading is true", async () => {
      const { PageSuggestions } = await import("../page-suggestions");
      render(
        <PageSuggestions
          suggestions={[]}
          onSelectPages={() => {}}
          onDismiss={() => {}}
          isLoading={true}
        />
      );

      expect(screen.getByText(/analyzing|loading/i)).toBeInTheDocument();
    });
  });
});

