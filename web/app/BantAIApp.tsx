"use client";

import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { api, downloadApiFile, ApiError } from "./api";

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

type PageName = "dashboard" | "activity" | "reports" | "email-reports" | "devices" | "profile" | "admin" | "review-reports" | "admin-email-reports" | "training-data" | "users";

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
  // Older local API versions returned UTC database values without a timezone.
  // Make that UTC explicit before the browser converts it to the device zone.
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
  return (
    <span className={cx("status-badge", `status-${outcome.toLowerCase()}`)}>
      <span className="status-symbol" aria-hidden="true">
        {outcome === "NO_STRONG_WARNING_SIGNS" ? "✓" : outcome === "NEEDS_CAUTION" ? "!" : "×"}
      </span>
      {outcomeInfo(outcome).label}
    </span>
  );
}

function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className={cx("logo", compact && "logo-compact")}>
      <span className="logo-mark" aria-hidden="true">B</span>
      {!compact && (
        <span>
          <strong>BantAI</strong>
          <small>Hybrid decision support</small>
        </span>
      )}
    </div>
  );
}

function Notice({ type = "info", children }: { type?: "info" | "error" | "success"; children: ReactNode }) {
  return <div className={cx("notice", `notice-${type}`)} role={type === "error" ? "alert" : "status"}>{children}</div>;
}

function EmptyState({ icon, title, text }: { icon: string; title: string; text: string }) {
  return (
    <div className="empty-state">
      <span className="empty-icon" aria-hidden="true">{icon}</span>
      <strong>{title}</strong>
      <p>{text}</p>
    </div>
  );
}

function LoadingPage({ error, onRetry }: { error?: string; onRetry?: () => void }) {
  return (
    <main className={cx("loading-page", error && "loading-error")} aria-busy={!error}>
      <Logo />
      {error ? (
        <div className="loading-recovery" role="alert">
          <span className="loading-recovery-icon" aria-hidden="true">!</span>
          <h1>Dashboard service unavailable</h1>
          <p>{error}</p>
          <button className="button primary" onClick={onRetry}>Try again</button>
        </div>
      ) : (
        <>
          <div className="loading-line"><span /></div>
          <p>Preparing your privacy-first dashboard…</p>
        </>
      )}
    </main>
  );
}

function AuthLayout({ children, eyebrow, title, description }: { children: ReactNode; eyebrow: string; title: string; description: string }) {
  return (
    <main className="auth-page">
      <section className="auth-brand-panel">
        <Logo />
        <div className="auth-promise">
          <p className="eyebrow light">LOCAL DETECTION + SHARED INSIGHTS</p>
          <h1>Your browsing stays yours.</h1>
          <p>BantAI analyzes sensitive content on your computer, then shares only minimized outcomes with this dashboard.</p>
          <ul className="privacy-points">
            <li><span aria-hidden="true">✓</span> Email bodies are never saved here</li>
            <li><span aria-hidden="true">✓</span> URL paths and searches stay private</li>
            <li><span aria-hidden="true">✓</span> Clear guidance, never false guarantees</li>
          </ul>
        </div>
        <p className="auth-footnote">BantAI v1.1 · Privacy-first hybrid analysis</p>
      </section>
      <section className="auth-form-panel">
        <div className="auth-form-wrap">
          <div className="mobile-logo"><Logo /></div>
          <p className="eyebrow">{eyebrow}</p>
          <h2>{title}</h2>
          <p className="auth-description">{description}</p>
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
      <form className="auth-form" onSubmit={submit}>
        {isRegister && (
          <div className="signup-name-grid">
            <label>
              <span>First name</span>
              <input name="first_name" autoComplete="given-name" maxLength={80} placeholder="First name" required />
            </label>
            <label>
              <span>Middle name <small>(optional)</small></span>
              <input name="middle_name" autoComplete="additional-name" maxLength={80} placeholder="Middle name" />
            </label>
            <label>
              <span>Last name</span>
              <input name="last_name" autoComplete="family-name" maxLength={80} placeholder="Last name" required />
            </label>
          </div>
        )}
        <label>
          <span>Email address</span>
          <input name="email" type="email" autoComplete="email" placeholder="you@example.com" required />
        </label>
        <label>
          <span>Password</span>
          <input name="password" type="password" autoComplete={isRegister ? "new-password" : "current-password"} minLength={12} maxLength={128} aria-describedby={isRegister ? "password-requirements" : undefined} placeholder={isRegister ? "Create a strong password" : "Your password"} required />
        </label>
        {isRegister && <p id="password-requirements" className="password-requirements">{PASSWORD_REQUIREMENTS}</p>}
        {isRegister && (
          <label>
            <span>Confirm password</span>
            <input name="confirm_password" type="password" autoComplete="new-password" minLength={12} maxLength={128} placeholder="Repeat your password" required />
          </label>
        )}
        <button className="button primary full" disabled={busy}>
          {busy ? "Please wait…" : isRegister ? "Create account" : "Sign in"}
        </button>
      </form>
      <div className="auth-switch">
        {isRegister ? <>Already have an account? <button onClick={() => go("/login")}>Sign in</button></> : <>New to BantAI? <button onClick={() => go("/register")}>Create an account</button></>}
      </div>
    </AuthLayout>
  );
}

function AppShell({ user, page, navigate, children }: { user: User; page: PageName; navigate: (page: PageName) => void; children: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const nav = [
    { id: "dashboard" as const, icon: "⌂", label: "Dashboard" },
    { id: "activity" as const, icon: "≡", label: "Activity" },
    { id: "reports" as const, icon: "!", label: "URL reports" },
    { id: "email-reports" as const, icon: "✉", label: "Email reports" },
    { id: "devices" as const, icon: "◇", label: "Paired devices" },
  ];
  const adminNav = [
    { id: "admin" as const, icon: "▦", label: "Admin overview" },
    { id: "review-reports" as const, icon: "✓", label: "User reviews" },
    { id: "admin-email-reports" as const, icon: "✉", label: "Email reports" },
    { id: "training-data" as const, icon: "◎", label: "Training data" },
    { id: "users" as const, icon: "♙", label: "Users" },
  ];
  return (
    <div className="app-shell">
      <aside className={cx("sidebar", menuOpen && "sidebar-open")}>
        <div className="sidebar-top"><Logo /><button className="mobile-close" onClick={() => setMenuOpen(false)} aria-label="Close menu">×</button></div>
        <nav aria-label="Primary navigation">
          <p className="nav-label">MY BANTAI</p>
          {nav.map((item) => <NavButton key={item.id} item={item} active={page === item.id} onClick={() => { navigate(item.id); setMenuOpen(false); }} />)}
          {user.role === "ADMIN" && <><p className="nav-label admin-label">ADMINISTRATION</p>{adminNav.map((item) => <NavButton key={item.id} item={item} active={page === item.id} onClick={() => { navigate(item.id); setMenuOpen(false); }} />)}</>}
        </nav>
        <div className="sidebar-privacy">
          <span className="privacy-lock" aria-hidden="true">●</span>
          <div><strong>Privacy protected</strong><p>Only minimized results reach this dashboard.</p></div>
        </div>
        <button className={cx("account-card", page === "profile" && "active")} onClick={() => navigate("profile")} title="Open profile">
          <span className="avatar">{userName(user).slice(0, 1).toUpperCase()}</span>
          <span><strong>{userName(user)}</strong><small>{user.email}</small></span>
          <span aria-hidden="true">↗</span>
        </button>
      </aside>
      {menuOpen && <button className="sidebar-scrim" onClick={() => setMenuOpen(false)} aria-label="Close navigation" />}
      <section className="main-column">
        <header className="topbar">
          <button className="menu-button" onClick={() => setMenuOpen(true)} aria-label="Open navigation">☰</button>
          <div className="companion-status"><span /><strong>Account signed in</strong><small>Check device status below</small></div>
          <button className="help-button" title="BantAI help" aria-label="BantAI help">?</button>
        </header>
        <main className="content">{children}</main>
      </section>
    </div>
  );
}

function NavButton({ item, active, onClick }: { item: { id: PageName; icon: string; label: string }; active: boolean; onClick: () => void }) {
  return <button className={cx("nav-button", active && "active")} onClick={onClick}><span aria-hidden="true">{item.icon}</span>{item.label}</button>;
}

function PageHeader({ eyebrow, title, description, actions }: { eyebrow: string; title: string; description: string; actions?: ReactNode }) {
  return (
    <div className="page-header">
      <div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p>{description}</p></div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}

function doughnutGradient(row: Distribution) {
  const colorByOutcome: Record<Outcome, string> = {
    NO_STRONG_WARNING_SIGNS: "var(--teal)",
    NEEDS_CAUTION: "#e09a21",
    SUSPICIOUS_SIGNS_FOUND: "var(--coral)",
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
    <section className="card chart-card" aria-labelledby="outcome-chart-title">
      <div className="card-header"><div><p className="eyebrow">DETECTION OUTCOMES</p><h2 id="outcome-chart-title">What BantAI found</h2></div><span className="privacy-chip">Percent of checks</span></div>
      <div className="chart-rows">
        {distribution.map((row) => (
          <article className="doughnut-panel" key={row.event_type}>
            <div className="doughnut-panel-heading">
              <span className="doughnut-type-icon" aria-hidden="true">{row.event_type === "URL" ? "◎" : "✉"}</span>
              <div><p className="eyebrow">{row.event_type === "URL" ? "WEBSITE DETECTIONS" : "EMAIL DETECTIONS"}</p><h3>{row.event_type === "URL" ? "Website addresses" : "Opened emails"}</h3></div>
            </div>
            <div className="doughnut-layout">
              <div
                className={cx("doughnut-chart", !row.total && "doughnut-empty")}
                style={row.total ? { background: doughnutGradient(row) } : undefined}
                role="img"
                aria-label={row.total ? `${row.event_type}: ${row.outcomes.map((part) => `${outcomeInfo(part.outcome).label} ${part.percentage}%`).join(", ")}` : `${row.event_type}: no checks in this period`}
              >
                <div className="doughnut-center" aria-hidden="true"><span>{row.event_type === "URL" ? "◎" : "✉"}</span><strong>{row.event_type === "URL" ? "Websites" : "Emails"}</strong></div>
              </div>
              <dl className="doughnut-stats">
                {OUTCOMES.map((outcome) => {
                  const part = row.outcomes.find((item) => item.outcome === outcome.value);
                  return (
                    <div className="doughnut-stat" key={outcome.value}>
                      <dt><i className={`legend-${outcome.value.toLowerCase()}`} aria-hidden="true" /><span>{outcome.label}</span></dt>
                      <dd>{part?.percentage || 0}<small>%</small></dd>
                    </div>
                  );
                })}
              </dl>
            </div>
            {!row.total && <p className="doughnut-empty-message">No checks in this period</p>}
          </article>
        ))}
      </div>
      <p className="chart-note">These percentages summarize categorical outcomes. BantAI does not calculate an overall risk score.</p>
    </section>
  );
}

function LatestCard({ type, item }: { type: EventType; item: Activity | null }) {
  const isUrl = type === "URL";
  return (
    <section className="card latest-card">
      <div className="latest-icon" aria-hidden="true">{isUrl ? "◎" : "✉"}</div>
      <div className="latest-copy">
        <p className="eyebrow">LAST {isUrl ? "WEBSITE" : "EMAIL"} CHECKED</p>
        {item ? <><h2>{isUrl ? item.origin : item.subject || "No subject"}</h2><p>{isUrl ? "Address-bar origin only" : `${item.sender || "Sender not shown"} · ${item.provider}`}</p><div className="latest-meta"><StatusBadge outcome={item.outcome} /><time title={niceDate(item.occurred_at)}>{relativeTime(item.occurred_at)}</time></div></> : <><h2>No {isUrl ? "website" : "email"} checks yet</h2><p>{isUrl ? "Browse to an HTTP or HTTPS website after pairing." : "Open an email in Gmail, Outlook, or Yahoo after pairing."}</p></>}
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
    return <section className="card detection-feedback feedback-complete" aria-live="polite"><span className="feedback-icon" aria-hidden="true">✓</span><div><p className="eyebrow">FEEDBACK RECEIVED</p><h2>Thank you for helping improve BantAI.</h2><p>An administrator will review the complete address you explicitly submitted before it can become a future training candidate.</p></div>{onClose && <button className="button ghost" type="button" onClick={onClose}>Close</button>}</section>;
  }

  return (
    <section className="card detection-feedback" aria-labelledby={`feedback-title-${activity.id}`}>
      <span className="feedback-icon" aria-hidden="true">?</span>
      <div className="feedback-content">
        <p className="eyebrow">HELP IMPROVE BANTAI</p>
        <h2 id={`feedback-title-${activity.id}`}>Do you think BantAI got this result right?</h2>
        <p><strong>{activity.origin}</strong> was shown as “{outcomeInfo(activity.outcome).label}.”</p>
        {error && <Notice type="error">{error}</Notice>}
        <form className="feedback-form" onSubmit={submit}>
          <label className="feedback-reason"><span>Complete website address</span><input type="url" inputMode="url" value={reportedUrl} onChange={(event) => setReportedUrl(event.target.value)} placeholder={`${activity.origin || "https://example.com"}/page`} maxLength={2048} autoCapitalize="none" autoComplete="off" spellCheck={false} required /><small>Paste the address shown in the browser, including its path. This address is stored only after you submit feedback.</small></label>
          <fieldset className="feedback-verdict-fieldset"><legend>Select one response</legend><label className={cx("feedback-verdict-choice", verdict === "CORRECT" && "selected", "correct")}><input type="radio" name={`feedback-verdict-${activity.id}`} checked={verdict === "CORRECT"} onChange={() => selectVerdict("CORRECT")} /><span>Yes, looks right</span></label><label className={cx("feedback-verdict-choice", verdict === "INCORRECT" && "selected", "incorrect")}><input type="radio" name={`feedback-verdict-${activity.id}`} checked={verdict === "INCORRECT"} onChange={() => selectVerdict("INCORRECT")} /><span>No, report correction</span></label><label className={cx("feedback-verdict-choice", verdict === "UNSURE" && "selected")}><input type="radio" name={`feedback-verdict-${activity.id}`} checked={verdict === "UNSURE"} onChange={() => selectVerdict("UNSURE")} /><span>Not sure</span></label></fieldset>
          {verdict === "INCORRECT" && <div className="feedback-correction">
            <fieldset className="report-choice-fieldset"><legend>What best describes the website?</legend><label className={cx("report-choice", classification === "LEGITIMATE" && "selected")}><input type="radio" name={`feedback-classification-${activity.id}`} checked={classification === "LEGITIMATE"} onChange={() => setClassification("LEGITIMATE")} /><span className="report-choice-icon legitimate" aria-hidden="true">✓</span><span><strong>Seems legitimate</strong><small>The warning may have been too cautious.</small></span></label><label className={cx("report-choice", classification === "SUSPICIOUS" && "selected")}><input type="radio" name={`feedback-classification-${activity.id}`} checked={classification === "SUSPICIOUS"} onChange={() => setClassification("SUSPICIOUS")} /><span className="report-choice-icon suspicious" aria-hidden="true">!</span><span><strong>Seems suspicious</strong><small>BantAI may have missed warning signs.</small></span></label></fieldset>
            <label className="feedback-reason"><span>Reason <small>(optional)</small></span><select value={reason} onChange={(event) => setReason(event.target.value as FeedbackReason | "")}><option value="">Select a reason</option><option value="TRUSTED_OR_OFFICIAL">Trusted or official website</option><option value="INCORRECT_WARNING">Incorrect warning</option><option value="MISSED_WARNING">Missed suspicious behavior</option><option value="IMPERSONATION_OR_DECEPTIVE">Impersonation or deceptive domain</option><option value="OTHER">Other</option></select></label>
          </div>}
          <div className="feedback-actions"><button className="button primary" type="submit" disabled={busy || !reportedUrl.trim() || !verdict || (verdict === "INCORRECT" && !classification)}>{busy ? "Submitting..." : "Submit feedback"}</button>{onClose && <button className="text-button" type="button" onClick={onClose}>Close</button>}</div>
        </form>
      </div>
    </section>
  );
}

function ActivityTable({ items, compact = false, onFeedback }: { items: Activity[]; compact?: boolean; onFeedback?: (activity: Activity) => void }) {
  if (!items.length) return <EmptyState icon="↗" title="No activity to show" text="Pair BantAI and complete a check. Privacy-minimized results will appear here." />;
  return (
    <div className="table-scroll">
      <table className="data-table">
        <thead><tr><th>Activity</th><th>Details</th><th>Outcome</th><th>Detected</th>{onFeedback && <th>Feedback</th>}</tr></thead>
        <tbody>{items.map((item) => <tr key={item.id}><td><span className="type-cell"><i>{item.event_type === "URL" ? "◎" : "✉"}</i><span><strong>{item.event_type === "URL" ? "Website" : "Email"}</strong><small>{item.event_type === "EMAIL" ? item.provider : "Address bar"}</small></span></span></td><td className="details-cell"><strong>{item.event_type === "URL" ? item.origin : item.subject || "No subject"}</strong>{item.event_type === "EMAIL" && <small>{item.sender || "Sender not shown"}</small>}</td><td><StatusBadge outcome={item.outcome} /></td><td><time title={niceDate(item.occurred_at)}>{compact ? relativeTime(item.occurred_at) : niceDate(item.occurred_at)}</time></td>{onFeedback && <td>{item.event_type === "URL" ? item.feedback_submitted ? <span className="feedback-sent">Submitted</span> : <button className="text-button" type="button" onClick={() => onFeedback(item)}>Give feedback</button> : <span aria-hidden="true">—</span>}</td>}</tr>)}</tbody>
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
      {error && <Notice type="error">{error} <button className="text-button" onClick={load}>Try again</button></Notice>}
      <ConnectionPanel onPairDevice={onPairDevice} />
      {!data ? <DashboardSkeleton /> : <>
        <div className="latest-grid"><LatestCard type="URL" item={data.last_url} /><LatestCard type="EMAIL" item={data.last_email} /></div>
        <OutcomeChart distribution={data.distribution} />
        <section className="card recent-card">
          <div className="card-header"><div><p className="eyebrow">RECENT ACTIVITY</p><h2>Your latest checks</h2></div><button className="button ghost" onClick={onViewActivity}>View all activity <span aria-hidden="true">→</span></button></div>
          <ActivityTable items={data.recent} compact />
        </section>
        <p className="safe-disclaimer"><strong>Remember:</strong> “No strong warning signs” means BantAI did not detect strong warning signs in the checked module. It is not a guarantee that an email or website is legitimate.</p>
      </>}
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
    <article className={cx("card", "connection-item", `connection-${state}`)}>
      <span className="connection-icon" aria-hidden="true">{icon}</span>
      <div className="connection-copy">
        <div className="connection-item-heading">
          <div>{detail && <p className="eyebrow">{detail}</p>}<h3>{title}</h3></div>
          <span className="connection-label">
            <span className="connection-label-symbol" aria-hidden="true">{state === "connected" ? "✓" : state === "waiting" ? "!" : "×"}</span>
            {label}
          </span>
        </div>
        <p>{message}</p>
      </div>
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
    <section className="connections-section" aria-labelledby="connections-title" aria-live="polite">
      <div className="connections-header">
        <div><p className="eyebrow">LIVE PROTECTION STATUS</p><h2 id="connections-title">Protection connections</h2><p>Detection status is shown only after this computer is paired with your account.</p></div>
        <div className="connection-actions">
          {status && <time title={niceDate(status.checked_at)}>Checked {relativeTime(status.checked_at)}</time>}
          <button className="button ghost" onClick={() => void load()} disabled={refreshing}>{refreshing ? "Checking..." : "Refresh status"}</button>
        </div>
      </div>
      {error ? (
        <div className="card connection-error" role="status"><span aria-hidden="true">!</span><div><strong>Companion unavailable</strong><p>{error}</p></div></div>
      ) : status && !status.extension.connected ? (
        <div className="card connection-locked" role="status">
          <span className="connection-lock-icon" aria-hidden="true">◇</span>
          <div>
            <p className="eyebrow">ACCOUNT CONNECTION REQUIRED</p>
            <h3>Detection is off</h3>
            <p>Pair this computer with your BantAI account to enable website and email checks. Detection details remain hidden until pairing is verified.</p>
          </div>
          <button className="button primary" onClick={onPairDevice}>Pair this device</button>
        </div>
      ) : status ? (
        <div className="connection-grid">
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
        <div className="connections-loading" aria-busy="true"><span className="card" /></div>
      )}
    </section>
  );
}

function RangePicker({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return <div className="range-picker" aria-label="Date range">{[7, 30, 90].map((days) => <button key={days} className={value === days ? "active" : ""} onClick={() => onChange(days)}>{days} days</button>)}</div>;
}

function DashboardSkeleton() {
  return <div className="skeleton-wrap" aria-busy="true"><div className="skeleton-row"><span /><span /></div><span className="skeleton-large" /><span className="skeleton-large" /></div>;
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
      <section className="card filter-card">
        <div className="filters">
          <label><span>Type</span><select value={filters.event_type} onChange={(event) => change("event_type", event.target.value)}><option value="">All activity</option><option value="URL">Websites</option><option value="EMAIL">Emails</option></select></label>
          <label><span>Outcome</span><select value={filters.outcome} onChange={(event) => change("outcome", event.target.value)}><option value="">All outcomes</option>{OUTCOMES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
          <label><span>Email provider</span><select value={filters.provider} onChange={(event) => change("provider", event.target.value)}><option value="">All providers</option><option value="gmail">Gmail</option><option value="outlook">Outlook</option><option value="yahoo">Yahoo</option></select></label>
          <label><span>From</span><input type="date" value={filters.date_from} onChange={(event) => change("date_from", event.target.value)} /></label>
          <label><span>To</span><input type="date" value={filters.date_to} onChange={(event) => change("date_to", event.target.value)} /></label>
        </div>
      </section>
      {error && <Notice type="error">{error}</Notice>}
      {feedbackActivity && <DetectionFeedbackCard key={feedbackActivity.id} activity={feedbackActivity} onSubmitted={load} onClose={() => setFeedbackActivity(null)} />}
      <section className="card activity-card">
        <div className="card-header"><div><p className="eyebrow">ALL CHECKS</p><h2>{data ? `${data.total} retained ${data.total === 1 ? "record" : "records"}` : "Loading activity…"}</h2></div><span className="privacy-chip">90-day retention</span></div>
        {data ? <ActivityTable items={data.items} onFeedback={setFeedbackActivity} /> : <DashboardSkeleton />}
        {data && data.pages > 1 && <div className="pagination"><button disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>← Previous</button><span>Page {page} of {data.pages}</span><button disabled={page >= data.pages} onClick={() => setPage((value) => value + 1)}>Next →</button></div>}
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
      <div className="report-layout">
        <section className="card report-form-card" aria-labelledby="new-url-report-title">
          <div className="card-header"><div><p className="eyebrow">NEW REPORT</p><h2 id="new-url-report-title">Enter the website address</h2></div><span className="privacy-chip">Explicit submission</span></div>
          <form className="report-form" onSubmit={submit}>
            <label>
              <span>Website URL</span>
              <input type="url" inputMode="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://example.com" maxLength={2048} autoCapitalize="none" autoComplete="off" spellCheck={false} aria-describedby="url-report-help" required />
            </label>
            <p id="url-report-help" className="form-help">Paste the complete address from your browser. BantAI retains its path for administrator review and future training-data assessment.</p>
            <label>
              <span>What result did BantAI show?</span>
              <select value={detectorOutcome} onChange={(event) => setDetectorOutcome(event.target.value as Outcome | "")} required>
                <option value="">Select the displayed result</option>
                {OUTCOMES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </label>
            <fieldset className="report-choice-fieldset">
              <legend>What do you believe about this website?</legend>
              <label className={cx("report-choice", classification === "LEGITIMATE" && "selected")}>
                <input type="radio" name="classification" value="LEGITIMATE" checked={classification === "LEGITIMATE"} onChange={() => setClassification("LEGITIMATE")} />
                <span className="report-choice-icon legitimate" aria-hidden="true">✓</span>
                <span><strong>Legitimate website</strong><small>The detection may have been too cautious.</small></span>
              </label>
              <label className={cx("report-choice", classification === "SUSPICIOUS" && "selected")}>
                <input type="radio" name="classification" value="SUSPICIOUS" checked={classification === "SUSPICIOUS"} onChange={() => setClassification("SUSPICIOUS")} />
                <span className="report-choice-icon suspicious" aria-hidden="true">!</span>
                <span><strong>Suspicious website</strong><small>The detection may have missed warning signs.</small></span>
              </label>
            </fieldset>
            <label><span>Reason <small>(optional)</small></span><select value={reason} onChange={(event) => setReason(event.target.value as FeedbackReason | "")}><option value="">Select a reason</option><option value="TRUSTED_OR_OFFICIAL">Trusted or official website</option><option value="INCORRECT_WARNING">Incorrect warning</option><option value="MISSED_WARNING">Missed suspicious behavior</option><option value="IMPERSONATION_OR_DECEPTIVE">Impersonation or deceptive domain</option><option value="OTHER">Other</option></select></label>
            <button className="button primary report-submit" disabled={busy || !url.trim() || !detectorOutcome}>{busy ? "Submitting..." : "Submit for review"}</button>
          </form>
        </section>
        <aside className="report-guidance" aria-label="Report privacy information">
          <span aria-hidden="true">◉</span>
          <div><p className="eyebrow">EXPLICIT REPORT</p><h2>Only addresses you submit are collected in full.</h2><p>The complete address is encrypted and shown to an administrator with your classification and detector outcome. Your identity is not included, and ordinary activity history remains origin-only.</p></div>
        </aside>
      </div>
      <section className="card activity-card report-history-card">
        <div className="card-header"><div><p className="eyebrow">YOUR SUBMISSIONS</p><h2>{data ? `${data.total} website ${data.total === 1 ? "report" : "reports"}` : "Loading reports..."}</h2></div><span className="privacy-chip">90-day retention</span></div>
        {data && data.items.length > 0 ? <div className="table-scroll"><table className="data-table report-table"><thead><tr><th>Complete website address</th><th>Detector result</th><th>Your feedback</th><th>Training review</th><th>Submitted</th></tr></thead><tbody>{data.items.map((report) => <tr key={report.id}><td><strong className="origin-cell" title={report.url}>{report.url}</strong><small className="reviewed-date">{feedbackReasonLabel(report.feedback_reason)}</small></td><td><StatusBadge outcome={report.detector_outcome} /></td><td><span className={cx("report-pill", report.user_classification.toLowerCase())}>{feedbackVerdictLabel(report.feedback_verdict)}</span><small className="reviewed-date">{userClassificationLabel(report.user_classification)}</small></td><td><span className={cx("training-pill", report.training_status.toLowerCase())}>{trainingStatusLabel(report.training_status)}</span>{report.reviewed_at && <small className="reviewed-date">Reviewed {niceDate(report.reviewed_at)}</small>}</td><td>{niceDate(report.submitted_at)}</td></tr>)}</tbody></table></div> : data ? <EmptyState icon="!" title="No website reports" text="Enter a website address above when you believe its detection outcome may be wrong." /> : <DashboardSkeleton />}
        {data && data.pages > 1 && <div className="pagination"><button disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>← Previous</button><span>Page {page} of {data.pages}</span><button disabled={page >= data.pages} onClick={() => setPage((value) => value + 1)}>Next →</button></div>}
      </section>
      <p className="safe-disclaimer"><strong>Reports are decision-support feedback.</strong> They do not automatically retrain the frozen detector or guarantee that a website is legitimate or malicious.</p>
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
      <div className="report-layout email-report-layout">
        <section className="card report-form-card" aria-labelledby="new-email-report-title">
          <div className="card-header"><div><p className="eyebrow">NEW EMAIL REPORT</p><h2 id="new-email-report-title">Enter the email details</h2></div><span className="privacy-chip">Explicit submission</span></div>
          <form className="report-form email-report-form" onSubmit={submit}>
            <div className="email-report-fields">
              <label><span>Email provider</span><select value={provider} onChange={(event) => setProvider(event.target.value as typeof provider)}><option value="gmail">Gmail</option><option value="outlook">Outlook</option><option value="yahoo">Yahoo Mail</option></select></label>
              <label><span>Sender</span><input value={sender} onChange={(event) => setSender(event.target.value)} maxLength={320} placeholder="Sender name or address" required /></label>
            </div>
            <label><span>Subject</span><input value={subject} onChange={(event) => setSubject(event.target.value)} maxLength={500} placeholder="Email subject, if available" /></label>
            <label><span>Email body</span><textarea value={body} onChange={(event) => setBody(event.target.value)} maxLength={10000} rows={9} placeholder="Paste the email message here" aria-describedby="email-body-help" required /></label>
            <p id="email-body-help" className="form-help">The body is encrypted before database storage. It cannot be read from the user or administrator interface and is reserved for an approved offline training process.</p>
            <label><span>What result did BantAI show?</span><select value={detectorOutcome} onChange={(event) => setDetectorOutcome(event.target.value as Outcome | "")} required><option value="">Select the displayed result</option>{OUTCOMES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
            <fieldset className="report-choice-fieldset"><legend>What do you believe about this email?</legend><label className={cx("report-choice", classification === "LEGITIMATE" && "selected")}><input type="radio" name="email-classification" checked={classification === "LEGITIMATE"} onChange={() => setClassification("LEGITIMATE")} /><span className="report-choice-icon legitimate" aria-hidden="true">✓</span><span><strong>Seems legitimate</strong><small>The warning may have been too cautious.</small></span></label><label className={cx("report-choice", classification === "SUSPICIOUS" && "selected")}><input type="radio" name="email-classification" checked={classification === "SUSPICIOUS"} onChange={() => setClassification("SUSPICIOUS")} /><span className="report-choice-icon suspicious" aria-hidden="true">!</span><span><strong>Seems suspicious</strong><small>BantAI may have missed warning signs.</small></span></label></fieldset>
            <label><span>Reason <small>(optional)</small></span><select value={reason} onChange={(event) => setReason(event.target.value as FeedbackReason | "")}><option value="">Select a reason</option><option value="TRUSTED_OR_OFFICIAL">Trusted or official sender</option><option value="INCORRECT_WARNING">Incorrect warning</option><option value="MISSED_WARNING">Missed suspicious behavior</option><option value="IMPERSONATION_OR_DECEPTIVE">Impersonation or deceptive message</option><option value="OTHER">Other</option></select></label>
            <label className="training-consent"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /><span><strong>Include this encrypted email in the reporting workflow.</strong><small>I understand that an administrator can see the sender and subject, but cannot read the stored email body.</small></span></label>
            <button className="button primary report-submit" disabled={busy || !sender.trim() || !body.trim() || !detectorOutcome || !confirmed}>{busy ? "Encrypting and submitting..." : "Submit encrypted report"}</button>
          </form>
        </section>
        <aside className="report-guidance" aria-label="Email training privacy information"><span aria-hidden="true">◉</span><div><p className="eyebrow">ENCRYPTED CONTENT</p><h2>The body is never displayed after submission.</h2><p>Administrators can assess the sender, subject, detector result, and your suggested label. The encrypted body is copied to training inventory only after approval.</p></div></aside>
      </div>
      <section className="card activity-card report-history-card">
        <div className="card-header"><div><p className="eyebrow">YOUR SUBMISSIONS</p><h2>{data ? `${data.total} email ${data.total === 1 ? "report" : "reports"}` : "Loading reports..."}</h2></div><span className="privacy-chip">Body encrypted</span></div>
        {data && data.items.length > 0 ? <div className="table-scroll"><table className="data-table report-table"><thead><tr><th>Email</th><th>Detector result</th><th>Your label</th><th>Training assessment</th><th>Submitted</th></tr></thead><tbody>{data.items.map((report) => <tr key={report.id}><td><strong className="origin-cell" title={report.subject || "No subject"}>{report.subject || "No subject"}</strong><small className="reviewed-date">{report.sender} · {report.provider.toUpperCase()} · Encrypted body included</small></td><td><StatusBadge outcome={report.detector_outcome} /></td><td><span className={cx("report-pill", report.user_classification.toLowerCase())}>{userClassificationLabel(report.user_classification)}</span></td><td><span className={cx("training-pill", report.training_status.toLowerCase())}>{trainingStatusLabel(report.training_status)}</span></td><td>{niceDate(report.submitted_at)}</td></tr>)}</tbody></table></div> : data ? <EmptyState icon="✉" title="No email reports" text="Submit an email above only when you want it considered for future training." /> : <DashboardSkeleton />}
        {data && data.pages > 1 && <div className="pagination"><button disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>← Previous</button><span>Page {page} of {data.pages}</span><button disabled={page >= data.pages} onClick={() => setPage((value) => value + 1)}>Next →</button></div>}
      </section>
      <p className="safe-disclaimer"><strong>Training reference only.</strong> Submission does not retrain XLM-R V1 or guarantee that the email is legitimate or malicious.</p>
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
      <section className="admin-privacy-banner"><span aria-hidden="true">◉</span><div><strong>Approval does not retrain the live model</strong><p>The queue contains complete addresses from explicit feedback only. BantAI never opens or crawls them, and RF V4-B remains frozen.</p></div></section>
      {error && <Notice type="error">{error}</Notice>}
      {message && <Notice type="success">{message}</Notice>}
      <section className="card filter-card users-filter">
        <label><span>Training status</span><select value={trainingFilter} onChange={(event) => { setPage(1); setTrainingFilter(event.target.value); }}><option value="">All feedback</option><option value="PENDING">Awaiting review</option><option value="APPROVED">Training candidates</option><option value="REJECTED">Rejected</option><option value="INCONCLUSIVE">Inconclusive</option></select></label>
        <label><span>User classification</span><select value={classificationFilter} onChange={(event) => { setPage(1); setClassificationFilter(event.target.value); }}><option value="">All classifications</option><option value="LEGITIMATE">Believes legitimate</option><option value="SUSPICIOUS">Believes suspicious</option><option value="UNSURE">No corrected label</option></select></label>
      </section>
      <section className="card activity-card admin-report-card">
        <div className="card-header"><div><p className="eyebrow">USER REVIEW QUEUE</p><h2>{data ? `${data.total} ${data.total === 1 ? "submission" : "submissions"}` : "Loading submissions..."}</h2></div><span className="privacy-chip">{data ? `${data.training_candidate_total} approved candidates` : "No reporter identity"}</span></div>
        {data && data.items.length > 0 ? <div className="admin-report-list">{data.items.map((report) => <article className="admin-report-item" key={report.id}>
          <div className="admin-report-origin"><div><p className="eyebrow">COMPLETE WEBSITE ADDRESS</p><h3>{report.url}</h3><p>{feedbackReasonLabel(report.feedback_reason)} · {report.similar_report_count || 1} similar {report.similar_report_count === 1 ? "report" : "reports"} · {report.detector_model_version} · Submitted {niceDate(report.submitted_at)}</p></div><button className="button ghost" type="button" onClick={() => void copyUrl(report.url)}>Copy address</button></div>
          <div className="admin-report-signals"><div><span>Detector result</span><StatusBadge outcome={report.detector_outcome} /></div><div><span>User feedback</span><strong className={cx("report-pill", report.feedback_verdict.toLowerCase())}>{feedbackVerdictLabel(report.feedback_verdict)}</strong></div><div><span>Suggested label</span><strong className={cx("report-pill", report.user_classification.toLowerCase())}>{userClassificationLabel(report.user_classification)}</strong></div><div><span>Training status</span><strong className={cx("training-pill", report.training_status.toLowerCase())}>{trainingStatusLabel(report.training_status)}</strong>{report.admin_assessment && <small className="reviewed-date">{adminAssessmentLabel(report.admin_assessment)}</small>}</div></div>
          {report.training_status === "PENDING" ? <fieldset className="admin-review-actions" disabled={busyId === report.id}><legend>Store for future model training?</legend><button type="button" className="button review-legitimate" onClick={() => void review(report, "APPROVE", "LEGITIMATE")}>Approve legitimate</button><button type="button" className="button review-suspicious" onClick={() => void review(report, "APPROVE", "SUSPICIOUS")}>Approve suspicious</button><button type="button" className="button danger-ghost" onClick={() => void review(report, "REJECT")}>Reject feedback</button><button type="button" className="button ghost" onClick={() => void review(report, "INCONCLUSIVE")}>Inconclusive</button></fieldset> : <div className="admin-review-complete"><strong>Review complete</strong><span>{trainingStatusLabel(report.training_status)} · {report.reviewed_at ? niceDate(report.reviewed_at) : "Review time unavailable"}</span></div>}
        </article>)}</div> : data ? <EmptyState icon="✓" title="No reports in this view" text="New user-submitted website reports will appear here for manual assessment." /> : <DashboardSkeleton />}
        {data && data.pages > 1 && <div className="pagination"><button disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>← Previous</button><span>Page {page} of {data.pages}</span><button disabled={page >= data.pages} onClick={() => setPage((value) => value + 1)}>Next →</button></div>}
      </section>
      <p className="safe-disclaimer"><strong>An administrator assessment is not a guarantee.</strong> It remains separate from BantAI’s frozen detection models and does not automatically change future outcomes.</p>
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
      <section className="admin-privacy-banner"><span aria-hidden="true">◉</span><div><strong>Email bodies cannot be opened from this interface</strong><p>You can review sender, subject, detector outcome, and the user’s suggested label. Approval copies the existing ciphertext into the de-identified training inventory.</p></div></section>
      {error && <Notice type="error">{error}</Notice>}
      {message && <Notice type="success">{message}</Notice>}
      <section className="card filter-card users-filter"><label><span>Training status</span><select value={trainingFilter} onChange={(event) => { setPage(1); setTrainingFilter(event.target.value); }}><option value="">All feedback</option><option value="PENDING">Awaiting review</option><option value="APPROVED">Training candidates</option><option value="REJECTED">Rejected</option><option value="INCONCLUSIVE">Inconclusive</option></select></label><label><span>User classification</span><select value={classificationFilter} onChange={(event) => { setPage(1); setClassificationFilter(event.target.value); }}><option value="">All classifications</option><option value="LEGITIMATE">Believes legitimate</option><option value="SUSPICIOUS">Believes suspicious</option></select></label></section>
      <section className="card activity-card admin-report-card">
        <div className="card-header"><div><p className="eyebrow">ENCRYPTED EMAIL REPORT QUEUE</p><h2>{data ? `${data.total} ${data.total === 1 ? "submission" : "submissions"}` : "Loading submissions..."}</h2></div><span className="privacy-chip">{data ? `${data.training_candidate_total} approved candidates` : "Body unavailable"}</span></div>
        {data && data.items.length > 0 ? <div className="admin-report-list">{data.items.map((report) => <article className="admin-report-item" key={report.id}>
          <div className="admin-report-origin"><div><p className="eyebrow">{report.provider.toUpperCase()} EMAIL</p><h3>{report.subject || "No subject"}</h3><p>From {report.sender} · {report.body_character_count.toLocaleString()} encrypted characters · {report.similar_report_count || 1} similar {(report.similar_report_count || 1) === 1 ? "submission" : "submissions"} · Submitted {niceDate(report.submitted_at)}</p></div><span className="encrypted-content-chip">Encrypted body</span></div>
          <div className="admin-report-signals"><div><span>Detector result</span><StatusBadge outcome={report.detector_outcome} /></div><div><span>User label</span><strong className={cx("report-pill", report.user_classification.toLowerCase())}>{userClassificationLabel(report.user_classification)}</strong></div><div><span>Reason</span><strong>{feedbackReasonLabel(report.feedback_reason)}</strong></div><div><span>Training status</span><strong className={cx("training-pill", report.training_status.toLowerCase())}>{trainingStatusLabel(report.training_status)}</strong></div></div>
          {report.training_status === "PENDING" ? <fieldset className="admin-review-actions" disabled={busyId === report.id}><legend>Store encrypted content for future training?</legend><button type="button" className="button review-legitimate" onClick={() => void review(report, "APPROVE", "LEGITIMATE")}>Approve legitimate</button><button type="button" className="button review-suspicious" onClick={() => void review(report, "APPROVE", "SUSPICIOUS")}>Approve suspicious</button><button type="button" className="button danger-ghost" onClick={() => void review(report, "REJECT")}>Reject feedback</button><button type="button" className="button ghost" onClick={() => void review(report, "INCONCLUSIVE")}>Inconclusive</button></fieldset> : <div className="admin-review-complete"><strong>Review complete</strong><span>{trainingStatusLabel(report.training_status)} · {report.reviewed_at ? niceDate(report.reviewed_at) : "Review time unavailable"}</span></div>}
        </article>)}</div> : data ? <EmptyState icon="✉" title="No email reports in this view" text="Explicit email submissions will appear here without readable body content." /> : <DashboardSkeleton />}
        {data && data.pages > 1 && <div className="pagination"><button disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>← Previous</button><span>Page {page} of {data.pages}</span><button disabled={page >= data.pages} onClick={() => setPage((value) => value + 1)}>Next →</button></div>}
      </section>
      <p className="safe-disclaimer"><strong>Encrypted reports only.</strong> Approval does not expose the email body or retrain the frozen XLM-R V1 model.</p>
    </>
  );
}

function TrainingDataPage() {
  const [page, setPage] = useState(1);
  const [labelFilter, setLabelFilter] = useState("");
  const [data, setData] = useState<TrainingDataInventory | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [exporting, setExporting] = useState(false);

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

  const exportManifest = async () => {
    setExporting(true);
    setError("");
    setMessage("");
    try {
      const params = new URLSearchParams();
      if (labelFilter) params.set("approved_label", labelFilter);
      const suffix = params.size ? `?${params}` : "";
      const { blob, filename } = await downloadApiFile(`/admin/training-data/export.csv${suffix}`);
      const href = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = href;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(href);
      setMessage("Training manifest exported. Email bodies and encrypted body values were not included.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "BantAI could not export the training-data manifest.");
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <PageHeader eyebrow="ADMINISTRATION" title="Training data" description="Inspect the approved, de-identified records currently reserved for a future, separately authorized model-training cycle." actions={<button className="button primary" type="button" onClick={() => void exportManifest()} disabled={exporting || !data || data.urls.candidate_total + data.emails.candidate_total === 0}>{exporting ? "Preparing CSV..." : "Export CSV manifest"}</button>} />
      <section className="training-summary-grid" aria-label="Training data summary">
        <article className="card training-summary-card url-summary">
          <span className="training-summary-icon" aria-hidden="true">◎</span>
          <div><p className="eyebrow">URL MODEL</p><h2>{data ? data.urls.candidate_total : "—"}</h2><strong>approved URL candidates</strong><p>{data ? `${data.urls.evidence_total} approved user ${data.urls.evidence_total === 1 ? "review" : "reviews"}` : "Loading evidence count..."}</p></div>
          <span className="model-version-chip">{data?.urls.model_version || "RF V4-B"}</span>
        </article>
        <article className="card training-summary-card email-summary">
          <span className="training-summary-icon" aria-hidden="true">✉</span>
          <div><p className="eyebrow">EMAIL MODEL</p><h2>{data ? data.emails.candidate_total : "—"}</h2><strong>encrypted email candidates</strong><p>{data ? `${data.emails.evidence_total} approved user ${data.emails.evidence_total === 1 ? "report" : "reports"}` : "Loading collection status..."}</p></div>
          <span className="model-version-chip muted">{data?.emails.model_version || "XLM-R V1"}</span>
        </article>
      </section>
      <section className="admin-privacy-banner"><span aria-hidden="true">◉</span><div><strong>This inventory does not train the live models</strong><p>Approved URL records and encrypted email content remain de-identified references. Email bodies cannot be opened here, and both frozen models remain unchanged.</p></div></section>
      {error && <Notice type="error">{error}</Notice>}
      {message && <Notice type="success">{message}</Notice>}
      <section className="card filter-card training-filter-card">
        <label><span>Approved training label</span><select value={labelFilter} onChange={(event) => { setPage(1); setLabelFilter(event.target.value); }}><option value="">All approved labels</option><option value="LEGITIMATE">Legitimate</option><option value="SUSPICIOUS">Suspicious</option></select></label>
        <div className="training-export-details"><p><strong>CSV manifest only.</strong> Approved labels and review metadata are included. Email bodies are not included and remain encrypted for a future restricted training process.</p>{data && <div className="training-label-totals" aria-label="URL candidate label totals"><span><i className="legend-dot safe" />{data.urls.label_counts.LEGITIMATE} legitimate</span><span><i className="legend-dot suspicious" />{data.urls.label_counts.SUSPICIOUS} suspicious</span></div>}</div>
      </section>
      <section className="card activity-card training-dataset-card" aria-labelledby="url-training-title">
        <div className="card-header"><div><p className="eyebrow">COLLECTED URLS</p><h2 id="url-training-title">Approved URL candidates</h2></div><span className="privacy-chip">No user identity</span></div>
        {data && data.urls.items.length > 0 ? <div className="table-scroll"><table className="data-table training-table"><thead><tr><th>Complete website address</th><th>Approved label</th><th>Detector result</th><th>Evidence</th><th>Model</th><th>Last approved</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{data.urls.items.map((candidate) => <tr key={candidate.id}><td><strong className="origin-cell" title={candidate.url}>{candidate.url}</strong><small className="reviewed-date">{feedbackSourceLabel(candidate.feedback_source)} · {feedbackReasonLabel(candidate.feedback_reason)}</small></td><td><span className={cx("training-label", candidate.approved_label.toLowerCase())}>{approvedTrainingLabel(candidate.approved_label)}</span></td><td><StatusBadge outcome={candidate.detector_outcome} /></td><td><strong>{candidate.evidence_count}</strong> {candidate.evidence_count === 1 ? "review" : "reviews"}</td><td>{candidate.detector_model_version}</td><td>{niceDate(candidate.last_approved_at)}</td><td><button className="text-button" type="button" onClick={() => void copyUrl(candidate.url)}>Copy address</button></td></tr>)}</tbody></table></div> : data ? <EmptyState icon="◎" title="No approved URL candidates" text="Approve suitable entries from User reviews before they appear in this training inventory." /> : <DashboardSkeleton />}
        {data && data.urls.pages > 1 && <div className="pagination"><button disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>← Previous</button><span>Page {page} of {data.urls.pages}</span><button disabled={page >= data.urls.pages} onClick={() => setPage((value) => value + 1)}>Next →</button></div>}
      </section>
      <section className="card activity-card email-training-card" aria-labelledby="email-training-title">
        <div className="email-training-heading"><span className="email-training-icon" aria-hidden="true">✉</span><div><p className="eyebrow">COLLECTED EMAILS</p><h2 id="email-training-title">Encrypted email candidates</h2></div><span className="collection-status encrypted">Bodies encrypted</span></div>
        {data && data.emails.items.length > 0 ? <div className="table-scroll"><table className="data-table training-table email-candidate-table"><thead><tr><th>Email reference</th><th>Approved label</th><th>Detector result</th><th>Training content</th><th>Evidence</th><th>Model</th><th>Last approved</th></tr></thead><tbody>{data.emails.items.map((candidate) => <tr key={candidate.id}><td><strong className="origin-cell" title={candidate.subject || "No subject"}>{candidate.subject || "No subject"}</strong><small className="reviewed-date">{candidate.sender} · {candidate.provider.toUpperCase()}</small></td><td><span className={cx("training-label", candidate.approved_label.toLowerCase())}>{approvedTrainingLabel(candidate.approved_label)}</span></td><td><StatusBadge outcome={candidate.detector_outcome} /></td><td><span className="encrypted-content-chip">Encrypted · {candidate.body_character_count.toLocaleString()} chars</span></td><td><strong>{candidate.evidence_count}</strong></td><td>{candidate.detector_model_version}</td><td>{niceDate(candidate.last_approved_at)}</td></tr>)}</tbody></table></div> : data ? <div className="email-training-empty"><strong>No approved encrypted email candidates.</strong><p>{data.emails.privacy_message}</p><p>Users must explicitly submit an email and an administrator must approve it before it appears here.</p></div> : <DashboardSkeleton />}
        {data && data.emails.pages > 1 && <div className="pagination"><button disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>← Previous</button><span>Page {page} of {data.emails.pages}</span><button disabled={page >= data.emails.pages} onClick={() => setPage((value) => value + 1)}>Next →</button></div>}
      </section>
      <p className="safe-disclaimer"><strong>Training inventory only.</strong> These records require offline quality checks, dataset versioning, and explicit authorization before any future model work.</p>
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
      <PageHeader eyebrow="LOCAL COMPANION" title="Paired devices" description="Connect or revoke computers that can send privacy-minimized results to your account." actions={<button className="button primary" onClick={createPair}>+ Pair a device</button>} />
      {error && <Notice type="error">{error}</Notice>}
      {pair && <section className="pairing-panel"><div><p className="eyebrow light">ONE-TIME PAIRING CODE</p><h2>{pair.code.slice(0, 4)} {pair.code.slice(4)}</h2><p>Enter this code in the BantAI extension. It expires {relativeTime(pair.expires_at)} and can be used once.</p></div><button onClick={() => navigator.clipboard.writeText(pair.code)} className="button light">Copy code</button></section>}
      <section className="card devices-card">
        <div className="card-header"><div><p className="eyebrow">YOUR COMPUTERS</p><h2>{devices.length} paired {devices.length === 1 ? "device" : "devices"}</h2></div></div>
        {!devices.length ? <EmptyState icon="◇" title="No devices paired" text="Generate a one-time code, then enter it in the BantAI extension on your computer." /> : <div className="device-list">{devices.map((device) => <div className="device-row" key={device.id}><span className="device-icon">▱</span><div><strong>{device.label}</strong><p>Paired {niceDate(device.paired_at)} · Last seen {niceDate(device.last_seen_at)}</p></div><span className={cx("device-status", device.status === "REVOKED" && "revoked")}>{device.status === "REVOKED" ? "Revoked" : "Active"}</span>{device.status !== "REVOKED" && <button className="button danger-ghost" onClick={() => revoke(device.id)}>Revoke</button>}</div>)}</div>}
      </section>
      <section className="privacy-explainer"><span aria-hidden="true">◉</span><div><h3>What leaves your computer?</h3><p>Routine activity sends only the final outcome, website origin, or email provider/sender/subject. A complete URL leaves the device only when you explicitly submit a report or feedback; email bodies and AI payloads are never stored in your dashboard.</p></div></section>
    </>
  );
}

function AdminDashboardPage() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<{ distribution: Distribution[] } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { api<{ distribution: Distribution[] }>(`/admin/dashboard?days=${days}`).then(setData).catch((reason: ApiError) => setError(reason.message)); }, [days]);
  return <><PageHeader eyebrow="ADMINISTRATION" title="Platform overview" description="Aggregate outcomes across BantAI. Personal browsing and email metadata remain private." actions={<RangePicker value={days} onChange={setDays} />} />{error && <Notice type="error">{error}</Notice>}<section className="admin-privacy-banner"><span>◉</span><div><strong>Aggregate view only</strong><p>This page intentionally cannot open an individual user’s activity.</p></div></section>{data ? <OutcomeChart distribution={data.distribution} /> : <DashboardSkeleton />}</>;
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
      <section className="card filter-card users-filter"><label className="search-field"><span>Search accounts</span><input type="search" value={search} onChange={(event) => { setPage(1); setSearch(event.target.value); }} placeholder="Search by name or email" /></label><label><span>Status</span><select value={statusFilter} onChange={(event) => { setPage(1); setStatusFilter(event.target.value); }}><option value="">All statuses</option><option value="ACTIVE">Active</option><option value="SUSPENDED">Suspended</option></select></label></section>
      <section className="card activity-card"><div className="card-header"><div><p className="eyebrow">ACCOUNTS</p><h2>{data ? `${data.total} users` : "Loading users…"}</h2></div><span className="privacy-chip">No personal activity access</span></div>
        {data && <div className="table-scroll"><table className="data-table user-table"><thead><tr><th>User</th><th>Role</th><th>Status</th><th>Registered</th><th>Last sign-in</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{data.items.map((user) => <tr key={user.id}><td><span className="user-cell"><i>{userName(user).slice(0, 1).toUpperCase()}</i><span><strong>{userName(user)}</strong><small>{user.email}</small></span></span></td><td>{user.role === "ADMIN" ? "Administrator" : "User"}</td><td><span className={cx("account-status", `account-${user.status.toLowerCase()}`)}>{user.status.replaceAll("_", " ").toLowerCase()}</span></td><td>{niceDate(user.created_at)}</td><td>{niceDate(user.last_login_at)}</td><td>{user.role !== "ADMIN" && user.id !== currentUser.id && <button className={cx("button", user.status === "SUSPENDED" ? "ghost" : "danger-ghost")} onClick={() => toggle(user)}>{user.status === "SUSPENDED" ? "Reactivate" : "Suspend"}</button>}</td></tr>)}</tbody></table></div>}
        {data && data.pages > 1 && <div className="pagination"><button disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>← Previous</button><span>Page {page} of {data.pages}</span><button disabled={page >= data.pages} onClick={() => setPage((value) => value + 1)}>Next →</button></div>}
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
      <div className="profile-grid">
        <section className="card profile-card" aria-labelledby="personal-details-title">
          <div className="card-header"><div><p className="eyebrow">PERSONAL DETAILS</p><h2 id="personal-details-title">Your name</h2></div><span className="profile-avatar" aria-hidden="true">{userName(user).slice(0, 1).toUpperCase()}</span></div>
          <form className="profile-form" onSubmit={saveName}>
            <div className="profile-name-grid">
              <label><span>First name</span><input name="first_name" autoComplete="given-name" maxLength={80} defaultValue={user.first_name} required /></label>
              <label><span>Middle name <small>(optional)</small></span><input name="middle_name" autoComplete="additional-name" maxLength={80} defaultValue={user.middle_name || ""} /></label>
              <label><span>Last name</span><input name="last_name" autoComplete="family-name" maxLength={80} defaultValue={user.last_name} required /></label>
            </div>
            <label><span>Email address</span><input value={user.email} readOnly aria-describedby="email-help" /></label>
            <p id="email-help" className="form-help">Email changes are not available in this MVP.</p>
            {nameMessage && <Notice type="success">{nameMessage}</Notice>}
            <button className="button primary profile-submit" disabled={nameBusy}>{nameBusy ? "Saving..." : "Save name"}</button>
          </form>
        </section>

        <section className="card profile-card" aria-labelledby="password-title">
          <div className="card-header"><div><p className="eyebrow">ACCOUNT SECURITY</p><h2 id="password-title">Change password</h2></div><span className="privacy-chip">Strong password</span></div>
          <form className="profile-form" onSubmit={changePassword}>
            <label><span>Current password</span><input name="current_password" type="password" autoComplete="current-password" maxLength={128} required /></label>
            <label><span>New password</span><input name="new_password" type="password" autoComplete="new-password" minLength={12} maxLength={128} aria-describedby="profile-password-requirements" required /></label>
            <label><span>Confirm new password</span><input name="confirm_password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required /></label>
            <p id="profile-password-requirements" className="form-help">{PASSWORD_REQUIREMENTS} Changing your password closes your other signed-in web sessions.</p>
            {passwordMessage && <Notice type="success">{passwordMessage}</Notice>}
            <button className="button primary profile-submit" disabled={passwordBusy}>{passwordBusy ? "Updating..." : "Change password"}</button>
          </form>
        </section>
      </div>

      <section className="card sign-out-card">
        <div><p className="eyebrow">CURRENT SESSION</p><h2>Sign out of BantAI</h2><p>This closes this web session. Your paired Companion continues local protection.</p></div>
        <button className="button danger-ghost" onClick={signOut} disabled={signOutBusy}>{signOutBusy ? "Signing out..." : "Sign out"}</button>
      </section>
    </>
  );
}

function Application({ user, onUserChanged, onSignedOut }: { user: User; onUserChanged: (user: User) => void; onSignedOut: () => void }) {
  const initialPage = ((typeof window === "undefined" ? "dashboard" : window.location.pathname.split("/")[1]) || "dashboard") as PageName;
  const allowed = useMemo<PageName[]>(
    () => user.role === "ADMIN" ? ["dashboard", "activity", "reports", "email-reports", "devices", "profile", "admin", "review-reports", "admin-email-reports", "training-data", "users"] : ["dashboard", "activity", "reports", "email-reports", "devices", "profile"],
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
  if (loading) return <LoadingPage />;
  if (startupError) return <LoadingPage error={startupError} onRetry={() => void loadSession()} />;
  if (!user) return <AuthScreen onAuthenticated={setUser} />;
  return <Application user={user} onUserChanged={setUser} onSignedOut={() => setUser(null)} />;
}
