"use client";

import { useEffect, useState } from "react";
import { api } from "../api";
import { Notice, PASSWORD_REQUIREMENTS, passwordValidationMessage } from "../components/ViewShared";
import AuthLayout from "./AuthLayout";

export default function ResetPasswordView({ go }) {
  const [token] = useState(() => typeof window === "undefined" ? "" : new URLSearchParams(window.location.hash.slice(1)).get("token") || "");
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (token) window.history.replaceState({}, "", "/reset-password");
  }, [token]);
  const submit = async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    const validation = passwordValidationMessage(data.password);
    if (validation || data.password !== data.confirm_password) {
      setMessage(validation || "Passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      const result = await api("/auth/reset-password", { method: "POST", body: JSON.stringify({ token, password: data.password }) });
      setSuccess(true);
      setMessage(result.message);
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "The password could not be reset.");
    } finally {
      setBusy(false);
    }
  };
  return <AuthLayout eyebrow="ACCOUNT RECOVERY" title="Set a new password" description="Your existing sessions and paired devices will be disconnected after a successful reset.">
    {message && <Notice type={success ? "success" : "error"}>{message}</Notice>}
    {!token && !success && <Notice type="error">This reset link is missing its token. Request a new link.</Notice>}
    {token && !success && <form onSubmit={submit} className="space-y-4">
      <label className="flex flex-col gap-1 text-xs font-semibold text-[#384551]">New password<input name="password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required className="h-10 px-3 rounded-md border border-[#d9dee3]"/></label>
      <p className="text-[11px] text-[#8592a3]">{PASSWORD_REQUIREMENTS}</p>
      <label className="flex flex-col gap-1 text-xs font-semibold text-[#384551]">Confirm password<input name="confirm_password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required className="h-10 px-3 rounded-md border border-[#d9dee3]"/></label>
      <button type="submit" disabled={busy} className="w-full h-10 rounded-md bg-[#696cff] text-white text-xs font-bold disabled:opacity-50">{busy ? "Saving…" : "Reset password"}</button>
    </form>}
    <button type="button" onClick={() => go(success ? "/login" : "/forgot-password")} className="mt-5 text-xs text-[#696cff] font-bold hover:underline">{success ? "Go to sign in" : "Request a new reset link"}</button>
  </AuthLayout>;
}
