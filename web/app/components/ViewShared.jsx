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
    return (<span className={cx("inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap border shadow-2xs", isSafe && "bg-[#e8fadf] text-[#2d5816] border-[#c6f1af]", isCaution && "bg-[#fff1d6] text-[#664400] border-[#ffdd99]", !isSafe && !isCaution && "bg-[#ffe0db] text-[#66190c] border-[#ffb2a5]")}>
      <span className={cx("w-3.5 h-3.5 rounded-full flex items-center justify-center text-[9px] font-bold text-white shrink-0", isSafe && "bg-[#71dd37]", isCaution && "bg-[#ffab00]", !isSafe && !isCaution && "bg-[#ff3e1d]")} aria-hidden="true">
        {isSafe ? "✓" : isCaution ? "!" : "×"}
      </span>
      {outcomeInfo(outcome).label}
    </span>);
}
function Notice({ type = "info", children }) {
    return (<div className={cx("flex items-start gap-3 p-3.5 sm:p-4 rounded-lg text-xs sm:text-sm font-medium border mb-5 leading-relaxed", type === "info" && "bg-[#e7e7ff] text-[#4347d9] border-[#c3c4ff]", type === "error" && "bg-[#ffe0db] text-[#b91c1c] border-[#ffb2a5]", type === "success" && "bg-[#e8fadf] text-[#2d5816] border-[#c6f1af]")} role={type === "error" ? "alert" : "status"}>
      <span className="shrink-0 mt-0.5">
        {type === "info" && <ShieldCheckIcon className="w-5 h-5 text-[#696cff]"/>}
        {type === "error" && <AlertTriangleIcon className="w-5 h-5 text-[#ff3e1d]"/>}
        {type === "success" && <CheckCircle2Icon className="w-5 h-5 text-[#71dd37]"/>}
      </span>
      <div className="flex-1">{children}</div>
    </div>);
}
function EmptyState({ icon, title, text }) {
    return (<div className="flex flex-col items-center justify-center py-10 px-4 text-center rounded-lg bg-[#f5f5f9]/70 border border-dashed border-[#d9dee3] my-2">
      <div className="w-12 h-12 rounded-lg bg-[#e7e7ff] text-[#696cff] flex items-center justify-center text-xl font-bold mb-3 shadow-xs">
        {icon}
      </div>
      <strong className="text-sm font-semibold text-[#384551]">{title}</strong>
      <p className="text-xs text-[#8592a3] max-w-sm mt-1 leading-relaxed">{text}</p>
    </div>);
}
function LoadingPage({ error, onRetry }) {
    return (<main className="min-h-screen flex flex-col items-center justify-center p-6 bg-[#f5f5f9] text-center" aria-busy={!error}>
      <Logo className="mb-8"/>
      {error ? (<div className="max-w-md w-full p-6 sm:p-8 rounded-xl bg-white border border-[#e4e6e8] shadow-[0_2px_6px_0_rgba(67,89,113,0.12)] text-center" role="alert">
          <div className="w-12 h-12 rounded-full bg-[#fff1d6] text-[#ffab00] border border-[#ffdd99] flex items-center justify-center text-xl font-bold mx-auto mb-4">
            !
          </div>
          <h1 className="text-lg font-bold text-[#384551]">Dashboard service unavailable</h1>
          <p className="text-xs text-[#646e78] my-3 leading-relaxed">{error}</p>
          <button className="w-full mt-2 py-2.5 px-4 rounded-md bg-[#696cff] hover:bg-[#5f61e6] text-white text-xs font-semibold transition-colors shadow-xs" onClick={onRetry}>
            Try again
          </button>
        </div>) : (<div className="flex flex-col items-center">
          <div className="w-48 h-1.5 bg-[#e4e6e8] rounded-full overflow-hidden mb-4">
            <div className="w-1/2 h-full bg-[#696cff] rounded-full animate-shimmer"/>
          </div>
          <p className="text-xs text-[#8592a3] font-medium tracking-wide">Preparing your privacy-first dashboard…</p>
        </div>)}
    </main>);
}
function PageHeader({ eyebrow, title, description, actions, }) {
    return (<div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
      <div>
        <p className="text-xs font-semibold text-[#696cff] tracking-wider uppercase mb-1">{eyebrow}</p>
        <h1 className="text-2xl lg:text-[26px] font-bold text-[#384551] tracking-tight">{title}</h1>
        <p className="text-xs sm:text-sm text-[#8592a3] mt-0.5 max-w-2xl leading-relaxed">{description}</p>
      </div>
      {actions && <div className="shrink-0">{actions}</div>}
    </div>);
}
function doughnutGradient(row) {
    const colorByOutcome = {
        NO_STRONG_WARNING_SIGNS: "#71dd37",
        NEEDS_CAUTION: "#ffab00",
        SUSPICIOUS_SIGNS_FOUND: "#ff3e1d",
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
    return (<section className="p-5 sm:p-6 rounded-xl bg-white border border-[#e4e6e8] shadow-[0_2px_6px_0_rgba(67,89,113,0.12)] mt-6" aria-labelledby="outcome-chart-title">
      <div className="flex items-center justify-between mb-5 pb-3 border-b border-[#e4e6e8]/70">
        <div>
          <p className="text-xs font-semibold text-[#696cff] tracking-wider uppercase">DETECTION OUTCOMES</p>
          <h2 id="outcome-chart-title" className="text-base font-bold text-[#384551]">What BantAI found</h2>
        </div>
        <span className="text-xs font-medium text-[#8592a3] bg-[#f5f5f9] px-2.5 py-1 rounded-md border border-[#e4e6e8]">Percent of checks</span>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {distribution.map((row) => (<article className="p-5 rounded-lg bg-[#f5f5f9]/60 border border-[#e4e6e8] flex flex-col justify-between" key={row.event_type}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-9 h-9 rounded-md bg-[#e7e7ff] text-[#696cff] flex items-center justify-center shadow-2xs">
                {row.event_type === "URL" ? <GlobeIcon className="w-4 h-4"/> : <MailIcon className="w-4 h-4"/>}
              </div>
              <div>
                <p className="text-[10px] font-bold text-[#8592a3] uppercase tracking-wider">{row.event_type === "URL" ? "WEBSITE DETECTIONS" : "EMAIL DETECTIONS"}</p>
                <h3 className="text-xs font-bold text-[#384551]">{row.event_type === "URL" ? "Website addresses" : "Opened emails"}</h3>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-6">
              <div className={cx("w-32 h-32 rounded-full relative shrink-0 shadow-inner flex items-center justify-center", !row.total && "bg-[#e4e6e8]")} style={row.total ? { background: doughnutGradient(row) } : undefined} role="img" aria-label={row.total ? `${row.event_type}: ${row.outcomes.map((part) => `${outcomeInfo(part.outcome).label} ${part.percentage}%`).join(", ")}` : `${row.event_type}: no checks in this period`}>
                <div className="w-20 h-20 rounded-full bg-white flex flex-col items-center justify-center shadow-xs">
                  <span className="text-xs font-extrabold text-[#384551]">{row.total}</span>
                  <span className="text-[9px] text-[#8592a3] uppercase font-bold tracking-wider">{row.event_type === "URL" ? "Websites" : "Emails"}</span>
                </div>
              </div>

              <dl className="space-y-2 flex-1 w-full text-xs">
                {OUTCOMES.map((outcome) => {
                const part = row.outcomes.find((item) => item.outcome === outcome.value);
                return (<div className="flex items-center justify-between pb-1 border-b border-[#e4e6e8]/60" key={outcome.value}>
                      <dt className="flex items-center gap-2 text-[#646e78] font-medium">
                        <span className={cx("w-2.5 h-2.5 rounded-full shrink-0", outcome.value === "NO_STRONG_WARNING_SIGNS" && "bg-[#71dd37]", outcome.value === "NEEDS_CAUTION" && "bg-[#ffab00]", outcome.value === "SUSPICIOUS_SIGNS_FOUND" && "bg-[#ff3e1d]")}/>
                        <span>{outcome.label}</span>
                      </dt>
                      <dd className="font-bold text-[#384551]">{part?.percentage || 0}%</dd>
                    </div>);
            })}
              </dl>
            </div>
            {!row.total && <p className="text-xs text-[#8592a3] text-center mt-3">No checks in this period</p>}
          </article>))}
      </div>
      <p className="text-xs text-[#8592a3] mt-6 pt-4 border-t border-[#e4e6e8]/70">These percentages summarize categorical outcomes. BantAI does not calculate an overall risk score.</p>
    </section>);
}
function ActivityTable({ items, compact = false, onFeedback }) {
    if (!items.length)
        return <EmptyState icon="↗" title="No activity to show" text="Pair BantAI and complete a check. Privacy-minimized results will appear here."/>;
    return (<div className="overflow-x-auto">
      <table className="w-full text-left text-xs text-[#646e78]">
        <thead className="text-[11px] font-bold text-[#8592a3] uppercase tracking-wider bg-[#f5f5f9]/80 border-b border-[#e4e6e8]">
          <tr>
            <th className="py-3 px-3.5">Activity</th>
            <th className="py-3 px-3.5">Details</th>
            <th className="py-3 px-3.5">Outcome</th>
            <th className="py-3 px-3.5">Detected</th>
            {onFeedback && <th className="py-3 px-3.5">Feedback</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-[#e4e6e8]/70">
          {items.map((item) => (<tr key={item.id} className="hover:bg-[#fbfbfd] transition-colors">
              <td className="py-3.5 px-3.5">
                <div className="flex items-center gap-2.5">
                  <span className="w-8 h-8 rounded-md bg-[#e7e7ff] text-[#696cff] flex items-center justify-center shrink-0 shadow-2xs">
                    {item.event_type === "URL" ? <GlobeIcon className="w-4 h-4"/> : <MailIcon className="w-4 h-4"/>}
                  </span>
                  <div>
                    <strong className="text-[#384551] block font-semibold text-xs sm:text-sm">{item.event_type === "URL" ? "Website" : "Email"}</strong>
                    <small className="text-[#8592a3] capitalize block text-[11px]">{item.event_type === "EMAIL" ? item.provider : "Address bar"}</small>
                  </div>
                </div>
              </td>
              <td className="py-3.5 px-3.5 max-w-sm">
                <strong className="text-[#384551] block truncate font-medium text-xs sm:text-sm">{item.event_type === "URL" ? item.origin : item.subject || "No subject"}</strong>
                {item.event_type === "EMAIL" && <small className="text-[#8592a3] block truncate text-[11px]">{item.sender || "Sender not shown"}</small>}
              </td>
              <td className="py-3.5 px-3.5">
                <StatusBadge outcome={item.outcome}/>
              </td>
              <td className="py-3.5 px-3.5 whitespace-nowrap text-[#8592a3] text-[11px]">
                <time title={niceDate(item.occurred_at)}>{compact ? relativeTime(item.occurred_at) : niceDate(item.occurred_at)}</time>
              </td>
              {onFeedback && (<td className="py-3.5 px-3.5">
                  {item.event_type === "URL" ? (item.feedback_submitted ? (<span className="text-[10px] font-bold text-[#2d5816] bg-[#e8fadf] px-2 py-0.5 rounded-full border border-[#c6f1af]">Submitted</span>) : (<button className="text-xs font-semibold text-[#696cff] hover:underline" type="button" onClick={() => onFeedback(item)}>
                        Give feedback
                      </button>)) : (<span className="text-[#d9dee3]" aria-hidden="true">—</span>)}
                </td>)}
            </tr>))}
        </tbody>
      </table>
    </div>);
}
function RangePicker({ value, onChange }) {
    return (<div className="inline-flex p-1 rounded-md bg-[#f5f5f9] border border-[#d9dee3] text-xs font-medium" aria-label="Date range">
      {[7, 30, 90].map((days) => (<button key={days} className={cx("px-3 py-1.5 rounded transition-all font-semibold", value === days ? "bg-white text-[#696cff] shadow-xs font-bold" : "text-[#8592a3] hover:text-[#384551]")} onClick={() => onChange(days)}>
          {days} days
        </button>))}
    </div>);
}
function DashboardSkeleton() {
    return (<div className="space-y-6" aria-busy="true">
      <div className="grid sm:grid-cols-2 gap-6">
        <div className="h-44 rounded-xl bg-white border border-[#e4e6e8] animate-shimmer shadow-xs"/>
        <div className="h-44 rounded-xl bg-white border border-[#e4e6e8] animate-shimmer shadow-xs"/>
      </div>
      <div className="h-64 rounded-xl bg-white border border-[#e4e6e8] animate-shimmer shadow-xs"/>
      <div className="h-64 rounded-xl bg-white border border-[#e4e6e8] animate-shimmer shadow-xs"/>
    </div>);
}

export { OUTCOMES, PASSWORD_REQUIREMENTS, passwordValidationMessage, cx, outcomeInfo, userClassificationLabel, feedbackVerdictLabel, feedbackReasonLabel, trainingStatusLabel, userName, deviceLocalDate, niceDate, relativeTime, StatusBadge, Notice, EmptyState, LoadingPage, PageHeader, doughnutGradient, OutcomeChart, ActivityTable, RangePicker, DashboardSkeleton };
