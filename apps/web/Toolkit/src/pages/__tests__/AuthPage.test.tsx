// @vitest-environment jsdom
/**
 * Sign-in asks for what it needs. Nobody chooses a username (one is made from
 * the email and never shown), so the field asks for the email address — and a
 * refused sign-in typed without an "@" says to use the registered email, without
 * saying whether an account exists. The server still accepts a username.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const { login, toast } = vi.hoisted(() => ({ login: vi.fn(), toast: vi.fn() }));

vi.mock("@toolkit/lib/auth", () => ({
  useAuth: () => ({ login, register: vi.fn(), verifyOtp: vi.fn(), resendOtp: vi.fn() }),
}));
vi.mock("@toolkit/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));
vi.mock("@/components/AppNavBack", () => ({ AppNavBack: () => null }));

import AuthPage from "../AuthPage";

const HINT = "Sign in with the email address you registered with, for example name@company.com.";

function signIn(identifier: string) {
  fireEvent.change(screen.getByLabelText("Email address"), { target: { value: identifier } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "not-the-password" } });
  fireEvent.click(screen.getByTestId("btn-submit-auth"));
}

afterEach(() => {
  cleanup();
  login.mockReset();
  toast.mockReset();
});

describe("sign-in", () => {
  it("asks for the email address", () => {
    render(<AuthPage />);
    const field = screen.getByLabelText("Email address");
    expect(field).toHaveAttribute("placeholder", "name@company.com");
    expect(screen.queryByText(/username/i)).toBeNull();
  });

  it("says to use the registered email when a name was typed and sign-in failed", async () => {
    login.mockRejectedValue(new Error("Invalid credentials"));
    render(<AuthPage />);
    signIn("Pat Reviewer");

    expect(await screen.findByTestId("hint-login-email")).toHaveTextContent(HINT);
    // Sent exactly as before: the server still accepts a username.
    expect(login).toHaveBeenCalledWith("Pat Reviewer", "not-the-password");
    expect(screen.getByLabelText("Email address")).toHaveAttribute("aria-describedby", "login-email-hint");
    // Nothing about whether that account exists.
    expect(screen.getByTestId("hint-login-email").textContent).not.toMatch(/exist|no account|not found/i);

    // Gone once an email address is being typed.
    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "pat@" } });
    expect(screen.queryByTestId("hint-login-email")).toBeNull();
  });

  it("does not show the hint when an email address was typed", async () => {
    login.mockRejectedValue(new Error("Invalid credentials"));
    render(<AuthPage />);
    signIn("pat@company.com");
    await waitFor(() => expect(toast).toHaveBeenCalled());
    expect(screen.queryByTestId("hint-login-email")).toBeNull();
  });
});
