"use client";

import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { api, downloadApiFile, ApiError } from "./api";
import { Logo } from "./BrandLogo";
import {
  ShieldIcon,
  ShieldCheckIcon,
  ShieldAlertIcon,
  LayoutDashboardIcon,
  ActivityIcon,
  SparklesIcon,
  GlobeIcon,
  MailIcon,
  LaptopIcon,
  UserIcon,
  UsersIcon,
  DatabaseIcon,
  FileCheckIcon,
  SearchIcon,
  CopyIcon,
  RefreshCwIcon,
  CheckCircle2Icon,
  AlertTriangleIcon,
  XCircleIcon,
  LockIcon,
  ClockIcon,
  LogOutIcon,
  MenuIcon,
  XIcon,
  HelpCircleIcon,
  ArrowRightIcon,
  ChevronRightIcon,
  ChevronLeftIcon,
  DownloadIcon,
  CheckIcon,
} from "./Icons";

type Role = "USER" | "ADMIN";
type UserStatus = "ACTIVE" | "SUSPENDED";
type Outcome = "NO_STRONG_WARNING_SIGNS" | "NEEDS_CAUTION" | "SUSPICIOUS_SIGNS_FOUND";
type EventType = "URL" | "EMAIL";
type UrlReportClassification = "LEGITIMATE" | "SUSPICIOUS" | "UNSURE";
type UrlReportStatus = "PENDING" | "REVIEWED";
type AdminUrlAssessment = "LEGITIMATE" | "SUSPICIOUS" | "INCONCLUSIVE";
type FeedbackVerdict = "CORRECT" | "INCORRECT" | "UNSURE";
type FeedbackReason = "TRUSTED_OR_OFFICIAL" | "INCORRECT_WARNING" | "MISSED_WARNING" | "IMPERSONATION_OR_DECEPTIVE" | "OTHER";
type FeedbackSource = "RECENT_DETECTION" | "MANUAL_ENTRY";
type TrainingStatus = "PENDING" | "APPROVED" | "REJECTED" | "INCONCLUSIVE";
type AdminReviewAction = "APPROVE" | "REJECT" | "INCONCLUSIVE";

type PastedMessageReviewResult = {
  status: "COMPLETE" | "UNAVAILABLE";
  assessment: Outcome | null;
  confidence: "LOW" | "MEDIUM" | "HIGH" | null;
  indicators: { category: string; severity: "CONTEXTUAL" | "STRONG" | "CRITICAL"; evidence: string }[];
  reasoning_summary: string;
  recommended_action: string;
  failure_reason?: string;
  stored: false;
  redacted_before_ai: true;
  analysis_scope: "PASTED_TEXT_ONLY";
};

type User = {
  id: string;
  email: string;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  full_name: string;
  role: Role;
  status: UserStatus;
  created_at: string;
  last_login_at: string | null;
};

type Activity = {
  id: string;
  event_type: EventType;
  origin: string | null;
  provider: string | null;
  sender: string | null;
  subject: string | null;
  outcome: Outcome;
  cloud_status: "COMPLETE" | "UNAVAILABLE";
  occurred_at: string;
  feedback_submitted: boolean;
};

type UrlReport = {
  id: string;
  activity_event_id: string | null;
  url: string;
  origin: string;
  detector_outcome: Outcome;
  user_classification: UrlReportClassification;
  feedback_verdict: FeedbackVerdict;
  feedback_reason: FeedbackReason | null;
  feedback_source: FeedbackSource;
  training_status: TrainingStatus;
  detector_model_version: string;
  similar_report_count?: number;
  status: UrlReportStatus;
  admin_assessment: AdminUrlAssessment | null;
  submitted_at: string;
  reviewed_at: string | null;
};

type UrlTrainingCandidate = {
  id: string;
  url: string;
  origin: string;
  detector_outcome: Outcome;
  approved_label: "LEGITIMATE" | "SUSPICIOUS";
  feedback_reason: FeedbackReason | null;
  feedback_source: FeedbackSource;
  detector_model_version: string;
  evidence_count: number;
  first_approved_at: string;
  last_approved_at: string;
};

type EmailReport = {
  id: string;
  provider: "gmail" | "outlook" | "yahoo";
  sender: string;
  subject: string;
  body_included: boolean;
  body_character_count: number;
  detector_outcome: Outcome;
  user_classification: UrlReportClassification;
  feedback_reason: FeedbackReason | null;
  training_status: TrainingStatus;
  detector_model_version: string;
  similar_report_count?: number;
  status: UrlReportStatus;
  admin_assessment: AdminUrlAssessment | null;
  submitted_at: string;
  reviewed_at: string | null;
};

type EmailTrainingCandidate = {
  id: string;
  provider: "gmail" | "outlook" | "yahoo";
  sender: string;
  subject: string;
  body_included: boolean;
  body_character_count: number;
  detector_outcome: Outcome;
  approved_label: "LEGITIMATE" | "SUSPICIOUS";
  feedback_reason: FeedbackReason | null;
  detector_model_version: string;
  evidence_count: number;
  first_approved_at: string;
  last_approved_at: string;
};

type TrainingDataInventory = {
  urls: {
    items: UrlTrainingCandidate[];
    page: number;
    pages: number;
    total: number;
    candidate_total: number;
    evidence_total: number;
    label_counts: { LEGITIMATE: number; SUSPICIOUS: number };
    model_version: string;
  };
  emails: {
    items: EmailTrainingCandidate[];
    page: number;
    pages: number;
    total: number;
    candidate_total: number;
    evidence_total: number;
    label_counts: { LEGITIMATE: number; SUSPICIOUS: number };
    observed_activity_total: number;
    collection_status: "ENCRYPTED_REVIEW_CONTENT";
    model_version: string;
    privacy_message: string;
  };
};

type Distribution = {
  event_type: EventType;
  total: number;
  outcomes: { outcome: Outcome; count: number; percentage: number }[];
};

type DashboardData = {
  range_days: number;
  last_url: Activity | null;
  last_email: Activity | null;
  recent: Activity[];
  distribution: Distribution[];
};

type ConnectionStatus = {
  checked_at: string;
  extension: { connected: boolean; device_label: string | null; message: string };
  local_models: {
    connected: boolean;
    url_model_ready: boolean;
    email_model_ready: boolean;
    message: string;
  };
  cloud_ai: {
    connected: boolean;
    platform_reachable: boolean;
    configured: boolean;
    message: string;
  };
};

const COMPANION_URL =
  process.env.NEXT_PUBLIC_BANTAI_COMPANION_URL || "http://127.0.0.1:8000";

type PageName = "dashboard" | "activity" | "message-review" | "reports" | "email-reports" | "devices" | "profile" | "admin" | "review-reports" | "admin-email-reports" | "training-data" | "users";

const OUTCOMES: { value: Outcome; label: string; short: string }[] = [
  { value: "NO_STRONG_WARNING_SIGNS", label: "No strong warning signs", short: "No warning signs" },
  { value: "NEEDS_CAUTION", label: "Needs caution", short: "Caution" },
  { value: "SUSPICIOUS_SIGNS_FOUND", label: "Suspicious signs found", short: "Suspicious" },
];

const PASSWORD_REQUIREMENTS =
  "Use 12 to 128 characters with at least one uppercase letter, one lowercase letter, one number, and one special character.";

function passwordValidationMessage(value: unknown) {
  const password = String(value || "");
  const isStrong =
    password.length >= 12 &&
    password.length <= 128 &&
    /[A-Z]/.test(password) &&
    /[a-z]/.test(password) &&
    /[0-9]/.test(password) &&
    /[^A-Za-z0-9\s]/.test(password);
  return isStrong ? "" : PASSWORD_REQUIREMENTS;
}

function cx(...values: (string | false | null | undefined)[]) {
  return values.filter(Boolean).join(" ");
}

function outcomeInfo(outcome: Outcome) {
  return OUTCOMES.find((item) => item.value === outcome) || OUTCOMES[1];
}

function userClassificationLabel(value: UrlReportClassification) {
  if (value === "LEGITIMATE") return "Believes legitimate";
  if (value === "SUSPICIOUS") return "Believes suspicious";
  return "No corrected label";
}

function feedbackVerdictLabel(value: FeedbackVerdict) {
  if (value === "CORRECT") return "Result looked right";
  if (value === "INCORRECT") return "Correction submitted";
  return "Not sure";
}

function feedbackReasonLabel(value: FeedbackReason | null) {
  const labels: Record<FeedbackReason, string> = {
    TRUSTED_OR_OFFICIAL: "Trusted or official website",
    INCORRECT_WARNING: "Incorrect warning",
    MISSED_WARNING: "Missed suspicious behavior",
    IMPERSONATION_OR_DECEPTIVE: "Impersonation or deceptive domain",
    OTHER: "Other",
  };
  return value ? labels[value] : "No reason provided";
}

function trainingStatusLabel(value: TrainingStatus) {
  if (value === "APPROVED") return "Training candidate";
  if (value === "REJECTED") return "Rejected";
  if (value === "INCONCLUSIVE") return "Inconclusive";
  return "Awaiting review";
}

function adminAssessmentLabel(value: AdminUrlAssessment | null) {
  if (value === "LEGITIMATE") return "Likely legitimate";
  if (value === "SUSPICIOUS") return "Likely suspicious";
  if (value === "INCONCLUSIVE") return "Inconclusive";
  return "Awaiting review";
}

function approvedTrainingLabel(value: "LEGITIMATE" | "SUSPICIOUS") {
  return value === "LEGITIMATE" ? "Legitimate" : "Suspicious";
}

function feedbackSourceLabel(value: FeedbackSource) {
  return value === "RECENT_DETECTION" ? "Detection review" : "Manual URL report";
}

function userName(user: User) {
  return user.full_name || user.email;
}

function deviceLocalDate(value: string) {
  const explicitZone = /(?:z|[+-]\d{2}:?\d{2})$/i.test(value);
  return new Date(explicitZone ? value : `${value}Z`);
}

function niceDate(value: string | null) {
  if (!value) return "Not yet";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(deviceLocalDate(value));
}

function relativeTime(value: string) {
  const seconds = Math.round((deviceLocalDate(value).getTime() - Date.now()) / 1000);
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  if (Math.abs(seconds) < 60) return formatter.format(seconds, "second");
  const minutes = Math.round(seconds / 60);
  if (Math.abs(minutes) < 60) return formatter.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return formatter.format(hours, "hour");
  return formatter.format(Math.round(hours / 24), "day");
}

function StatusBadge({ outcome }: { outcome: Outcome }) {
  const isSafe = outcome === "NO_STRONG_WARNING_SIGNS";
  const isCaution = outcome === "NEEDS_CAUTION";
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap shadow-2xs border",
        isSafe && "bg-emerald-50 text-emerald-800 border-emerald-200",
        isCaution && "bg-amber-50 text-amber-800 border-amber-200",
        !isSafe && !isCaution && "bg-rose-50 text-rose-800 border-rose-200"
      )}
    >
      <span
        className={cx(
          "w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0",
          isSafe && "bg-emerald-600",
          isCaution && "bg-amber-600",
          !isSafe && !isCaution && "bg-rose-600"
        )}
        aria-hidden="true"
      >
        {isSafe ? "✓" : isCaution ? "!" : "×"}
      </span>
      {outcomeInfo(outcome).label}
    </span>
  );
}

function Notice({ type = "info", children }: { type?: "info" | "error" | "success"; children: ReactNode }) {
  return (
    <div
      className={cx(
        "flex items-start gap-3 p-3.5 rounded-xl text-sm font-medium border mb-5 leading-relaxed",
        type === "info" && "bg-blue-50/80 text-[#071E4A] border-blue-200",
        type === "error" && "bg-rose-50 text-rose-800 border-rose-200",
        type === "success" && "bg-emerald-50 text-emerald-800 border-emerald-200"
      )}
      role={type === "error" ? "alert" : "status"}
    >
      <span className="shrink-0 mt-0.5">
        {type === "info" && <ShieldCheckIcon className="w-5 h-5 text-[#087EFF]" />}
        {type === "error" && <AlertTriangleIcon className="w-5 h-5 text-rose-600" />}
        {type === "success" && <CheckCircle2Icon className="w-5 h-5 text-emerald-600" />}
      </span>
      <div className="flex-1">{children}</div>
    </div>
  );
}

function EmptyState({ icon, title, text }: { icon: string; title: string; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center rounded-xl bg-slate-50/50 border border-dashed border-slate-200 my-2">
      <div className="w-12 h-12 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center text-[#087EFF] text-xl font-bold mb-3 shadow-2xs">
        {icon}
      </div>
      <strong className="text-sm font-semibold text-[#04142F]">{title}</strong>
      <p className="text-xs text-slate-500 max-w-sm mt-1 leading-relaxed">{text}</p>
    </div>
  );
}

function LoadingPage({ error, onRetry }: { error?: string; onRetry?: () => void }) {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6 bg-slate-50 text-center" aria-busy={!error}>
      <Logo className="mb-8" />
      {error ? (
        <div className="max-w-md w-full p-6 rounded-2xl bg-white border border-slate-200 shadow-sm text-center" role="alert">
          <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 border border-amber-200 flex items-center justify-center text-xl font-bold mx-auto mb-4">
            !
          </div>
          <h1 className="text-lg font-bold text-[#04142F]">Dashboard service unavailable</h1>
          <p className="text-xs text-slate-600 my-3 leading-relaxed">{error}</p>
          <button
            className="w-full mt-2 py-2.5 px-4 rounded-xl bg-[#087EFF] hover:bg-[#071E4A] text-white text-xs font-semibold transition-colors shadow-sm"
            onClick={onRetry}
          >
            Try again
          </button>
        </div>
      ) : (
        <div className="flex flex-col items-center">
          <div className="w-48 h-1 bg-slate-200 rounded-full overflow-hidden mb-4">
            <div className="w-1/2 h-full bg-[#087EFF] rounded-full animate-shimmer" />
          </div>
          <p className="text-xs text-slate-500 font-medium tracking-wide">Preparing your privacy-first dashboard…</p>
        </div>
      )}
    </main>
  );
}

function LandingPage({
  authenticated,
  onNavigate,
}: {
  authenticated: boolean;
  onNavigate: (path: string) => void;
}) {
  return (
    <main className="min-h-screen bg-gradient-to-b from-[#04142F] via-[#071E4A] to-[#04142F] text-slate-100 flex flex-col selection:bg-[#087EFF] selection:text-white">
      {/* Header */}
      <header className="w-full max-w-7xl mx-auto px-6 h-20 flex items-center justify-between z-10 border-b border-slate-800/60">
        <Logo light />
        <nav className="hidden md:flex items-center gap-8 text-xs font-semibold text-slate-300" aria-label="Landing page navigation">
          <a href="#how-it-works" className="hover:text-white transition-colors">How it works</a>
          <a href="#coverage" className="hover:text-white transition-colors">What it checks</a>
          <a href="#privacy" className="hover:text-white transition-colors">Privacy</a>
        </nav>
        <div className="flex items-center gap-3">
          {!authenticated && (
            <button
              className="text-xs font-semibold text-slate-200 hover:text-white px-3 py-2 transition-colors"
              onClick={() => onNavigate("/login")}
            >
              Sign in
            </button>
          )}
          <button
            className="text-xs font-semibold bg-[#087EFF] hover:bg-[#1495FF] text-white px-4 py-2 rounded-xl transition-all shadow-md shadow-[#087EFF]/25 active:scale-95"
            onClick={() => onNavigate(authenticated ? "/dashboard" : "/register")}
          >
            {authenticated ? "Open dashboard" : "Create account"}
          </button>
        </div>
      </header>

      {/* Hero Section */}
      <section className="w-full max-w-7xl mx-auto px-6 pt-16 pb-24 grid lg:grid-cols-12 gap-12 items-center" aria-labelledby="landing-title">
        <div className="lg:col-span-7 flex flex-col">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-400/20 text-[#1495FF] text-[11px] font-bold tracking-wider uppercase mb-6 w-fit">
            <span className="w-1.5 h-1.5 rounded-full bg-[#087EFF] animate-pulse" />
            LOCAL DETECTION · PRIVACY-MINIMIZED INSIGHTS
          </div>
          <h1 id="landing-title" className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-white tracking-tight leading-[1.08] mb-6">
            Clear warnings.<br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#1495FF] to-[#68C4FF]">
              Private by design.
            </span>
          </h1>
          <p className="text-slate-300 text-base sm:text-lg leading-relaxed max-w-xl mb-8">
            BantAI checks websites and supported emails with local AI, adds contextual cloud review when needed,
            and gives you a clear result without claiming certainty.
          </p>
          <div className="flex flex-wrap items-center gap-4">
            <button
              className="flex items-center gap-2 bg-[#087EFF] hover:bg-[#1495FF] text-white text-sm font-semibold px-6 py-3.5 rounded-xl transition-all shadow-lg shadow-[#087EFF]/30 active:scale-95"
              onClick={() => onNavigate(authenticated ? "/dashboard" : "/register")}
            >
              <span>{authenticated ? "Go to your dashboard" : "Get started with BantAI"}</span>
              <ArrowRightIcon className="w-4 h-4" />
            </button>
            {!authenticated && (
              <button
                className="text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-800 border border-slate-700 text-sm font-semibold px-5 py-3.5 rounded-xl transition-colors"
                onClick={() => onNavigate("/login")}
              >
                I already have an account
              </button>
            )}
          </div>
          <p className="flex items-center gap-2 text-xs text-slate-400 mt-6">
            <LockIcon className="w-3.5 h-3.5 text-[#087EFF]" />
            Complete URLs and email content stay inside the local detector boundary
          </p>
        </div>

        {/* Hero Browser Mockup */}
        <div className="lg:col-span-5 relative" aria-label="Example BantAI website assessment">
          <div className="absolute -inset-1 bg-gradient-to-r from-[#087EFF] to-[#1495FF] rounded-2xl blur-xl opacity-30 animate-pulse" />
          <div className="relative rounded-2xl overflow-hidden bg-slate-900 border border-slate-700/80 shadow-2xl">
            <div className="h-12 bg-slate-950 border-b border-slate-800 px-4 flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500/80" />
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500/80" />
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80" />
              </div>
              <div className="flex-1 flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-lg px-3 py-1 text-xs text-slate-400 font-mono truncate">
                <GlobeIcon className="w-3.5 h-3.5 text-[#087EFF] shrink-0" />
                <span>secure-example.ph</span>
              </div>
              <span className="flex items-center gap-1.5 text-[10px] font-semibold text-emerald-400 bg-emerald-950/60 border border-emerald-800/50 px-2 py-0.5 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-live-dot" />
                Local models ready
              </span>
            </div>
            <div className="p-6 bg-slate-900/90 flex flex-col gap-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-[#087EFF]/20 border border-[#087EFF]/30 flex items-center justify-center text-[#1495FF]">
                    <ShieldIcon className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="block text-[9px] font-bold text-slate-400 tracking-wider uppercase">WEBSITE CHECK</span>
                    <strong className="text-xs font-semibold text-white">Address-bar analysis</strong>
                  </div>
                </div>
                <span className="text-[11px] font-bold text-amber-300 bg-amber-950/70 border border-amber-700/60 px-2.5 py-1 rounded-full uppercase tracking-wide">
                  Needs caution
                </span>
              </div>
              <div className="p-4 rounded-xl bg-slate-950/80 border border-amber-500/30">
                <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider block mb-1">CURRENT WEBSITE</span>
                <h2 className="text-base font-bold text-white mb-2">secure-example.ph</h2>
                <p className="text-xs text-slate-300 leading-relaxed mb-3">
                  The address shows patterns worth checking before you enter passwords, codes, or payment details.
                </p>
                <div className="space-y-2 pt-2 border-t border-slate-800 text-[11px]">
                  <div className="flex items-center justify-between text-slate-400">
                    <span>Local URL model</span>
                    <strong className="text-amber-300">Warning detected</strong>
                  </div>
                  <div className="flex items-center justify-between text-slate-400">
                    <span>Contextual review</span>
                    <strong className="text-amber-300">Supporting evidence found</strong>
                  </div>
                </div>
              </div>
              <p className="text-[10px] text-slate-400 text-center leading-normal">
                BantAI supports decisions—it does not guarantee that a website is legitimate or malicious.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Trust Pillars */}
      <section className="w-full max-w-7xl mx-auto px-6 py-6" aria-label="BantAI protection layers">
        <div className="grid md:grid-cols-3 gap-4 p-4 rounded-2xl bg-slate-900/70 border border-slate-800 backdrop-blur-md">
          <div className="flex gap-3 p-4 rounded-xl bg-slate-950/50 border border-slate-800/80">
            <span className="text-sm font-extrabold text-[#087EFF] font-mono">01</span>
            <div>
              <strong className="text-sm font-bold text-white block">Local AI models</strong>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">Website and email signals are checked on your computer.</p>
            </div>
          </div>
          <div className="flex gap-3 p-4 rounded-xl bg-slate-950/50 border border-slate-800/80">
            <span className="text-sm font-extrabold text-[#087EFF] font-mono">02</span>
            <div>
              <strong className="text-sm font-bold text-white block">Contextual cloud review</strong>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">Only minimized, redacted evidence is reviewed when required.</p>
            </div>
          </div>
          <div className="flex gap-3 p-4 rounded-xl bg-slate-950/50 border border-slate-800/80">
            <span className="text-sm font-extrabold text-[#087EFF] font-mono">03</span>
            <div>
              <strong className="text-sm font-bold text-white block">Clear final guidance</strong>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">Deterministic rules combine evidence into a human-readable outcome.</p>
            </div>
          </div>
        </div>
      </section>

      {/* How BantAI Works */}
      <section className="w-full max-w-7xl mx-auto px-6 py-20" id="how-it-works" aria-labelledby="how-title">
        <div className="text-center max-w-2xl mx-auto mb-14">
          <p className="text-[11px] font-bold text-[#087EFF] tracking-wider uppercase mb-2">HOW BANTAI WORKS</p>
          <h2 id="how-title" className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">Protection that works quietly in the background.</h2>
          <p className="text-sm text-slate-300 mt-3 leading-relaxed">The Companion and browser extension handle the technical steps. You see the result and the evidence that matters.</p>
        </div>
        <div className="grid md:grid-cols-3 gap-6">
          <article className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 flex flex-col gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#087EFF]/20 border border-[#087EFF]/30 text-[#1495FF] flex items-center justify-center font-bold font-mono text-sm">1</div>
            <h3 className="text-base font-bold text-white">Check locally</h3>
            <p className="text-xs text-slate-300 leading-relaxed">Frozen URL and email models analyze the active address or supported opened email on your device.</p>
          </article>
          <article className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 flex flex-col gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#087EFF]/20 border border-[#087EFF]/30 text-[#1495FF] flex items-center justify-center font-bold font-mono text-sm">2</div>
            <h3 className="text-base font-bold text-white">Add context safely</h3>
            <p className="text-xs text-slate-300 leading-relaxed">Redacted cloud review adds context while local rules remain responsible for the final result.</p>
          </article>
          <article className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 flex flex-col gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#087EFF]/20 border border-[#087EFF]/30 text-[#1495FF] flex items-center justify-center font-bold font-mono text-sm">3</div>
            <h3 className="text-base font-bold text-white">Understand the result</h3>
            <p className="text-xs text-slate-300 leading-relaxed">Receive clear guidance, then review activity and submit corrections from your private dashboard.</p>
          </article>
        </div>
      </section>

      {/* Coverage Section */}
      <section className="w-full max-w-7xl mx-auto px-6 py-20 border-t border-slate-800/80" id="coverage" aria-labelledby="coverage-title">
        <div className="grid lg:grid-cols-12 gap-12 items-center">
          <div className="lg:col-span-5 flex flex-col">
            <p className="text-[11px] font-bold text-[#087EFF] tracking-wider uppercase mb-2">FOCUSED BY DESIGN</p>
            <h2 id="coverage-title" className="text-3xl font-extrabold text-white tracking-tight mb-4">The right signal for the right context.</h2>
            <p className="text-xs text-slate-300 leading-relaxed mb-6">
              BantAI keeps website and email checks independent, so an ordinary webmail address never hides warning signs in an opened message.
            </p>
            <div className="flex flex-wrap gap-2" aria-label="Supported email providers">
              <span className="px-3 py-1 rounded-full bg-slate-800 border border-slate-700 text-xs font-semibold text-slate-200">Gmail</span>
              <span className="px-3 py-1 rounded-full bg-slate-800 border border-slate-700 text-xs font-semibold text-slate-200">Outlook</span>
              <span className="px-3 py-1 rounded-full bg-slate-800 border border-slate-700 text-xs font-semibold text-slate-200">Yahoo Mail</span>
            </div>
          </div>
          <div className="lg:col-span-7 grid sm:grid-cols-2 gap-4">
            <article className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 flex flex-col">
              <GlobeIcon className="w-8 h-8 text-[#087EFF] mb-4" />
              <p className="text-[10px] font-bold text-blue-400 uppercase tracking-wider mb-1">WEBSITES</p>
              <h3 className="text-base font-bold text-white mb-2">Address-bar URL checks</h3>
              <p className="text-xs text-slate-300 leading-relaxed">Analyzes the exact active-tab URL locally. Routine dashboard history stores only the website origin.</p>
            </article>
            <article className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 flex flex-col">
              <MailIcon className="w-8 h-8 text-[#087EFF] mb-4" />
              <p className="text-[10px] font-bold text-blue-400 uppercase tracking-wider mb-1">EMAIL</p>
              <h3 className="text-base font-bold text-white mb-2">Opened-message checks</h3>
              <p className="text-xs text-slate-300 leading-relaxed">Supports Gmail, Outlook, and Yahoo Mail. Dashboard history keeps provider, sender, and subject—not the body.</p>
            </article>
          </div>
        </div>
      </section>

      {/* Outcomes Grid */}
      <section className="w-full max-w-7xl mx-auto px-6 py-20 border-t border-slate-800/80" aria-labelledby="outcomes-title">
        <div className="text-center max-w-xl mx-auto mb-12">
          <p className="text-[11px] font-bold text-[#087EFF] tracking-wider uppercase mb-2">RESULTS WITHOUT FALSE CERTAINTY</p>
          <h2 id="outcomes-title" className="text-3xl font-extrabold text-white tracking-tight">Three clear outcomes. No made-up risk score.</h2>
        </div>
        <div className="grid md:grid-cols-3 gap-6">
          <article className="p-6 rounded-2xl bg-emerald-950/20 border border-emerald-800/40 flex flex-col">
            <div className="w-8 h-8 rounded-full bg-emerald-500 text-white flex items-center justify-center text-sm font-bold mb-4">✓</div>
            <h3 className="text-base font-bold text-emerald-300 mb-2">No strong warning signs</h3>
            <p className="text-xs text-slate-300 leading-relaxed">No strong warning sign was detected by the completed checks. This is not a guarantee of legitimacy.</p>
          </article>
          <article className="p-6 rounded-2xl bg-amber-950/20 border border-amber-800/40 flex flex-col">
            <div className="w-8 h-8 rounded-full bg-amber-500 text-white flex items-center justify-center text-sm font-bold mb-4">!</div>
            <h3 className="text-base font-bold text-amber-300 mb-2">Needs caution</h3>
            <p className="text-xs text-slate-300 leading-relaxed">Some evidence deserves a closer look before you share information or continue.</p>
          </article>
          <article className="p-6 rounded-2xl bg-rose-950/20 border border-rose-800/40 flex flex-col">
            <div className="w-8 h-8 rounded-full bg-rose-500 text-white flex items-center justify-center text-sm font-bold mb-4">×</div>
            <h3 className="text-base font-bold text-rose-300 mb-2">Suspicious signs found</h3>
            <p className="text-xs text-slate-300 leading-relaxed">Multiple warning signs were found. Pause and independently verify the website or sender.</p>
          </article>
        </div>
      </section>

      {/* Privacy Section */}
      <section className="w-full max-w-7xl mx-auto px-6 py-16" id="privacy" aria-labelledby="privacy-title">
        <div className="p-8 sm:p-12 rounded-3xl bg-gradient-to-br from-[#071E4A] to-[#04142F] border border-blue-900/60 shadow-2xl flex flex-col lg:flex-row items-center gap-8">
          <div className="w-20 h-20 rounded-2xl bg-[#087EFF]/10 border border-[#087EFF]/30 flex items-center justify-center text-[#1495FF] shrink-0">
            <LockIcon className="w-10 h-10" />
          </div>
          <div className="flex-1">
            <p className="text-[11px] font-bold text-[#1495FF] tracking-wider uppercase mb-1">PRIVACY BOUNDARY</p>
            <h2 id="privacy-title" className="text-2xl sm:text-3xl font-extrabold text-white mb-3">Your sensitive content is not dashboard content.</h2>
            <p className="text-xs text-slate-300 leading-relaxed max-w-2xl">
              Complete browsing paths and routine email bodies stay outside shared activity history. Cloud evidence is minimized and redacted before it leaves the local detector boundary.
            </p>
          </div>
          <ul className="grid sm:grid-cols-2 gap-3 text-xs text-slate-300 shrink-0">
            <li className="flex items-center gap-2"><CheckIcon className="w-4 h-4 text-emerald-400 shrink-0" /> Origin-only routine website history</li>
            <li className="flex items-center gap-2"><CheckIcon className="w-4 h-4 text-emerald-400 shrink-0" /> No stored routine email bodies</li>
            <li className="flex items-center gap-2"><CheckIcon className="w-4 h-4 text-emerald-400 shrink-0" /> Revocable paired-device access</li>
            <li className="flex items-center gap-2"><CheckIcon className="w-4 h-4 text-emerald-400 shrink-0" /> 90-day activity retention</li>
          </ul>
        </div>
      </section>

      {/* CTA */}
      <section className="w-full max-w-7xl mx-auto px-6 py-12" aria-labelledby="landing-cta-title">
        <div className="p-8 sm:p-12 rounded-3xl bg-gradient-to-r from-[#087EFF] to-[#1495FF] text-white flex flex-col md:flex-row items-center justify-between gap-6 shadow-xl shadow-[#087EFF]/20">
          <div>
            <p className="text-[11px] font-bold text-blue-100 tracking-wider uppercase mb-1">READY WHEN YOU ARE</p>
            <h2 id="landing-cta-title" className="text-2xl sm:text-3xl font-black tracking-tight">Make the next click a more informed one.</h2>
            <p className="text-xs text-blue-100 mt-2 max-w-xl">Set up your BantAI account, pair your computer, and let the Companion handle detection without a terminal.</p>
          </div>
          <button
            className="flex items-center gap-2 bg-white text-[#04142F] hover:bg-slate-100 text-sm font-bold px-6 py-3.5 rounded-xl transition-all shadow-md shrink-0 active:scale-95"
            onClick={() => onNavigate(authenticated ? "/dashboard" : "/register")}
          >
            <span>{authenticated ? "Open dashboard" : "Create your BantAI account"}</span>
            <ArrowRightIcon className="w-4 h-4" />
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="w-full max-w-7xl mx-auto px-6 py-12 mt-auto border-t border-slate-800/60 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-400">
        <Logo light compact />
        <p className="text-center">Decision support for safer browsing—not a guarantee that a website or email is legitimate.</p>
        <span>© {new Date().getFullYear()} BantAI · v1.1</span>
      </footer>
    </main>
  );
}

function AuthLayout({ children, eyebrow, title, description }: { children: ReactNode; eyebrow: string; title: string; description: string }) {
  return (
    <main className="min-h-screen grid lg:grid-cols-12 bg-white selection:bg-[#087EFF] selection:text-white">
      {/* Left Brand Panel */}
      <section className="hidden lg:flex lg:col-span-5 flex-col justify-between p-12 bg-gradient-to-b from-[#04142F] via-[#071E4A] to-[#04142F] text-white relative overflow-hidden">
        <div className="absolute inset-0 bg-security-grid-dark opacity-30 pointer-events-none" />
        <Logo light />
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
        <div className="w-full max-w-md bg-white p-8 rounded-2xl border border-slate-200 shadow-sm">
          <div className="lg:hidden mb-6 flex justify-center">
            <Logo />
          </div>
          <p className="text-[10px] font-bold text-[#087EFF] tracking-wider uppercase mb-1">{eyebrow}</p>
          <h2 className="text-2xl font-bold text-[#04142F] tracking-tight">{title}</h2>
          <p className="text-xs text-slate-500 mt-1 mb-6 leading-relaxed">{description}</p>
          {children}
        </div>
      </section>
    </main>
  );
}

function AuthScreen({ onAuthenticated }: { onAuthenticated: (user: User) => void }) {
  const [path, setPath] = useState(() => (
    typeof window !== "undefined" && window.location.pathname === "/register" ? "/register" : "/login"
  ));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const go = (next: string) => {
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

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    const data = Object.fromEntries(new FormData(event.currentTarget));
    try {
      if (path === "/register") {
        const availability = await api<{ available: boolean }>("/auth/email-availability", {
          method: "POST",
          body: JSON.stringify({ email: data.email }),
        });
        if (!availability.available) throw new Error("This email is already in use.");
        const passwordError = passwordValidationMessage(data.password);
        if (passwordError) throw new Error(passwordError);
        if (data.password !== data.confirm_password) throw new Error("Passwords do not match.");
        await api<{ message: string }>("/auth/register", {
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
      const result = await api<{ user: User }>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: data.email, password: data.password }),
      });
      history.replaceState({}, "", "/dashboard");
      onAuthenticated(result.user);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "BantAI could not complete that request.");
    } finally {
      setBusy(false);
    }
  };

  const isRegister = path === "/register";
  const title = isRegister ? "Create your account" : "Welcome back";
  const description = isRegister
    ? "Create a secure BantAI account using your email address."
    : "Sign in to review your recent website and email checks.";

  return (
    <AuthLayout eyebrow={isRegister ? "GET STARTED" : "SECURE SIGN IN"} title={title} description={description}>
      {error && <Notice type="error">{error}</Notice>}
      <form className="space-y-4" onSubmit={submit}>
        {isRegister && (
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-slate-700">First name</span>
              <input
                name="first_name"
                autoComplete="given-name"
                maxLength={80}
                placeholder="First name"
                required
                className="h-11 px-3.5 rounded-xl border border-slate-300 bg-white text-slate-800 text-xs focus:ring-2 focus:ring-[#087EFF] focus:border-transparent outline-none transition"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-slate-700">Middle name <small className="text-slate-400 font-normal">(optional)</small></span>
              <input
                name="middle_name"
                autoComplete="additional-name"
                maxLength={80}
                placeholder="Middle name"
                className="h-11 px-3.5 rounded-xl border border-slate-300 bg-white text-slate-800 text-xs focus:ring-2 focus:ring-[#087EFF] focus:border-transparent outline-none transition"
              />
            </label>
            <label className="sm:col-span-2 flex flex-col gap-1">
              <span className="text-xs font-semibold text-slate-700">Last name</span>
              <input
                name="last_name"
                autoComplete="family-name"
                maxLength={80}
                placeholder="Last name"
                required
                className="h-11 px-3.5 rounded-xl border border-slate-300 bg-white text-slate-800 text-xs focus:ring-2 focus:ring-[#087EFF] focus:border-transparent outline-none transition"
              />
            </label>
          </div>
        )}
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-slate-700">Email address</span>
          <input
            name="email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            required
            className="h-11 px-3.5 rounded-xl border border-slate-300 bg-white text-slate-800 text-xs focus:ring-2 focus:ring-[#087EFF] focus:border-transparent outline-none transition"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-slate-700">Password</span>
          <input
            name="password"
            type="password"
            autoComplete={isRegister ? "new-password" : "current-password"}
            minLength={12}
            maxLength={128}
            aria-describedby={isRegister ? "password-requirements" : undefined}
            placeholder={isRegister ? "Create a strong password" : "Your password"}
            required
            className="h-11 px-3.5 rounded-xl border border-slate-300 bg-white text-slate-800 text-xs focus:ring-2 focus:ring-[#087EFF] focus:border-transparent outline-none transition"
          />
        </label>
        {isRegister && (
          <p id="password-requirements" className="text-[11px] text-slate-500 leading-normal">
            {PASSWORD_REQUIREMENTS}
          </p>
        )}
        {isRegister && (
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-slate-700">Confirm password</span>
            <input
              name="confirm_password"
              type="password"
              autoComplete="new-password"
              minLength={12}
              maxLength={128}
              placeholder="Repeat your password"
              required
              className="h-11 px-3.5 rounded-xl border border-slate-300 bg-white text-slate-800 text-xs focus:ring-2 focus:ring-[#087EFF] focus:border-transparent outline-none transition"
            />
          </label>
        )}
        <button
          type="submit"
          className="w-full mt-2 h-11 rounded-xl bg-[#087EFF] hover:bg-[#071E4A] text-white text-xs font-bold transition-all shadow-md shadow-[#087EFF]/20 active:scale-[0.99] disabled:opacity-50"
          disabled={busy}
        >
          {busy ? "Please wait…" : isRegister ? "Create account" : "Sign in"}
        </button>
      </form>
      <div className="mt-6 text-center text-xs text-slate-500">
        {isRegister ? (
          <>
            Already have an account?{" "}
            <button className="text-[#087EFF] font-bold hover:underline" onClick={() => go("/login")}>
              Sign in
            </button>
          </>
        ) : (
          <>
            New to BantAI?{" "}
            <button className="text-[#087EFF] font-bold hover:underline" onClick={() => go("/register")}>
              Create an account
            </button>
          </>
        )}
      </div>
    </AuthLayout>
  );
}

function AppShell({ user, page, navigate, children }: { user: User; page: PageName; navigate: (page: PageName) => void; children: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const nav = [
    { id: "dashboard" as const, icon: LayoutDashboardIcon, label: "Dashboard" },
    { id: "activity" as const, icon: ActivityIcon, label: "Activity" },
    { id: "message-review" as const, icon: SparklesIcon, label: "AI message check" },
    { id: "reports" as const, icon: GlobeIcon, label: "URL reports" },
    { id: "email-reports" as const, icon: MailIcon, label: "Email reports" },
    { id: "devices" as const, icon: LaptopIcon, label: "Paired devices" },
  ];
  const adminNav = [
    { id: "admin" as const, icon: ShieldIcon, label: "Admin overview" },
    { id: "review-reports" as const, icon: FileCheckIcon, label: "User reviews" },
    { id: "admin-email-reports" as const, icon: MailIcon, label: "Email reports" },
    { id: "training-data" as const, icon: DatabaseIcon, label: "Training data" },
    { id: "users" as const, icon: UsersIcon, label: "Users" },
  ];

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Desktop & Mobile Slide-over Sidebar */}
      <aside
        className={cx(
          "fixed inset-y-0 left-0 z-40 w-64 bg-white border-r border-slate-200 p-5 flex flex-col justify-between transition-transform duration-200 ease-in-out lg:translate-x-0 shadow-sm",
          menuOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex flex-col">
          <div className="flex items-center justify-between mb-8 px-1">
            <Logo />
            <button
              className="lg:hidden p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"
              onClick={() => setMenuOpen(false)}
              aria-label="Close menu"
            >
              <XIcon className="w-5 h-5" />
            </button>
          </div>

          <nav className="space-y-6" aria-label="Primary navigation">
            <div>
              <p className="px-3 text-[10px] font-bold text-slate-400 tracking-wider uppercase mb-2">MY BANTAI</p>
              <div className="space-y-1">
                {nav.map((item) => (
                  <NavButton
                    key={item.id}
                    item={item}
                    active={page === item.id}
                    onClick={() => {
                      navigate(item.id);
                      setMenuOpen(false);
                    }}
                  />
                ))}
              </div>
            </div>

            {user.role === "ADMIN" && (
              <div>
                <p className="px-3 text-[10px] font-bold text-slate-400 tracking-wider uppercase mb-2">ADMINISTRATION</p>
                <div className="space-y-1">
                  {adminNav.map((item) => (
                    <NavButton
                      key={item.id}
                      item={item}
                      active={page === item.id}
                      onClick={() => {
                        navigate(item.id);
                        setMenuOpen(false);
                      }}
                    />
                  ))}
                </div>
              </div>
            )}
          </nav>
        </div>

        <div className="space-y-4 pt-4 border-t border-slate-100">
          <div className="p-3.5 rounded-xl bg-blue-50/70 border border-blue-100 flex items-start gap-2.5">
            <div className="w-6 h-6 rounded-full bg-[#087EFF]/10 text-[#087EFF] flex items-center justify-center shrink-0 mt-0.5">
              <ShieldIcon className="w-3.5 h-3.5" />
            </div>
            <div>
              <strong className="text-xs font-semibold text-[#071E4A] block leading-none mb-1">Privacy protected</strong>
              <p className="text-[10px] text-slate-500 leading-snug">Only minimized results reach this dashboard.</p>
            </div>
          </div>

          <button
            className={cx(
              "w-full flex items-center gap-3 p-2 rounded-xl text-left transition-colors border",
              page === "profile" ? "bg-blue-50/80 border-blue-200 text-[#087EFF]" : "hover:bg-slate-100 border-transparent text-slate-700"
            )}
            onClick={() => {
              navigate("profile");
              setMenuOpen(false);
            }}
            title="Open profile"
          >
            <span className="w-8 h-8 rounded-lg bg-[#071E4A] text-white flex items-center justify-center text-xs font-bold shrink-0">
              {userName(user).slice(0, 1).toUpperCase()}
            </span>
            <div className="flex-1 min-w-0">
              <strong className="text-xs font-semibold text-slate-900 block truncate">{userName(user)}</strong>
              <small className="text-[10px] text-slate-500 block truncate">{user.email}</small>
            </div>
            <ChevronRightIcon className="w-4 h-4 text-slate-400 shrink-0" />
          </button>
        </div>
      </aside>

      {/* Backdrop for Mobile Drawer */}
      {menuOpen && (
        <div
          className="fixed inset-0 bg-[#04142F]/40 backdrop-blur-xs z-30 lg:hidden"
          onClick={() => setMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Main Content Area */}
      <div className="flex-1 lg:ml-64 flex flex-col min-h-screen min-w-0">
        <header className="h-16 border-b border-slate-200/80 bg-white/80 backdrop-blur-md px-6 flex items-center justify-between sticky top-0 z-20">
          <div className="flex items-center gap-3">
            <button
              className="lg:hidden p-2 rounded-lg text-slate-600 hover:bg-slate-100"
              onClick={() => setMenuOpen(true)}
              aria-label="Open navigation"
            >
              <MenuIcon className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-live-dot" />
              <span className="text-xs font-semibold text-slate-700">Account signed in</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              className="w-8 h-8 rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50 flex items-center justify-center text-xs font-bold transition-colors"
              title="BantAI help"
              aria-label="BantAI help"
            >
              <HelpCircleIcon className="w-4 h-4" />
            </button>
          </div>
        </header>

        <main className="flex-1 p-6 sm:p-8 max-w-7xl w-full mx-auto">{children}</main>
      </div>
    </div>
  );
}

function NavButton({
  item,
  active,
  onClick,
}: {
  item: { id: PageName; icon: (props: any) => any; label: string };
  active: boolean;
  onClick: () => void;
}) {
  const Icon = item.icon;
  return (
    <button
      className={cx(
        "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all text-left",
        active
          ? "bg-[#EAF4FF] text-[#087EFF] font-bold border-l-4 border-[#087EFF] shadow-2xs"
          : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
      )}
      onClick={onClick}
    >
      <Icon className={cx("w-4 h-4 shrink-0", active ? "text-[#087EFF]" : "text-slate-400")} />
      <span>{item.label}</span>
    </button>
  );
}

function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
      <div>
        <p className="text-[10px] font-bold text-[#087EFF] tracking-wider uppercase mb-1">{eyebrow}</p>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-[#04142F] tracking-tight">{title}</h1>
        <p className="text-xs text-slate-500 mt-1 max-w-2xl leading-relaxed">{description}</p>
      </div>
      {actions && <div className="shrink-0">{actions}</div>}
    </div>
  );
}

function doughnutGradient(row: Distribution) {
  const colorByOutcome: Record<Outcome, string> = {
    NO_STRONG_WARNING_SIGNS: "#059669",
    NEEDS_CAUTION: "#D97706",
    SUSPICIOUS_SIGNS_FOUND: "#DC2626",
  };
  let cursor = 0;
  const segments = OUTCOMES.map(({ value }) => {
    const percentage = row.outcomes.find((part) => part.outcome === value)?.percentage || 0;
    const start = cursor;
    cursor += percentage;
    return `${colorByOutcome[value]} ${start}% ${cursor}%`;
  });
  return `conic-gradient(from -90deg, ${segments.join(", ")})`;
}

function OutcomeChart({ distribution }: { distribution: Distribution[] }) {
  return (
    <section className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm mt-6" aria-labelledby="outcome-chart-title">
      <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-100">
        <div>
          <p className="text-[10px] font-bold text-[#087EFF] tracking-wider uppercase">DETECTION OUTCOMES</p>
          <h2 id="outcome-chart-title" className="text-base font-bold text-[#04142F]">What BantAI found</h2>
        </div>
        <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full">Percent of checks</span>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {distribution.map((row) => (
          <article className="p-5 rounded-xl bg-slate-50 border border-slate-200/80 flex flex-col justify-between" key={row.event_type}>
            <div className="flex items-center gap-2.5 mb-4">
              <div className="w-8 h-8 rounded-lg bg-[#EAF4FF] text-[#087EFF] flex items-center justify-center">
                {row.event_type === "URL" ? <GlobeIcon className="w-4 h-4" /> : <MailIcon className="w-4 h-4" />}
              </div>
              <div>
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">{row.event_type === "URL" ? "WEBSITE DETECTIONS" : "EMAIL DETECTIONS"}</p>
                <h3 className="text-xs font-bold text-[#04142F]">{row.event_type === "URL" ? "Website addresses" : "Opened emails"}</h3>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-6">
              <div
                className={cx("w-32 h-32 rounded-full relative shrink-0 shadow-inner flex items-center justify-center", !row.total && "bg-slate-200")}
                style={row.total ? { background: doughnutGradient(row) } : undefined}
                role="img"
                aria-label={row.total ? `${row.event_type}: ${row.outcomes.map((part) => `${outcomeInfo(part.outcome).label} ${part.percentage}%`).join(", ")}` : `${row.event_type}: no checks in this period`}
              >
                <div className="w-20 h-20 rounded-full bg-white flex flex-col items-center justify-center shadow-xs">
                  <span className="text-xs font-extrabold text-[#071E4A]">{row.total}</span>
                  <span className="text-[9px] text-slate-400 uppercase font-bold tracking-wider">{row.event_type === "URL" ? "Websites" : "Emails"}</span>
                </div>
              </div>

              <dl className="space-y-2 flex-1 w-full text-xs">
                {OUTCOMES.map((outcome) => {
                  const part = row.outcomes.find((item) => item.outcome === outcome.value);
                  return (
                    <div className="flex items-center justify-between pb-1 border-b border-slate-200/60" key={outcome.value}>
                      <dt className="flex items-center gap-2 text-slate-600 font-medium">
                        <span
                          className={cx(
                            "w-2.5 h-2.5 rounded-full shrink-0",
                            outcome.value === "NO_STRONG_WARNING_SIGNS" && "bg-emerald-600",
                            outcome.value === "NEEDS_CAUTION" && "bg-amber-500",
                            outcome.value === "SUSPICIOUS_SIGNS_FOUND" && "bg-rose-600"
                          )}
                        />
                        <span>{outcome.label}</span>
                      </dt>
                      <dd className="font-bold text-slate-800">{part?.percentage || 0}%</dd>
                    </div>
                  );
                })}
              </dl>
            </div>
            {!row.total && <p className="text-[11px] text-slate-400 text-center mt-3">No checks in this period</p>}
          </article>
        ))}
      </div>
      <p className="text-[11px] text-slate-400 mt-6 pt-4 border-t border-slate-100">These percentages summarize categorical outcomes. BantAI does not calculate an overall risk score.</p>
    </section>
  );
}

function LatestCard({ type, item }: { type: EventType; item: Activity | null }) {
  const isUrl = type === "URL";
  return (
    <section className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm flex gap-4">
      <div className="w-10 h-10 rounded-xl bg-[#EAF4FF] text-[#087EFF] flex items-center justify-center shrink-0 mt-0.5">
        {isUrl ? <GlobeIcon className="w-5 h-5" /> : <MailIcon className="w-5 h-5" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-bold text-[#087EFF] tracking-wider uppercase mb-1">LAST {isUrl ? "WEBSITE" : "EMAIL"} CHECKED</p>
        {item ? (
          <>
            <h2 className="text-sm font-bold text-[#04142F] truncate">{isUrl ? item.origin : item.subject || "No subject"}</h2>
            <p className="text-xs text-slate-500 truncate mt-0.5">{isUrl ? "Address-bar origin only" : `${item.sender || "Sender not shown"} · ${item.provider}`}</p>
            <div className="flex items-center justify-between gap-2 mt-4 pt-3 border-t border-slate-100">
              <StatusBadge outcome={item.outcome} />
              <time className="text-[11px] text-slate-400" title={niceDate(item.occurred_at)}>{relativeTime(item.occurred_at)}</time>
            </div>
          </>
        ) : (
          <>
            <h2 className="text-sm font-bold text-slate-700">No {isUrl ? "website" : "email"} checks yet</h2>
            <p className="text-xs text-slate-400 mt-1">{isUrl ? "Browse to an HTTP or HTTPS website after pairing." : "Open an email in Gmail, Outlook, or Yahoo after pairing."}</p>
          </>
        )}
      </div>
    </section>
  );
}

function DetectionFeedbackCard({ activity, onSubmitted, onClose }: { activity: Activity; onSubmitted: () => void | Promise<void>; onClose?: () => void }) {
  const [reportedUrl, setReportedUrl] = useState("");
  const [verdict, setVerdict] = useState<FeedbackVerdict | "">("");
  const [classification, setClassification] = useState<UrlReportClassification | "">("");
  const [reason, setReason] = useState<FeedbackReason | "">("");
  const [submitted, setSubmitted] = useState(activity.feedback_submitted);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const selectVerdict = (nextVerdict: FeedbackVerdict) => {
    setVerdict(nextVerdict);
    setError("");
    if (nextVerdict !== "INCORRECT") {
      setClassification("");
      setReason("");
    }
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!reportedUrl.trim() || !verdict || (verdict === "INCORRECT" && !classification)) {
      setError("Enter the complete website address and select your feedback before submitting.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api("/url-reports/from-activity", {
        method: "POST",
        body: JSON.stringify({
          activity_event_id: activity.id,
          url: reportedUrl.trim(),
          verdict,
          classification: verdict === "INCORRECT" ? classification : undefined,
          reason: verdict === "INCORRECT" && reason ? reason : undefined,
          confirmed: true,
        }),
      });
      setSubmitted(true);
      await onSubmitted();
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "BantAI could not save your feedback.");
    } finally {
      setBusy(false);
    }
  };

  if (submitted) {
    return (
      <section className="p-6 rounded-2xl bg-emerald-50 border border-emerald-200 shadow-sm flex items-center justify-between gap-4 my-4" aria-live="polite">
        <div className="flex items-center gap-3">
          <CheckCircle2Icon className="w-6 h-6 text-emerald-600 shrink-0" />
          <div>
            <p className="text-[10px] font-bold text-emerald-700 uppercase">FEEDBACK RECEIVED</p>
            <h2 className="text-sm font-bold text-emerald-950">Thank you for helping improve BantAI.</h2>
            <p className="text-xs text-emerald-800/80 mt-0.5">An administrator will review the complete address you explicitly submitted before it can become a future training candidate.</p>
          </div>
        </div>
        {onClose && (
          <button className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-white border border-emerald-300 text-emerald-800 hover:bg-emerald-100" type="button" onClick={onClose}>
            Close
          </button>
        )}
      </section>
    );
  }

  return (
    <section className="p-6 rounded-2xl bg-white border border-blue-200 shadow-sm my-4" aria-labelledby={`feedback-title-${activity.id}`}>
      <div className="flex items-start gap-4">
        <div className="w-10 h-10 rounded-xl bg-blue-50 text-[#087EFF] flex items-center justify-center shrink-0">
          <HelpCircleIcon className="w-5 h-5" />
        </div>
        <div className="flex-1">
          <p className="text-[10px] font-bold text-[#087EFF] tracking-wider uppercase mb-1">HELP IMPROVE BANTAI</p>
          <h2 id={`feedback-title-${activity.id}`} className="text-base font-bold text-[#04142F]">Do you think BantAI got this result right?</h2>
          <p className="text-xs text-slate-500 mt-1"><strong>{activity.origin}</strong> was shown as “{outcomeInfo(activity.outcome).label}.”</p>
          {error && <Notice type="error">{error}</Notice>}
          <form className="space-y-4 mt-4" onSubmit={submit}>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-slate-700">Complete website address</span>
              <input
                type="url"
                inputMode="url"
                value={reportedUrl}
                onChange={(event) => setReportedUrl(event.target.value)}
                placeholder={`${activity.origin || "https://example.com"}/page`}
                maxLength={2048}
                autoCapitalize="none"
                autoComplete="off"
                spellCheck={false}
                required
                className="h-10 px-3 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-[#087EFF] outline-none"
              />
              <small className="text-[11px] text-slate-400">Paste the address shown in the browser, including its path. This address is stored only after you submit feedback.</small>
            </label>

            <fieldset className="space-y-1 border-0 p-0 m-0">
              <legend className="text-xs font-semibold text-slate-700 mb-2">Select one response</legend>
              <div className="flex flex-wrap gap-2">
                <label className={cx("px-3.5 py-2 rounded-xl border text-xs font-semibold cursor-pointer transition flex items-center gap-2", verdict === "CORRECT" ? "bg-emerald-50 text-emerald-800 border-emerald-300 ring-2 ring-emerald-200" : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50")}>
                  <input type="radio" name={`feedback-verdict-${activity.id}`} className="sr-only" checked={verdict === "CORRECT"} onChange={() => selectVerdict("CORRECT")} />
                  <span>Yes, looks right</span>
                </label>
                <label className={cx("px-3.5 py-2 rounded-xl border text-xs font-semibold cursor-pointer transition flex items-center gap-2", verdict === "INCORRECT" ? "bg-rose-50 text-rose-800 border-rose-300 ring-2 ring-rose-200" : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50")}>
                  <input type="radio" name={`feedback-verdict-${activity.id}`} className="sr-only" checked={verdict === "INCORRECT"} onChange={() => selectVerdict("INCORRECT")} />
                  <span>No, report correction</span>
                </label>
                <label className={cx("px-3.5 py-2 rounded-xl border text-xs font-semibold cursor-pointer transition flex items-center gap-2", verdict === "UNSURE" ? "bg-blue-50 text-[#071E4A] border-blue-300 ring-2 ring-blue-200" : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50")}>
                  <input type="radio" name={`feedback-verdict-${activity.id}`} className="sr-only" checked={verdict === "UNSURE"} onChange={() => selectVerdict("UNSURE")} />
                  <span>Not sure</span>
                </label>
              </div>
            </fieldset>

            {verdict === "INCORRECT" && (
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                <fieldset className="space-y-1 border-0 p-0 m-0">
                  <legend className="text-xs font-semibold text-slate-700 mb-2">What best describes the website?</legend>
                  <div className="grid sm:grid-cols-2 gap-2">
                    <label className={cx("p-3 rounded-xl border cursor-pointer flex gap-2.5 items-start transition", classification === "LEGITIMATE" ? "bg-emerald-50 border-emerald-300 text-emerald-950 ring-2 ring-emerald-200" : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50")}>
                      <input type="radio" name={`feedback-classification-${activity.id}`} className="sr-only" checked={classification === "LEGITIMATE"} onChange={() => setClassification("LEGITIMATE")} />
                      <span className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center text-xs font-bold shrink-0">✓</span>
                      <div>
                        <strong className="text-xs font-bold block">Seems legitimate</strong>
                        <small className="text-[10px] text-slate-500">The warning may have been too cautious.</small>
                      </div>
                    </label>
                    <label className={cx("p-3 rounded-xl border cursor-pointer flex gap-2.5 items-start transition", classification === "SUSPICIOUS" ? "bg-rose-50 border-rose-300 text-rose-950 ring-2 ring-rose-200" : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50")}>
                      <input type="radio" name={`feedback-classification-${activity.id}`} className="sr-only" checked={classification === "SUSPICIOUS"} onChange={() => setClassification("SUSPICIOUS")} />
                      <span className="w-5 h-5 rounded-full bg-rose-600 text-white flex items-center justify-center text-xs font-bold shrink-0">!</span>
                      <div>
                        <strong className="text-xs font-bold block">Seems suspicious</strong>
                        <small className="text-[10px] text-slate-500">BantAI may have missed warning signs.</small>
                      </div>
                    </label>
                  </div>
                </fieldset>
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-semibold text-slate-700">Reason <small className="text-slate-400 font-normal">(optional)</small></span>
                  <select
                    value={reason}
                    onChange={(event) => setReason(event.target.value as FeedbackReason | "")}
                    className="h-10 px-3 rounded-xl border border-slate-300 text-xs bg-white focus:ring-2 focus:ring-[#087EFF] outline-none"
                  >
                    <option value="">Select a reason</option>
                    <option value="TRUSTED_OR_OFFICIAL">Trusted or official website</option>
                    <option value="INCORRECT_WARNING">Incorrect warning</option>
                    <option value="MISSED_WARNING">Missed suspicious behavior</option>
                    <option value="IMPERSONATION_OR_DECEPTIVE">Impersonation or deceptive domain</option>
                    <option value="OTHER">Other</option>
                  </select>
                </label>
              </div>
            )}

            <div className="flex items-center gap-3 pt-2">
              <button
                type="submit"
                disabled={busy || !reportedUrl.trim() || !verdict || (verdict === "INCORRECT" && !classification)}
                className="px-4 py-2 rounded-xl bg-[#087EFF] hover:bg-[#071E4A] text-white text-xs font-bold shadow-sm transition disabled:opacity-50"
              >
                {busy ? "Submitting..." : "Submit feedback"}
              </button>
              {onClose && (
                <button type="button" onClick={onClose} className="px-3 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100">
                  Close
                </button>
              )}
            </div>
          </form>
        </div>
      </div>
    </section>
  );
}

function ActivityTable({ items, compact = false, onFeedback }: { items: Activity[]; compact?: boolean; onFeedback?: (activity: Activity) => void }) {
  if (!items.length) return <EmptyState icon="↗" title="No activity to show" text="Pair BantAI and complete a check. Privacy-minimized results will appear here." />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs text-slate-600">
        <thead className="text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">
          <tr>
            <th className="pb-3 px-3">Activity</th>
            <th className="pb-3 px-3">Details</th>
            <th className="pb-3 px-3">Outcome</th>
            <th className="pb-3 px-3">Detected</th>
            {onFeedback && <th className="pb-3 px-3">Feedback</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {items.map((item) => (
            <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
              <td className="py-3.5 px-3">
                <div className="flex items-center gap-2.5">
                  <span className="w-7 h-7 rounded-lg bg-blue-50 text-[#087EFF] flex items-center justify-center shrink-0">
                    {item.event_type === "URL" ? <GlobeIcon className="w-3.5 h-3.5" /> : <MailIcon className="w-3.5 h-3.5" />}
                  </span>
                  <div>
                    <strong className="text-slate-900 block font-semibold">{item.event_type === "URL" ? "Website" : "Email"}</strong>
                    <small className="text-slate-400 capitalize block">{item.event_type === "EMAIL" ? item.provider : "Address bar"}</small>
                  </div>
                </div>
              </td>
              <td className="py-3.5 px-3 max-w-xs">
                <strong className="text-slate-900 block truncate font-medium">{item.event_type === "URL" ? item.origin : item.subject || "No subject"}</strong>
                {item.event_type === "EMAIL" && <small className="text-slate-400 block truncate">{item.sender || "Sender not shown"}</small>}
              </td>
              <td className="py-3.5 px-3">
                <StatusBadge outcome={item.outcome} />
              </td>
              <td className="py-3.5 px-3 whitespace-nowrap text-slate-400">
                <time title={niceDate(item.occurred_at)}>{compact ? relativeTime(item.occurred_at) : niceDate(item.occurred_at)}</time>
              </td>
              {onFeedback && (
                <td className="py-3.5 px-3">
                  {item.event_type === "URL" ? (
                    item.feedback_submitted ? (
                      <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">Submitted</span>
                    ) : (
                      <button className="text-xs font-bold text-[#087EFF] hover:underline" type="button" onClick={() => onFeedback(item)}>
                        Give feedback
                      </button>
                    )
                  ) : (
                    <span className="text-slate-300" aria-hidden="true">—</span>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DashboardPage({ onViewActivity, onPairDevice }: { onViewActivity: () => void; onPairDevice: () => void }) {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(() => {
    return api<DashboardData>(`/dashboard?days=${days}`).then(setData).catch((reason: ApiError) => setError(reason.message));
  }, [days]);
  useEffect(() => { void load(); }, [load]);
  return (
    <>
      <PageHeader eyebrow="PERSONAL OVERVIEW" title="Good to see you." description="A clear view of your recent BantAI checks—without storing sensitive content." actions={<RangePicker value={days} onChange={setDays} />} />
      {error && <Notice type="error">{error} <button className="ml-2 font-bold underline" onClick={load}>Try again</button></Notice>}
      <ConnectionPanel onPairDevice={onPairDevice} />
      {!data ? <DashboardSkeleton /> : (
        <>
          <div className="grid sm:grid-cols-2 gap-6 mt-6">
            <LatestCard type="URL" item={data.last_url} />
            <LatestCard type="EMAIL" item={data.last_email} />
          </div>
          <OutcomeChart distribution={data.distribution} />
          <section className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm mt-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-[10px] font-bold text-[#087EFF] tracking-wider uppercase">RECENT ACTIVITY</p>
                <h2 className="text-base font-bold text-[#04142F]">Your latest checks</h2>
              </div>
              <button className="flex items-center gap-1 text-xs font-bold text-[#087EFF] hover:underline" onClick={onViewActivity}>
                <span>View all activity</span>
                <ArrowRightIcon className="w-3.5 h-3.5" />
              </button>
            </div>
            <ActivityTable items={data.recent} compact />
          </section>
          <p className="text-[11px] text-slate-400 text-center max-w-2xl mx-auto mt-6 leading-relaxed">
            <strong>Remember:</strong> “No strong warning signs” means BantAI did not detect strong warning signs in the checked module. It is not a guarantee that an email or website is legitimate.
          </p>
        </>
      )}
    </>
  );
}

function ConnectionItem({
  icon,
  title,
  label,
  message,
  state,
  detail,
}: {
  icon: string;
  title: string;
  label: string;
  message: string;
  state: "connected" | "waiting" | "unavailable";
  detail?: string;
}) {
  return (
    <article className={cx("p-5 rounded-xl border flex flex-col justify-between transition", state === "connected" ? "bg-emerald-50/40 border-emerald-200" : state === "waiting" ? "bg-amber-50/40 border-amber-200" : "bg-slate-50 border-slate-200")}>
      <div className="flex items-start justify-between gap-2 mb-3">
        <div>
          {detail && <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">{detail}</p>}
          <h3 className="text-sm font-bold text-[#04142F]">{title}</h3>
        </div>
        <span className={cx("text-[10px] font-bold px-2 py-0.5 rounded-full", state === "connected" ? "bg-emerald-100 text-emerald-800" : state === "waiting" ? "bg-amber-100 text-amber-800" : "bg-slate-200 text-slate-700")}>
          {label}
        </span>
      </div>
      <p className="text-xs text-slate-500 leading-snug">{message}</p>
    </article>
  );
}

function ConnectionPanel({ onPairDevice }: { onPairDevice: () => void }) {
  const [status, setStatus] = useState<ConnectionStatus | null>(null);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch(`${COMPANION_URL}/connection-status`, {
        cache: "no-store",
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
      if (!response.ok) throw new Error("Companion status is unavailable.");
      setStatus((await response.json()) as ConnectionStatus);
      setError("");
    } catch {
      setStatus(null);
      setError("BantAI Companion could not be reached. Start or restart it to check protection connections.");
    } finally {
      window.clearTimeout(timeout);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => void load(), 0);
    const poll = window.setInterval(() => void load(), 15000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(poll);
    };
  }, [load]);

  const localState = status?.local_models.connected ? "connected" : "waiting";
  const cloudState = status?.cloud_ai.connected
    ? "connected"
    : status?.cloud_ai.platform_reachable
      ? "waiting"
      : "unavailable";

  return (
    <section className="mb-6 p-6 rounded-2xl bg-white border border-slate-200 shadow-sm" aria-labelledby="connections-title" aria-live="polite">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4 pb-3 border-b border-slate-100">
        <div>
          <p className="text-[10px] font-bold text-[#087EFF] tracking-wider uppercase">LIVE PROTECTION STATUS</p>
          <h2 id="connections-title" className="text-base font-bold text-[#04142F]">Protection connections</h2>
        </div>
        <div className="flex items-center gap-3">
          {status && <time className="text-xs text-slate-400" title={niceDate(status.checked_at)}>Checked {relativeTime(status.checked_at)}</time>}
          <button
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
            onClick={() => void load()}
            disabled={refreshing}
          >
            <RefreshCwIcon className={cx("w-3.5 h-3.5", refreshing && "animate-spin text-[#087EFF]")} />
            <span>{refreshing ? "Checking..." : "Refresh status"}</span>
          </button>
        </div>
      </div>

      {error ? (
        <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 flex items-center gap-3 text-xs text-amber-900" role="status">
          <AlertTriangleIcon className="w-5 h-5 text-amber-600 shrink-0" />
          <div>
            <strong className="block font-bold">Companion unavailable</strong>
            <span>{error}</span>
          </div>
        </div>
      ) : status && !status.extension.connected ? (
        <div className="p-6 rounded-xl bg-blue-50/60 border border-blue-200 flex flex-col sm:flex-row items-center justify-between gap-4" role="status">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-[#EAF4FF] text-[#087EFF] flex items-center justify-center shrink-0">
              <LaptopIcon className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[10px] font-bold text-[#087EFF] uppercase tracking-wider">ACCOUNT CONNECTION REQUIRED</p>
              <h3 className="text-sm font-bold text-[#071E4A]">Detection is off</h3>
              <p className="text-xs text-slate-600 mt-0.5 max-w-xl">Pair this computer with your BantAI account to enable website and email checks. Detection details remain hidden until pairing is verified.</p>
            </div>
          </div>
          <button className="px-4 py-2 rounded-xl bg-[#087EFF] hover:bg-[#071E4A] text-white text-xs font-bold transition shadow-sm shrink-0" onClick={onPairDevice}>
            Pair this device
          </button>
        </div>
      ) : status ? (
        <div className="grid md:grid-cols-3 gap-4">
          <ConnectionItem
            icon="◉"
            title="Local models"
            label={status.local_models.connected ? "Connected" : "Loading"}
            state={localState}
            detail="RF URL + XLM-R email"
            message={status.local_models.message}
          />
          <ConnectionItem
            icon="☁"
            title="Cloud AI"
            label={status.cloud_ai.connected ? "Connected" : status.cloud_ai.configured ? "Unavailable" : "Setup needed"}
            state={cloudState}
            detail="Privacy-minimized review"
            message={status.cloud_ai.message}
          />
          <ConnectionItem
            icon="◇"
            title="Browser extension"
            label="Paired"
            state="connected"
            detail={status.extension.device_label || "This computer"}
            message={status.extension.message}
          />
        </div>
      ) : (
        <div className="grid md:grid-cols-3 gap-4" aria-busy="true">
          <div className="h-24 rounded-xl bg-slate-100 animate-shimmer" />
          <div className="h-24 rounded-xl bg-slate-100 animate-shimmer" />
          <div className="h-24 rounded-xl bg-slate-100 animate-shimmer" />
        </div>
      )}
    </section>
  );
}

function RangePicker({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return (
    <div className="inline-flex p-1 rounded-xl bg-slate-100 border border-slate-200 text-xs font-semibold" aria-label="Date range">
      {[7, 30, 90].map((days) => (
        <button
          key={days}
          className={cx(
            "px-3 py-1.5 rounded-lg transition-all",
            value === days ? "bg-white text-[#04142F] shadow-2xs font-bold" : "text-slate-500 hover:text-slate-900"
          )}
          onClick={() => onChange(days)}
        >
          {days} days
        </button>
      ))}
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true">
      <div className="grid sm:grid-cols-2 gap-6">
        <div className="h-44 rounded-2xl bg-slate-100 animate-shimmer" />
        <div className="h-44 rounded-2xl bg-slate-100 animate-shimmer" />
      </div>
      <div className="h-64 rounded-2xl bg-slate-100 animate-shimmer" />
      <div className="h-64 rounded-2xl bg-slate-100 animate-shimmer" />
    </div>
  );
}

function MessageReviewPage() {
  const [message, setMessage] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<PastedMessageReviewResult | null>(null);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!message.trim() || !confirmed) return;
    setBusy(true);
    setError("");
    setResult(null);
    try {
      setResult(await api<PastedMessageReviewResult>("/message-review", {
        method: "POST",
        body: JSON.stringify({ message, confirmed: true }),
      }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "BantAI could not review this message.");
    } finally {
      setBusy(false);
    }
  };

  const clear = () => {
    setMessage("");
    setConfirmed(false);
    setResult(null);
    setError("");
  };

  const assessmentTitle = result?.assessment === "SUSPICIOUS_SIGNS_FOUND"
    ? "AI found suspicious wording"
    : result?.assessment === "NEEDS_CAUTION"
      ? "AI review suggests caution"
      : "No strong warning signs in the pasted text";
  const confidenceLabel = result?.confidence === "HIGH"
    ? "High"
    : result?.confidence === "MEDIUM"
      ? "Moderate"
      : "Limited";

  return (
    <>
      <PageHeader eyebrow="ON-DEMAND AI REVIEW" title="Check a message" description="Paste an email body, SMS, chat, or other message for a one-time contextual review." />
      {error && <Notice type="error">{error}</Notice>}
      <div className="grid lg:grid-cols-12 gap-6">
        <section className="lg:col-span-8 p-6 rounded-2xl bg-white border border-slate-200 shadow-sm" aria-labelledby="message-review-form-title">
          <div className="mb-4">
            <p className="text-[10px] font-bold text-[#087EFF] tracking-wider uppercase">PASTED TEXT</p>
            <h2 id="message-review-form-title" className="text-base font-bold text-[#04142F]">What message would you like to check?</h2>
          </div>
          <form className="space-y-4" onSubmit={submit}>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-slate-700">Message text</span>
              <textarea
                value={message}
                onChange={(event) => { setMessage(event.target.value); setResult(null); }}
                maxLength={10_000}
                placeholder="Paste the message here. Remove any details you do not want processed."
                aria-describedby="message-review-help message-review-count"
                required
                className="w-full h-44 p-3.5 rounded-xl border border-slate-300 text-xs font-mono leading-relaxed focus:ring-2 focus:ring-[#087EFF] outline-none"
              />
            </label>
            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <p id="message-review-help" className="max-w-md">BantAI redacts reasonably detectable OTPs, phone numbers, email addresses, cards, and account identifiers before the AI request.</p>
              <span id="message-review-count" className="font-mono font-bold text-slate-600">{message.length.toLocaleString()} / 10,000</span>
            </div>
            <label className="flex items-start gap-3 p-3.5 rounded-xl bg-blue-50/60 border border-blue-200 cursor-pointer">
              <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} className="mt-0.5 rounded text-[#087EFF] focus:ring-[#087EFF]" />
              <div className="text-xs">
                <strong className="text-[#071E4A] block">Review this text with Cloud AI</strong>
                <small className="text-slate-500 block mt-0.5">I understand the redacted text will be sent to Cloud AI for this one-time analysis. It will not be saved to activity or training data.</small>
              </div>
            </label>
            <div className="flex items-center gap-3">
              <button
                className="px-5 py-2.5 rounded-xl bg-[#087EFF] hover:bg-[#071E4A] text-white text-xs font-bold shadow-sm transition disabled:opacity-50"
                type="submit"
                disabled={busy || !message.trim() || !confirmed}
              >
                {busy ? "Reviewing message..." : "Analyze pasted text"}
              </button>
              <button
                className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-semibold transition disabled:opacity-40"
                type="button"
                onClick={clear}
                disabled={busy || (!message && !result)}
              >
                Clear
              </button>
            </div>
          </form>
        </section>

        <aside className="lg:col-span-4 p-6 rounded-2xl bg-gradient-to-br from-[#071E4A] to-[#04142F] text-white flex flex-col justify-between" aria-label="AI message check limitations">
          <div>
            <div className="w-9 h-9 rounded-xl bg-[#087EFF]/20 border border-[#087EFF]/30 flex items-center justify-center text-[#1495FF] mb-3">
              <SparklesIcon className="w-5 h-5" />
            </div>
            <p className="text-[10px] font-bold text-[#1495FF] uppercase tracking-wider mb-1">CONTEXTUAL SIGNAL ONLY</p>
            <h2 className="text-lg font-bold text-white mb-2">One part of the picture</h2>
            <p className="text-xs text-slate-300 leading-relaxed mb-4">This check analyzes only the wording you paste. It does not inspect the sender, email headers, attachments, websites, or your local XLM-R model.</p>
            <ul className="space-y-2 text-xs text-slate-300">
              <li className="flex items-center gap-2"><span className="text-[#1495FF]">✓</span> English, Filipino, and Taglish scam context is reviewed</li>
              <li className="flex items-center gap-2"><span className="text-[#1495FF]">✓</span> Language or code-switching alone is never a warning sign</li>
              <li className="flex items-center gap-2"><span className="text-[#1495FF]">✓</span> No message is added to history or training data</li>
              <li className="flex items-center gap-2"><span className="text-[#1495FF]">✓</span> No links are opened or followed</li>
            </ul>
          </div>
        </aside>
      </div>

      {result?.status === "UNAVAILABLE" && (
        <section className="p-6 rounded-2xl bg-amber-50 border border-amber-200 mt-6 flex items-start gap-4" role="status">
          <AlertTriangleIcon className="w-6 h-6 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-[10px] font-bold text-amber-700 uppercase">AI REVIEW UNAVAILABLE</p>
            <h2 className="text-base font-bold text-amber-950">Message review could not be completed</h2>
            <p className="text-xs text-amber-900 mt-1">{result.reasoning_summary} {result.recommended_action}</p>
          </div>
        </section>
      )}

      {result?.status === "COMPLETE" && result.assessment && (
        <section className={cx("p-6 rounded-2xl border shadow-sm mt-6 space-y-6", result.assessment === "NO_STRONG_WARNING_SIGNS" ? "bg-emerald-50/30 border-emerald-200" : result.assessment === "NEEDS_CAUTION" ? "bg-amber-50/30 border-amber-200" : "bg-rose-50/30 border-rose-200")} aria-live="polite">
          <div className="flex items-center gap-4">
            <div className={cx("w-12 h-12 rounded-2xl flex items-center justify-center text-white text-xl font-bold shrink-0", result.assessment === "NO_STRONG_WARNING_SIGNS" ? "bg-emerald-600" : result.assessment === "NEEDS_CAUTION" ? "bg-amber-600" : "bg-rose-600")}>
              {result.assessment === "NO_STRONG_WARNING_SIGNS" ? "✓" : "!"}
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">CLOUD AI TEXT SIGNAL</p>
              <h2 className="text-lg font-bold text-[#04142F]">{assessmentTitle}</h2>
            </div>
          </div>

          <div className="p-5 rounded-xl bg-white border border-slate-200 shadow-2xs">
            <div className="flex items-center justify-between mb-2">
              <div>
                <p className="text-[10px] font-bold text-[#087EFF] uppercase tracking-wider">DETAILED ASSESSMENT</p>
                <h3 className="text-sm font-bold text-[#04142F]">Why BantAI reached this result</h3>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-slate-400 block">Text-only confidence</span>
                <strong className="text-xs font-bold text-[#071E4A]">{confidenceLabel}</strong>
              </div>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed mt-2">{result.reasoning_summary}</p>
          </div>

          <div>
            <p className="text-[10px] font-bold text-[#087EFF] uppercase tracking-wider mb-1">OBSERVED WORDING</p>
            <h3 className="text-sm font-bold text-[#04142F] mb-3">{result.indicators.length > 0 ? `${result.indicators.length} contextual indicator${result.indicators.length === 1 ? "" : "s"}` : "No specific warning indicators"}</h3>
            {result.indicators.length > 0 ? (
              <div className="grid sm:grid-cols-2 gap-3" aria-label="Observed message indicators">
                {result.indicators.map((indicator, index) => (
                  <article key={`${indicator.category}-${index}`} className="p-4 rounded-xl bg-white border border-slate-200 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1">
                        <span className="font-bold uppercase">{indicator.severity.toLowerCase()}</span>
                        <em>Signal {index + 1}</em>
                      </div>
                      <strong className="text-xs font-bold text-[#04142F] block">{indicator.category}</strong>
                      <p className="text-xs text-slate-600 mt-1 leading-relaxed">{indicator.evidence}</p>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-500 p-4 rounded-xl bg-white border border-slate-200">The pasted wording did not provide a specific scam or social-engineering signal. This does not verify the sender or message.</p>
            )}
          </div>

          <div className="p-4 rounded-xl bg-slate-100 border border-slate-200 text-xs">
            <strong className="text-[#071E4A] block mb-1">Safer next steps</strong>
            <p className="text-slate-600 leading-relaxed">{result.recommended_action}</p>
          </div>

          <p className="text-[11px] text-slate-400"><strong>Cloud-only review:</strong> This is not a final BantAI email result and cannot confirm that a message is legitimate or malicious.</p>
        </section>
      )}
    </>
  );
}

function ActivityPage() {
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({ event_type: "", outcome: "", provider: "", date_from: "", date_to: "" });
  const [data, setData] = useState<{ items: Activity[]; page: number; pages: number; total: number } | null>(null);
  const [feedbackActivity, setFeedbackActivity] = useState<Activity | null>(null);
  const [error, setError] = useState("");
  const query = useMemo(() => {
    const params = new URLSearchParams({ page: String(page), page_size: "25" });
    Object.entries(filters).forEach(([key, value]) => value && params.set(key, key.startsWith("date_") ? new Date(`${value}T${key === "date_to" ? "23:59:59" : "00:00:00"}`).toISOString() : value));
    return params.toString();
  }, [filters, page]);
  const load = useCallback(() => api<typeof data>(`/activities?${query}`).then(setData).catch((reason: ApiError) => setError(reason.message)), [query]);
  useEffect(() => { void load(); }, [load]);
  const change = (key: keyof typeof filters, value: string) => { setPage(1); setFilters((current) => ({ ...current, [key]: value })); };
  return (
    <>
      <PageHeader eyebrow="PRIVACY-MINIMIZED HISTORY" title="Activity" description="Review your retained website origins and email metadata. Records are removed after 90 days." />
      <section className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm mb-6">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 text-xs">
          <label className="flex flex-col gap-1">
            <span className="font-semibold text-slate-600">Type</span>
            <select value={filters.event_type} onChange={(event) => change("event_type", event.target.value)} className="h-9 px-2.5 rounded-lg border border-slate-300 bg-white text-xs">
              <option value="">All activity</option>
              <option value="URL">Websites</option>
              <option value="EMAIL">Emails</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-semibold text-slate-600">Outcome</span>
            <select value={filters.outcome} onChange={(event) => change("outcome", event.target.value)} className="h-9 px-2.5 rounded-lg border border-slate-300 bg-white text-xs">
              <option value="">All outcomes</option>
              {OUTCOMES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-semibold text-slate-600">Email provider</span>
            <select value={filters.provider} onChange={(event) => change("provider", event.target.value)} className="h-9 px-2.5 rounded-lg border border-slate-300 bg-white text-xs">
              <option value="">All providers</option>
              <option value="gmail">Gmail</option>
              <option value="outlook">Outlook</option>
              <option value="yahoo">Yahoo</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-semibold text-slate-600">From</span>
            <input type="date" value={filters.date_from} onChange={(event) => change("date_from", event.target.value)} className="h-9 px-2.5 rounded-lg border border-slate-300 bg-white text-xs" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-semibold text-slate-600">To</span>
            <input type="date" value={filters.date_to} onChange={(event) => change("date_to", event.target.value)} className="h-9 px-2.5 rounded-lg border border-slate-300 bg-white text-xs" />
          </label>
        </div>
      </section>
      {error && <Notice type="error">{error}</Notice>}
      {feedbackActivity && <DetectionFeedbackCard key={feedbackActivity.id} activity={feedbackActivity} onSubmitted={load} onClose={() => setFeedbackActivity(null)} />}
      <section className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm">
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
          <div>
            <p className="text-[10px] font-bold text-[#087EFF] uppercase tracking-wider">ALL CHECKS</p>
            <h2 className="text-base font-bold text-[#04142F]">{data ? `${data.total} retained ${data.total === 1 ? "record" : "records"}` : "Loading activity…"}</h2>
          </div>
          <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full">90-day retention</span>
        </div>
        {data ? <ActivityTable items={data.items} onFeedback={setFeedbackActivity} /> : <DashboardSkeleton />}
        {data && data.pages > 1 && (
          <div className="flex items-center justify-between pt-4 mt-4 border-t border-slate-100 text-xs text-slate-500">
            <button disabled={page <= 1} onClick={() => setPage((value) => value - 1)} className="px-3 py-1.5 rounded-lg border border-slate-200 font-semibold hover:bg-slate-50 disabled:opacity-40">
              ← Previous
            </button>
            <span>Page {page} of {data.pages}</span>
            <button disabled={page >= data.pages} onClick={() => setPage((value) => value + 1)} className="px-3 py-1.5 rounded-lg border border-slate-200 font-semibold hover:bg-slate-50 disabled:opacity-40">
              Next →
            </button>
          </div>
        )}
      </section>
    </>
  );
}

function UrlReportsPage() {
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ items: UrlReport[]; page: number; pages: number; total: number } | null>(null);
  const [url, setUrl] = useState("");
  const [detectorOutcome, setDetectorOutcome] = useState<Outcome | "">("");
  const [classification, setClassification] = useState<UrlReportClassification>("LEGITIMATE");
  const [reason, setReason] = useState<FeedbackReason | "">("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(() => {
    return api<{ items: UrlReport[]; page: number; pages: number; total: number }>(`/url-reports?page=${page}&page_size=25`)
      .then(setData)
      .catch((reason: ApiError) => setError(reason.message || "BantAI could not load website reports."));
  }, [page]);

  useEffect(() => { void load(); }, [load]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!url.trim() || !detectorOutcome) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await api<{ message: string }>("/url-reports", {
        method: "POST",
        body: JSON.stringify({ url: url.trim(), detector_outcome: detectorOutcome, classification, reason: reason || undefined }),
      });
      setUrl("");
      setDetectorOutcome("");
      setReason("");
      setMessage(result.message);
      setPage(1);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "BantAI could not submit this website report.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader eyebrow="RESULT FEEDBACK" title="Report a website result" description="Paste the complete website address, including its path, when you believe BantAI classified it incorrectly." />
      {error && <Notice type="error">{error}</Notice>}
      {message && <Notice type="success">{message}</Notice>}
      <div className="grid lg:grid-cols-12 gap-6 mb-6">
        <section className="lg:col-span-8 p-6 rounded-2xl bg-white border border-slate-200 shadow-sm" aria-labelledby="new-url-report-title">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
            <div>
              <p className="text-[10px] font-bold text-[#087EFF] uppercase tracking-wider">NEW REPORT</p>
              <h2 id="new-url-report-title" className="text-base font-bold text-[#04142F]">Enter the website address</h2>
            </div>
            <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full">Explicit submission</span>
          </div>
          <form className="space-y-4" onSubmit={submit}>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-slate-700">Website URL</span>
              <input type="url" inputMode="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://example.com" maxLength={2048} autoCapitalize="none" autoComplete="off" spellCheck={false} aria-describedby="url-report-help" required className="h-10 px-3 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-[#087EFF] outline-none" />
            </label>
            <p id="url-report-help" className="text-[11px] text-slate-400">Paste the complete address from your browser. BantAI retains its path for administrator review and future training-data assessment.</p>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-slate-700">What result did BantAI show?</span>
              <select value={detectorOutcome} onChange={(event) => setDetectorOutcome(event.target.value as Outcome | "")} required className="h-10 px-3 rounded-xl border border-slate-300 text-xs bg-white focus:ring-2 focus:ring-[#087EFF] outline-none">
                <option value="">Select the displayed result</option>
                {OUTCOMES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </label>
            <fieldset className="space-y-1 border-0 p-0 m-0">
              <legend className="text-xs font-semibold text-slate-700 mb-2">What do you believe about this website?</legend>
              <div className="grid sm:grid-cols-2 gap-3">
                <label className={cx("p-3.5 rounded-xl border cursor-pointer flex gap-3 items-start transition", classification === "LEGITIMATE" ? "bg-emerald-50 border-emerald-300 text-emerald-950 ring-2 ring-emerald-200" : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50")}>
                  <input type="radio" name="classification" value="LEGITIMATE" checked={classification === "LEGITIMATE"} onChange={() => setClassification("LEGITIMATE")} className="sr-only" />
                  <span className="w-6 h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center text-xs font-bold shrink-0">✓</span>
                  <div>
                    <strong className="text-xs font-bold block">Legitimate website</strong>
                    <small className="text-[11px] text-slate-500 leading-snug">The detection may have been too cautious.</small>
                  </div>
                </label>
                <label className={cx("p-3.5 rounded-xl border cursor-pointer flex gap-3 items-start transition", classification === "SUSPICIOUS" ? "bg-rose-50 border-rose-300 text-rose-950 ring-2 ring-rose-200" : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50")}>
                  <input type="radio" name="classification" value="SUSPICIOUS" checked={classification === "SUSPICIOUS"} onChange={() => setClassification("SUSPICIOUS")} className="sr-only" />
                  <span className="w-6 h-6 rounded-full bg-rose-600 text-white flex items-center justify-center text-xs font-bold shrink-0">!</span>
                  <div>
                    <strong className="text-xs font-bold block">Suspicious website</strong>
                    <small className="text-[11px] text-slate-500 leading-snug">The detection may have missed warning signs.</small>
                  </div>
                </label>
              </div>
            </fieldset>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-slate-700">Reason <small className="text-slate-400 font-normal">(optional)</small></span>
              <select value={reason} onChange={(event) => setReason(event.target.value as FeedbackReason | "")} className="h-10 px-3 rounded-xl border border-slate-300 text-xs bg-white focus:ring-2 focus:ring-[#087EFF] outline-none">
                <option value="">Select a reason</option>
                <option value="TRUSTED_OR_OFFICIAL">Trusted or official website</option>
                <option value="INCORRECT_WARNING">Incorrect warning</option>
                <option value="MISSED_WARNING">Missed suspicious behavior</option>
                <option value="IMPERSONATION_OR_DECEPTIVE">Impersonation or deceptive domain</option>
                <option value="OTHER">Other</option>
              </select>
            </label>
            <button className="px-5 py-2.5 rounded-xl bg-[#087EFF] hover:bg-[#071E4A] text-white text-xs font-bold shadow-sm transition disabled:opacity-50" disabled={busy || !url.trim() || !detectorOutcome}>
              {busy ? "Submitting..." : "Submit for review"}
            </button>
          </form>
        </section>
        <aside className="lg:col-span-4 p-6 rounded-2xl bg-gradient-to-br from-[#071E4A] to-[#04142F] text-white flex flex-col justify-between" aria-label="Report privacy information">
          <div>
            <div className="w-9 h-9 rounded-xl bg-[#087EFF]/20 border border-[#087EFF]/30 flex items-center justify-center text-[#1495FF] mb-3">
              <GlobeIcon className="w-5 h-5" />
            </div>
            <p className="text-[10px] font-bold text-[#1495FF] uppercase tracking-wider mb-1">EXPLICIT REPORT</p>
            <h2 className="text-lg font-bold text-white mb-2">Only addresses you submit are collected in full.</h2>
            <p className="text-xs text-slate-300 leading-relaxed">The complete address is encrypted and shown to an administrator with your classification and detector outcome. Your identity is not included, and ordinary activity history remains origin-only.</p>
          </div>
        </aside>
      </div>

      <section className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm">
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
          <div>
            <p className="text-[10px] font-bold text-[#087EFF] uppercase tracking-wider">YOUR SUBMISSIONS</p>
            <h2 className="text-base font-bold text-[#04142F]">{data ? `${data.total} website ${data.total === 1 ? "report" : "reports"}` : "Loading reports..."}</h2>
          </div>
          <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full">90-day retention</span>
        </div>
        {data && data.items.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">
                <tr>
                  <th className="pb-3 px-3">Complete website address</th>
                  <th className="pb-3 px-3">Detector result</th>
                  <th className="pb-3 px-3">Your feedback</th>
                  <th className="pb-3 px-3">Training review</th>
                  <th className="pb-3 px-3">Submitted</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.items.map((report) => (
                  <tr key={report.id} className="hover:bg-slate-50">
                    <td className="py-3 px-3 max-w-xs">
                      <strong className="block truncate font-semibold text-slate-900" title={report.url}>{report.url}</strong>
                      <small className="text-slate-400 block">{feedbackReasonLabel(report.feedback_reason)}</small>
                    </td>
                    <td className="py-3 px-3"><StatusBadge outcome={report.detector_outcome} /></td>
                    <td className="py-3 px-3">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-[#071E4A]">{feedbackVerdictLabel(report.feedback_verdict)}</span>
                      <small className="text-slate-400 block mt-0.5">{userClassificationLabel(report.user_classification)}</small>
                    </td>
                    <td className="py-3 px-3">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">{trainingStatusLabel(report.training_status)}</span>
                      {report.reviewed_at && <small className="text-slate-400 block mt-0.5">Reviewed {niceDate(report.reviewed_at)}</small>}
                    </td>
                    <td className="py-3 px-3 text-slate-400 whitespace-nowrap">{niceDate(report.submitted_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : data ? (
          <EmptyState icon="!" title="No website reports" text="Enter a website address above when you believe its detection outcome may be wrong." />
        ) : (
          <DashboardSkeleton />
        )}
        {data && data.pages > 1 && (
          <div className="flex items-center justify-between pt-4 mt-4 border-t border-slate-100 text-xs text-slate-500">
            <button disabled={page <= 1} onClick={() => setPage((value) => value - 1)} className="px-3 py-1.5 rounded-lg border border-slate-200 font-semibold hover:bg-slate-50 disabled:opacity-40">← Previous</button>
            <span>Page {page} of {data.pages}</span>
            <button disabled={page >= data.pages} onClick={() => setPage((value) => value + 1)} className="px-3 py-1.5 rounded-lg border border-slate-200 font-semibold hover:bg-slate-50 disabled:opacity-40">Next →</button>
          </div>
        )}
      </section>
      <p className="text-[11px] text-slate-400 text-center max-w-2xl mx-auto mt-6 leading-relaxed"><strong>Reports are decision-support feedback.</strong> They do not automatically retrain the frozen detector or guarantee that a website is legitimate or malicious.</p>
    </>
  );
}

function EmailReportsPage() {
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ items: EmailReport[]; page: number; pages: number; total: number } | null>(null);
  const [provider, setProvider] = useState<"gmail" | "outlook" | "yahoo">("gmail");
  const [sender, setSender] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [detectorOutcome, setDetectorOutcome] = useState<Outcome | "">("");
  const [classification, setClassification] = useState<UrlReportClassification>("LEGITIMATE");
  const [reason, setReason] = useState<FeedbackReason | "">("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(() => api<{ items: EmailReport[]; page: number; pages: number; total: number }>(`/email-reports?page=${page}&page_size=25`)
    .then(setData)
    .catch((problem: ApiError) => setError(problem.message || "BantAI could not load email reports.")), [page]);

  useEffect(() => { void load(); }, [load]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!sender.trim() || !body.trim() || !detectorOutcome || !confirmed) {
      setError("Complete the required fields and confirm the encrypted training submission.");
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await api<{ message: string }>("/email-reports", {
        method: "POST",
        body: JSON.stringify({ provider, sender: sender.trim(), subject, body, detector_outcome: detectorOutcome, classification, reason: reason || undefined, confirmed: true }),
      });
      setSender("");
      setSubject("");
      setBody("");
      setDetectorOutcome("");
      setReason("");
      setConfirmed(false);
      setMessage(result.message);
      setPage(1);
      await load();
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "BantAI could not submit this email report.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader eyebrow="RESULT FEEDBACK" title="Submit an email report" description="Provide an email only when you want it considered as an encrypted reference for a future model-training cycle." />
      {error && <Notice type="error">{error}</Notice>}
      {message && <Notice type="success">{message}</Notice>}
      <div className="grid lg:grid-cols-12 gap-6 mb-6">
        <section className="lg:col-span-8 p-6 rounded-2xl bg-white border border-slate-200 shadow-sm" aria-labelledby="new-email-report-title">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
            <div>
              <p className="text-[10px] font-bold text-[#087EFF] uppercase tracking-wider">NEW EMAIL REPORT</p>
              <h2 id="new-email-report-title" className="text-base font-bold text-[#04142F]">Enter the email details</h2>
            </div>
            <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full">Explicit submission</span>
          </div>
          <form className="space-y-4" onSubmit={submit}>
            <div className="grid sm:grid-cols-2 gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-slate-700">Email provider</span>
                <select value={provider} onChange={(event) => setProvider(event.target.value as typeof provider)} className="h-10 px-3 rounded-xl border border-slate-300 text-xs bg-white focus:ring-2 focus:ring-[#087EFF] outline-none">
                  <option value="gmail">Gmail</option>
                  <option value="outlook">Outlook</option>
                  <option value="yahoo">Yahoo Mail</option>
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-slate-700">Sender</span>
                <input value={sender} onChange={(event) => setSender(event.target.value)} maxLength={320} placeholder="Sender name or address" required className="h-10 px-3 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-[#087EFF] outline-none" />
              </label>
            </div>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-slate-700">Subject</span>
              <input value={subject} onChange={(event) => setSubject(event.target.value)} maxLength={500} placeholder="Email subject, if available" className="h-10 px-3 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-[#087EFF] outline-none" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-slate-700">Email body</span>
              <textarea value={body} onChange={(event) => setBody(event.target.value)} maxLength={10000} rows={6} placeholder="Paste the email message here" aria-describedby="email-body-help" required className="w-full p-3 rounded-xl border border-slate-300 text-xs font-mono focus:ring-2 focus:ring-[#087EFF] outline-none" />
            </label>
            <p id="email-body-help" className="text-[11px] text-slate-400">The body is encrypted before database storage. It cannot be read from the user or administrator interface and is reserved for an approved offline training process.</p>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-slate-700">What result did BantAI show?</span>
              <select value={detectorOutcome} onChange={(event) => setDetectorOutcome(event.target.value as Outcome | "")} required className="h-10 px-3 rounded-xl border border-slate-300 text-xs bg-white focus:ring-2 focus:ring-[#087EFF] outline-none">
                <option value="">Select the displayed result</option>
                {OUTCOMES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </label>
            <fieldset className="space-y-1 border-0 p-0 m-0">
              <legend className="text-xs font-semibold text-slate-700 mb-2">What do you believe about this email?</legend>
              <div className="grid sm:grid-cols-2 gap-3">
                <label className={cx("p-3.5 rounded-xl border cursor-pointer flex gap-3 items-start transition", classification === "LEGITIMATE" ? "bg-emerald-50 border-emerald-300 text-emerald-950 ring-2 ring-emerald-200" : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50")}>
                  <input type="radio" name="email-classification" checked={classification === "LEGITIMATE"} onChange={() => setClassification("LEGITIMATE")} className="sr-only" />
                  <span className="w-6 h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center text-xs font-bold shrink-0">✓</span>
                  <div>
                    <strong className="text-xs font-bold block">Seems legitimate</strong>
                    <small className="text-[11px] text-slate-500">The warning may have been too cautious.</small>
                  </div>
                </label>
                <label className={cx("p-3.5 rounded-xl border cursor-pointer flex gap-3 items-start transition", classification === "SUSPICIOUS" ? "bg-rose-50 border-rose-300 text-rose-950 ring-2 ring-rose-200" : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50")}>
                  <input type="radio" name="email-classification" checked={classification === "SUSPICIOUS"} onChange={() => setClassification("SUSPICIOUS")} className="sr-only" />
                  <span className="w-6 h-6 rounded-full bg-rose-600 text-white flex items-center justify-center text-xs font-bold shrink-0">!</span>
                  <div>
                    <strong className="text-xs font-bold block">Seems suspicious</strong>
                    <small className="text-[11px] text-slate-500">BantAI may have missed warning signs.</small>
                  </div>
                </label>
              </div>
            </fieldset>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-slate-700">Reason <small className="text-slate-400 font-normal">(optional)</small></span>
              <select value={reason} onChange={(event) => setReason(event.target.value as FeedbackReason | "")} className="h-10 px-3 rounded-xl border border-slate-300 text-xs bg-white focus:ring-2 focus:ring-[#087EFF] outline-none">
                <option value="">Select a reason</option>
                <option value="TRUSTED_OR_OFFICIAL">Trusted or official sender</option>
                <option value="INCORRECT_WARNING">Incorrect warning</option>
                <option value="MISSED_WARNING">Missed suspicious behavior</option>
                <option value="IMPERSONATION_OR_DECEPTIVE">Impersonation or deceptive message</option>
                <option value="OTHER">Other</option>
              </select>
            </label>
            <label className="flex items-start gap-3 p-3.5 rounded-xl bg-blue-50/60 border border-blue-200 cursor-pointer">
              <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} className="mt-0.5 rounded text-[#087EFF]" />
              <div className="text-xs">
                <strong className="text-[#071E4A] block">Include this encrypted email in the reporting workflow.</strong>
                <small className="text-slate-500 block mt-0.5">I understand that an administrator can see the sender and subject, but cannot read the stored email body.</small>
              </div>
            </label>
            <button className="px-5 py-2.5 rounded-xl bg-[#087EFF] hover:bg-[#071E4A] text-white text-xs font-bold shadow-sm transition disabled:opacity-50" disabled={busy || !sender.trim() || !body.trim() || !detectorOutcome || !confirmed}>
              {busy ? "Encrypting and submitting..." : "Submit encrypted report"}
            </button>
          </form>
        </section>
        <aside className="lg:col-span-4 p-6 rounded-2xl bg-gradient-to-br from-[#071E4A] to-[#04142F] text-white flex flex-col justify-between" aria-label="Email training privacy information">
          <div>
            <div className="w-9 h-9 rounded-xl bg-[#087EFF]/20 border border-[#087EFF]/30 flex items-center justify-center text-[#1495FF] mb-3">
              <MailIcon className="w-5 h-5" />
            </div>
            <p className="text-[10px] font-bold text-[#1495FF] uppercase tracking-wider mb-1">ENCRYPTED CONTENT</p>
            <h2 className="text-lg font-bold text-white mb-2">The body is never displayed after submission.</h2>
            <p className="text-xs text-slate-300 leading-relaxed">Administrators can assess the sender, subject, detector result, and your suggested label. The encrypted body is copied to training inventory only after approval.</p>
          </div>
        </aside>
      </div>

      <section className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm">
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
          <div>
            <p className="text-[10px] font-bold text-[#087EFF] uppercase tracking-wider">YOUR SUBMISSIONS</p>
            <h2 className="text-base font-bold text-[#04142F]">{data ? `${data.total} email ${data.total === 1 ? "report" : "reports"}` : "Loading reports..."}</h2>
          </div>
          <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full">Body encrypted</span>
        </div>
        {data && data.items.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">
                <tr>
                  <th className="pb-3 px-3">Email</th>
                  <th className="pb-3 px-3">Detector result</th>
                  <th className="pb-3 px-3">Your label</th>
                  <th className="pb-3 px-3">Training assessment</th>
                  <th className="pb-3 px-3">Submitted</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.items.map((report) => (
                  <tr key={report.id} className="hover:bg-slate-50">
                    <td className="py-3 px-3 max-w-xs">
                      <strong className="block truncate font-semibold text-slate-900" title={report.subject || "No subject"}>{report.subject || "No subject"}</strong>
                      <small className="text-slate-400 block">{report.sender} · {report.provider.toUpperCase()} · Encrypted body included</small>
                    </td>
                    <td className="py-3 px-3"><StatusBadge outcome={report.detector_outcome} /></td>
                    <td className="py-3 px-3"><span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-[#071E4A]">{userClassificationLabel(report.user_classification)}</span></td>
                    <td className="py-3 px-3"><span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">{trainingStatusLabel(report.training_status)}</span></td>
                    <td className="py-3 px-3 text-slate-400 whitespace-nowrap">{niceDate(report.submitted_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : data ? (
          <EmptyState icon="✉" title="No email reports" text="Submit an email above only when you want it considered for future training." />
        ) : (
          <DashboardSkeleton />
        )}
        {data && data.pages > 1 && (
          <div className="flex items-center justify-between pt-4 mt-4 border-t border-slate-100 text-xs text-slate-500">
            <button disabled={page <= 1} onClick={() => setPage((value) => value - 1)} className="px-3 py-1.5 rounded-lg border border-slate-200 font-semibold hover:bg-slate-50 disabled:opacity-40">← Previous</button>
            <span>Page {page} of {data.pages}</span>
            <button disabled={page >= data.pages} onClick={() => setPage((value) => value + 1)} className="px-3 py-1.5 rounded-lg border border-slate-200 font-semibold hover:bg-slate-50 disabled:opacity-40">Next →</button>
          </div>
        )}
      </section>
      <p className="text-[11px] text-slate-400 text-center max-w-2xl mx-auto mt-6 leading-relaxed"><strong>Training reference only.</strong> Submission does not retrain XLM-R V1 or guarantee that the email is legitimate or malicious.</p>
    </>
  );
}

function AdminUrlReportsPage() {
  const [page, setPage] = useState(1);
  const [trainingFilter, setTrainingFilter] = useState("");
  const [classificationFilter, setClassificationFilter] = useState("");
  const [data, setData] = useState<{ items: UrlReport[]; page: number; pages: number; total: number; training_candidate_total: number } | null>(null);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(() => {
    const params = new URLSearchParams({ page: String(page), page_size: "25" });
    if (trainingFilter) params.set("training_status", trainingFilter);
    if (classificationFilter) params.set("classification", classificationFilter);
    return api<{ items: UrlReport[]; page: number; pages: number; total: number; training_candidate_total: number }>(`/admin/url-reports?${params}`)
      .then(setData)
      .catch((reason: ApiError) => setError(reason.message || "BantAI could not load the administrator review queue."));
  }, [classificationFilter, page, trainingFilter]);

  useEffect(() => { void load(); }, [load]);

  const review = async (report: UrlReport, action: AdminReviewAction, assessment?: AdminUrlAssessment) => {
    setBusyId(report.id);
    setError("");
    setMessage("");
    try {
      const result = await api<{ message: string }>(`/admin/url-reports/${report.id}`, {
        method: "PATCH",
        body: JSON.stringify({ action, assessment }),
      });
      setMessage(result.message);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "BantAI could not save this review.");
    } finally {
      setBusyId("");
    }
  };

  const copyUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setMessage("Complete website address copied. Review it using your approved manual process.");
    } catch {
      setError("The website address could not be copied from this browser.");
    }
  };

  return (
    <>
      <PageHeader eyebrow="ADMINISTRATION" title="User reviews" description="View explicit website feedback from users and decide whether each submission belongs in the future URL training inventory." />
      <div className="p-4 rounded-xl bg-blue-50 border border-blue-200 flex items-center gap-3 text-xs text-[#071E4A] mb-6">
        <LockIcon className="w-5 h-5 text-[#087EFF] shrink-0" />
        <div>
          <strong className="block font-bold">Approval does not retrain the live model</strong>
          <p className="text-slate-600 mt-0.5">The queue contains complete addresses from explicit feedback only. BantAI never opens or crawls them, and RF V4-B remains frozen.</p>
        </div>
      </div>
      {error && <Notice type="error">{error}</Notice>}
      {message && <Notice type="success">{message}</Notice>}
      <section className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm mb-6 grid sm:grid-cols-2 gap-3 text-xs">
        <label className="flex flex-col gap-1">
          <span className="font-semibold text-slate-600">Training status</span>
          <select value={trainingFilter} onChange={(event) => { setPage(1); setTrainingFilter(event.target.value); }} className="h-9 px-2.5 rounded-lg border border-slate-300 bg-white text-xs">
            <option value="">All feedback</option>
            <option value="PENDING">Awaiting review</option>
            <option value="APPROVED">Training candidates</option>
            <option value="REJECTED">Rejected</option>
            <option value="INCONCLUSIVE">Inconclusive</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-semibold text-slate-600">User classification</span>
          <select value={classificationFilter} onChange={(event) => { setPage(1); setClassificationFilter(event.target.value); }} className="h-9 px-2.5 rounded-lg border border-slate-300 bg-white text-xs">
            <option value="">All classifications</option>
            <option value="LEGITIMATE">Believes legitimate</option>
            <option value="SUSPICIOUS">Believes suspicious</option>
            <option value="UNSURE">No corrected label</option>
          </select>
        </label>
      </section>

      <section className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm">
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
          <div>
            <p className="text-[10px] font-bold text-[#087EFF] uppercase tracking-wider">USER REVIEW QUEUE</p>
            <h2 className="text-base font-bold text-[#04142F]">{data ? `${data.total} ${data.total === 1 ? "submission" : "submissions"}` : "Loading submissions..."}</h2>
          </div>
          <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full">{data ? `${data.training_candidate_total} approved candidates` : "No reporter identity"}</span>
        </div>

        {data && data.items.length > 0 ? (
          <div className="space-y-4">
            {data.items.map((report) => (
              <article className="p-5 rounded-xl border border-slate-200 bg-slate-50/50 space-y-4" key={report.id}>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200/60">
                  <div>
                    <p className="text-[9px] font-bold text-[#087EFF] uppercase tracking-wider">COMPLETE WEBSITE ADDRESS</p>
                    <h3 className="text-sm font-bold text-slate-900 break-all">{report.url}</h3>
                    <p className="text-xs text-slate-400 mt-0.5">{feedbackReasonLabel(report.feedback_reason)} · {report.similar_report_count || 1} similar {report.similar_report_count === 1 ? "report" : "reports"} · {report.detector_model_version} · Submitted {niceDate(report.submitted_at)}</p>
                  </div>
                  <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 shrink-0" type="button" onClick={() => void copyUrl(report.url)}>
                    <CopyIcon className="w-3.5 h-3.5" />
                    <span>Copy address</span>
                  </button>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Detector result</span>
                    <StatusBadge outcome={report.detector_outcome} />
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1">User feedback</span>
                    <strong className="text-xs font-bold text-slate-800">{feedbackVerdictLabel(report.feedback_verdict)}</strong>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Suggested label</span>
                    <strong className="text-xs font-bold text-slate-800">{userClassificationLabel(report.user_classification)}</strong>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Training status</span>
                    <strong className="text-xs font-bold text-[#087EFF]">{trainingStatusLabel(report.training_status)}</strong>
                    {report.admin_assessment && <small className="text-slate-400 block">{adminAssessmentLabel(report.admin_assessment)}</small>}
                  </div>
                </div>
                {report.training_status === "PENDING" ? (
                  <fieldset className="pt-3 border-t border-slate-200/60 flex flex-wrap items-center gap-2" disabled={busyId === report.id}>
                    <legend className="text-xs font-semibold text-slate-700 mr-2">Store for future model training?</legend>
                    <button type="button" className="px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-300 text-emerald-800 hover:bg-emerald-100 text-xs font-bold" onClick={() => void review(report, "APPROVE", "LEGITIMATE")}>Approve legitimate</button>
                    <button type="button" className="px-3 py-1.5 rounded-lg bg-rose-50 border border-rose-300 text-rose-800 hover:bg-rose-100 text-xs font-bold" onClick={() => void review(report, "APPROVE", "SUSPICIOUS")}>Approve suspicious</button>
                    <button type="button" className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100 text-xs font-semibold" onClick={() => void review(report, "REJECT")}>Reject feedback</button>
                    <button type="button" className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100 text-xs font-semibold" onClick={() => void review(report, "INCONCLUSIVE")}>Inconclusive</button>
                  </fieldset>
                ) : (
                  <div className="pt-3 border-t border-slate-200/60 flex items-center justify-between text-xs text-slate-500">
                    <strong className="text-slate-800">Review complete</strong>
                    <span>{trainingStatusLabel(report.training_status)} · {report.reviewed_at ? niceDate(report.reviewed_at) : "Review time unavailable"}</span>
                  </div>
                )}
              </article>
            ))}
          </div>
        ) : data ? (
          <EmptyState icon="✓" title="No reports in this view" text="New user-submitted website reports will appear here for manual assessment." />
        ) : (
          <DashboardSkeleton />
        )}

        {data && data.pages > 1 && (
          <div className="flex items-center justify-between pt-4 mt-4 border-t border-slate-100 text-xs text-slate-500">
            <button disabled={page <= 1} onClick={() => setPage((value) => value - 1)} className="px-3 py-1.5 rounded-lg border border-slate-200 font-semibold hover:bg-slate-50 disabled:opacity-40">← Previous</button>
            <span>Page {page} of {data.pages}</span>
            <button disabled={page >= data.pages} onClick={() => setPage((value) => value + 1)} className="px-3 py-1.5 rounded-lg border border-slate-200 font-semibold hover:bg-slate-50 disabled:opacity-40">Next →</button>
          </div>
        )}
      </section>
      <p className="text-[11px] text-slate-400 text-center max-w-2xl mx-auto mt-6 leading-relaxed"><strong>An administrator assessment is not a guarantee.</strong> It remains separate from BantAI’s frozen detection models and does not automatically change future outcomes.</p>
    </>
  );
}

function AdminEmailReportsPage() {
  const [page, setPage] = useState(1);
  const [trainingFilter, setTrainingFilter] = useState("");
  const [classificationFilter, setClassificationFilter] = useState("");
  const [data, setData] = useState<{ items: EmailReport[]; page: number; pages: number; total: number; training_candidate_total: number; body_access: string } | null>(null);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(() => {
    const params = new URLSearchParams({ page: String(page), page_size: "25" });
    if (trainingFilter) params.set("training_status", trainingFilter);
    if (classificationFilter) params.set("classification", classificationFilter);
    return api<{ items: EmailReport[]; page: number; pages: number; total: number; training_candidate_total: number; body_access: string }>(`/admin/email-reports?${params}`)
      .then(setData)
      .catch((problem: ApiError) => setError(problem.message || "BantAI could not load email reports."));
  }, [classificationFilter, page, trainingFilter]);

  useEffect(() => { void load(); }, [load]);

  const review = async (report: EmailReport, action: AdminReviewAction, assessment?: AdminUrlAssessment) => {
    setBusyId(report.id);
    setError("");
    setMessage("");
    try {
      const result = await api<{ message: string }>(`/admin/email-reports/${report.id}`, { method: "PATCH", body: JSON.stringify({ action, assessment }) });
      setMessage(result.message);
      await load();
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "BantAI could not save this email report.");
    } finally {
      setBusyId("");
    }
  };

  return (
    <>
      <PageHeader eyebrow="ADMINISTRATION" title="Email reports" description="Assess explicit email submissions without exposing their encrypted body content." />
      <div className="p-4 rounded-xl bg-blue-50 border border-blue-200 flex items-center gap-3 text-xs text-[#071E4A] mb-6">
        <LockIcon className="w-5 h-5 text-[#087EFF] shrink-0" />
        <div>
          <strong className="block font-bold">Email bodies cannot be opened from this interface</strong>
          <p className="text-slate-600 mt-0.5">You can review sender, subject, detector outcome, and the user’s suggested label. Approval copies the existing ciphertext into the de-identified training inventory.</p>
        </div>
      </div>
      {error && <Notice type="error">{error}</Notice>}
      {message && <Notice type="success">{message}</Notice>}
      <section className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm mb-6 grid sm:grid-cols-2 gap-3 text-xs">
        <label className="flex flex-col gap-1">
          <span className="font-semibold text-slate-600">Training status</span>
          <select value={trainingFilter} onChange={(event) => { setPage(1); setTrainingFilter(event.target.value); }} className="h-9 px-2.5 rounded-lg border border-slate-300 bg-white text-xs">
            <option value="">All feedback</option>
            <option value="PENDING">Awaiting review</option>
            <option value="APPROVED">Training candidates</option>
            <option value="REJECTED">Rejected</option>
            <option value="INCONCLUSIVE">Inconclusive</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-semibold text-slate-600">User classification</span>
          <select value={classificationFilter} onChange={(event) => { setPage(1); setClassificationFilter(event.target.value); }} className="h-9 px-2.5 rounded-lg border border-slate-300 bg-white text-xs">
            <option value="">All classifications</option>
            <option value="LEGITIMATE">Believes legitimate</option>
            <option value="SUSPICIOUS">Believes suspicious</option>
          </select>
        </label>
      </section>

      <section className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm">
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
          <div>
            <p className="text-[10px] font-bold text-[#087EFF] uppercase tracking-wider">ENCRYPTED EMAIL REPORT QUEUE</p>
            <h2 className="text-base font-bold text-[#04142F]">{data ? `${data.total} ${data.total === 1 ? "submission" : "submissions"}` : "Loading submissions..."}</h2>
          </div>
          <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full">{data ? `${data.training_candidate_total} approved candidates` : "Body unavailable"}</span>
        </div>

        {data && data.items.length > 0 ? (
          <div className="space-y-4">
            {data.items.map((report) => (
              <article className="p-5 rounded-xl border border-slate-200 bg-slate-50/50 space-y-4" key={report.id}>
                <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-200/60">
                  <div>
                    <p className="text-[9px] font-bold text-[#087EFF] uppercase tracking-wider">{report.provider.toUpperCase()} EMAIL</p>
                    <h3 className="text-sm font-bold text-slate-900">{report.subject || "No subject"}</h3>
                    <p className="text-xs text-slate-400 mt-0.5">From {report.sender} · {report.body_character_count.toLocaleString()} encrypted characters · {report.similar_report_count || 1} similar {(report.similar_report_count || 1) === 1 ? "submission" : "submissions"} · Submitted {niceDate(report.submitted_at)}</p>
                  </div>
                  <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-blue-50 text-[#071E4A] border border-blue-200 shrink-0">Encrypted body</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Detector result</span>
                    <StatusBadge outcome={report.detector_outcome} />
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1">User label</span>
                    <strong className="text-xs font-bold text-slate-800">{userClassificationLabel(report.user_classification)}</strong>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Reason</span>
                    <strong className="text-xs font-bold text-slate-800">{feedbackReasonLabel(report.feedback_reason)}</strong>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Training status</span>
                    <strong className="text-xs font-bold text-[#087EFF]">{trainingStatusLabel(report.training_status)}</strong>
                  </div>
                </div>
                {report.training_status === "PENDING" ? (
                  <fieldset className="pt-3 border-t border-slate-200/60 flex flex-wrap items-center gap-2" disabled={busyId === report.id}>
                    <legend className="text-xs font-semibold text-slate-700 mr-2">Store encrypted content for future training?</legend>
                    <button type="button" className="px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-300 text-emerald-800 hover:bg-emerald-100 text-xs font-bold" onClick={() => void review(report, "APPROVE", "LEGITIMATE")}>Approve legitimate</button>
                    <button type="button" className="px-3 py-1.5 rounded-lg bg-rose-50 border border-rose-300 text-rose-800 hover:bg-rose-100 text-xs font-bold" onClick={() => void review(report, "APPROVE", "SUSPICIOUS")}>Approve suspicious</button>
                    <button type="button" className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100 text-xs font-semibold" onClick={() => void review(report, "REJECT")}>Reject feedback</button>
                    <button type="button" className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100 text-xs font-semibold" onClick={() => void review(report, "INCONCLUSIVE")}>Inconclusive</button>
                  </fieldset>
                ) : (
                  <div className="pt-3 border-t border-slate-200/60 flex items-center justify-between text-xs text-slate-500">
                    <strong className="text-slate-800">Review complete</strong>
                    <span>{trainingStatusLabel(report.training_status)} · {report.reviewed_at ? niceDate(report.reviewed_at) : "Review time unavailable"}</span>
                  </div>
                )}
              </article>
            ))}
          </div>
        ) : data ? (
          <EmptyState icon="✉" title="No email reports in this view" text="Explicit email submissions will appear here without readable body content." />
        ) : (
          <DashboardSkeleton />
        )}

        {data && data.pages > 1 && (
          <div className="flex items-center justify-between pt-4 mt-4 border-t border-slate-100 text-xs text-slate-500">
            <button disabled={page <= 1} onClick={() => setPage((value) => value - 1)} className="px-3 py-1.5 rounded-lg border border-slate-200 font-semibold hover:bg-slate-50 disabled:opacity-40">← Previous</button>
            <span>Page {page} of {data.pages}</span>
            <button disabled={page >= data.pages} onClick={() => setPage((value) => value + 1)} className="px-3 py-1.5 rounded-lg border border-slate-200 font-semibold hover:bg-slate-50 disabled:opacity-40">Next →</button>
          </div>
        )}
      </section>
      <p className="text-[11px] text-slate-400 text-center max-w-2xl mx-auto mt-6 leading-relaxed"><strong>Encrypted reports only.</strong> Approval does not expose the email body or retrain the frozen XLM-R V1 model.</p>
    </>
  );
}

function TrainingDataPage() {
  const [page, setPage] = useState(1);
  const [labelFilter, setLabelFilter] = useState("");
  const [data, setData] = useState<TrainingDataInventory | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [exporting, setExporting] = useState<"URL" | "EMAIL" | null>(null);

  const load = useCallback(() => {
    const params = new URLSearchParams({ page: String(page), page_size: "25" });
    if (labelFilter) params.set("approved_label", labelFilter);
    return api<TrainingDataInventory>(`/admin/training-data?${params}`)
      .then(setData)
      .catch((reason: ApiError) => setError(reason.message || "BantAI could not load the training-data inventory."));
  }, [labelFilter, page]);

  useEffect(() => { void load(); }, [load]);

  const copyUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setMessage("Complete website address copied.");
    } catch {
      setError("The website address could not be copied from this browser.");
    }
  };

  const exportManifest = async (candidateType: "URL" | "EMAIL") => {
    setExporting(candidateType);
    setError("");
    setMessage("");
    try {
      const params = new URLSearchParams({ candidate_type: candidateType });
      if (labelFilter) params.set("approved_label", labelFilter);
      const { blob, filename } = await downloadApiFile(`/admin/training-data/export.csv?${params}`);
      const href = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = href;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(href);
      setMessage(candidateType === "URL" ? "URL training data exported." : "Email training manifest exported. Email bodies and encrypted body values were not included.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : `BantAI could not export the ${candidateType.toLowerCase()} training data.`);
    } finally {
      setExporting(null);
    }
  };

  return (
    <>
      <PageHeader eyebrow="ADMINISTRATION" title="Training data" description="Inspect the approved, de-identified records currently reserved for a future, separately authorized model-training cycle." />
      <div className="grid sm:grid-cols-2 gap-4 mb-6" aria-label="Training data summary">
        <article className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-[#EAF4FF] text-[#087EFF] flex items-center justify-center">
              <GlobeIcon className="w-6 h-6" />
            </div>
            <div>
              <p className="text-[10px] font-bold text-[#087EFF] uppercase tracking-wider">URL MODEL</p>
              <h2 className="text-2xl font-black text-[#04142F]">{data ? data.urls.candidate_total : "—"}</h2>
              <strong className="text-xs font-semibold text-slate-700 block">approved URL candidates</strong>
              <p className="text-[11px] text-slate-400 mt-0.5">{data ? `${data.urls.evidence_total} approved user ${data.urls.evidence_total === 1 ? "review" : "reviews"}` : "Loading evidence count..."}</p>
            </div>
          </div>
          <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-blue-50 text-[#087EFF] border border-blue-200 self-start">{data?.urls.model_version || "RF V4-B"}</span>
        </article>

        <article className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-blue-50 text-[#071E4A] flex items-center justify-center">
              <MailIcon className="w-6 h-6" />
            </div>
            <div>
              <p className="text-[10px] font-bold text-[#087EFF] uppercase tracking-wider">EMAIL MODEL</p>
              <h2 className="text-2xl font-black text-[#04142F]">{data ? data.emails.candidate_total : "—"}</h2>
              <strong className="text-xs font-semibold text-slate-700 block">encrypted email candidates</strong>
              <p className="text-[11px] text-slate-400 mt-0.5">{data ? `${data.emails.evidence_total} approved user ${data.emails.evidence_total === 1 ? "report" : "reports"}` : "Loading collection status..."}</p>
            </div>
          </div>
          <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 border border-slate-200 self-start">{data?.emails.model_version || "XLM-R V1"}</span>
        </article>
      </div>

      <div className="p-4 rounded-xl bg-blue-50 border border-blue-200 flex items-center gap-3 text-xs text-[#071E4A] mb-6">
        <LockIcon className="w-5 h-5 text-[#087EFF] shrink-0" />
        <div>
          <strong className="block font-bold">This inventory does not train the live models</strong>
          <p className="text-slate-600 mt-0.5">Approved URL records and encrypted email content remain de-identified references. Email bodies cannot be opened here, and both frozen models remain unchanged.</p>
        </div>
      </div>

      {error && <Notice type="error">{error}</Notice>}
      {message && <Notice type="success">{message}</Notice>}

      <section className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4 text-xs">
        <label className="flex flex-col gap-1 max-w-xs">
          <span className="font-semibold text-slate-600">Approved training label</span>
          <select value={labelFilter} onChange={(event) => { setPage(1); setLabelFilter(event.target.value); }} className="h-9 px-2.5 rounded-lg border border-slate-300 bg-white text-xs">
            <option value="">All approved labels</option>
            <option value="LEGITIMATE">Legitimate</option>
            <option value="SUSPICIOUS">Suspicious</option>
          </select>
        </label>
        <div className="text-right">
          <p className="text-slate-500"><strong>Separate CSV exports.</strong> URL and email candidates download independently. Email bodies are not included and remain encrypted for a future restricted training process.</p>
          {data && (
            <div className="flex items-center justify-end gap-3 mt-1.5" aria-label="URL candidate label totals">
              <span className="flex items-center gap-1.5 font-bold text-emerald-700"><span className="w-2 h-2 rounded-full bg-emerald-500" />{data.urls.label_counts.LEGITIMATE} legitimate</span>
              <span className="flex items-center gap-1.5 font-bold text-rose-700"><span className="w-2 h-2 rounded-full bg-rose-500" />{data.urls.label_counts.SUSPICIOUS} suspicious</span>
            </div>
          )}
        </div>
      </section>

      <section className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm mb-6" aria-labelledby="url-training-title">
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
          <div>
            <p className="text-[10px] font-bold text-[#087EFF] uppercase tracking-wider">COLLECTED URLS</p>
            <h2 id="url-training-title" className="text-base font-bold text-[#04142F]">Approved URL candidates</h2>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full">No user identity</span>
            <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#087EFF] hover:bg-[#071E4A] text-white text-xs font-bold shadow-sm transition disabled:opacity-50" type="button" onClick={() => void exportManifest("URL")} disabled={exporting !== null || !data || data.urls.candidate_total === 0}>
              <DownloadIcon className="w-3.5 h-3.5" />
              <span>{exporting === "URL" ? "Preparing URL CSV..." : "Export URL CSV"}</span>
            </button>
          </div>
        </div>
        {data && data.urls.items.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">
                <tr>
                  <th className="pb-3 px-3">Complete website address</th>
                  <th className="pb-3 px-3">Approved label</th>
                  <th className="pb-3 px-3">Detector result</th>
                  <th className="pb-3 px-3">Evidence</th>
                  <th className="pb-3 px-3">Model</th>
                  <th className="pb-3 px-3">Last approved</th>
                  <th className="pb-3 px-3"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.urls.items.map((candidate) => (
                  <tr key={candidate.id} className="hover:bg-slate-50">
                    <td className="py-3 px-3 max-w-xs">
                      <strong className="block truncate font-semibold text-slate-900" title={candidate.url}>{candidate.url}</strong>
                      <small className="text-slate-400 block">{feedbackSourceLabel(candidate.feedback_source)} · {feedbackReasonLabel(candidate.feedback_reason)}</small>
                    </td>
                    <td className="py-3 px-3"><span className={cx("text-[10px] font-bold px-2 py-0.5 rounded-full", candidate.approved_label === "LEGITIMATE" ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800")}>{approvedTrainingLabel(candidate.approved_label)}</span></td>
                    <td className="py-3 px-3"><StatusBadge outcome={candidate.detector_outcome} /></td>
                    <td className="py-3 px-3"><strong>{candidate.evidence_count}</strong> {candidate.evidence_count === 1 ? "review" : "reviews"}</td>
                    <td className="py-3 px-3 text-slate-400">{candidate.detector_model_version}</td>
                    <td className="py-3 px-3 text-slate-400 whitespace-nowrap">{niceDate(candidate.last_approved_at)}</td>
                    <td className="py-3 px-3"><button className="text-xs font-bold text-[#087EFF] hover:underline" type="button" onClick={() => void copyUrl(candidate.url)}>Copy address</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : data ? (
          <EmptyState icon="◎" title="No approved URL candidates" text="Approve suitable entries from User reviews before they appear in this training inventory." />
        ) : (
          <DashboardSkeleton />
        )}
        {data && data.urls.pages > 1 && (
          <div className="flex items-center justify-between pt-4 mt-4 border-t border-slate-100 text-xs text-slate-500">
            <button disabled={page <= 1} onClick={() => setPage((value) => value - 1)} className="px-3 py-1.5 rounded-lg border border-slate-200 font-semibold hover:bg-slate-50 disabled:opacity-40">← Previous</button>
            <span>Page {page} of {data.urls.pages}</span>
            <button disabled={page >= data.urls.pages} onClick={() => setPage((value) => value + 1)} className="px-3 py-1.5 rounded-lg border border-slate-200 font-semibold hover:bg-slate-50 disabled:opacity-40">Next →</button>
          </div>
        )}
      </section>

      <section className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm" aria-labelledby="email-training-title">
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
          <div>
            <p className="text-[10px] font-bold text-[#087EFF] uppercase tracking-wider">COLLECTED EMAILS</p>
            <h2 id="email-training-title" className="text-base font-bold text-[#04142F]">Encrypted email candidates</h2>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full">Bodies encrypted</span>
            <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#087EFF] hover:bg-[#071E4A] text-white text-xs font-bold shadow-sm transition disabled:opacity-50" type="button" onClick={() => void exportManifest("EMAIL")} disabled={exporting !== null || !data || data.emails.candidate_total === 0}>
              <DownloadIcon className="w-3.5 h-3.5" />
              <span>{exporting === "EMAIL" ? "Preparing email CSV..." : "Export email CSV"}</span>
            </button>
          </div>
        </div>
        {data && data.emails.items.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">
                <tr>
                  <th className="pb-3 px-3">Email reference</th>
                  <th className="pb-3 px-3">Approved label</th>
                  <th className="pb-3 px-3">Detector result</th>
                  <th className="pb-3 px-3">Training content</th>
                  <th className="pb-3 px-3">Evidence</th>
                  <th className="pb-3 px-3">Model</th>
                  <th className="pb-3 px-3">Last approved</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.emails.items.map((candidate) => (
                  <tr key={candidate.id} className="hover:bg-slate-50">
                    <td className="py-3 px-3 max-w-xs">
                      <strong className="block truncate font-semibold text-slate-900" title={candidate.subject || "No subject"}>{candidate.subject || "No subject"}</strong>
                      <small className="text-slate-400 block">{candidate.sender} · {candidate.provider.toUpperCase()}</small>
                    </td>
                    <td className="py-3 px-3"><span className={cx("text-[10px] font-bold px-2 py-0.5 rounded-full", candidate.approved_label === "LEGITIMATE" ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800")}>{approvedTrainingLabel(candidate.approved_label)}</span></td>
                    <td className="py-3 px-3"><StatusBadge outcome={candidate.detector_outcome} /></td>
                    <td className="py-3 px-3"><span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-[#071E4A]">Encrypted · {candidate.body_character_count.toLocaleString()} chars</span></td>
                    <td className="py-3 px-3 font-bold">{candidate.evidence_count}</td>
                    <td className="py-3 px-3 text-slate-400">{candidate.detector_model_version}</td>
                    <td className="py-3 px-3 text-slate-400 whitespace-nowrap">{niceDate(candidate.last_approved_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : data ? (
          <div className="p-6 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 space-y-1">
            <strong className="text-slate-900 block font-bold">No approved encrypted email candidates.</strong>
            <p>{data.emails.privacy_message}</p>
            <p className="text-slate-400">Users must explicitly submit an email and an administrator must approve it before it appears here.</p>
          </div>
        ) : (
          <DashboardSkeleton />
        )}
        {data && data.emails.pages > 1 && (
          <div className="flex items-center justify-between pt-4 mt-4 border-t border-slate-100 text-xs text-slate-500">
            <button disabled={page <= 1} onClick={() => setPage((value) => value - 1)} className="px-3 py-1.5 rounded-lg border border-slate-200 font-semibold hover:bg-slate-50 disabled:opacity-40">← Previous</button>
            <span>Page {page} of {data.emails.pages}</span>
            <button disabled={page >= data.emails.pages} onClick={() => setPage((value) => value + 1)} className="px-3 py-1.5 rounded-lg border border-slate-200 font-semibold hover:bg-slate-50 disabled:opacity-40">Next →</button>
          </div>
        )}
      </section>
      <p className="text-[11px] text-slate-400 text-center max-w-2xl mx-auto mt-6 leading-relaxed"><strong>Training inventory only.</strong> These records require offline quality checks, dataset versioning, and explicit authorization before any future model work.</p>
    </>
  );
}

function DevicesPage() {
  const [devices, setDevices] = useState<{ id: string; label: string; paired_at: string; last_seen_at: string | null; status: string }[]>([]);
  const [pair, setPair] = useState<{ code: string; expires_at: string } | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(() => api<{ items: typeof devices }>("/devices").then((result) => setDevices(result.items)).catch((reason: ApiError) => setError(reason.message)), []);
  useEffect(() => { load(); }, [load]);
  const createPair = async () => { try { setPair(await api<{ code: string; expires_at: string }>("/pairing", { method: "POST" })); } catch (reason) { setError((reason as Error).message); } };
  const revoke = async (id: string) => { if (!confirm("Revoke this device? It will stop sending activity until paired again.")) return; await api(`/devices/${id}`, { method: "DELETE" }); load(); };
  return (
    <>
      <PageHeader eyebrow="LOCAL COMPANION" title="Paired devices" description="Connect or revoke computers that can send privacy-minimized results to your account." actions={<button className="px-4 py-2 rounded-xl bg-[#087EFF] hover:bg-[#071E4A] text-white text-xs font-bold shadow-sm transition" onClick={createPair}>+ Pair a device</button>} />
      {error && <Notice type="error">{error}</Notice>}
      {pair && (
        <section className="p-6 rounded-2xl bg-gradient-to-r from-[#071E4A] to-[#04142F] text-white flex flex-col sm:flex-row items-center justify-between gap-4 mb-6 shadow-md">
          <div>
            <p className="text-[10px] font-bold text-[#1495FF] uppercase tracking-wider mb-1">ONE-TIME PAIRING CODE</p>
            <h2 className="text-3xl font-mono font-bold tracking-widest">{pair.code.slice(0, 4)} {pair.code.slice(4)}</h2>
            <p className="text-xs text-slate-300 mt-1">Enter this code in the BantAI extension. It expires {relativeTime(pair.expires_at)} and can be used once.</p>
          </div>
          <button onClick={() => navigator.clipboard.writeText(pair.code)} className="px-4 py-2 rounded-xl bg-white text-[#04142F] hover:bg-slate-100 text-xs font-bold shadow-sm transition shrink-0">
            Copy code
          </button>
        </section>
      )}
      <section className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm">
        <div className="mb-4 pb-3 border-b border-slate-100">
          <p className="text-[10px] font-bold text-[#087EFF] uppercase tracking-wider">YOUR COMPUTERS</p>
          <h2 className="text-base font-bold text-[#04142F]">{devices.length} paired {devices.length === 1 ? "device" : "devices"}</h2>
        </div>
        {!devices.length ? (
          <EmptyState icon="◇" title="No devices paired" text="Generate a one-time code, then enter it in the BantAI extension on your computer." />
        ) : (
          <div className="divide-y divide-slate-100">
            {devices.map((device) => (
              <div className="py-4 flex items-center justify-between gap-4" key={device.id}>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center shrink-0">
                    <LaptopIcon className="w-5 h-5" />
                  </div>
                  <div>
                    <strong className="text-sm font-bold text-slate-900 block">{device.label}</strong>
                    <p className="text-xs text-slate-400">Paired {niceDate(device.paired_at)} · Last seen {niceDate(device.last_seen_at)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={cx("text-[10px] font-bold px-2.5 py-1 rounded-full", device.status === "REVOKED" ? "bg-slate-100 text-slate-500" : "bg-emerald-50 text-emerald-800")}>
                    {device.status === "REVOKED" ? "Revoked" : "Active"}
                  </span>
                  {device.status !== "REVOKED" && (
                    <button className="text-xs font-bold text-rose-600 hover:text-rose-800 px-3 py-1.5 rounded-lg border border-rose-200 hover:bg-rose-50 transition" onClick={() => revoke(device.id)}>
                      Revoke
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
      <div className="p-4 rounded-xl bg-blue-50 border border-blue-200 flex items-center gap-3 text-xs text-[#071E4A] mt-6">
        <LockIcon className="w-5 h-5 text-[#087EFF] shrink-0" />
        <div>
          <h3 className="font-bold block">What leaves your computer?</h3>
          <p className="text-slate-600 mt-0.5">Routine activity sends only the final outcome, website origin, or email provider/sender/subject. A complete URL leaves the device only when you explicitly submit a report or feedback; email bodies and AI payloads are never stored in your dashboard.</p>
        </div>
      </div>
    </>
  );
}

function AdminDashboardPage() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<{ distribution: Distribution[] } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { api<{ distribution: Distribution[] }>(`/admin/dashboard?days=${days}`).then(setData).catch((reason: ApiError) => setError(reason.message)); }, [days]);
  return (
    <>
      <PageHeader eyebrow="ADMINISTRATION" title="Platform overview" description="Aggregate outcomes across BantAI. Personal browsing and email metadata remain private." actions={<RangePicker value={days} onChange={setDays} />} />
      {error && <Notice type="error">{error}</Notice>}
      <div className="p-4 rounded-xl bg-blue-50 border border-blue-200 flex items-center gap-3 text-xs text-[#071E4A] mb-6">
        <LockIcon className="w-5 h-5 text-[#087EFF] shrink-0" />
        <div>
          <strong className="block font-bold">Aggregate view only</strong>
          <p className="text-slate-600 mt-0.5">This page intentionally cannot open an individual user’s activity.</p>
        </div>
      </div>
      {data ? <OutcomeChart distribution={data.distribution} /> : <DashboardSkeleton />}
    </>
  );
}

function UsersPage({ currentUser }: { currentUser: User }) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [data, setData] = useState<{ items: User[]; total: number; pages: number } | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(() => {
    const params = new URLSearchParams({ page: String(page), page_size: "25" });
    if (search) params.set("search", search);
    if (statusFilter) params.set("account_status", statusFilter);
    api<{ items: User[]; total: number; pages: number }>(`/admin/users?${params}`).then(setData).catch((reason: ApiError) => setError(reason.message));
  }, [page, search, statusFilter]);
  useEffect(load, [load]);
  const toggle = async (user: User) => {
    const next = user.status === "SUSPENDED" ? "ACTIVE" : "SUSPENDED";
    if (!confirm(`${next === "SUSPENDED" ? "Suspend" : "Reactivate"} ${user.email}?`)) return;
    try { await api(`/admin/users/${user.id}/status?account_status=${next}`, { method: "PATCH" }); load(); } catch (reason) { setError((reason as Error).message); }
  };
  return (
    <>
      <PageHeader eyebrow="ADMINISTRATION" title="Users" description="Manage account access. Detection history and personal activity are not available to administrators." />
      {error && <Notice type="error">{error}</Notice>}
      <section className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm mb-6 grid sm:grid-cols-2 gap-3 text-xs">
        <label className="flex flex-col gap-1">
          <span className="font-semibold text-slate-600">Search accounts</span>
          <input type="search" value={search} onChange={(event) => { setPage(1); setSearch(event.target.value); }} placeholder="Search by name or email" className="h-9 px-3 rounded-lg border border-slate-300 text-xs outline-none focus:ring-2 focus:ring-[#087EFF]" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-semibold text-slate-600">Status</span>
          <select value={statusFilter} onChange={(event) => { setPage(1); setStatusFilter(event.target.value); }} className="h-9 px-2.5 rounded-lg border border-slate-300 bg-white text-xs">
            <option value="">All statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="SUSPENDED">Suspended</option>
          </select>
        </label>
      </section>
      <section className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm">
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
          <div>
            <p className="text-[10px] font-bold text-[#087EFF] uppercase tracking-wider">ACCOUNTS</p>
            <h2 className="text-base font-bold text-[#04142F]">{data ? `${data.total} users` : "Loading users…"}</h2>
          </div>
          <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full">No personal activity access</span>
        </div>
        {data && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">
                <tr>
                  <th className="pb-3 px-3">User</th>
                  <th className="pb-3 px-3">Role</th>
                  <th className="pb-3 px-3">Status</th>
                  <th className="pb-3 px-3">Registered</th>
                  <th className="pb-3 px-3">Last sign-in</th>
                  <th className="pb-3 px-3"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.items.map((user) => (
                  <tr key={user.id} className="hover:bg-slate-50">
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-2.5">
                        <span className="w-7 h-7 rounded-lg bg-[#071E4A] text-white flex items-center justify-center font-bold shrink-0">{userName(user).slice(0, 1).toUpperCase()}</span>
                        <div>
                          <strong className="text-slate-900 block font-semibold">{userName(user)}</strong>
                          <small className="text-slate-400 block">{user.email}</small>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-3">{user.role === "ADMIN" ? "Administrator" : "User"}</td>
                    <td className="py-3 px-3">
                      <span className={cx("text-[10px] font-bold px-2 py-0.5 rounded-full capitalize", user.status === "ACTIVE" ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800")}>
                        {user.status.replaceAll("_", " ").toLowerCase()}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-slate-400 whitespace-nowrap">{niceDate(user.created_at)}</td>
                    <td className="py-3 px-3 text-slate-400 whitespace-nowrap">{niceDate(user.last_login_at)}</td>
                    <td className="py-3 px-3">
                      {user.role !== "ADMIN" && user.id !== currentUser.id && (
                        <button className={cx("text-xs font-bold px-3 py-1 rounded-lg border transition", user.status === "SUSPENDED" ? "border-slate-300 text-slate-700 hover:bg-slate-50" : "border-rose-200 text-rose-600 hover:bg-rose-50")} onClick={() => toggle(user)}>
                          {user.status === "SUSPENDED" ? "Reactivate" : "Suspend"}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && data.pages > 1 && (
          <div className="flex items-center justify-between pt-4 mt-4 border-t border-slate-100 text-xs text-slate-500">
            <button disabled={page <= 1} onClick={() => setPage((value) => value - 1)} className="px-3 py-1.5 rounded-lg border border-slate-200 font-semibold hover:bg-slate-50 disabled:opacity-40">← Previous</button>
            <span>Page {page} of {data.pages}</span>
            <button disabled={page >= data.pages} onClick={() => setPage((value) => value + 1)} className="px-3 py-1.5 rounded-lg border border-slate-200 font-semibold hover:bg-slate-50 disabled:opacity-40">Next →</button>
          </div>
        )}
      </section>
    </>
  );
}

function ProfilePage({ user, onUserChanged, onSignOut }: { user: User; onUserChanged: (user: User) => void; onSignOut: () => Promise<void> }) {
  const [nameBusy, setNameBusy] = useState(false);
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [signOutBusy, setSignOutBusy] = useState(false);
  const [nameMessage, setNameMessage] = useState("");
  const [passwordMessage, setPasswordMessage] = useState("");
  const [error, setError] = useState("");

  const saveName = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setNameBusy(true);
    setError("");
    setNameMessage("");
    const data = Object.fromEntries(new FormData(event.currentTarget));
    try {
      const result = await api<{ user: User; message: string }>("/profile", {
        method: "PATCH",
        body: JSON.stringify({
          first_name: data.first_name,
          middle_name: data.middle_name || null,
          last_name: data.last_name,
        }),
      });
      onUserChanged(result.user);
      setNameMessage(result.message);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "BantAI could not update your profile.");
    } finally {
      setNameBusy(false);
    }
  };

  const changePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPasswordBusy(true);
    setError("");
    setPasswordMessage("");
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form));
    try {
      const passwordError = passwordValidationMessage(data.new_password);
      if (passwordError) throw new Error(passwordError);
      if (data.new_password !== data.confirm_password) throw new Error("New passwords do not match.");
      const result = await api<{ message: string }>("/profile/change-password", {
        method: "POST",
        body: JSON.stringify({ current_password: data.current_password, new_password: data.new_password }),
      });
      form.reset();
      setPasswordMessage(result.message);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "BantAI could not change your password.");
    } finally {
      setPasswordBusy(false);
    }
  };

  const signOut = async () => {
    setSignOutBusy(true);
    setError("");
    try {
      await onSignOut();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "BantAI could not sign you out.");
      setSignOutBusy(false);
    }
  };

  return (
    <>
      <PageHeader eyebrow="YOUR ACCOUNT" title="Profile" description="Update your name, protect your password, and manage this signed-in session." />
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
                <input name="first_name" autoComplete="given-name" maxLength={80} defaultValue={user.first_name} required className="h-10 px-3 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-[#087EFF] outline-none" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-slate-700">Middle name <small className="text-slate-400 font-normal">(optional)</small></span>
                <input name="middle_name" autoComplete="additional-name" maxLength={80} defaultValue={user.middle_name || ""} className="h-10 px-3 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-[#087EFF] outline-none" />
              </label>
              <label className="sm:col-span-2 flex flex-col gap-1">
                <span className="text-xs font-semibold text-slate-700">Last name</span>
                <input name="last_name" autoComplete="family-name" maxLength={80} defaultValue={user.last_name} required className="h-10 px-3 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-[#087EFF] outline-none" />
              </label>
            </div>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-slate-700">Email address</span>
              <input value={user.email} readOnly aria-describedby="email-help" className="h-10 px-3 rounded-xl border border-slate-200 bg-slate-50 text-slate-500 text-xs cursor-not-allowed" />
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
              <input name="current_password" type="password" autoComplete="current-password" maxLength={128} required className="h-10 px-3 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-[#087EFF] outline-none" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-slate-700">New password</span>
              <input name="new_password" type="password" autoComplete="new-password" minLength={12} maxLength={128} aria-describedby="profile-password-requirements" required className="h-10 px-3 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-[#087EFF] outline-none" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-slate-700">Confirm new password</span>
              <input name="confirm_password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required className="h-10 px-3 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-[#087EFF] outline-none" />
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
    </>
  );
}

function Application({ user, onUserChanged, onSignedOut }: { user: User; onUserChanged: (user: User) => void; onSignedOut: () => void }) {
  const initialPage = ((typeof window === "undefined" ? "dashboard" : window.location.pathname.split("/")[1]) || "dashboard") as PageName;
  const allowed = useMemo<PageName[]>(
    () => user.role === "ADMIN" ? ["dashboard", "activity", "message-review", "reports", "email-reports", "devices", "profile", "admin", "review-reports", "admin-email-reports", "training-data", "users"] : ["dashboard", "activity", "message-review", "reports", "email-reports", "devices", "profile"],
    [user.role],
  );
  const [page, setPage] = useState<PageName>(allowed.includes(initialPage) ? initialPage : "dashboard");
  const navigate = (next: PageName) => { history.pushState({}, "", `/${next}`); setPage(next); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const logout = async () => {
    try {
      await api("/auth/logout", { method: "POST" });
    } catch (reason) {
      if (!(reason instanceof ApiError) || reason.status !== 401) throw reason;
    }
    history.replaceState({}, "", "/login");
    onSignedOut();
  };
  useEffect(() => { const handler = () => { const next = (window.location.pathname.split("/")[1] || "dashboard") as PageName; if (allowed.includes(next)) setPage(next); }; window.addEventListener("popstate", handler); return () => window.removeEventListener("popstate", handler); }, [allowed]);
  return (
    <AppShell user={user} page={page} navigate={navigate}>
      {page === "dashboard" && <DashboardPage onViewActivity={() => navigate("activity")} onPairDevice={() => navigate("devices")} />}
      {page === "activity" && <ActivityPage />}
      {page === "message-review" && <MessageReviewPage />}
      {page === "reports" && <UrlReportsPage />}
      {page === "email-reports" && <EmailReportsPage />}
      {page === "devices" && <DevicesPage />}
      {page === "profile" && <ProfilePage user={user} onUserChanged={onUserChanged} onSignOut={logout} />}
      {page === "admin" && user.role === "ADMIN" && <AdminDashboardPage />}
      {page === "review-reports" && user.role === "ADMIN" && <AdminUrlReportsPage />}
      {page === "admin-email-reports" && user.role === "ADMIN" && <AdminEmailReportsPage />}
      {page === "training-data" && user.role === "ADMIN" && <TrainingDataPage />}
      {page === "users" && user.role === "ADMIN" && <UsersPage currentUser={user} />}
    </AppShell>
  );
}

export function BantAIApp() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [startupError, setStartupError] = useState("");
  const [path, setPath] = useState(() => typeof window === "undefined" ? "/" : window.location.pathname);
  const navigatePublic = (next: string) => {
    history.pushState({}, "", next);
    setPath(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const loadSession = useCallback(async () => {
    setLoading(true);
    setStartupError("");
    try {
      const result = await api<{ user: User }>("/auth/me");
      setUser(result.user);
    } catch (reason) {
      setUser(null);
      if (!(reason instanceof ApiError) || reason.status !== 401) {
        setStartupError(reason instanceof Error ? reason.message : "BantAI cannot reach the shared service.");
      }
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    const initial = window.setTimeout(() => void loadSession(), 0);
    return () => window.clearTimeout(initial);
  }, [loadSession]);
  useEffect(() => {
    const handler = () => setPath(window.location.pathname);
    window.addEventListener("popstate", handler);
    return () => window.removeEventListener("popstate", handler);
  }, []);
  if (path === "/") return <LandingPage authenticated={Boolean(user)} onNavigate={navigatePublic} />;
  if (loading) return <LoadingPage />;
  if (startupError) return <LoadingPage error={startupError} onRetry={() => void loadSession()} />;
  if (!user) return <AuthScreen onAuthenticated={setUser} />;
  return <Application user={user} onUserChanged={setUser} onSignedOut={() => setUser(null)} />;
}
