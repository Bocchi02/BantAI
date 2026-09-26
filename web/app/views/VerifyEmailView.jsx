"use client";

import { useEffect, useState } from "react";
import { api } from "../api";
import { Notice } from "../components/ViewShared";
import AuthLayout from "./AuthLayout";

export default function VerifyEmailView({ go }) {
  const [token] = useState(() => typeof window === "undefined" ? "" : new URLSearchParams(window.location.hash.slice(1)).get("token") || "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);
  useEffect(() => {
    if (token) window.history.replaceState({}, "", "/verify-email");
  }, [token]);
  const verify = async () => {
    setBusy(true);
    try {
      const result = await api("/auth/verify-email", { method: "POST", body: JSON.stringify({ token }) });
      setSuccess(true);
      setMessage(result.message);
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "This link could not be verified.");
    } finally {
      setBusy(false);
    }
  };
  return <AuthLayout eyebrow="EMAIL VERIFICATION" title="Verify your email" description="Confirm your email address to activate your Signalam account.">
    {message && <Notice type={success ? "success" : "error"}>{message}</Notice>}
    {!success && token && <button type="button" onClick={verify} disabled={busy} className="w-full h-10 rounded-md bg-[#696cff] text-white text-xs font-bold disabled:opacity-50">{busy ? "Verifying…" : "Verify email"}</button>}
    {!token && !success && <Notice type="error">This link is missing its verification token. Request a new email.</Notice>}
    <button type="button" onClick={() => go(success ? "/login" : "/verification-pending")} className="mt-5 text-xs text-[#696cff] font-bold hover:underline">{success ? "Go to sign in" : "Request a new verification email"}</button>
  </AuthLayout>;
}
