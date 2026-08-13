"use client";

import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { api, ApiError } from "./api";

type Role = "USER" | "ADMIN";
type UserStatus = "PENDING_VERIFICATION" | "ACTIVE" | "SUSPENDED";
type Outcome = "NO_STRONG_WARNING_SIGNS" | "NEEDS_CAUTION" | "SUSPICIOUS_SIGNS_FOUND";
type EventType = "URL" | "EMAIL";

type User = {
  id: string;
  email: string;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  full_name: string;
  role: Role;
  status: UserStatus;
  verified_at: string | null;
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

type PageName = "dashboard" | "activity" | "devices" | "profile" | "admin" | "users";

const OUTCOMES: { value: Outcome; label: string; short: string }[] = [
  { value: "NO_STRONG_WARNING_SIGNS", label: "No strong warning signs", short: "No warning signs" },
  { value: "NEEDS_CAUTION", label: "Needs caution", short: "Caution" },
  { value: "SUSPICIOUS_SIGNS_FOUND", label: "Suspicious signs found", short: "Suspicious" },
];

function cx(...values: (string | false | null | undefined)[]) {
  return values.filter(Boolean).join(" ");
}

function outcomeInfo(outcome: Outcome) {
  return OUTCOMES.find((item) => item.value === outcome) || OUTCOMES[1];
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

function LoadingPage() {
  return (
    <main className="loading-page" aria-busy="true">
      <Logo />
      <div className="loading-line"><span /></div>
      <p>Preparing your privacy-first dashboard…</p>
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
  const [path, setPath] = useState(() => (typeof window === "undefined" ? "/login" : window.location.pathname));
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(() => path === "/verify-email");

  const go = (next: string) => {
    history.pushState({}, "", next);
    setPath(next);
    setMessage("");
    setError("");
  };

  useEffect(() => {
    const handler = () => setPath(window.location.pathname);
    window.addEventListener("popstate", handler);
    return () => window.removeEventListener("popstate", handler);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");
    if (path === "/verify-email" && token) {
      api<{ message: string }>("/auth/verify-email", { method: "POST", body: JSON.stringify({ token }) })
        .then((result) => setMessage(result.message))
        .catch((reason: ApiError) => setError(reason.message))
        .finally(() => setBusy(false));
    }
  }, [path]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    const data = Object.fromEntries(new FormData(event.currentTarget));
    try {
      if (path === "/register") {
        if (data.password !== data.confirm_password) throw new Error("Passwords do not match.");
        const result = await api<{ message: string }>("/auth/register", {
          method: "POST",
          body: JSON.stringify({
            first_name: data.first_name,
            middle_name: data.middle_name || null,
            last_name: data.last_name,
            email: data.email,
            password: data.password,
          }),
        });
        setMessage(result.message);
      } else if (path === "/forgot-password") {
        const result = await api<{ message: string }>("/auth/request-password-reset", {
          method: "POST",
          body: JSON.stringify({ email: data.email }),
        });
        setMessage(result.message);
      } else if (path === "/reset-password") {
        if (data.password !== data.confirm_password) throw new Error("Passwords do not match.");
        const token = new URLSearchParams(window.location.search).get("token") || "";
        const result = await api<{ message: string }>("/auth/reset-password", {
          method: "POST",
          body: JSON.stringify({ token, password: data.password }),
        });
        setMessage(result.message);
      } else {
        const result = await api<{ user: User }>("/auth/login", {
          method: "POST",
          body: JSON.stringify({ email: data.email, password: data.password }),
        });
        history.replaceState({}, "", "/dashboard");
        onAuthenticated(result.user);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "BantAI could not complete that request.");
    } finally {
      setBusy(false);
    }
  };

  if (path === "/verify-email") {
    return (
      <AuthLayout eyebrow="EMAIL VERIFICATION" title={busy ? "Checking your link…" : message ? "Email verified" : "We couldn’t verify that link"} description={message || error || "Please wait while BantAI validates your secure link."}>
        {message && <Notice type="success">{message}</Notice>}
        {error && <Notice type="error">{error}</Notice>}
        <button className="button primary full" onClick={() => go("/login")}>Continue to sign in</button>
      </AuthLayout>
    );
  }

  const isRegister = path === "/register";
  const isForgot = path === "/forgot-password";
  const isReset = path === "/reset-password";
  const title = isRegister ? "Create your account" : isForgot ? "Reset your password" : isReset ? "Choose a new password" : "Welcome back";
  const description = isRegister
    ? "Verify your email, then connect BantAI in a few guided steps."
    : isForgot
      ? "We’ll email a secure reset link if the account is eligible."
      : isReset
        ? "Use at least 12 characters for a strong new password."
        : "Sign in to review your recent website and email checks.";

  return (
    <AuthLayout eyebrow={isRegister ? "GET STARTED" : isForgot || isReset ? "ACCOUNT RECOVERY" : "SECURE SIGN IN"} title={title} description={description}>
      {message && <Notice type="success">{message}</Notice>}
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
        {!isReset && (
          <label>
            <span>Email address</span>
            <input name="email" type="email" autoComplete="email" placeholder="you@example.com" required />
          </label>
        )}
        {!isForgot && (
          <label>
            <span>{isReset ? "New password" : "Password"}</span>
            <input name="password" type="password" autoComplete={isRegister ? "new-password" : "current-password"} minLength={12} placeholder="At least 12 characters" required />
          </label>
        )}
        {(isRegister || isReset) && (
          <label>
            <span>Confirm password</span>
            <input name="confirm_password" type="password" autoComplete="new-password" minLength={12} placeholder="Repeat your password" required />
          </label>
        )}
        {!isRegister && !isForgot && !isReset && (
          <button type="button" className="text-button align-right" onClick={() => go("/forgot-password")}>Forgot password?</button>
        )}
        <button className="button primary full" disabled={busy}>
          {busy ? "Please wait…" : isRegister ? "Create account" : isForgot ? "Send reset link" : isReset ? "Update password" : "Sign in"}
        </button>
      </form>
      <div className="auth-switch">
        {isRegister ? <>Already have an account? <button onClick={() => go("/login")}>Sign in</button></> : isForgot || isReset ? <button onClick={() => go("/login")}>← Back to sign in</button> : <>New to BantAI? <button onClick={() => go("/register")}>Create an account</button></>}
      </div>
    </AuthLayout>
  );
}

function AppShell({ user, page, navigate, children }: { user: User; page: PageName; navigate: (page: PageName) => void; children: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const nav = [
    { id: "dashboard" as const, icon: "⌂", label: "Dashboard" },
    { id: "activity" as const, icon: "≡", label: "Activity" },
    { id: "devices" as const, icon: "◇", label: "Paired devices" },
  ];
  const adminNav = [
    { id: "admin" as const, icon: "▦", label: "Admin overview" },
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
          <div className="companion-status"><span /><strong>Companion ready</strong><small>Local protection active</small></div>
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

function OutcomeChart({ distribution }: { distribution: Distribution[] }) {
  return (
    <section className="card chart-card" aria-labelledby="outcome-chart-title">
      <div className="card-header"><div><p className="eyebrow">DETECTION OUTCOMES</p><h2 id="outcome-chart-title">What BantAI found</h2></div><span className="privacy-chip">Percent of checks</span></div>
      <div className="legend">{OUTCOMES.map((item) => <span key={item.value}><i className={`legend-${item.value.toLowerCase()}`} />{item.short}</span>)}</div>
      <div className="chart-rows">
        {distribution.map((row) => (
          <div className="chart-row" key={row.event_type}>
            <div className="chart-row-heading"><span>{row.event_type === "URL" ? "Website addresses" : "Opened emails"}</span><strong>{row.total} {row.total === 1 ? "check" : "checks"}</strong></div>
            {row.total ? (
              <div className="stacked-bar" role="img" aria-label={`${row.event_type}: ${row.outcomes.map((part) => `${outcomeInfo(part.outcome).label} ${part.percentage}%`).join(", ")}`}>
                {row.outcomes.map((part) => <span key={part.outcome} className={`segment segment-${part.outcome.toLowerCase()}`} style={{ width: `${part.percentage}%` }} title={`${outcomeInfo(part.outcome).label}: ${part.count} (${part.percentage}%)`} />)}
              </div>
            ) : <div className="empty-bar">No checks in this period</div>}
            <div className="chart-counts">{row.outcomes.map((part) => <span key={part.outcome}><strong>{part.count}</strong> {outcomeInfo(part.outcome).short}</span>)}</div>
          </div>
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

function ActivityTable({ items, compact = false }: { items: Activity[]; compact?: boolean }) {
  if (!items.length) return <EmptyState icon="↗" title="No activity to show" text="Pair BantAI and complete a check. Privacy-minimized results will appear here." />;
  return (
    <div className="table-scroll">
      <table className="data-table">
        <thead><tr><th>Activity</th><th>Details</th><th>Outcome</th><th>Detected</th></tr></thead>
        <tbody>{items.map((item) => <tr key={item.id}><td><span className="type-cell"><i>{item.event_type === "URL" ? "◎" : "✉"}</i><span><strong>{item.event_type === "URL" ? "Website" : "Email"}</strong><small>{item.event_type === "EMAIL" ? item.provider : "Address bar"}</small></span></span></td><td className="details-cell"><strong>{item.event_type === "URL" ? item.origin : item.subject || "No subject"}</strong>{item.event_type === "EMAIL" && <small>{item.sender || "Sender not shown"}</small>}</td><td><StatusBadge outcome={item.outcome} /></td><td><time title={niceDate(item.occurred_at)}>{compact ? relativeTime(item.occurred_at) : niceDate(item.occurred_at)}</time></td></tr>)}</tbody>
      </table>
    </div>
  );
}

function DashboardPage({ onViewActivity }: { onViewActivity: () => void }) {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(() => {
    api<DashboardData>(`/dashboard?days=${days}`).then(setData).catch((reason: ApiError) => setError(reason.message));
  }, [days]);
  useEffect(load, [load]);
  return (
    <>
      <PageHeader eyebrow="PERSONAL OVERVIEW" title="Good to see you." description="A clear view of your recent BantAI checks—without storing sensitive content." actions={<RangePicker value={days} onChange={setDays} />} />
      {error && <Notice type="error">{error} <button className="text-button" onClick={load}>Try again</button></Notice>}
      <ConnectionPanel />
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

function ConnectionPanel() {
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

  const extensionState = status?.extension.connected ? "connected" : "waiting";
  const localState = status?.local_models.connected ? "connected" : "waiting";
  const cloudState = status?.cloud_ai.connected
    ? "connected"
    : status?.cloud_ai.platform_reachable
      ? "waiting"
      : "unavailable";

  return (
    <section className="connections-section" aria-labelledby="connections-title" aria-live="polite">
      <div className="connections-header">
        <div><p className="eyebrow">LIVE PROTECTION STATUS</p><h2 id="connections-title">Protection connections</h2><p>Confirms that the extension can reach the local detectors and Cloud AI gateway.</p></div>
        <div className="connection-actions">
          {status && <time title={niceDate(status.checked_at)}>Checked {relativeTime(status.checked_at)}</time>}
          <button className="button ghost" onClick={() => void load()} disabled={refreshing}>{refreshing ? "Checking..." : "Refresh status"}</button>
        </div>
      </div>
      {error ? (
        <div className="card connection-error" role="status"><span aria-hidden="true">!</span><div><strong>Companion unavailable</strong><p>{error}</p></div></div>
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
            label={status.extension.connected ? "Paired" : "Not paired"}
            state={extensionState}
            detail={status.extension.device_label || "This computer"}
            message={status.extension.message}
          />
        </div>
      ) : (
        <div className="connections-loading" aria-busy="true"><span className="card" /><span className="card" /><span className="card" /></div>
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
  const [error, setError] = useState("");
  const query = useMemo(() => {
    const params = new URLSearchParams({ page: String(page), page_size: "25" });
    Object.entries(filters).forEach(([key, value]) => value && params.set(key, key.startsWith("date_") ? new Date(`${value}T${key === "date_to" ? "23:59:59" : "00:00:00"}`).toISOString() : value));
    return params.toString();
  }, [filters, page]);
  useEffect(() => { api<typeof data>(`/activities?${query}`).then(setData).catch((reason: ApiError) => setError(reason.message)); }, [query]);
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
      <section className="card activity-card">
        <div className="card-header"><div><p className="eyebrow">ALL CHECKS</p><h2>{data ? `${data.total} retained ${data.total === 1 ? "record" : "records"}` : "Loading activity…"}</h2></div><span className="privacy-chip">90-day retention</span></div>
        {data ? <ActivityTable items={data.items} /> : <DashboardSkeleton />}
        {data && data.pages > 1 && <div className="pagination"><button disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>← Previous</button><span>Page {page} of {data.pages}</span><button disabled={page >= data.pages} onClick={() => setPage((value) => value + 1)}>Next →</button></div>}
      </section>
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
      <section className="privacy-explainer"><span aria-hidden="true">◉</span><div><h3>What leaves your computer?</h3><p>Only the final outcome, website origin, or email provider/sender/subject. Complete URLs, email bodies, and AI payloads are never stored in your dashboard.</p></div></section>
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
      <section className="card filter-card users-filter"><label className="search-field"><span>Search accounts</span><input type="search" value={search} onChange={(event) => { setPage(1); setSearch(event.target.value); }} placeholder="Search by name or email" /></label><label><span>Status</span><select value={statusFilter} onChange={(event) => { setPage(1); setStatusFilter(event.target.value); }}><option value="">All statuses</option><option value="ACTIVE">Active</option><option value="PENDING_VERIFICATION">Pending verification</option><option value="SUSPENDED">Suspended</option></select></label></section>
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
          <div className="card-header"><div><p className="eyebrow">ACCOUNT SECURITY</p><h2 id="password-title">Change password</h2></div><span className="privacy-chip">12+ characters</span></div>
          <form className="profile-form" onSubmit={changePassword}>
            <label><span>Current password</span><input name="current_password" type="password" autoComplete="current-password" maxLength={128} required /></label>
            <label><span>New password</span><input name="new_password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required /></label>
            <label><span>Confirm new password</span><input name="confirm_password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required /></label>
            <p className="form-help">Changing your password closes your other signed-in web sessions.</p>
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
    () => user.role === "ADMIN" ? ["dashboard", "activity", "devices", "profile", "admin", "users"] : ["dashboard", "activity", "devices", "profile"],
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
      {page === "dashboard" && <DashboardPage onViewActivity={() => navigate("activity")} />}
      {page === "activity" && <ActivityPage />}
      {page === "devices" && <DevicesPage />}
      {page === "profile" && <ProfilePage user={user} onUserChanged={onUserChanged} onSignOut={logout} />}
      {page === "admin" && user.role === "ADMIN" && <AdminDashboardPage />}
      {page === "users" && user.role === "ADMIN" && <UsersPage currentUser={user} />}
    </AppShell>
  );
}

export function BantAIApp() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    api<{ user: User }>("/auth/me")
      .then((result) => setUser(result.user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);
  if (loading) return <LoadingPage />;
  if (!user) return <AuthScreen onAuthenticated={setUser} />;
  return <Application user={user} onUserChanged={setUser} onSignedOut={() => setUser(null)} />;
}
