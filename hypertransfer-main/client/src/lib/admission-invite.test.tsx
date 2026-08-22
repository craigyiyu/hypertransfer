/**
 * admission-invite.test.ts — 双通道认领落地页浏览器测试 (Task 4).
 *
 * 核心断言: 一个 QR case 只能在"邀请邮箱 + Email OTP"之后才能认领;
 * 输满 6 位 OTP 后进入 "Set up your account" 步骤。QR 扫描本身不认领。
 */
// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import Invite from "@/pages/Invite";
import { AuthProvider } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { DemoProvider } from "@/contexts/DemoContext";

afterEach(() => cleanup());

const { verifyEmailMock, registerMock } = vi.hoisted(() => ({
  verifyEmailMock: vi.fn(),
  registerMock: vi.fn(),
}));

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    admissionClaimApi: {
      verifyEmail: verifyEmailMock,
      register: registerMock,
    },
  };
});

function renderInvite(url = "/invite?qrSession=qr-session-token-123") {
  window.history.replaceState({}, "", url);
  return render(
    <ThemeProvider defaultTheme="dark">
      <AuthProvider>
        <DemoProvider>
          <Invite />
        </DemoProvider>
      </AuthProvider>
    </ThemeProvider>,
  );
}

describe("admission invite claim page", () => {
  beforeEach(() => {
    verifyEmailMock.mockReset();
    registerMock.mockReset();
    sessionStorage.clear();
    verifyEmailMock.mockResolvedValue({
      data: { ok: true, patronEmailMasked: "v***@example.test", caseId: "case-1" },
    });
    registerMock.mockResolvedValue({
      data: {
        userId: "u-1",
        email: "vip@example.test",
        otpauth_uri: "otpauth://totp/HyperTransfer:vip%40example.test?secret=S3CRET&issuer=HyperTransfer",
        secret: "S3CRET",
        qr_png_base64: "data:image/png;base64,abc",
        expires_at: 1_750_000_000,
        expires_in: 600,
        demo: false,
      },
    });
  });

  it("claims a QR case only after the invitation email OTP", async () => {
    const user = userEvent.setup();
    renderInvite();

    // 1. 输入邀请邮箱 → 发送 Email 码(verify-email 后端同时校验 session+邮箱)
    await user.type(screen.getByLabelText("Invitation email"), "vip@example.test");
    await user.click(screen.getByRole("button", { name: "Send email code" }));
    await waitFor(() =>
      expect(verifyEmailMock).toHaveBeenCalledWith("qr-session-token-123", "vip@example.test"),
    );

    // 2. 输满 6 位 OTP → 进入 "Set up your account"(OTP 在提交时验真)
    await user.type(screen.getByLabelText("Verification code"), "123456");
    expect(await screen.findByText("Set up your account")).toBeVisible();
  });

  it("does not advance before a full 6-digit code is entered", async () => {
    const user = userEvent.setup();
    renderInvite();

    await user.type(screen.getByLabelText("Invitation email"), "vip@example.test");
    await user.click(screen.getByRole("button", { name: "Send email code" }));
    await waitFor(() => expect(verifyEmailMock).toHaveBeenCalled());

    await user.type(screen.getByLabelText("Verification code"), "123");
    expect(screen.queryByText("Set up your account")).not.toBeInTheDocument();
  });

  it("shows the masked destination email after verification", async () => {
    const user = userEvent.setup();
    renderInvite();

    await user.type(screen.getByLabelText("Invitation email"), "vip@example.test");
    await user.click(screen.getByRole("button", { name: "Send email code" }));
    expect(await screen.findByDisplayValue("v***@example.test")).toBeInTheDocument();
  });

  it("submits registration with the verified email and OTP to bind the case", async () => {
    const user = userEvent.setup();
    renderInvite();

    await user.type(screen.getByLabelText("Invitation email"), "vip@example.test");
    await user.click(screen.getByRole("button", { name: "Send email code" }));
    await user.type(screen.getByLabelText("Verification code"), "123456");
    expect(await screen.findByText("Set up your account")).toBeVisible();

    await user.type(screen.getByPlaceholderText("As shown on ID"), "Vip Patron");
    await user.type(screen.getByLabelText("Password"), "Patron#2026");
    await user.click(screen.getByRole("button", { name: "Create account" }));

    await waitFor(() =>
      expect(registerMock).toHaveBeenCalledWith({
        sessionToken: "qr-session-token-123",
        email: "vip@example.test",
        emailOtp: "123456",
        name: "Vip Patron",
        password: "Patron#2026",
      }),
    );
  });
});
