"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { CheckCircle2Icon, HelpCircleIcon } from "../Icons";
import { OUTCOMES, cx, outcomeInfo, Notice, PageHeader, ActivityTable, DashboardSkeleton } from "../components/ViewShared";

function DetectionFeedbackCard({ activity, onSubmitted, onClose }) {
    const [reportedUrl, setReportedUrl] = useState("");
    const [verdict, setVerdict] = useState("");
    const [classification, setClassification] = useState("");
    const [reason, setReason] = useState("");
    const [submitted, setSubmitted] = useState(activity.feedback_submitted);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const selectVerdict = (nextVerdict) => {
        setVerdict(nextVerdict);
        setError("");
        if (nextVerdict !== "INCORRECT") {
            setClassification("");
            setReason("");
        }
    };
    const submit = async (event) => {
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
        }
        catch (problem) {
            setError(problem instanceof Error ? problem.message : "BantAI could not save your feedback.");
        }
        finally {
            setBusy(false);
        }
    };
    if (submitted) {
        return (<section className="p-6 rounded-2xl bg-emerald-50 border border-emerald-200 shadow-sm flex items-center justify-between gap-4 my-4" aria-live="polite">
        <div className="flex items-center gap-3">
          <CheckCircle2Icon className="w-6 h-6 text-emerald-600 shrink-0"/>
          <div>
            <p className="text-[10px] font-bold text-emerald-700 uppercase">FEEDBACK RECEIVED</p>
            <h2 className="text-sm font-bold text-emerald-950">Thank you for helping improve BantAI.</h2>
            <p className="text-xs text-emerald-800/80 mt-0.5">An administrator will review the complete address you explicitly submitted before it can become a future training candidate.</p>
          </div>
        </div>
        {onClose && (<button className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-white border border-emerald-300 text-emerald-800 hover:bg-emerald-100" type="button" onClick={onClose}>
            Close
          </button>)}
      </section>);
    }
    return (<section className="p-6 rounded-2xl bg-white border border-blue-200 shadow-sm my-4" aria-labelledby={`feedback-title-${activity.id}`}>
      <div className="flex items-start gap-4">
        <div className="w-10 h-10 rounded-xl bg-blue-50 text-[#087EFF] flex items-center justify-center shrink-0">
          <HelpCircleIcon className="w-5 h-5"/>
        </div>
        <div className="flex-1">
          <p className="text-[10px] font-bold text-[#087EFF] tracking-wider uppercase mb-1">HELP IMPROVE BANTAI</p>
          <h2 id={`feedback-title-${activity.id}`} className="text-base font-bold text-[#04142F]">Do you think BantAI got this result right?</h2>
          <p className="text-xs text-slate-500 mt-1"><strong>{activity.origin}</strong> was shown as “{outcomeInfo(activity.outcome).label}.”</p>
          {error && <Notice type="error">{error}</Notice>}
          <form className="space-y-4 mt-4" onSubmit={submit}>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-slate-700">Complete website address</span>
              <input type="url" inputMode="url" value={reportedUrl} onChange={(event) => setReportedUrl(event.target.value)} placeholder={`${activity.origin || "https://example.com"}/page`} maxLength={2048} autoCapitalize="none" autoComplete="off" spellCheck={false} required className="h-10 px-3 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-[#087EFF] outline-none"/>
              <small className="text-[11px] text-slate-400">Paste the address shown in the browser, including its path. This address is stored only after you submit feedback.</small>
            </label>

            <fieldset className="space-y-1 border-0 p-0 m-0">
              <legend className="text-xs font-semibold text-slate-700 mb-2">Select one response</legend>
              <div className="flex flex-wrap gap-2">
                <label className={cx("px-3.5 py-2 rounded-xl border text-xs font-semibold cursor-pointer transition flex items-center gap-2", verdict === "CORRECT" ? "bg-emerald-50 text-emerald-800 border-emerald-300 ring-2 ring-emerald-200" : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50")}>
                  <input type="radio" name={`feedback-verdict-${activity.id}`} className="sr-only" checked={verdict === "CORRECT"} onChange={() => selectVerdict("CORRECT")}/>
                  <span>Yes, looks right</span>
                </label>
                <label className={cx("px-3.5 py-2 rounded-xl border text-xs font-semibold cursor-pointer transition flex items-center gap-2", verdict === "INCORRECT" ? "bg-rose-50 text-rose-800 border-rose-300 ring-2 ring-rose-200" : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50")}>
                  <input type="radio" name={`feedback-verdict-${activity.id}`} className="sr-only" checked={verdict === "INCORRECT"} onChange={() => selectVerdict("INCORRECT")}/>
                  <span>No, report correction</span>
                </label>
                <label className={cx("px-3.5 py-2 rounded-xl border text-xs font-semibold cursor-pointer transition flex items-center gap-2", verdict === "UNSURE" ? "bg-blue-50 text-[#071E4A] border-blue-300 ring-2 ring-blue-200" : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50")}>
                  <input type="radio" name={`feedback-verdict-${activity.id}`} className="sr-only" checked={verdict === "UNSURE"} onChange={() => selectVerdict("UNSURE")}/>
                  <span>Not sure</span>
                </label>
              </div>
            </fieldset>

            {verdict === "INCORRECT" && (<div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                <fieldset className="space-y-1 border-0 p-0 m-0">
                  <legend className="text-xs font-semibold text-slate-700 mb-2">What best describes the website?</legend>
                  <div className="grid sm:grid-cols-2 gap-2">
                    <label className={cx("p-3 rounded-xl border cursor-pointer flex gap-2.5 items-start transition", classification === "LEGITIMATE" ? "bg-emerald-50 border-emerald-300 text-emerald-950 ring-2 ring-emerald-200" : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50")}>
                      <input type="radio" name={`feedback-classification-${activity.id}`} className="sr-only" checked={classification === "LEGITIMATE"} onChange={() => setClassification("LEGITIMATE")}/>
                      <span className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center text-xs font-bold shrink-0">✓</span>
                      <div>
                        <strong className="text-xs font-bold block">Seems legitimate</strong>
                        <small className="text-[10px] text-slate-500">The warning may have been too cautious.</small>
                      </div>
                    </label>
                    <label className={cx("p-3 rounded-xl border cursor-pointer flex gap-2.5 items-start transition", classification === "SUSPICIOUS" ? "bg-rose-50 border-rose-300 text-rose-950 ring-2 ring-rose-200" : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50")}>
                      <input type="radio" name={`feedback-classification-${activity.id}`} className="sr-only" checked={classification === "SUSPICIOUS"} onChange={() => setClassification("SUSPICIOUS")}/>
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
                  <select value={reason} onChange={(event) => setReason(event.target.value)} className="h-10 px-3 rounded-xl border border-slate-300 text-xs bg-white focus:ring-2 focus:ring-[#087EFF] outline-none">
                    <option value="">Select a reason</option>
                    <option value="TRUSTED_OR_OFFICIAL">Trusted or official website</option>
                    <option value="INCORRECT_WARNING">Incorrect warning</option>
                    <option value="MISSED_WARNING">Missed suspicious behavior</option>
                    <option value="IMPERSONATION_OR_DECEPTIVE">Impersonation or deceptive domain</option>
                    <option value="OTHER">Other</option>
                  </select>
                </label>
              </div>)}

            <div className="flex items-center gap-3 pt-2">
              <button type="submit" disabled={busy || !reportedUrl.trim() || !verdict || (verdict === "INCORRECT" && !classification)} className="px-4 py-2 rounded-xl bg-[#087EFF] hover:bg-[#071E4A] text-white text-xs font-bold shadow-sm transition disabled:opacity-50">
                {busy ? "Submitting..." : "Submit feedback"}
              </button>
              {onClose && (<button type="button" onClick={onClose} className="px-3 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100">
                  Close
                </button>)}
            </div>
          </form>
        </div>
      </div>
    </section>);
}
function ActivityPage() {
    const [page, setPage] = useState(1);
    const [filters, setFilters] = useState({ event_type: "", outcome: "", provider: "", date_from: "", date_to: "" });
    const [data, setData] = useState(null);
    const [feedbackActivity, setFeedbackActivity] = useState(null);
    const [error, setError] = useState("");
    const query = useMemo(() => {
        const params = new URLSearchParams({ page: String(page), page_size: "25" });
        Object.entries(filters).forEach(([key, value]) => value && params.set(key, key.startsWith("date_") ? new Date(`${value}T${key === "date_to" ? "23:59:59" : "00:00:00"}`).toISOString() : value));
        return params.toString();
    }, [filters, page]);
    const load = useCallback(() => api(`/activities?${query}`).then(setData).catch((reason) => setError(reason.message)), [query]);
    useEffect(() => { void load(); }, [load]);
    const change = (key, value) => { setPage(1); setFilters((current) => ({ ...current, [key]: value })); };
    return (<>
      <PageHeader eyebrow="PRIVACY-MINIMIZED HISTORY" title="Activity" description="Review your retained website origins and email metadata. Records are removed after 90 days."/>
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
            <input type="date" value={filters.date_from} onChange={(event) => change("date_from", event.target.value)} className="h-9 px-2.5 rounded-lg border border-slate-300 bg-white text-xs"/>
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-semibold text-slate-600">To</span>
            <input type="date" value={filters.date_to} onChange={(event) => change("date_to", event.target.value)} className="h-9 px-2.5 rounded-lg border border-slate-300 bg-white text-xs"/>
          </label>
        </div>
      </section>
      {error && <Notice type="error">{error}</Notice>}
      {feedbackActivity && <DetectionFeedbackCard key={feedbackActivity.id} activity={feedbackActivity} onSubmitted={load} onClose={() => setFeedbackActivity(null)}/>}
      <section className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm">
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
          <div>
            <p className="text-[10px] font-bold text-[#087EFF] uppercase tracking-wider">ALL CHECKS</p>
            <h2 className="text-base font-bold text-[#04142F]">{data ? `${data.total} retained ${data.total === 1 ? "record" : "records"}` : "Loading activity…"}</h2>
          </div>
          <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full">90-day retention</span>
        </div>
        {data ? <ActivityTable items={data.items} onFeedback={setFeedbackActivity}/> : <DashboardSkeleton />}
        {data && data.pages > 1 && (<div className="flex items-center justify-between pt-4 mt-4 border-t border-slate-100 text-xs text-slate-500">
            <button disabled={page <= 1} onClick={() => setPage((value) => value - 1)} className="px-3 py-1.5 rounded-lg border border-slate-200 font-semibold hover:bg-slate-50 disabled:opacity-40">
              ← Previous
            </button>
            <span>Page {page} of {data.pages}</span>
            <button disabled={page >= data.pages} onClick={() => setPage((value) => value + 1)} className="px-3 py-1.5 rounded-lg border border-slate-200 font-semibold hover:bg-slate-50 disabled:opacity-40">
              Next →
            </button>
          </div>)}
      </section>
    </>);
}

export default ActivityPage;
