"use client";

import { useEffect, useState } from "react";
import { api } from "../api";
import { Notice } from "../components/ViewShared";
import AuthLayout from "./AuthLayout";

export default function VerificationPendingView({ go, initialEmail = "", emailDeliveryReady = false }) {
  const [email, setEmail] = useState(initialEmail);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(false);
  useEffect(() => {
    if (!cooldown) return;
    const timer = window.setTimeout(() => setCooldown(false), 30000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);
  const resend = async (event) => {
    event.preventDefault();
    setBusy(true);
    try {
      const result = await api("/auth/resend-verification", { method: "POST", body: JSON.stringify({ email }) });
      setMessage(result.message);
      setCooldown(true);
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Please try again shortly.");
    } finally {
      setBusy(false);
    }
  };
  return <AuthLayout eyebrow="ONE MORE STEP" title="Check your email" description="Open the Signalam verification message and follow its link. It expires after 24 hours.">
    {!emailDeliveryReady && <Notice type="info">Verification emails are temporarily unavailable. Please try again after email delivery is configured.</Notice>}
    {message && <Notice type="info">{message}</Notice>}
    <form onSubmit={resend} className="space-y-4">
      <label className="flex flex-col gap-1 text-xs font-semibold text-[#384551]">Email address<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required className="h-10 px-3 rounded-md border border-[#d9dee3]"/></label>
      <button type="submit" disabled={busy || cooldown || !emailDeliveryReady} className="w-full h-10 rounded-md bg-[#696cff] text-white text-xs font-bold disabled:opacity-50">{busy ? "Sending…" : cooldown ? "You can resend again shortly" : "Resend verification email"}</button>
    </form>
    <button type="button" onClick={() => go("/login")} className="mt-5 text-xs text-[#696cff] font-bold hover:underline">Back to sign in</button>
  </AuthLayout>;
}
