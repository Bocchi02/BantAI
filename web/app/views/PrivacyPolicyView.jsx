"use client";

import { Logo } from "../BrandLogo";
import {
  CheckCircle2Icon,
  ChevronLeftIcon,
  DatabaseIcon,
  GlobeIcon,
  LockIcon,
  MailIcon,
  ShieldIcon,
} from "../Icons";

const EFFECTIVE_DATE = "September 26, 2026";

const sections = [
  ["overview", "Overview"],
  ["information", "Information we handle"],
  ["cloud", "Cloud AI review"],
  ["reports", "Reports and training data"],
  ["use", "How information is used"],
  ["sharing", "Sharing and administrator access"],
  ["retention", "Retention"],
  ["security", "Security"],
  ["choices", "Your choices"],
  ["changes", "Policy changes and contact"],
];

function PolicySection({ id, title, icon: Icon, children }) {
  return (
    <section id={id} className="scroll-mt-24 border-b border-[#e4e6e8] pb-7 last:border-0 last:pb-0" aria-labelledby={`${id}-title`}>
      <div className="flex items-start gap-3 mb-3">
        <span className="w-9 h-9 rounded-lg bg-[#e7e7ff] text-[#696cff] flex items-center justify-center shrink-0">
          <Icon className="w-4.5 h-4.5" />
        </span>
        <div>
          <p className="text-[11px] font-bold text-[#696cff] tracking-wider uppercase">PRIVACY POLICY</p>
          <h2 id={`${id}-title`} className="text-lg sm:text-xl font-bold text-[#384551]">{title}</h2>
        </div>
      </div>
      <div className="pl-0 sm:pl-12 space-y-3 text-sm text-[#646e78] leading-7">{children}</div>
    </section>
  );
}

function PolicyList({ children }) {
  return <ul className="space-y-2.5">{children}</ul>;
}

function PolicyItem({ children }) {
  return (
    <li className="flex items-start gap-2.5">
      <CheckCircle2Icon className="w-4 h-4 text-[#008f7a] shrink-0 mt-1.5" />
      <span>{children}</span>
    </li>
  );
}

export default function PrivacyPolicyPage({ authenticated = false, onNavigate }) {
  const go = (path) => {
    if (onNavigate) onNavigate(path);
  };

  return (
    <main className="min-h-screen bg-[#f5f5f9] text-[#646e78] selection:bg-[#696cff] selection:text-white">
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-[#e4e6e8] shadow-[0_2px_6px_0_rgba(67,89,113,0.06)]">
        <div className="max-w-[1240px] mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          <button type="button" onClick={() => go("/")} aria-label="Go to the Signalam home page">
            <Logo />
          </button>
          <button type="button" onClick={() => go(authenticated ? "/dashboard" : "/")} className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md border border-[#d9dee3] bg-white text-xs font-semibold text-[#646e78] hover:bg-[#f5f5f9] hover:text-[#384551] focus:outline-none focus:ring-2 focus:ring-[#696cff]/30">
            <ChevronLeftIcon className="w-4 h-4" />
            {authenticated ? "Back to dashboard" : "Back to home"}
          </button>
        </div>
      </header>

      <section className="bg-gradient-to-br from-[#071e4a] to-[#04142f] text-white">
        <div className="max-w-[1240px] mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#696cff]/20 border border-[#696cff]/30 text-[#aeb0ff] text-[11px] font-bold tracking-wider uppercase mb-5">
            <LockIcon className="w-3.5 h-3.5" />
            PRIVACY BY DESIGN
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-4">Signalam Privacy Policy</h1>
          <p className="max-w-3xl text-sm sm:text-base text-slate-300 leading-7">
            This policy explains what the current Signalam v1.1 service handles when you use the web dashboard and browser extension, why it is needed, when cloud AI is involved, and the controls available to you.
          </p>
          <p className="text-xs text-slate-400 mt-5">Effective date: {EFFECTIVE_DATE}</p>
        </div>
      </section>

      <div className="max-w-[1240px] mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10 grid lg:grid-cols-12 gap-6 lg:gap-8">
        <aside className="lg:col-span-3">
          <nav className="sneat-card p-4 lg:sticky lg:top-24" aria-label="Privacy policy sections">
            <p className="px-2 mb-2 text-[11px] font-bold text-[#a1acb8] uppercase tracking-wider">On this page</p>
            <ul className="space-y-0.5">
              {sections.map(([id, label]) => (
                <li key={id}><a href={`#${id}`} className="block px-2 py-2 rounded-md text-xs font-medium hover:bg-[#f5f5f9] hover:text-[#696cff] focus:outline-none focus:ring-2 focus:ring-[#696cff]/30">{label}</a></li>
              ))}
            </ul>
          </nav>
        </aside>

        <article className="lg:col-span-9 sneat-card p-5 sm:p-8 space-y-7">
          <div className="rounded-lg border border-[#c3c4ff] bg-[#e7e7ff]/45 p-4 text-sm text-[#4347d9] leading-6">
            <strong className="block text-[#384551] mb-1">Important summary</strong>
            Routine history is deliberately limited: website activity keeps the normalized origin, while email activity keeps the provider, sender, subject, outcome, and time—not the routine email body. Some explicit report and opt-in training workflows collect more information and are described below.
          </div>

          <PolicySection id="overview" title="Overview and scope" icon={ShieldIcon}>
            <p>This policy applies to the Signalam web interface, authenticated public API, and paired Chromium extension. Signalam provides decision support and does not guarantee that a website, email, or sender is legitimate.</p>
            <p>The organization operating a Signalam deployment is responsible for that deployment and its support channel. This policy describes the behavior of the Signalam software in this version.</p>
          </PolicySection>

          <PolicySection id="information" title="Information we handle" icon={DatabaseIcon}>
            <PolicyList>
              <PolicyItem><strong>Account information:</strong> your first name, optional middle name, last name, normalized email address, password hash, role, account status, verification time, registration date, and last sign-in time. One-time email verification and password reset token hashes are kept until they expire or are used.</PolicyItem>
              <PolicyItem><strong>Session and device information:</strong> protected session and CSRF credentials, paired-device credential hashes, device labels, pairing and last-seen times, revocation state, and limited security or operational events.</PolicyItem>
              <PolicyItem><strong>Website detection:</strong> the exact active-tab address is sent over HTTPS for transient server detection. Routine activity history stores only its normalized origin—scheme, hostname, and optional port—plus the outcome, timing, device, and cloud status. Paths, queries, fragments, HTML, and page content are not kept in routine history.</PolicyItem>
              <PolicyItem><strong>Email detection:</strong> on supported Gmail, Outlook, and Yahoo Mail pages, the visible provider, sender, subject, and message content are sent for transient checking. Routine history stores the provider, sender, subject, outcome, timing, device, and cloud status. It does not store the routine email body.</PolicyItem>
            </PolicyList>
          </PolicySection>

          <PolicySection id="cloud" title="Cloud AI review" icon={GlobeIcon}>
            <p>Cloud AI is an additional contextual layer and does not replace Signalam’s server models or deterministic email decision rules. Provider credentials remain on the backend.</p>
            <PolicyList>
              <PolicyItem>When the URL model warns, cloud URL review receives only the minimized website origin.</PolicyItem>
              <PolicyItem>Email cloud review receives bounded email context after reasonably detectable email addresses, phone numbers, OTPs, card values, and account identifiers are redacted. Truncation keeps only compact beginning and ending context when needed.</PolicyItem>
              <PolicyItem>The optional AI Message Check sends privacy-redacted pasted text after you explicitly submit it. The optional AI Website Check uses the full address only to retrieve one public page, then sends the origin and redacted readable text—not the path, query, or fragment—to cloud AI.</PolicyItem>
              <PolicyItem>On-demand cloud inputs and responses are not added to routine activity history or training data by those features. Cloud failures return an unavailable state rather than a reassuring result.</PolicyItem>
            </PolicyList>
            <p>Signalam currently uses Google Gemini as its cloud AI provider. The provider processes the minimized request to return the review. Its processing may also be subject to the deployment operator’s agreement with Google and applicable provider terms.</p>
          </PolicySection>

          <PolicySection id="reports" title="Optional reports and training data" icon={MailIcon}>
            <p>These workflows are separate from routine detection and collect data only after a user action or opt-in:</p>
            <PolicyList>
              <PolicyItem><strong>Website reports and result feedback</strong> may store the full address, including its path, together with the shown result and your proposed correction so an administrator can review it.</PolicyItem>
              <PolicyItem><strong>Email reports and feedback</strong> may store the provider, sender, subject, displayed outcome, proposed label, and email body. The body is protected with authenticated application-layer encryption. Administrator pages and CSV exports do not display, return, or decrypt it.</PolicyItem>
              <PolicyItem><strong>Automatic training contribution</strong> is optional. When enabled, each completed check has the displayed sampling chance—currently 10%—of contributing an encrypted full URL or encrypted email content. These samples can contain personal information and are not confirmed training labels.</PolicyItem>
              <PolicyItem>Approved user reports may become de-identified future training candidates. Model training is a separate, later process; submitting data does not retrain or change the live models automatically.</PolicyItem>
            </PolicyList>
          </PolicySection>

          <PolicySection id="use" title="How information is used" icon={CheckCircle2Icon}>
            <PolicyList>
              <PolicyItem>Authenticate accounts, maintain secure sessions, and pair or revoke devices.</PolicyItem>
              <PolicyItem>Run website and email detection, cloud contextual review, deterministic fusion, and user-requested explanations.</PolicyItem>
              <PolicyItem>Display personal activity, outcome distributions, connection status, and aggregate administrative metrics.</PolicyItem>
              <PolicyItem>Investigate user-submitted corrections and prepare separately approved data for a future, authorized model-training cycle.</PolicyItem>
              <PolicyItem>Protect the service, enforce rate limits, diagnose availability, and prevent duplicate activity.</PolicyItem>
            </PolicyList>
          </PolicySection>

          <PolicySection id="sharing" title="Sharing and administrator access" icon={ShieldIcon}>
            <p>Information is processed by the Signalam deployment’s application, database, detector infrastructure, and cloud AI provider where a cloud review is required. The software does not include advertising, behavioral-advertising cookies, or a workflow for selling personal information.</p>
            <p>Google processes the sender and recipient addresses and the transactional message needed for account verification or password recovery through Gmail SMTP. These messages are not marketing emails. Signalam does not use authentication emails for advertising.</p>
            <p>Administrators can manage account status and view aggregate detection statistics. They cannot browse an individual user’s routine website or email activity. Report-review screens expose only the information required for the submitted report and do not identify the reporting user. Encrypted email bodies are not available through administrator interfaces or exports.</p>
          </PolicySection>

          <PolicySection id="retention" title="Retention" icon={DatabaseIcon}>
            <PolicyList>
              <PolicyItem>Routine activity, submitted reports, and automatic training samples are removed after 90 days by the current retention process.</PolicyItem>
              <PolicyItem>Approved, de-identified training candidates may remain beyond ordinary report retention for a future separately authorized training cycle.</PolicyItem>
              <PolicyItem>Single-use pairing codes expire after five minutes. Email verification links expire after 24 hours, and password reset links after 30 minutes. Expired or used account tokens, revoked sessions, and pairing codes are cleaned up.</PolicyItem>
              <PolicyItem>Account and paired-device records remain while needed to operate or administer the account. Revoked devices remain marked as revoked for account security and audit context.</PolicyItem>
            </PolicyList>
          </PolicySection>

          <PolicySection id="security" title="Security measures and cookies" icon={LockIcon}>
            <p>Signalam uses Argon2id password hashing, opaque server-side sessions, secure HttpOnly cookies in production, SameSite protections, CSRF checks, rate limits, credential hashing, restricted origins, and authenticated application-layer encryption for protected stored fields. Production traffic is intended to use HTTPS.</p>
            <p>The dashboard uses essential session and CSRF cookies to keep you signed in and protect account actions. These are not advertising cookies. No security measure can remove every risk, so users should protect their account password and revoke unfamiliar paired devices.</p>
          </PolicySection>

          <PolicySection id="choices" title="Your choices and controls" icon={CheckCircle2Icon}>
            <PolicyList>
              <PolicyItem>Update your name or change your password from Profile. A password change closes your other web sessions.</PolicyItem>
              <PolicyItem>Review and revoke paired devices from Paired Devices, or sign out to end the current session.</PolicyItem>
              <PolicyItem>Choose whether to submit a website or email report and whether to use the on-demand AI Message or Website Check.</PolicyItem>
              <PolicyItem>Enable or disable automatic training contribution from Profile. Disabling it stops future automatic collection and deletes that account’s stored automatic samples.</PolicyItem>
              <PolicyItem>Contact the administrator responsible for your Signalam deployment for account access, correction, deletion, or privacy questions. This version does not provide a self-service account deletion control.</PolicyItem>
            </PolicyList>
          </PolicySection>

          <PolicySection id="changes" title="Policy changes and contact" icon={GlobeIcon}>
            <p>This policy may be updated when Signalam’s features, providers, retention rules, or legal obligations change. Material changes should be presented with a revised effective date before they apply to new optional data-collection consent.</p>
            <p>For privacy questions or requests, contact the administrator or organization that provided or operates your Signalam account. They can identify the appropriate support and privacy contact for that deployment.</p>
          </PolicySection>
        </article>
      </div>

      <footer className="bg-white border-t border-[#e4e6e8] py-6 text-xs text-[#8592a3]">
        <div className="max-w-[1240px] mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row gap-3 items-center justify-between">
          <Logo compact />
          <span>Effective {EFFECTIVE_DATE} · Signalam v1.1</span>
        </div>
      </footer>
    </main>
  );
}
