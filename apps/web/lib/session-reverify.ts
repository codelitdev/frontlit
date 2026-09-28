import { ApiError } from "./api-client";

export async function sendEmailOtp(email: string) {
  const response = await fetch("/api/auth/email-otp/send-verification-otp", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, type: "sign-in" }),
  });
  if (!response.ok) {
    throw new ApiError(response.status, "Could not send verification code");
  }
}

export async function reverifySession(otp: string) {
  const response = await fetch("/api/proxy/session/reverify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ otp }),
  });
  if (!response.ok) {
    let error = "Could not confirm your identity";
    try {
      const body = (await response.json()) as { error?: string };
      if (body.error === "invalid_otp") {
        error = "That verification code is invalid or expired";
      }
    } catch {
      // Keep the generic message when the body is not JSON.
    }
    throw new ApiError(response.status, error);
  }
}
