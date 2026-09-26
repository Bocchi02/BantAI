"use client";

import { useState } from "react";
import { api, ApiError } from "../api";
import { Notice, PASSWORD_REQUIREMENTS, passwordValidationMessage } from "../components/ViewShared";
import AuthLayout from "./AuthLayout";

const inputClass = "h-10 px-3.5 rounded-md border border-[#d9dee3] bg-white text-[#384551] text-xs focus:ring-2 focus:ring-[#696cff]/20 focus:border-[#696cff] outline-none";

export default function RegisterView({ go, emailDeliveryReady = false }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    setError("");
    setBusy(true);
    try {
      const availability = await api("/auth/email-availability", { method: "POST", body: JSON.stringify({ email: data.email }) });
      if (!availability.available) throw new Error("This email is already in use.");
      const passwordError = passwordValidationMessage(data.password);
      if (passwordError) throw new Error(passwordError);
      if (data.password !== data.confirm_password) throw new Error("Passwords do not match.");
      await api("/auth/register", { method: "POST", body: JSON.stringify({
        first_name: data.first_name, middle_name: data.middle_name || null,
        last_name: data.last_name, email: data.email, password: data.password,
      }) });
      go("/verification-pending", data.email);
    } catch (reason) {
      if (reason instanceof ApiError && reason.status === 503 && reason.message.startsWith("Account created")) {
        go("/verification-pending", data.email);
      } else {
        setError(reason instanceof Error ? reason.message : "Account creation failed. Please try again.");
      }
    } finally {
      setBusy(false);
    }
  };
  return <AuthLayout eyebrow="GET STARTED" title="Create your account" description="We will email you a link to verify your address before you sign in.">
    {!emailDeliveryReady && <Notice type="info">Account creation is temporarily unavailable while verification email delivery is being set up. Please try again later.</Notice>}
    {error && <Notice type="error">{error}</Notice>}
    <form className="space-y-4" onSubmit={submit}>
      <div className="grid sm:grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-xs font-semibold text-[#384551]">First name<input name="first_name" autoComplete="given-name" maxLength={80} required className={inputClass}/></label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-[#384551]">Middle name (optional)<input name="middle_name" autoComplete="additional-name" maxLength={80} className={inputClass}/></label>
        <label className="sm:col-span-2 flex flex-col gap-1 text-xs font-semibold text-[#384551]">Last name<input name="last_name" autoComplete="family-name" maxLength={80} required className={inputClass}/></label>
      </div>
      <label className="flex flex-col gap-1 text-xs font-semibold text-[#384551]">Email address<input name="email" type="email" autoComplete="email" required className={inputClass}/></label>
      <label className="flex flex-col gap-1 text-xs font-semibold text-[#384551]">Password<input name="password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required aria-describedby="password-requirements" className={inputClass}/></label>
      <p id="password-requirements" className="text-[11px] text-[#8592a3]">{PASSWORD_REQUIREMENTS}</p>
      <label className="flex flex-col gap-1 text-xs font-semibold text-[#384551]">Confirm password<input name="confirm_password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required className={inputClass}/></label>
      <button type="submit" disabled={busy || !emailDeliveryReady} className="w-full h-10 rounded-md bg-[#696cff] text-white text-xs font-bold disabled:opacity-50">{busy ? "Creating account…" : "Create account"}</button>
    </form>
    <p className="mt-6 text-center text-xs text-[#8592a3]">Already have an account? <button type="button" onClick={() => go("/login")} className="text-[#696cff] font-bold hover:underline">Sign in</button></p>
  </AuthLayout>;
}
