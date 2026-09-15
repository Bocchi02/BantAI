"use client";

import { AlertTriangleIcon, GlobeIcon, HelpCircleIcon, LaptopIcon, MailIcon, ShieldCheckIcon } from "../Icons";
import { PageHeader, StatusBadge } from "../components/ViewShared";

function HelpCard({ icon: Icon, title, children }) {
    return (<section className="sneat-card p-5 sm:p-6">
      <div className="flex items-center gap-3 mb-3">
        <span className="w-10 h-10 rounded-lg bg-[#e7e7ff] text-[#696cff] flex items-center justify-center shrink-0">
          <Icon className="w-5 h-5" aria-hidden="true"/>
        </span>
        <h2 className="text-base font-bold text-[#384551]">{title}</h2>
      </div>
      <div className="text-sm text-[#646e78] leading-relaxed space-y-3">{children}</div>
    </section>);
}

function HelpView({ onNavigate, registrationEnabled = false }) {
    return (<>
      <PageHeader eyebrow="GUIDED SETUP" title="Help and setup" description="Set up each BantAI layer, understand its limits, and recover safely when a service is unavailable."/>

      <div className="p-4 rounded-lg bg-[#fff1d6] border border-[#ffdd99] flex items-start gap-3 text-sm text-[#664400] mb-6" role="note">
        <AlertTriangleIcon className="w-5 h-5 text-[#ffab00] shrink-0 mt-0.5" aria-hidden="true"/>
        <p><strong>Signing in alone does not activate detection.</strong> The BantAI server models must be ready, the extension must be installed, and that browser extension must be connected to your account.</p>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <HelpCard icon={ShieldCheckIcon} title={registrationEnabled ? "1. Create an account" : "1. Use your provisioned account"}>
          <ol className="list-decimal pl-5 space-y-2">
            <li>{registrationEnabled ? "Create an account or sign in through this web dashboard." : "Sign in through this web dashboard with the account provisioned for the authorized pilot."}</li>
            <li>On the Dashboard, confirm that <strong>Server models</strong> show <strong>Ready</strong>. “Unavailable” means checks cannot currently complete.</li>
            <li>Continue with extension connection even if you are already signed in; these are separate authorization states.</li>
          </ol>
          <p>End users do not install Python, Docker, model files, a local API, or BantAI Companion.</p>
        </HelpCard>

        <HelpCard icon={GlobeIcon} title="2. Install the browser extension">
          <ol className="list-decimal pl-5 space-y-2">
            <li>Open <code className="px-1.5 py-0.5 rounded bg-[#f5f5f9] text-[#384551]">chrome://extensions</code> in Chrome or <code className="px-1.5 py-0.5 rounded bg-[#f5f5f9] text-[#384551]">edge://extensions</code> in Edge.</li>
            <li>Enable <strong>Developer mode</strong>, choose <strong>Load unpacked</strong>, and select the existing <code className="px-1.5 py-0.5 rounded bg-[#f5f5f9] text-[#384551]">extension</code> folder inside this BantAI project.</li>
            <li>Pin BantAI if desired, then refresh any already-open Gmail, Outlook, or Yahoo Mail tab.</li>
          </ol>
          <p>BantAI scans the exact active address-bar URL. It does not crawl pages, follow redirects, inspect TLS, or scan embedded links.</p>
        </HelpCard>

        <HelpCard icon={LaptopIcon} title="3. Connect or revoke the extension">
          <ol className="list-decimal pl-5 space-y-2">
            <li>Open <button type="button" className="font-semibold text-[#696cff] hover:underline" onClick={() => onNavigate("devices")}>Paired Devices</button> and generate a one-time code.</li>
            <li>Open the BantAI extension popup and enter the eight-character code before it expires.</li>
            <li>Return to the Dashboard and refresh connection status. Detection is enabled only after the account and device are verified.</li>
          </ol>
          <p>To remove access, use <strong>Revoke</strong> beside the device. Revocation immediately stops authenticated extension requests and clears that device&apos;s transient server context.</p>
        </HelpCard>

        <HelpCard icon={MailIcon} title="4. Know what email checking covers">
          <p>Opened-message extraction is limited to Gmail, Outlook, and Yahoo Mail. The trusted extension service worker sends visible opened-email text over HTTPS to the BantAI server; it does not open links or attachments.</p>
          <p>Automatic email cloud review receives bounded context after detectable email addresses, phone numbers, one-time codes, card numbers, and account identifiers are redacted. The provider key stays on the backend.</p>
          <p>Routine activity stores provider, sender, subject, result, and aggregate diagnostics—not the email body. Raw inference input is transient. Explicit reports and optional sampled contributions remain separate consented, encrypted workflows.</p>
        </HelpCard>
      </div>

      <section className="sneat-card p-5 sm:p-6 mt-6" aria-labelledby="outcome-help-title">
        <div className="flex items-center gap-3 mb-4">
          <HelpCircleIcon className="w-5 h-5 text-[#696cff]" aria-hidden="true"/>
          <h2 id="outcome-help-title" className="text-base font-bold text-[#384551]">Learn the three outcomes with a synthetic example</h2>
        </div>
        <div className="p-4 rounded-lg bg-[#f5f5f9] border border-[#e4e6e8] text-sm text-[#646e78] mb-4">
          <strong className="text-[#384551] block">Safe training example—do not send it</strong>
          <p className="mt-1"><span className="font-semibold">Sender:</span> alerts@example.invalid · <span className="font-semibold">Subject:</span> Urgent account check · <span className="font-semibold">Message:</span> “Send your one-time code now to avoid suspension.”</p>
          <p className="mt-1 text-xs text-[#8592a3]">The reserved <code>.invalid</code> domain makes this non-routable. Use it only to understand the interface.</p>
        </div>
        <div className="grid md:grid-cols-3 gap-4">
          <div className="p-4 rounded-lg border border-[#c6f1af] bg-[#e8fadf]/50"><StatusBadge outcome="NO_STRONG_WARNING_SIGNS"/><p className="text-sm text-[#2d5816] mt-2">No strong warning sign was detected by the completed checks. This is not a guarantee of legitimacy.</p></div>
          <div className="p-4 rounded-lg border border-[#ffdd99] bg-[#fff1d6]/50"><StatusBadge outcome="NEEDS_CAUTION"/><p className="text-sm text-[#664400] mt-2">Some evidence deserves closer review before you continue or share information.</p></div>
          <div className="p-4 rounded-lg border border-[#ffb2a5] bg-[#ffe0db]/50"><StatusBadge outcome="SUSPICIOUS_SIGNS_FOUND"/><p className="text-sm text-[#66190c] mt-2">Multiple independent warning sources were found. Pause and verify through another channel.</p></div>
        </div>
      </section>

      <section className="sneat-card p-5 sm:p-6 mt-6" aria-labelledby="troubleshooting-title">
        <h2 id="troubleshooting-title" className="text-base font-bold text-[#384551] mb-3">Troubleshooting</h2>
        <dl className="grid md:grid-cols-2 gap-4 text-sm">
          <div className="p-4 rounded-lg bg-[#f5f5f9]"><dt className="font-bold text-[#384551]">Server models unavailable</dt><dd className="mt-1">Wait briefly and retry. BantAI shows Service unavailable and does not substitute another model or present a safe result.</dd></div>
          <div className="p-4 rounded-lg bg-[#f5f5f9]"><dt className="font-bold text-[#384551]">Cloud review unavailable</dt><dd className="mt-1">The frozen server checks may still complete, but BantAI reports the cloud layer as unavailable instead of inventing a result.</dd></div>
          <div className="p-4 rounded-lg bg-[#f5f5f9]"><dt className="font-bold text-[#384551]">Extension connection failed</dt><dd className="mt-1">Confirm the account is active, generate a fresh one-time code, and check that the configured BantAI HTTPS service is reachable.</dd></div>
          <div className="p-4 rounded-lg bg-[#f5f5f9]"><dt className="font-bold text-[#384551]">Optional collection did not accept a sample</dt><dd className="mt-1">Check Profile consent and Dashboard diagnostics. Valid outcomes include not enabled, not selected by the 10% sample, duplicate, oversized, invalid, unavailable, consent-version mismatch, and accepted.</dd></div>
        </dl>
      </section>
    </>);
}

export default HelpView;
