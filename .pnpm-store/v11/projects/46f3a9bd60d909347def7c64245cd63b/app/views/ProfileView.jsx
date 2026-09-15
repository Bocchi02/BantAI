"use client";
import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import { UserIcon, LockIcon, LogOutIcon, GlobeIcon, MailIcon, CheckIcon } from "../Icons";
import { PASSWORD_REQUIREMENTS, passwordValidationMessage, cx, Notice, PageHeader, DashboardSkeleton } from "../components/ViewShared";

function ProfilePage({ user, onUpdateUser, onUserChanged, onLogout, onSignOut }) {
    const updateUser = onUpdateUser || onUserChanged || (() => {});
    const logout = onLogout || onSignOut || (() => {});
    const [consent, setConsent] = useState(null);
    const [firstName, setFirstName] = useState(user.first_name || "");
    const [middleName, setMiddleName] = useState(user.middle_name || "");
    const [lastName, setLastName] = useState(user.last_name || "");
    const [oldPassword, setOldPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [trainingConsent, setTrainingConsent] = useState(false);
    const [profileError, setProfileError] = useState("");
    const [profileMessage, setProfileMessage] = useState("");
    const [passwordError, setPasswordError] = useState("");
    const [passwordMessage, setPasswordMessage] = useState("");
    const [consentError, setConsentError] = useState("");
    const [consentMessage, setConsentMessage] = useState("");
    const [savingProfile, setSavingProfile] = useState(false);
    const [savingPassword, setSavingPassword] = useState(false);
    const [savingConsent, setSavingConsent] = useState(false);
    const load = useCallback(() => {
        return api("/auth/me")
            .then(({ user: data }) => {
            setFirstName(data.first_name || "");
            setMiddleName(data.middle_name || "");
            setLastName(data.last_name || "");

        })
            .catch((reason) => setProfileError(reason.message));
    }, []);
    useEffect(() => { void load(); }, [load]);
    useEffect(() => {
        api("/training-consent").then((data) => { setConsent(data); setTrainingConsent(data.enabled); })
            .catch((error) => setConsentError(error.message));
    }, []);
    const saveProfile = async (event) => {
        event.preventDefault();
        setSavingProfile(true);
        setProfileError("");
        setProfileMessage("");
        try {
            const updated = await api("/profile", {
                method: "PATCH",
                body: JSON.stringify({
                    first_name: firstName.trim(),
                    middle_name: middleName.trim() || null,
                    last_name: lastName.trim(),
                }),
            });
            updateUser(updated.user);
            setProfileMessage("Personal details updated.");
        }
        catch (reason) {
            setProfileError(reason instanceof Error ? reason.message : "BantAI could not update your details.");
        }
        finally {
            setSavingProfile(false);
        }
    };
    const savePassword = async (event) => {
        event.preventDefault();
        setPasswordError("");
        setPasswordMessage("");
        const validation = passwordValidationMessage(newPassword);
        if (validation) {
            setPasswordError(validation);
            return;
        }
        if (newPassword !== confirmPassword) {
            setPasswordError("New passwords do not match.");
            return;
        }
        setSavingPassword(true);
        try {
            await api("/profile/change-password", {
                method: "POST",
                body: JSON.stringify({
                    current_password: oldPassword,
                    new_password: newPassword,
                }),
            });
            setOldPassword("");
            setNewPassword("");
            setConfirmPassword("");
            setPasswordMessage("Password updated successfully.");
        }
        catch (reason) {
            setPasswordError(reason instanceof Error ? reason.message : "BantAI could not update your password.");
        }
        finally {
            setSavingPassword(false);
        }
    };
    const updateConsent = async (enabled) => {
        setSavingConsent(true);
        setConsentError("");
        setConsentMessage("");
        try {
            const updated = await api("/training-consent", {
                method: "PATCH",
                body: JSON.stringify({ enabled, confirmed: enabled }),
            });
            setTrainingConsent(updated.enabled);
            setConsent(updated);
            setConsentMessage(updated.message || (enabled ? "Automatic random training-data contribution is enabled." : "Automatic collection is disabled."));
        }
        catch (reason) {
            setTrainingConsent(Boolean(consent?.enabled));
            setConsentError(reason instanceof Error ? reason.message : "BantAI could not update your contribution preference.");
        }
        finally {
            setSavingConsent(false);
        }
    };
    return (<>
      <PageHeader eyebrow="ACCOUNT SETTINGS" title="Profile" description="Manage your account details, password, and privacy-preserving training contribution settings." actions={<button className="flex items-center gap-1.5 px-3.5 py-2 rounded-md bg-[#ffe0db] text-[#ff3e1d] hover:bg-[#ffb2a5]/50 text-xs font-bold transition" onClick={logout} type="button">
            <LogOutIcon className="w-4 h-4"/>
            <span>Sign out</span>
          </button>}/>
      <div className="grid lg:grid-cols-12 gap-6">
        <section className="lg:col-span-6 sneat-card p-5 sm:p-6" aria-labelledby="personal-details-title">
          <div className="flex items-center gap-3 mb-4 pb-3 border-b border-[#e4e6e8]/70">
            <div className="w-9 h-9 rounded-md bg-[#e7e7ff] text-[#696cff] flex items-center justify-center shrink-0 shadow-2xs">
              <UserIcon className="w-4 h-4"/>
            </div>
            <div>
              <p className="text-xs font-semibold text-[#696cff] uppercase tracking-wider">IDENTITY</p>
              <h2 id="personal-details-title" className="text-base font-bold text-[#384551]">Personal details</h2>
            </div>
          </div>
          {profileError && <Notice type="error">{profileError}</Notice>}
          {profileMessage && <Notice type="success">{profileMessage}</Notice>}
          <form className="space-y-4" onSubmit={saveProfile}>
            <div className="grid sm:grid-cols-2 gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-[#384551]">First name</span>
                <input value={firstName} onChange={(event) => setFirstName(event.target.value)} maxLength={80} required className="h-10 px-3 rounded-md border border-[#d9dee3] text-xs bg-white text-[#384551] focus:ring-2 focus:ring-[#696cff]/20 focus:border-[#696cff] outline-none"/>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-[#384551]">Middle name <small className="text-[#8592a3] font-normal">(optional)</small></span>
                <input value={middleName} onChange={(event) => setMiddleName(event.target.value)} maxLength={80} className="h-10 px-3 rounded-md border border-[#d9dee3] text-xs bg-white text-[#384551] focus:ring-2 focus:ring-[#696cff]/20 focus:border-[#696cff] outline-none"/>
              </label>
              <label className="sm:col-span-2 flex flex-col gap-1">
                <span className="text-xs font-semibold text-[#384551]">Last name</span>
                <input value={lastName} onChange={(event) => setLastName(event.target.value)} maxLength={80} required className="h-10 px-3 rounded-md border border-[#d9dee3] text-xs bg-white text-[#384551] focus:ring-2 focus:ring-[#696cff]/20 focus:border-[#696cff] outline-none"/>
              </label>
            </div>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-[#384551]">Email address</span>
              <input value={user.email} disabled className="h-10 px-3 rounded-md border border-[#d9dee3] text-xs bg-[#f5f5f9] text-[#8592a3] cursor-not-allowed"/>
              <small className="text-[#8592a3] text-[11px]">Email addresses cannot be changed directly.</small>
            </label>
            <button type="submit" disabled={savingProfile} className="py-2 px-4 rounded-md bg-[#696cff] hover:bg-[#5f61e6] text-white text-xs font-bold shadow-[0_2px_4px_0_rgba(105,108,255,0.4)] transition disabled:opacity-50">
              {savingProfile ? "Saving…" : "Save personal details"}
            </button>
          </form>
        </section>

        <section className="lg:col-span-6 sneat-card p-5 sm:p-6" aria-labelledby="change-password-title">
          <div className="flex items-center gap-3 mb-4 pb-3 border-b border-[#e4e6e8]/70">
            <div className="w-9 h-9 rounded-md bg-[#e7e7ff] text-[#696cff] flex items-center justify-center shrink-0 shadow-2xs">
              <LockIcon className="w-4 h-4"/>
            </div>
            <div>
              <p className="text-xs font-semibold text-[#696cff] uppercase tracking-wider">SECURITY</p>
              <h2 id="change-password-title" className="text-base font-bold text-[#384551]">Change password</h2>
            </div>
          </div>
          {passwordError && <Notice type="error">{passwordError}</Notice>}
          {passwordMessage && <Notice type="success">{passwordMessage}</Notice>}
          <form className="space-y-4" onSubmit={savePassword}>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-[#384551]">Current password</span>
              <input type="password" value={oldPassword} onChange={(event) => setOldPassword(event.target.value)} required className="h-10 px-3 rounded-md border border-[#d9dee3] text-xs bg-white text-[#384551] focus:ring-2 focus:ring-[#696cff]/20 focus:border-[#696cff] outline-none"/>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-[#384551]">New password</span>
              <input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} minLength={12} maxLength={128} required className="h-10 px-3 rounded-md border border-[#d9dee3] text-xs bg-white text-[#384551] focus:ring-2 focus:ring-[#696cff]/20 focus:border-[#696cff] outline-none"/>
              <small className="text-[#8592a3] text-[11px] leading-normal">{PASSWORD_REQUIREMENTS}</small>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-[#384551]">Confirm new password</span>
              <input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} minLength={12} maxLength={128} required className="h-10 px-3 rounded-md border border-[#d9dee3] text-xs bg-white text-[#384551] focus:ring-2 focus:ring-[#696cff]/20 focus:border-[#696cff] outline-none"/>
            </label>
            <button type="submit" disabled={savingPassword} className="py-2 px-4 rounded-md bg-[#696cff] hover:bg-[#5f61e6] text-white text-xs font-bold shadow-[0_2px_4px_0_rgba(105,108,255,0.4)] transition disabled:opacity-50">
              {savingPassword ? "Updating…" : "Update password"}
            </button>
          </form>
        </section>

        <section className="lg:col-span-12 sneat-card p-5 sm:p-6 border-l-4 border-l-[#008f7a]" aria-labelledby="training-contribution-title">
          <div className="flex items-center gap-3 mb-4 pb-3 border-b border-[#e4e6e8]/70">
            <div className="w-9 h-9 rounded-md bg-[#e0f8f2] text-[#008f7a] flex items-center justify-center shrink-0 shadow-2xs">
              <GlobeIcon className="w-4 h-4"/>
            </div>
            <div>
              <p className="text-xs font-semibold text-[#008f7a] uppercase tracking-wider">FUTURE MODEL IMPROVEMENT</p>
              <h2 id="training-contribution-title" className="text-base font-bold text-[#384551]">Automatic training-data contribution</h2>
            </div>
          </div>
          {consentError && <Notice type="error">{consentError}</Notice>}
          {consentMessage && <Notice type="success">{consentMessage}</Notice>}
          <p className="text-xs text-[#646e78] leading-relaxed max-w-3xl mb-4">
            Consenting users allow the BantAI server to randomly collect a small fraction of completed checks to help improve future model accuracy. Selected full URLs and email content may contain personal information. Stored content is encrypted and separate from human-approved labels.
          </p>
          <div className="p-4 rounded-lg bg-[#e0f8f2]/40 border border-[#bfe4dc] space-y-3 mb-4">
            <label className="flex items-start gap-3 cursor-pointer">
              <input type="checkbox" checked={trainingConsent} onChange={(event) => void updateConsent(event.target.checked)} disabled={savingConsent || !consent} className="mt-0.5 rounded border-[#d9dee3] text-[#008f7a] focus:ring-[#008f7a] shrink-0 accent-[#008f7a]"/>
              <span className="text-xs font-semibold text-[#064e43] leading-relaxed">
                I agree to automatic random training-data collection.
              </span>
            </label>
            <p className="text-[11px] text-[#064e43]/80 leading-relaxed pl-6">
              When enabled, each completed check has a {consent?.sample_rate_percent ?? 10}% chance of selection; this does not collect every check. The server checks current consent at completion, makes the decision at most once, and encrypts selected full URLs or email content in a separate automatic inventory. Opting out immediately stops collection and deletes your stored automatic samples.
            </p>
            {trainingConsent && <p className="text-xs text-[#064e43] pl-6"><strong>Stop collection and delete samples:</strong> clear the checkbox. The shared service stops accepting samples and deletes this account’s automatic samples.</p>}
          </div>
          <p role="status" aria-live="polite" className="text-sm text-[#646e78]">{!consent ? (consentError ? "Collection status unavailable. Reload to retry." : "Loading collection status…") : `${trainingConsent ? "Enabled" : "Disabled"} · ${consent.collected_sample_count} collected samples · Last accepted: ${consent.last_collected_at ? new Date(consent.last_collected_at).toLocaleString() : "Not yet"}`}</p>
        </section>
      </div>
    </>);
}

export default ProfilePage;
