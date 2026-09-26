"use client";

import { useState } from "react";
import { api } from "../api";
import { Notice } from "../components/ViewShared";
import AuthLayout from "./AuthLayout";

export default function ForgotPasswordView({ go, emailDeliveryReady = false }) {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    try {
      const result = await api("/auth/request-password-reset", { method: "POST", body: JSON.stringify({ email }) });
      setMessage(result.message);
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Please try again shortly.");
    } finally {
      setBusy(false);
    }
  };
  return <AuthLayout eyebrow="ACCOUNT RECOVERY" title="Forgot your password?" description="Enter your account email address. A reset link expires after 30 minutes.">
    {!emailDeliveryReady && <Notice type="info">Password reset emails are temporarily unavailable. Please try again after email delivery is configured.</Notice>}
    {message && <Notice type="info">{message}</Notice>}
    <form onSubmit={submit} className="space-y-4">
      <label className="flex flex-col gap-1 text-xs font-semibold text-[#384551]">Email address<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required className="h-10 px-3 rounded-md border border-[#d9dee3]"/></label>
      <button type="submit" disabled={busy || !emailDeliveryReady} className="w-full h-10 rounded-md bg-[#696cff] text-white text-xs font-bold disabled:opacity-50">{busy ? "Sending…" : "Send reset link"}</button>
    </form>
    <button type="button" onClick={() => go("/login")} className="mt-5 text-xs text-[#696cff] font-bold hover:underline">Back to sign in</button>
  </AuthLayout>;
}
