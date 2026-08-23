"use client";
import { useState } from "react";
import { api } from "../api";
import { PASSWORD_REQUIREMENTS, passwordValidationMessage, userName, Notice, PageHeader } from "../components/ViewShared";

function ProfilePage({ user, onUserChanged, onSignOut }) {
    const [nameBusy, setNameBusy] = useState(false);
    const [passwordBusy, setPasswordBusy] = useState(false);
    const [signOutBusy, setSignOutBusy] = useState(false);
    const [nameMessage, setNameMessage] = useState("");
    const [passwordMessage, setPasswordMessage] = useState("");
    const [error, setError] = useState("");
    const saveName = async (event) => {
        event.preventDefault();
        setNameBusy(true);
        setError("");
        setNameMessage("");
        const data = Object.fromEntries(new FormData(event.currentTarget));
        try {
            const result = await api("/profile", {
                method: "PATCH",
                body: JSON.stringify({
                    first_name: data.first_name,
                    middle_name: data.middle_name || null,
                    last_name: data.last_name,
                }),
            });
            onUserChanged(result.user);
            setNameMessage(result.message);
        }
        catch (reason) {
            setError(reason instanceof Error ? reason.message : "BantAI could not update your profile.");
        }
        finally {
            setNameBusy(false);
        }
    };
    const changePassword = async (event) => {
        event.preventDefault();
        setPasswordBusy(true);
        setError("");
        setPasswordMessage("");
        const form = event.currentTarget;
        const data = Object.fromEntries(new FormData(form));
        try {
            const passwordError = passwordValidationMessage(data.new_password);
            if (passwordError)
                throw new Error(passwordError);
            if (data.new_password !== data.confirm_password)
                throw new Error("New passwords do not match.");
            const result = await api("/profile/change-password", {
                method: "POST",
                body: JSON.stringify({ current_password: data.current_password, new_password: data.new_password }),
            });
            form.reset();
            setPasswordMessage(result.message);
        }
        catch (reason) {
            setError(reason instanceof Error ? reason.message : "BantAI could not change your password.");
        }
        finally {
            setPasswordBusy(false);
        }
    };
    const signOut = async () => {
        setSignOutBusy(true);
        setError("");
        try {
            await onSignOut();
        }
        catch (reason) {
            setError(reason instanceof Error ? reason.message : "BantAI could not sign you out.");
            setSignOutBusy(false);
        }
    };
    return (<>
      <PageHeader eyebrow="YOUR ACCOUNT" title="Profile" description="Update your name, protect your password, and manage this signed-in session."/>
      {error && <Notice type="error">{error}</Notice>}
      <div className="grid sm:grid-cols-2 gap-6 mb-6">
        <section className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm" aria-labelledby="personal-details-title">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
            <div>
              <p className="text-[10px] font-bold text-[#087EFF] uppercase tracking-wider">PERSONAL DETAILS</p>
              <h2 id="personal-details-title" className="text-base font-bold text-[#04142F]">Your name</h2>
            </div>
            <span className="w-8 h-8 rounded-xl bg-[#071E4A] text-white flex items-center justify-center font-bold text-xs">
              {userName(user).slice(0, 1).toUpperCase()}
            </span>
          </div>
          <form className="space-y-4" onSubmit={saveName}>
            <div className="grid sm:grid-cols-2 gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-slate-700">First name</span>
                <input name="first_name" autoComplete="given-name" maxLength={80} defaultValue={user.first_name} required className="h-10 px-3 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-[#087EFF] outline-none"/>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-slate-700">Middle name <small className="text-slate-400 font-normal">(optional)</small></span>
                <input name="middle_name" autoComplete="additional-name" maxLength={80} defaultValue={user.middle_name || ""} className="h-10 px-3 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-[#087EFF] outline-none"/>
              </label>
              <label className="sm:col-span-2 flex flex-col gap-1">
                <span className="text-xs font-semibold text-slate-700">Last name</span>
                <input name="last_name" autoComplete="family-name" maxLength={80} defaultValue={user.last_name} required className="h-10 px-3 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-[#087EFF] outline-none"/>
              </label>
            </div>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-slate-700">Email address</span>
              <input value={user.email} readOnly aria-describedby="email-help" className="h-10 px-3 rounded-xl border border-slate-200 bg-slate-50 text-slate-500 text-xs cursor-not-allowed"/>
            </label>
            <p id="email-help" className="text-[11px] text-slate-400">Email changes are not available in this MVP.</p>
            {nameMessage && <Notice type="success">{nameMessage}</Notice>}
            <button className="px-5 py-2.5 rounded-xl bg-[#087EFF] hover:bg-[#071E4A] text-white text-xs font-bold shadow-sm transition disabled:opacity-50" disabled={nameBusy}>
              {nameBusy ? "Saving..." : "Save name"}
            </button>
          </form>
        </section>

        <section className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm" aria-labelledby="password-title">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
            <div>
              <p className="text-[10px] font-bold text-[#087EFF] uppercase tracking-wider">ACCOUNT SECURITY</p>
              <h2 id="password-title" className="text-base font-bold text-[#04142F]">Change password</h2>
            </div>
            <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full">Strong password</span>
          </div>
          <form className="space-y-4" onSubmit={changePassword}>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-slate-700">Current password</span>
              <input name="current_password" type="password" autoComplete="current-password" maxLength={128} required className="h-10 px-3 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-[#087EFF] outline-none"/>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-slate-700">New password</span>
              <input name="new_password" type="password" autoComplete="new-password" minLength={12} maxLength={128} aria-describedby="profile-password-requirements" required className="h-10 px-3 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-[#087EFF] outline-none"/>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-slate-700">Confirm new password</span>
              <input name="confirm_password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required className="h-10 px-3 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-[#087EFF] outline-none"/>
            </label>
            <p id="profile-password-requirements" className="text-[11px] text-slate-400 leading-normal">{PASSWORD_REQUIREMENTS} Changing your password closes your other signed-in web sessions.</p>
            {passwordMessage && <Notice type="success">{passwordMessage}</Notice>}
            <button className="px-5 py-2.5 rounded-xl bg-[#087EFF] hover:bg-[#071E4A] text-white text-xs font-bold shadow-sm transition disabled:opacity-50" disabled={passwordBusy}>
              {passwordBusy ? "Updating..." : "Change password"}
            </button>
          </form>
        </section>
      </div>

      <section className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
        <div>
          <p className="text-[10px] font-bold text-[#087EFF] uppercase tracking-wider mb-0.5">CURRENT SESSION</p>
          <h2 className="text-base font-bold text-[#04142F]">Sign out of BantAI</h2>
          <p className="text-xs text-slate-500 mt-0.5">This closes this web session. Your paired Companion continues local protection.</p>
        </div>
        <button className="px-4 py-2 rounded-xl border border-rose-200 text-rose-600 hover:bg-rose-50 text-xs font-bold transition disabled:opacity-50 shrink-0" onClick={signOut} disabled={signOutBusy}>
          {signOutBusy ? "Signing out..." : "Sign out"}
        </button>
      </section>
    </>);
}

export default ProfilePage;
