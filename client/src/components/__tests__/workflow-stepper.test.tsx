import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

describe("WorkflowStepper", () => {
  describe("step rendering", () => {
    it("should render all four steps", async () => {
      const { WorkflowStepper } = await import("../workflow-stepper");
      render(<WorkflowStepper currentStep="upload" />);

      expect(screen.getByText("Upload")).toBeInTheDocument();
      expect(screen.getByText("Configure")).toBeInTheDocument();
      expect(screen.getByText("Process")).toBeInTheDocument();
      expect(screen.getByText("Review")).toBeInTheDocument();
    });

    it("should show step numbers", async () => {
      const { WorkflowStepper } = await import("../workflow-stepper");
      render(<WorkflowStepper currentStep="upload" />);

      expect(screen.getByText("1")).toBeInTheDocument();
      expect(screen.getByText("2")).toBeInTheDocument();
      expect(screen.getByText("3")).toBeInTheDocument();
      expect(screen.getByText("4")).toBeInTheDocument();
    });
  });

  describe("current step indication", () => {
    it("should highlight upload step when current", async () => {
      const { WorkflowStepper } = await import("../workflow-stepper");
      render(<WorkflowStepper currentStep="upload" />);

      // The upload step should be active
      const uploadStep = screen.getByText("Upload").closest("[data-step]");
      expect(uploadStep).toHaveAttribute("data-active", "true");
    });

    it("should highlight configure step when current", async () => {
      const { WorkflowStepper } = await import("../workflow-stepper");
      render(<WorkflowStepper currentStep="pageIdentify" />);

      const configureStep = screen.getByText("Configure").closest("[data-step]");
      expect(configureStep).toHaveAttribute("data-active", "true");
    });

    it("should highlight process step when current", async () => {
      const { WorkflowStepper } = await import("../workflow-stepper");
      render(<WorkflowStepper currentStep="converting" />);

      const processStep = screen.getByText("Process").closest("[data-step]");
      expect(processStep).toHaveAttribute("data-active", "true");
    });

    it("should highlight review step when current", async () => {
      const { WorkflowStepper } = await import("../workflow-stepper");
      render(<WorkflowStepper currentStep="preview" />);

      const reviewStep = screen.getByText("Review").closest("[data-step]");
      expect(reviewStep).toHaveAttribute("data-active", "true");
    });
  });

  describe("completed steps", () => {
    it("should mark upload as completed when on configure step", async () => {
      const { WorkflowStepper } = await import("../workflow-stepper");
      render(<WorkflowStepper currentStep="pageIdentify" />);

      const uploadStep = screen.getByText("Upload").closest("[data-step]");
      expect(uploadStep).toHaveAttribute("data-completed", "true");
    });

    it("should mark upload and configure as completed when on process step", async () => {
      const { WorkflowStepper } = await import("../workflow-stepper");
      render(<WorkflowStepper currentStep="converting" />);

      const uploadStep = screen.getByText("Upload").closest("[data-step]");
      const configureStep = screen.getByText("Configure").closest("[data-step]");

      expect(uploadStep).toHaveAttribute("data-completed", "true");
      expect(configureStep).toHaveAttribute("data-completed", "true");
    });

    it("should mark all previous steps as completed when on review", async () => {
      const { WorkflowStepper } = await import("../workflow-stepper");
      render(<WorkflowStepper currentStep="preview" />);

      const uploadStep = screen.getByText("Upload").closest("[data-step]");
      const configureStep = screen.getByText("Configure").closest("[data-step]");
      const processStep = screen.getByText("Process").closest("[data-step]");

      expect(uploadStep).toHaveAttribute("data-completed", "true");
      expect(configureStep).toHaveAttribute("data-completed", "true");
      expect(processStep).toHaveAttribute("data-completed", "true");
    });
  });

  describe("pending steps", () => {
    it("should mark steps after current as pending", async () => {
      const { WorkflowStepper } = await import("../workflow-stepper");
      render(<WorkflowStepper currentStep="upload" />);

      const configureStep = screen.getByText("Configure").closest("[data-step]");
      const processStep = screen.getByText("Process").closest("[data-step]");
      const reviewStep = screen.getByText("Review").closest("[data-step]");

      expect(configureStep).toHaveAttribute("data-completed", "false");
      expect(processStep).toHaveAttribute("data-completed", "false");
      expect(reviewStep).toHaveAttribute("data-completed", "false");
    });
  });

  describe("visual connectors", () => {
    it("should render connector lines between steps", async () => {
      const { WorkflowStepper } = await import("../workflow-stepper");
      const { container } = render(<WorkflowStepper currentStep="upload" />);

      // Each step has left and right connector halves (except edges)
      // Total: 6 connector segments (3 left, 3 right for middle transitions)
      const connectors = container.querySelectorAll("[data-connector]");
      expect(connectors.length).toBeGreaterThan(0);
    });
  });
});

