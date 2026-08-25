"use client";
import { useEffect, useState } from "react";
import { api } from "../api";
import { Logo } from "../BrandLogo";
import { PASSWORD_REQUIREMENTS, passwordValidationMessage, Notice } from "../components/ViewShared";

function AuthLayout({ children, eyebrow, title, description }) {
    return (<main className="min-h-screen grid lg:grid-cols-12 bg-white selection:bg-[#087EFF] selection:text-white">
      {/* Left Brand Panel */}
      <section className="hidden lg:flex lg:col-span-5 flex-col justify-between p-12 bg-gradient-to-b from-[#04142F] via-[#071E4A] to-[#04142F] text-white relative overflow-hidden">
        <div className="absolute inset-0 bg-security-grid-dark opacity-30 pointer-events-none"/>
        <Logo light/>
        <div className="relative z-10 my-auto max-w-md">
          <p className="text-[11px] font-bold text-[#1495FF] tracking-wider uppercase mb-2">LOCAL DETECTION + SHARED INSIGHTS</p>
          <h1 className="text-4xl font-extrabold tracking-tight leading-tight mb-4">Your browsing stays yours.</h1>
          <p className="text-sm text-slate-300 leading-relaxed mb-6">
            BantAI analyzes sensitive content on your computer, then shares only minimized outcomes with this dashboard.
          </p>
          <ul className="space-y-3 text-xs text-slate-300">
            <li className="flex items-center gap-2.5">
              <span className="w-5 h-5 rounded-full bg-[#087EFF]/20 border border-[#087EFF]/40 flex items-center justify-center text-emerald-400 text-xs font-bold">✓</span>
              Email bodies are never saved here
            </li>
            <li className="flex items-center gap-2.5">
              <span className="w-5 h-5 rounded-full bg-[#087EFF]/20 border border-[#087EFF]/40 flex items-center justify-center text-emerald-400 text-xs font-bold">✓</span>
              URL paths and searches stay private
            </li>
            <li className="flex items-center gap-2.5">
              <span className="w-5 h-5 rounded-full bg-[#087EFF]/20 border border-[#087EFF]/40 flex items-center justify-center text-emerald-400 text-xs font-bold">✓</span>
              Clear guidance, never false guarantees
            </li>
          </ul>
        </div>
        <p className="text-[11px] text-slate-400">BantAI v1.1 · Privacy-first hybrid analysis</p>
      </section>

      {/* Right Form Panel */}
      <section className="lg:col-span-7 flex items-center justify-center p-6 sm:p-12 bg-slate-50/50">
        <div className="w-full max-w-md bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-sm">
          <div className="lg:hidden mb-6 flex justify-center">
            <Logo />
          </div>
          <p className="text-xs font-semibold text-[#087EFF] tracking-wider uppercase mb-1">{eyebrow}</p>
          <h2 className="text-2xl font-bold text-[#04142F] tracking-tight">{title}</h2>
          <p className="text-xs text-slate-500 mt-1 mb-6 leading-relaxed">{description}</p>
          {children}
        </div>
      </section>
    </main>);
}
function AuthScreen({ onAuthenticated, initialPath }) {
    const [path, setPath] = useState(initialPath === "/register" ? "/register" : "/login");
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    const go = (next) => {
        history.pushState({}, "", next);
        setPath(next);
        setError("");
    };
    useEffect(() => {
        if (!["/login", "/register"].includes(window.location.pathname)) {
            history.replaceState({}, "", "/login");
        }
        const handler = () => setPath(window.location.pathname === "/register" ? "/register" : "/login");
        window.addEventListener("popstate", handler);
        return () => window.removeEventListener("popstate", handler);
    }, []);
    const submit = async (event) => {
        event.preventDefault();
        setBusy(true);
        setError("");
        const data = Object.fromEntries(new FormData(event.currentTarget));
        try {
            if (path === "/register") {
                const availability = await api("/auth/email-availability", {
                    method: "POST",
                    body: JSON.stringify({ email: data.email }),
                });
                if (!availability.available)
                    throw new Error("This email is already in use.");
                const passwordError = passwordValidationMessage(data.password);
                if (passwordError)
                    throw new Error(passwordError);
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
        }
        catch (reason) {
            setError(reason instanceof Error ? reason.message : "BantAI could not complete that request.");
        }
        finally {
            setBusy(false);
        }
    };
    const isRegister = path === "/register";
    const title = isRegister ? "Create your account" : "Welcome back";
    const description = isRegister
        ? "Create a secure BantAI account using your email address."
        : "Sign in to review your recent website and email checks.";
    return (<AuthLayout eyebrow={isRegister ? "GET STARTED" : "SECURE SIGN IN"} title={title} description={description}>
      {error && <Notice type="error">{error}</Notice>}
      <form className="space-y-4" onSubmit={submit}>
        {isRegister && (<div className="grid sm:grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-slate-700">First name</span>
              <input name="first_name" autoComplete="given-name" maxLength={80} placeholder="First name" required className="h-11 px-3.5 rounded-xl border border-slate-300 bg-white text-slate-800 text-xs focus:ring-2 focus:ring-[#087EFF] focus:border-transparent outline-none transition"/>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-slate-700">Middle name <small className="text-slate-400 font-normal">(optional)</small></span>
              <input name="middle_name" autoComplete="additional-name" maxLength={80} placeholder="Middle name" className="h-11 px-3.5 rounded-xl border border-slate-300 bg-white text-slate-800 text-xs focus:ring-2 focus:ring-[#087EFF] focus:border-transparent outline-none transition"/>
            </label>
            <label className="sm:col-span-2 flex flex-col gap-1">
              <span className="text-xs font-semibold text-slate-700">Last name</span>
              <input name="last_name" autoComplete="family-name" maxLength={80} placeholder="Last name" required className="h-11 px-3.5 rounded-xl border border-slate-300 bg-white text-slate-800 text-xs focus:ring-2 focus:ring-[#087EFF] focus:border-transparent outline-none transition"/>
            </label>
          </div>)}
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-slate-700">Email address</span>
          <input name="email" type="email" autoComplete="email" placeholder="you@example.com" required className="h-11 px-3.5 rounded-xl border border-slate-300 bg-white text-slate-800 text-xs focus:ring-2 focus:ring-[#087EFF] focus:border-transparent outline-none transition"/>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-slate-700">Password</span>
          <input name="password" type="password" autoComplete={isRegister ? "new-password" : "current-password"} minLength={12} maxLength={128} aria-describedby={isRegister ? "password-requirements" : undefined} placeholder={isRegister ? "Create a strong password" : "Your password"} required className="h-11 px-3.5 rounded-xl border border-slate-300 bg-white text-slate-800 text-xs focus:ring-2 focus:ring-[#087EFF] focus:border-transparent outline-none transition"/>
        </label>
        {isRegister && (<p id="password-requirements" className="text-[11px] text-slate-500 leading-normal">
            {PASSWORD_REQUIREMENTS}
          </p>)}
        {isRegister && (<label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-slate-700">Confirm password</span>
            <input name="confirm_password" type="password" autoComplete="new-password" minLength={12} maxLength={128} placeholder="Repeat your password" required className="h-11 px-3.5 rounded-xl border border-slate-300 bg-white text-slate-800 text-xs focus:ring-2 focus:ring-[#087EFF] focus:border-transparent outline-none transition"/>
          </label>)}
        <button type="submit" className="w-full mt-2 h-11 rounded-xl bg-[#087EFF] hover:bg-[#071E4A] text-white text-xs font-bold transition-all shadow-md shadow-[#087EFF]/20 active:scale-[0.99] disabled:opacity-50" disabled={busy}>
          {busy ? "Please wait…" : isRegister ? "Create account" : "Sign in"}
        </button>
      </form>
      <div className="mt-6 text-center text-xs text-slate-500">
        {isRegister ? (<>
            Already have an account?{" "}
            <button className="text-[#087EFF] font-bold hover:underline" onClick={() => go("/login")}>
              Sign in
            </button>
          </>) : (<>
            New to BantAI?{" "}
            <button className="text-[#087EFF] font-bold hover:underline" onClick={() => go("/register")}>
              Create an account
            </button>
          </>)}
      </div>
    </AuthLayout>);
}

export default AuthScreen;
