import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { RegisterTable } from "../register-table";
import type { ModbusRegister } from "@shared/schema";

// Helper to create test registers
function createRegisters(count: number): ModbusRegister[] {
  return Array.from({ length: count }, (_, i) => ({
    address: 40001 + i,
    name: `Register_${i}`,
    datatype: "UINT16" as const,
    description: `Description for register ${i}`,
    writable: i % 2 === 0,
  }));
}

describe("RegisterTable", () => {
  describe("Basic rendering", () => {
    it("should render empty state when no registers", () => {
      const onUpdate = vi.fn();
      render(<RegisterTable registers={[]} onUpdate={onUpdate} />);

      expect(screen.getByText(/No registers loaded/i)).toBeInTheDocument();
    });

    it("should render register count in header", () => {
      const registers = createRegisters(5);
      const onUpdate = vi.fn();
      render(<RegisterTable registers={registers} onUpdate={onUpdate} />);

      expect(screen.getByText("5 registers loaded")).toBeInTheDocument();
    });

    it("should render registers with correct data", () => {
      const registers = createRegisters(3);
      const onUpdate = vi.fn();
      render(<RegisterTable registers={registers} onUpdate={onUpdate} />);

      // Check first register address is displayed
      expect(screen.getByTestId("text-address-0")).toHaveTextContent("40001");
      expect(screen.getByTestId("text-name-0")).toHaveTextContent("Register_0");
    });

    it("should show add row button when not read-only", () => {
      const onUpdate = vi.fn();
      render(<RegisterTable registers={[]} onUpdate={onUpdate} isReadOnly={false} />);

      expect(screen.getByTestId("button-add-row")).toBeInTheDocument();
    });

    it("should hide add row button when read-only", () => {
      const onUpdate = vi.fn();
      render(<RegisterTable registers={[]} onUpdate={onUpdate} isReadOnly={true} />);

      expect(screen.queryByTestId("button-add-row")).not.toBeInTheDocument();
    });
  });

  describe("Editing functionality", () => {
    it("should add new row when add button clicked", () => {
      const onUpdate = vi.fn();
      const registers = createRegisters(2);
      render(<RegisterTable registers={registers} onUpdate={onUpdate} />);

      fireEvent.click(screen.getByTestId("button-add-row"));

      expect(onUpdate).toHaveBeenCalledTimes(1);
      const newRegisters = onUpdate.mock.calls[0][0];
      expect(newRegisters).toHaveLength(3);
      expect(newRegisters[2].address).toBe(40003);
    });

    it("should delete row when delete button clicked", () => {
      const onUpdate = vi.fn();
      const registers = createRegisters(3);
      render(<RegisterTable registers={registers} onUpdate={onUpdate} />);

      fireEvent.click(screen.getByTestId("button-delete-1"));

      expect(onUpdate).toHaveBeenCalledTimes(1);
      const newRegisters = onUpdate.mock.calls[0][0];
      expect(newRegisters).toHaveLength(2);
      expect(newRegisters.map((r: ModbusRegister) => r.address)).toEqual([40001, 40003]);
    });

    it("should toggle writable checkbox", () => {
      const onUpdate = vi.fn();
      const registers = createRegisters(2);
      render(<RegisterTable registers={registers} onUpdate={onUpdate} />);

      fireEvent.click(screen.getByTestId("checkbox-writable-1"));

      expect(onUpdate).toHaveBeenCalledTimes(1);
      const newRegisters = onUpdate.mock.calls[0][0];
      expect(newRegisters[1].writable).toBe(true); // Was false (odd index), now true
    });

    it("should not allow editing when read-only", () => {
      const onUpdate = vi.fn();
      const registers = createRegisters(2);
      render(<RegisterTable registers={registers} onUpdate={onUpdate} isReadOnly={true} />);

      // Writable checkbox should be disabled
      const checkbox = screen.getByTestId("checkbox-writable-0");
      expect(checkbox).toBeDisabled();
    });
  });

  describe("Virtual scrolling", () => {
    it("should use standard rendering for small datasets (< 100 rows)", () => {
      const onUpdate = vi.fn();
      const registers = createRegisters(50);
      render(<RegisterTable registers={registers} onUpdate={onUpdate} />);

      // Should NOT show virtual scrolling indicator
      expect(screen.queryByText(/virtual scrolling enabled/i)).not.toBeInTheDocument();
    });

    it("should enable virtual scrolling for large datasets (> 100 rows)", () => {
      const onUpdate = vi.fn();
      const registers = createRegisters(150);
      render(<RegisterTable registers={registers} onUpdate={onUpdate} />);

      // Should show virtual scrolling indicator
      expect(screen.getByText(/virtual scrolling enabled/i)).toBeInTheDocument();
    });

    it("should handle very large datasets efficiently", () => {
      const onUpdate = vi.fn();
      const registers = createRegisters(1000);
      
      // This should not crash or hang
      const { container } = render(<RegisterTable registers={registers} onUpdate={onUpdate} />);

      // Should show correct count
      expect(screen.getByText("1000 registers loaded")).toBeInTheDocument();
      
      // Virtual scrolling should be enabled
      expect(screen.getByText(/virtual scrolling enabled/i)).toBeInTheDocument();
    });
  });

  describe("Validation errors", () => {
    it("should display validation errors for specific fields", () => {
      const onUpdate = vi.fn();
      const registers = createRegisters(2);
      const validationErrors = [
        { row: 0, field: "address", message: "Duplicate address" },
      ];

      render(
        <RegisterTable
          registers={registers}
          onUpdate={onUpdate}
          validationErrors={validationErrors}
        />
      );

      expect(screen.getByText("Duplicate address")).toBeInTheDocument();
    });
  });
});

