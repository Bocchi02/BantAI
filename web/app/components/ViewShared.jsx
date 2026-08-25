"use client";
import { Logo } from "../BrandLogo";
import { ShieldCheckIcon, GlobeIcon, MailIcon, CheckCircle2Icon, AlertTriangleIcon } from "../Icons";

const OUTCOMES = [
    { value: "NO_STRONG_WARNING_SIGNS", label: "No strong warning signs", short: "No warning signs" },
    { value: "NEEDS_CAUTION", label: "Needs caution", short: "Caution" },
    { value: "SUSPICIOUS_SIGNS_FOUND", label: "Suspicious signs found", short: "Suspicious" },
];
const PASSWORD_REQUIREMENTS = "Use 12 to 128 characters with at least one uppercase letter, one lowercase letter, one number, and one special character.";
function passwordValidationMessage(value) {
    const password = String(value || "");
    const isStrong = password.length >= 12 &&
        password.length <= 128 &&
        /[A-Z]/.test(password) &&
        /[a-z]/.test(password) &&
        /[0-9]/.test(password) &&
        /[^A-Za-z0-9\s]/.test(password);
    return isStrong ? "" : PASSWORD_REQUIREMENTS;
}
function cx(...values) {
    return values.filter(Boolean).join(" ");
}
function outcomeInfo(outcome) {
    return OUTCOMES.find((item) => item.value === outcome) || OUTCOMES[1];
}
function userClassificationLabel(value) {
    if (value === "LEGITIMATE")
        return "Believes legitimate";
    if (value === "SUSPICIOUS")
        return "Believes suspicious";
    return "No corrected label";
}
function feedbackVerdictLabel(value) {
    if (value === "CORRECT")
        return "Result looked right";
    if (value === "INCORRECT")
        return "Correction submitted";
    return "Not sure";
}
function feedbackReasonLabel(value) {
    const labels = {
        TRUSTED_OR_OFFICIAL: "Trusted or official website",
        INCORRECT_WARNING: "Incorrect warning",
        MISSED_WARNING: "Missed suspicious behavior",
        IMPERSONATION_OR_DECEPTIVE: "Impersonation or deceptive domain",
        OTHER: "Other",
    };
    return value ? labels[value] : "No reason provided";
}
function trainingStatusLabel(value) {
    if (value === "APPROVED")
        return "Training candidate";
    if (value === "REJECTED")
        return "Rejected";
    if (value === "INCONCLUSIVE")
        return "Inconclusive";
    return "Awaiting review";
}
function userName(user) {
    return user.full_name || user.email;
}
function deviceLocalDate(value) {
    const explicitZone = /(?:z|[+-]\d{2}:?\d{2})$/i.test(value);
    return new Date(explicitZone ? value : `${value}Z`);
}
function niceDate(value) {
    if (!value)
        return "Not yet";
    return new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
    }).format(deviceLocalDate(value));
}
function relativeTime(value) {
    const seconds = Math.round((deviceLocalDate(value).getTime() - Date.now()) / 1000);
    const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
    if (Math.abs(seconds) < 60)
        return formatter.format(seconds, "second");
    const minutes = Math.round(seconds / 60);
    if (Math.abs(minutes) < 60)
        return formatter.format(minutes, "minute");
    const hours = Math.round(minutes / 60);
    if (Math.abs(hours) < 24)
        return formatter.format(hours, "hour");
    return formatter.format(Math.round(hours / 24), "day");
}
function StatusBadge({ outcome }) {
    const isSafe = outcome === "NO_STRONG_WARNING_SIGNS";
    const isCaution = outcome === "NEEDS_CAUTION";
    return (<span className={cx("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap shadow-2xs border", isSafe && "bg-emerald-50 text-emerald-800 border-emerald-200", isCaution && "bg-amber-50 text-amber-800 border-amber-200", !isSafe && !isCaution && "bg-rose-50 text-rose-800 border-rose-200")}>
      <span className={cx("w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0", isSafe && "bg-emerald-600", isCaution && "bg-amber-600", !isSafe && !isCaution && "bg-rose-600")} aria-hidden="true">
        {isSafe ? "✓" : isCaution ? "!" : "×"}
      </span>
      {outcomeInfo(outcome).label}
    </span>);
}
function Notice({ type = "info", children }) {
    return (<div className={cx("flex items-start gap-3 p-3.5 rounded-xl text-sm font-medium border mb-5 leading-relaxed", type === "info" && "bg-blue-50/80 text-[#071E4A] border-blue-200", type === "error" && "bg-rose-50 text-rose-800 border-rose-200", type === "success" && "bg-emerald-50 text-emerald-800 border-emerald-200")} role={type === "error" ? "alert" : "status"}>
      <span className="shrink-0 mt-0.5">
        {type === "info" && <ShieldCheckIcon className="w-5 h-5 text-[#087EFF]"/>}
        {type === "error" && <AlertTriangleIcon className="w-5 h-5 text-rose-600"/>}
        {type === "success" && <CheckCircle2Icon className="w-5 h-5 text-emerald-600"/>}
      </span>
      <div className="flex-1">{children}</div>
    </div>);
}
function EmptyState({ icon, title, text }) {
    return (<div className="flex flex-col items-center justify-center py-10 px-4 text-center rounded-xl bg-slate-50/50 border border-dashed border-slate-200 my-2">
      <div className="w-11 h-11 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center text-[#087EFF] text-lg font-bold mb-3 shadow-2xs">
        {icon}
      </div>
      <strong className="text-sm font-semibold text-[#04142F]">{title}</strong>
      <p className="text-xs text-slate-500 max-w-sm mt-1 leading-relaxed">{text}</p>
    </div>);
}
function LoadingPage({ error, onRetry }) {
    return (<main className="min-h-screen flex flex-col items-center justify-center p-6 bg-slate-50 text-center" aria-busy={!error}>
      <Logo className="mb-8"/>
      {error ? (<div className="max-w-md w-full p-6 rounded-2xl bg-white border border-slate-200 shadow-sm text-center" role="alert">
          <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 border border-amber-200 flex items-center justify-center text-xl font-bold mx-auto mb-4">
            !
          </div>
          <h1 className="text-lg font-bold text-[#04142F]">Dashboard service unavailable</h1>
          <p className="text-xs text-slate-600 my-3 leading-relaxed">{error}</p>
          <button className="w-full mt-2 py-2.5 px-4 rounded-xl bg-[#087EFF] hover:bg-[#071E4A] text-white text-xs font-semibold transition-colors shadow-sm" onClick={onRetry}>
            Try again
          </button>
        </div>) : (<div className="flex flex-col items-center">
          <div className="w-48 h-1 bg-slate-200 rounded-full overflow-hidden mb-4">
            <div className="w-1/2 h-full bg-[#087EFF] rounded-full animate-shimmer"/>
          </div>
          <p className="text-xs text-slate-500 font-medium tracking-wide">Preparing your privacy-first dashboard…</p>
        </div>)}
    </main>);
}
function PageHeader({ eyebrow, title, description, actions, }) {
    return (<div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
      <div>
        <p className="text-xs font-semibold text-[#087EFF] tracking-wider uppercase mb-1">{eyebrow}</p>
        <h1 className="text-2xl lg:text-[28px] font-bold text-[#04142F] tracking-tight">{title}</h1>
        <p className="text-sm text-slate-500 mt-1 max-w-2xl leading-relaxed">{description}</p>
      </div>
      {actions && <div className="shrink-0">{actions}</div>}
    </div>);
}
function doughnutGradient(row) {
    const colorByOutcome = {
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
function OutcomeChart({ distribution }) {
    return (<section className="p-5 sm:p-6 rounded-2xl bg-white border border-slate-200 shadow-sm mt-6" aria-labelledby="outcome-chart-title">
      <div className="flex items-center justify-between mb-5 pb-3.5 border-b border-slate-100">
        <div>
          <p className="text-xs font-semibold text-[#087EFF] tracking-wider uppercase">DETECTION OUTCOMES</p>
          <h2 id="outcome-chart-title" className="text-base font-bold text-[#04142F]">What BantAI found</h2>
        </div>
        <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full">Percent of checks</span>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {distribution.map((row) => (<article className="p-5 rounded-xl bg-slate-50 border border-slate-200/80 flex flex-col justify-between" key={row.event_type}>
            <div className="flex items-center gap-2.5 mb-4">
              <div className="w-8 h-8 rounded-lg bg-[#EAF4FF] text-[#087EFF] flex items-center justify-center">
                {row.event_type === "URL" ? <GlobeIcon className="w-4 h-4"/> : <MailIcon className="w-4 h-4"/>}
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{row.event_type === "URL" ? "WEBSITE DETECTIONS" : "EMAIL DETECTIONS"}</p>
                <h3 className="text-xs font-bold text-[#04142F]">{row.event_type === "URL" ? "Website addresses" : "Opened emails"}</h3>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-6">
              <div className={cx("w-32 h-32 rounded-full relative shrink-0 shadow-inner flex items-center justify-center", !row.total && "bg-slate-200")} style={row.total ? { background: doughnutGradient(row) } : undefined} role="img" aria-label={row.total ? `${row.event_type}: ${row.outcomes.map((part) => `${outcomeInfo(part.outcome).label} ${part.percentage}%`).join(", ")}` : `${row.event_type}: no checks in this period`}>
                <div className="w-20 h-20 rounded-full bg-white flex flex-col items-center justify-center shadow-xs">
                  <span className="text-xs font-extrabold text-[#071E4A]">{row.total}</span>
                  <span className="text-[9px] text-slate-400 uppercase font-bold tracking-wider">{row.event_type === "URL" ? "Websites" : "Emails"}</span>
                </div>
              </div>

              <dl className="space-y-2 flex-1 w-full text-xs">
                {OUTCOMES.map((outcome) => {
                const part = row.outcomes.find((item) => item.outcome === outcome.value);
                return (<div className="flex items-center justify-between pb-1 border-b border-slate-200/60" key={outcome.value}>
                      <dt className="flex items-center gap-2 text-slate-600 font-medium">
                        <span className={cx("w-2.5 h-2.5 rounded-full shrink-0", outcome.value === "NO_STRONG_WARNING_SIGNS" && "bg-emerald-600", outcome.value === "NEEDS_CAUTION" && "bg-amber-500", outcome.value === "SUSPICIOUS_SIGNS_FOUND" && "bg-rose-600")}/>
                        <span>{outcome.label}</span>
                      </dt>
                      <dd className="font-bold text-slate-800">{part?.percentage || 0}%</dd>
                    </div>);
            })}
              </dl>
            </div>
            {!row.total && <p className="text-xs text-slate-400 text-center mt-3">No checks in this period</p>}
          </article>))}
      </div>
      <p className="text-xs text-slate-400 mt-6 pt-4 border-t border-slate-100">These percentages summarize categorical outcomes. BantAI does not calculate an overall risk score.</p>
    </section>);
}
function ActivityTable({ items, compact = false, onFeedback }) {
    if (!items.length)
        return <EmptyState icon="↗" title="No activity to show" text="Pair BantAI and complete a check. Privacy-minimized results will appear here."/>;
    return (<div className="overflow-x-auto">
      <table className="w-full text-left text-xs text-slate-600">
        <thead className="text-xs font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-100">
          <tr>
            <th className="pb-3 px-3.5">Activity</th>
            <th className="pb-3 px-3.5">Details</th>
            <th className="pb-3 px-3.5">Outcome</th>
            <th className="pb-3 px-3.5">Detected</th>
            {onFeedback && <th className="pb-3 px-3.5">Feedback</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {items.map((item) => (<tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
              <td className="py-3.5 px-3.5">
                <div className="flex items-center gap-2.5">
                  <span className="w-7 h-7 rounded-lg bg-blue-50 text-[#087EFF] flex items-center justify-center shrink-0">
                    {item.event_type === "URL" ? <GlobeIcon className="w-3.5 h-3.5"/> : <MailIcon className="w-3.5 h-3.5"/>}
                  </span>
                  <div>
                    <strong className="text-slate-900 block font-semibold text-sm">{item.event_type === "URL" ? "Website" : "Email"}</strong>
                    <small className="text-slate-400 capitalize block text-xs">{item.event_type === "EMAIL" ? item.provider : "Address bar"}</small>
                  </div>
                </div>
              </td>
              <td className="py-3.5 px-3.5 max-w-sm">
                <strong className="text-slate-900 block truncate font-medium text-sm">{item.event_type === "URL" ? item.origin : item.subject || "No subject"}</strong>
                {item.event_type === "EMAIL" && <small className="text-slate-400 block truncate text-xs">{item.sender || "Sender not shown"}</small>}
              </td>
              <td className="py-3.5 px-3.5">
                <StatusBadge outcome={item.outcome}/>
              </td>
              <td className="py-3.5 px-3.5 whitespace-nowrap text-slate-400 text-xs">
                <time title={niceDate(item.occurred_at)}>{compact ? relativeTime(item.occurred_at) : niceDate(item.occurred_at)}</time>
              </td>
              {onFeedback && (<td className="py-3.5 px-3.5">
                  {item.event_type === "URL" ? (item.feedback_submitted ? (<span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">Submitted</span>) : (<button className="text-xs font-bold text-[#087EFF] hover:underline" type="button" onClick={() => onFeedback(item)}>
                        Give feedback
                      </button>)) : (<span className="text-slate-300" aria-hidden="true">—</span>)}
                </td>)}
            </tr>))}
        </tbody>
      </table>
    </div>);
}
function RangePicker({ value, onChange }) {
    return (<div className="inline-flex p-1 rounded-xl bg-slate-100 border border-slate-200 text-xs font-medium" aria-label="Date range">
      {[7, 30, 90].map((days) => (<button key={days} className={cx("px-3 py-1.5 rounded-lg transition-all font-semibold", value === days ? "bg-white text-[#04142F] shadow-2xs font-bold" : "text-slate-500 hover:text-slate-900")} onClick={() => onChange(days)}>
          {days} days
        </button>))}
    </div>);
}
function DashboardSkeleton() {
    return (<div className="space-y-6" aria-busy="true">
      <div className="grid sm:grid-cols-2 gap-6">
        <div className="h-44 rounded-2xl bg-slate-100 animate-shimmer"/>
        <div className="h-44 rounded-2xl bg-slate-100 animate-shimmer"/>
      </div>
      <div className="h-64 rounded-2xl bg-slate-100 animate-shimmer"/>
      <div className="h-64 rounded-2xl bg-slate-100 animate-shimmer"/>
    </div>);
}

export { OUTCOMES, PASSWORD_REQUIREMENTS, passwordValidationMessage, cx, outcomeInfo, userClassificationLabel, feedbackVerdictLabel, feedbackReasonLabel, trainingStatusLabel, userName, deviceLocalDate, niceDate, relativeTime, StatusBadge, Notice, EmptyState, LoadingPage, PageHeader, doughnutGradient, OutcomeChart, ActivityTable, RangePicker, DashboardSkeleton };
