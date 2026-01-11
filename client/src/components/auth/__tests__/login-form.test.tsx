import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Mock the auth context
const mockLogin = vi.fn();
const mockRequestMagicLink = vi.fn();

vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({
    login: mockLogin,
    requestMagicLink: mockRequestMagicLink,
  }),
}));

// Mock the toast hook
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({
    toast: vi.fn(),
  }),
}));

describe("LoginForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("rendering", () => {
    it("should render password and magic link tabs", async () => {
      const { LoginForm } = await import("../login-form");
      render(<LoginForm />);

      expect(screen.getByRole("tab", { name: "Password" })).toBeInTheDocument();
      expect(screen.getByRole("tab", { name: "Magic Link" })).toBeInTheDocument();
    });

    it("should show email and password fields in password tab", async () => {
      const { LoginForm } = await import("../login-form");
      render(<LoginForm />);

      expect(screen.getByPlaceholderText(/you@example.com/i)).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/enter your password/i)).toBeInTheDocument();
    });

    it("should show Sign In button", async () => {
      const { LoginForm } = await import("../login-form");
      render(<LoginForm />);

      expect(screen.getByRole("button", { name: /sign in/i })).toBeInTheDocument();
    });
  });

  describe("tab switching", () => {
    it("should switch to magic link tab", async () => {
      const { LoginForm } = await import("../login-form");
      const user = userEvent.setup();

      render(<LoginForm />);

      await user.click(screen.getByRole("tab", { name: "Magic Link" }));

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /Send Magic Link/i })).toBeInTheDocument();
      });
    });
  });

  describe("validation", () => {
    it("should not call login with invalid email", async () => {
      const { LoginForm } = await import("../login-form");

      render(<LoginForm />);

      // Enter invalid email
      fireEvent.change(screen.getByPlaceholderText(/you@example.com/i), {
        target: { value: "invalid-email" },
      });
      // Enter a password
      fireEvent.change(screen.getByPlaceholderText(/enter your password/i), {
        target: { value: "password123" },
      });
      // Try to submit
      fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

      // Login should not be called because email validation fails
      await waitFor(() => {
        expect(mockLogin).not.toHaveBeenCalled();
      });
    });
  });

  describe("form submission", () => {
    it("should call login with email and password", async () => {
      const { LoginForm } = await import("../login-form");
      mockLogin.mockResolvedValueOnce(undefined);

      render(<LoginForm />);

      fireEvent.change(screen.getByPlaceholderText(/you@example.com/i), { target: { value: "test@example.com" } });
      fireEvent.change(screen.getByPlaceholderText(/enter your password/i), { target: { value: "password123" } });
      fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

      await waitFor(() => {
        expect(mockLogin).toHaveBeenCalledWith("test@example.com", "password123");
      });
    });

    it("should call onSuccess after successful login", async () => {
      const { LoginForm } = await import("../login-form");
      const onSuccess = vi.fn();
      mockLogin.mockResolvedValueOnce(undefined);

      render(<LoginForm onSuccess={onSuccess} />);

      fireEvent.change(screen.getByPlaceholderText(/you@example.com/i), { target: { value: "test@example.com" } });
      fireEvent.change(screen.getByPlaceholderText(/enter your password/i), { target: { value: "password123" } });
      fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

      await waitFor(() => {
        expect(onSuccess).toHaveBeenCalled();
      });
    });
  });
});
