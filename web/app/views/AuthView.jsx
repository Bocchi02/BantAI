"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "../api";
import { Notice } from "../components/ViewShared";
import { normalizeAuthPath } from "../registration";
import AuthLayout from "./AuthLayout";
import RegisterView from "./RegisterView";
import VerificationPendingView from "./VerificationPendingView";
import VerifyEmailView from "./VerifyEmailView";
import ForgotPasswordView from "./ForgotPasswordView";
import ResetPasswordView from "./ResetPasswordView";

export default function AuthScreen({ onAuthenticated, initialPath, registrationEnabled = false, emailDeliveryReady = false }) {
  const [path, setPath] = useState(normalizeAuthPath(initialPath, registrationEnabled));
  const [pendingEmail, setPendingEmail] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const go = (next, email = "") => {
    if (next === "/register" && !registrationEnabled) return;
    window.history.pushState({}, "", next);
    setPath(next);
    if (email) setPendingEmail(email);
    setError("");
  };
  useEffect(() => {
    const normalized = normalizeAuthPath(window.location.pathname, registrationEnabled);
    if (window.location.pathname !== normalized) window.history.replaceState({}, "", normalized);
    const handler = () => setPath(normalizeAuthPath(window.location.pathname, registrationEnabled));
    window.addEventListener("popstate", handler);
    return () => window.removeEventListener("popstate", handler);
  }, [registrationEnabled]);
  const login = async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    setBusy(true);
    setError("");
    try {
      const result = await api("/auth/login", { method: "POST", body: JSON.stringify({ email: data.email, password: data.password }) });
      window.history.replaceState({}, "", "/dashboard");
      onAuthenticated(result.user);
    } catch (reason) {
      if (reason instanceof ApiError && reason.status === 403 && reason.message.includes("Verify your email")) {
        go("/verification-pending", data.email);
      } else {
        setError(reason instanceof Error ? reason.message : "Sign in failed. Please try again.");
      }
    } finally {
      setBusy(false);
    }
  };

  if (path === "/register") return <RegisterView go={go} emailDeliveryReady={emailDeliveryReady} />;
  if (path === "/verification-pending") return <VerificationPendingView go={go} initialEmail={pendingEmail} emailDeliveryReady={emailDeliveryReady} />;
  if (path === "/verify-email") return <VerifyEmailView go={go} />;
  if (path === "/forgot-password") return <ForgotPasswordView go={go} emailDeliveryReady={emailDeliveryReady} />;
  if (path === "/reset-password") return <ResetPasswordView go={go} />;

  return <AuthLayout eyebrow="SECURE SIGN IN" title="Welcome back" description="Sign in to review your recent website and email checks.">
    {error && <Notice type="error">{error}</Notice>}
    <form onSubmit={login} className="space-y-4">
      <label className="flex flex-col gap-1 text-xs font-semibold text-[#384551]">Email address<input name="email" type="email" autoComplete="email" placeholder="you@example.com" required className="h-10 px-3.5 rounded-md border border-[#d9dee3] bg-white text-[#384551]"/></label>
      <label className="flex flex-col gap-1 text-xs font-semibold text-[#384551]">Password<input name="password" type="password" autoComplete="current-password" required className="h-10 px-3.5 rounded-md border border-[#d9dee3] bg-white text-[#384551]"/></label>
      <div className="text-right"><button type="button" onClick={() => go("/forgot-password")} className="text-xs font-semibold text-[#696cff] hover:underline">Forgot password?</button></div>
      <button type="submit" disabled={busy} className="w-full h-10 rounded-md bg-[#696cff] text-white text-xs font-bold disabled:opacity-50">{busy ? "Signing in…" : "Sign in"}</button>
    </form>
    <div className="mt-6 text-center text-xs text-[#8592a3]">
      {registrationEnabled ? (<>New to Signalam? <button type="button" onClick={() => go("/register")} className="text-[#696cff] font-bold hover:underline">Create an account</button></>) : <>Accounts are currently provisioned for authorized pilot users. Contact the Signalam administrator.</>}
    </div>
  </AuthLayout>;
}
