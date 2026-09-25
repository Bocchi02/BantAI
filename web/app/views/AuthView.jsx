"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "../api";
import { Logo } from "../BrandLogo";
import { normalizeAuthPath } from "../registration";
import {
  PASSWORD_REQUIREMENTS,
  passwordValidationMessage,
  Notice,
} from "../components/ViewShared";

function AuthLayout({ children, eyebrow, title, description }) {
  return (
    <main className="min-h-screen grid lg:grid-cols-12 bg-[#f5f5f9] selection:bg-[#696cff] selection:text-white">
      {/* Left Brand Panel */}
      <section className="hidden lg:flex lg:col-span-5 flex-col justify-between p-12 bg-gradient-to-b from-[#071e4a] via-[#04142f] to-[#071e4a] text-white relative overflow-hidden">
        <Logo light />
        <div className="relative z-10 my-auto max-w-md">
          <p className="text-[11px] font-bold text-[#696cff] tracking-wider uppercase mb-2">
            SERVER MODELS + PRIVACY-MINIMIZED INSIGHTS
          </p>
          <h1 className="text-3xl xl:text-4xl font-extrabold tracking-tight leading-tight mb-4">
            Clear checks, carefully handled.
          </h1>
          <p className="text-xs sm:text-sm text-slate-300 leading-relaxed mb-6">
            Exact addresses and supported opened-email content are sent securely
            to the Signalam server for transient checking. Routine inputs are not
            retained, and this dashboard receives only permitted metadata.
          </p>
          <ul className="space-y-3 text-xs text-slate-300">
            <li className="flex items-center gap-2.5">
              <span className="w-5 h-5 rounded-full bg-[#696cff]/20 border border-[#696cff]/40 flex items-center justify-center text-[#71dd37] text-xs font-bold">
                ✓
              </span>
              Email bodies are never saved here
            </li>
            <li className="flex items-center gap-2.5">
              <span className="w-5 h-5 rounded-full bg-[#696cff]/20 border border-[#696cff]/40 flex items-center justify-center text-[#71dd37] text-xs font-bold">
                ✓
              </span>
              Routine URL paths and searches are not retained
            </li>
            <li className="flex items-center gap-2.5">
              <span className="w-5 h-5 rounded-full bg-[#696cff]/20 border border-[#696cff]/40 flex items-center justify-center text-[#71dd37] text-xs font-bold">
                ✓
              </span>
              Clear guidance, never false guarantees
            </li>
          </ul>
        </div>
        <p className="text-[11px] text-slate-400">
          Signalam v1.1 · Privacy-first hybrid analysis
        </p>
      </section>

      {/* Right Form Panel (Sneat Basic Auth Card) */}
      <section className="lg:col-span-7 flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-md sneat-card p-6 sm:p-8 bg-white border border-[#e4e6e8]">
          <div className="lg:hidden mb-6 flex justify-center">
            <Logo />
          </div>
          <p className="text-xs font-semibold text-[#696cff] tracking-wider uppercase mb-1">
            {eyebrow}
          </p>
          <h2 className="text-2xl font-bold text-[#384551] tracking-tight">
            {title}
          </h2>
          <p className="text-xs text-[#8592a3] mt-1 mb-6 leading-relaxed">
            {description}
          </p>
          {children}
          <p className="mt-6 pt-4 border-t border-[#e4e6e8] text-center text-[11px] text-[#8592a3]">
            By using Signalam, you acknowledge how information is handled in the <Link href="/privacy" className="font-semibold text-[#696cff] hover:underline focus:outline-none focus:ring-2 focus:ring-[#696cff]/30 rounded-sm">Privacy Policy</Link>.
          </p>
        </div>
      </section>
    </main>
  );
}

function AuthScreen({ onAuthenticated, initialPath, registrationEnabled = false }) {
  const [path, setPath] = useState(
    normalizeAuthPath(initialPath, registrationEnabled),
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const go = (next) => {
    if (next === "/register" && !registrationEnabled) return;
    history.pushState({}, "", next);
    setPath(next);
    setError("");
  };
  useEffect(() => {
    const normalizedPath = normalizeAuthPath(
      window.location.pathname,
      registrationEnabled,
    );
    if (window.location.pathname !== normalizedPath) {
      history.replaceState({}, "", normalizedPath);
    }
    const handler = () =>
      setPath(normalizeAuthPath(window.location.pathname, registrationEnabled));
    window.addEventListener("popstate", handler);
    return () => window.removeEventListener("popstate", handler);
  }, [registrationEnabled]);
  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    const data = Object.fromEntries(new FormData(event.currentTarget));
    try {
      if (registrationEnabled && path === "/register") {
        const availability = await api("/auth/email-availability", {
          method: "POST",
          body: JSON.stringify({ email: data.email }),
        });
        if (!availability.available)
          throw new Error("This email is already in use.");
        const passwordError = passwordValidationMessage(data.password);
        if (passwordError) throw new Error(passwordError);
        if (data.password !== data.confirm_password)
          throw new Error("Passwords do not match.");
        await api("/auth/register", {
          method: "POST",
          body: JSON.stringify({
            first_name: data.first_name,
            middle_name: data.middle_name || null,
            last_name: data.last_name,
            email: data.email,
            password: data.password,
          }),
        });
      }
      const result = await api("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: data.email, password: data.password }),
      });
      history.replaceState({}, "", "/dashboard");
      onAuthenticated(result.user);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Signalam could not complete that request.",
      );
    } finally {
      setBusy(false);
    }
  };
  const isRegister = registrationEnabled && path === "/register";
  const title = isRegister ? "Create your account" : "Welcome back";
  const description = isRegister
    ? "Create a secure Signalam account using your email address."
    : "Sign in to review your recent website and email checks.";
  return (
    <AuthLayout
      eyebrow={isRegister ? "GET STARTED" : "SECURE SIGN IN"}
      title={title}
      description={description}
    >
      {error && <Notice type="error">{error}</Notice>}
      <form className="space-y-4" onSubmit={submit}>
        {isRegister && (
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-[#384551]">
                First name
              </span>
              <input
                name="first_name"
                autoComplete="given-name"
                maxLength={80}
                placeholder="First name"
                required
                className="h-10 px-3.5 rounded-md border border-[#d9dee3] bg-white text-[#384551] text-xs focus:ring-2 focus:ring-[#696cff]/20 focus:border-[#696cff] outline-none transition"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-[#384551]">
                Middle name{" "}
                <small className="text-[#8592a3] font-normal">(optional)</small>
              </span>
              <input
                name="middle_name"
                autoComplete="additional-name"
                maxLength={80}
                placeholder="Middle name"
                className="h-10 px-3.5 rounded-md border border-[#d9dee3] bg-white text-[#384551] text-xs focus:ring-2 focus:ring-[#696cff]/20 focus:border-[#696cff] outline-none transition"
              />
            </label>
            <label className="sm:col-span-2 flex flex-col gap-1">
              <span className="text-xs font-semibold text-[#384551]">
                Last name
              </span>
              <input
                name="last_name"
                autoComplete="family-name"
                maxLength={80}
                placeholder="Last name"
                required
                className="h-10 px-3.5 rounded-md border border-[#d9dee3] bg-white text-[#384551] text-xs focus:ring-2 focus:ring-[#696cff]/20 focus:border-[#696cff] outline-none transition"
              />
            </label>
          </div>
        )}
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-[#384551]">
            Email address
          </span>
          <input
            name="email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            required
            className="h-10 px-3.5 rounded-md border border-[#d9dee3] bg-white text-[#384551] text-xs focus:ring-2 focus:ring-[#696cff]/20 focus:border-[#696cff] outline-none transition"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-[#384551]">Password</span>
          <input
            name="password"
            type="password"
            autoComplete={isRegister ? "new-password" : "current-password"}
            minLength={12}
            maxLength={128}
            aria-describedby={isRegister ? "password-requirements" : undefined}
            placeholder={
              isRegister ? "Create a strong password" : "Your password"
            }
            required
            className="h-10 px-3.5 rounded-md border border-[#d9dee3] bg-white text-[#384551] text-xs focus:ring-2 focus:ring-[#696cff]/20 focus:border-[#696cff] outline-none transition"
          />
        </label>
        {isRegister && (
          <p
            id="password-requirements"
            className="text-[11px] text-[#8592a3] leading-normal"
          >
            {PASSWORD_REQUIREMENTS}
          </p>
        )}
        {isRegister && (
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-[#384551]">
              Confirm password
            </span>
            <input
              name="confirm_password"
              type="password"
              autoComplete="new-password"
              minLength={12}
              maxLength={128}
              placeholder="Repeat your password"
              required
              className="h-10 px-3.5 rounded-md border border-[#d9dee3] bg-white text-[#384551] text-xs focus:ring-2 focus:ring-[#696cff]/20 focus:border-[#696cff] outline-none transition"
            />
          </label>
        )}
        <button
          type="submit"
          className="w-full mt-2 h-10 rounded-md bg-[#696cff] hover:bg-[#5f61e6] text-white text-xs font-bold transition-all shadow-[0_2px_4px_0_rgba(105,108,255,0.4)] active:scale-[0.99] disabled:opacity-50"
          disabled={busy}
        >
          {busy ? "Please wait…" : isRegister ? "Create account" : "Sign in"}
        </button>
      </form>
      <div className="mt-6 text-center text-xs text-[#8592a3]">
        {isRegister ? (
          <>
            Already have an account?{" "}
            <button
              className="text-[#696cff] font-bold hover:underline"
              onClick={() => go("/login")}
            >
              Sign in
            </button>
          </>
        ) : (
          registrationEnabled ? (
            <>
              New to Signalam?{" "}
              <button
                className="text-[#696cff] font-bold hover:underline"
                onClick={() => go("/register")}
              >
                Create an account
              </button>
            </>
          ) : (
            <>Accounts are currently provisioned for authorized pilot users. Contact the Signalam administrator.</>
          )
        )}
      </div>
    </AuthLayout>
  );
}

export default AuthScreen;
