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
        return (<section className="p-5 sm:p-6 rounded-xl bg-[#e8fadf] border border-[#c6f1af] shadow-xs flex items-center justify-between gap-4 my-4" aria-live="polite">
        <div className="flex items-center gap-3.5">
          <CheckCircle2Icon className="w-6 h-6 text-[#71dd37] shrink-0"/>
          <div>
            <p className="text-xs font-semibold text-[#2d5816] uppercase tracking-wider">FEEDBACK RECEIVED</p>
            <h2 className="text-sm font-bold text-[#2d5816]">Thank you for helping improve BantAI.</h2>
            <p className="text-xs text-[#2d5816]/90 mt-0.5">An administrator will review the complete address you explicitly submitted before it can become a future training candidate.</p>
          </div>
        </div>
        {onClose && (<button className="text-xs font-semibold px-3 py-1.5 rounded-md bg-white border border-[#c6f1af] text-[#2d5816] hover:bg-[#e8fadf]" type="button" onClick={onClose}>
            Close
          </button>)}
      </section>);
    }
    return (<section className="sneat-card p-5 sm:p-6 my-4 border-[#c3c4ff]" aria-labelledby={`feedback-title-${activity.id}`}>
      <div className="flex items-start gap-4">
        <div className="w-10 h-10 rounded-lg bg-[#e7e7ff] text-[#696cff] flex items-center justify-center shrink-0 shadow-2xs">
          <HelpCircleIcon className="w-5 h-5"/>
        </div>
        <div className="flex-1">
          <p className="text-xs font-semibold text-[#696cff] tracking-wider uppercase mb-1">HELP IMPROVE BANTAI</p>
          <h2 id={`feedback-title-${activity.id}`} className="text-base font-bold text-[#384551]">Do you think BantAI got this result right?</h2>
          <p className="text-xs text-[#8592a3] mt-1"><strong>{activity.origin}</strong> was shown as “{outcomeInfo(activity.outcome).label}.”</p>
          {error && <Notice type="error">{error}</Notice>}
          <form className="space-y-4 mt-4" onSubmit={submit}>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-[#384551]">Complete website address</span>
              <input type="url" inputMode="url" value={reportedUrl} onChange={(event) => setReportedUrl(event.target.value)} placeholder={`${activity.origin || "https://example.com"}/page`} maxLength={2048} autoCapitalize="none" autoComplete="off" spellCheck={false} required className="h-10 px-3 rounded-md border border-[#d9dee3] text-xs focus:ring-2 focus:ring-[#696cff]/20 focus:border-[#696cff] outline-none bg-white"/>
              <small className="text-xs text-[#8592a3]">Paste the address shown in the browser, including its path. This address is stored only after you submit feedback.</small>
            </label>

            <fieldset className="space-y-1 border-0 p-0 m-0">
              <legend className="text-xs font-semibold text-[#384551] mb-2">Select one response</legend>
              <div className="flex flex-wrap gap-2">
                <label className={cx("px-3.5 py-2 rounded-md border text-xs font-semibold cursor-pointer transition flex items-center gap-2", verdict === "CORRECT" ? "bg-[#e8fadf] text-[#2d5816] border-[#c6f1af] ring-2 ring-[#c6f1af]" : "bg-white text-[#646e78] border-[#d9dee3] hover:bg-[#f5f5f9]")}>
                  <input type="radio" name={`feedback-verdict-${activity.id}`} className="sr-only" checked={verdict === "CORRECT"} onChange={() => selectVerdict("CORRECT")}/>
                  <span>Yes, looks right</span>
                </label>
                <label className={cx("px-3.5 py-2 rounded-md border text-xs font-semibold cursor-pointer transition flex items-center gap-2", verdict === "INCORRECT" ? "bg-[#ffe0db] text-[#66190c] border-[#ffb2a5] ring-2 ring-[#ffb2a5]" : "bg-white text-[#646e78] border-[#d9dee3] hover:bg-[#f5f5f9]")}>
                  <input type="radio" name={`feedback-verdict-${activity.id}`} className="sr-only" checked={verdict === "INCORRECT"} onChange={() => selectVerdict("INCORRECT")}/>
                  <span>No, report correction</span>
                </label>
                <label className={cx("px-3.5 py-2 rounded-md border text-xs font-semibold cursor-pointer transition flex items-center gap-2", verdict === "UNSURE" ? "bg-[#e7e7ff] text-[#4347d9] border-[#c3c4ff] ring-2 ring-[#c3c4ff]" : "bg-white text-[#646e78] border-[#d9dee3] hover:bg-[#f5f5f9]")}>
                  <input type="radio" name={`feedback-verdict-${activity.id}`} className="sr-only" checked={verdict === "UNSURE"} onChange={() => selectVerdict("UNSURE")}/>
                  <span>Not sure</span>
                </label>
              </div>
            </fieldset>

            {verdict === "INCORRECT" && (<div className="p-4 rounded-lg bg-[#f5f5f9] border border-[#e4e6e8] space-y-3">
                <fieldset className="space-y-1 border-0 p-0 m-0">
                  <legend className="text-xs font-semibold text-[#384551] mb-2">What best describes the website?</legend>
                  <div className="grid sm:grid-cols-2 gap-2">
                    <label className={cx("p-3 rounded-lg border cursor-pointer flex gap-2.5 items-start transition", classification === "LEGITIMATE" ? "bg-[#e8fadf] border-[#c6f1af] text-[#2d5816] ring-2 ring-[#c6f1af]" : "bg-white border-[#d9dee3] text-[#646e78] hover:bg-[#f5f5f9]")}>
                      <input type="radio" name={`feedback-classification-${activity.id}`} className="sr-only" checked={classification === "LEGITIMATE"} onChange={() => setClassification("LEGITIMATE")}/>
                      <span className="w-5 h-5 rounded-full bg-[#71dd37] text-white flex items-center justify-center text-xs font-bold shrink-0">✓</span>
                      <div>
                        <strong className="text-xs font-bold block text-[#384551]">Seems legitimate</strong>
                        <small className="text-xs text-[#8592a3]">The warning may have been too cautious.</small>
                      </div>
                    </label>
                    <label className={cx("p-3 rounded-lg border cursor-pointer flex gap-2.5 items-start transition", classification === "SUSPICIOUS" ? "bg-[#ffe0db] border-[#ffb2a5] text-[#66190c] ring-2 ring-[#ffb2a5]" : "bg-white border-[#d9dee3] text-[#646e78] hover:bg-[#f5f5f9]")}>
                      <input type="radio" name={`feedback-classification-${activity.id}`} className="sr-only" checked={classification === "SUSPICIOUS"} onChange={() => setClassification("SUSPICIOUS")}/>
                      <span className="w-5 h-5 rounded-full bg-[#ff3e1d] text-white flex items-center justify-center text-xs font-bold shrink-0">!</span>
                      <div>
                        <strong className="text-xs font-bold block text-[#384551]">Seems suspicious</strong>
                        <small className="text-xs text-[#8592a3]">BantAI may have missed warning signs.</small>
                      </div>
                    </label>
                  </div>
                </fieldset>
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-semibold text-[#384551]">Reason <small className="text-[#8592a3] font-normal">(optional)</small></span>
                  <select value={reason} onChange={(event) => setReason(event.target.value)} className="h-10 px-3 rounded-md border border-[#d9dee3] text-xs bg-white focus:ring-2 focus:ring-[#696cff]/20 focus:border-[#696cff] outline-none">
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
              <button type="submit" disabled={busy || !reportedUrl.trim() || !verdict || (verdict === "INCORRECT" && !classification)} className="px-4 py-2 rounded-md bg-[#696cff] hover:bg-[#5f61e6] text-white text-xs font-bold shadow-[0_2px_4px_0_rgba(105,108,255,0.4)] transition disabled:opacity-50">
                {busy ? "Submitting..." : "Submit feedback"}
              </button>
              {onClose && (<button type="button" onClick={onClose} className="px-3 py-2 rounded-md text-xs font-semibold text-[#646e78] hover:bg-[#f5f5f9]">
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
      <section className="sneat-card p-4 sm:p-5 mb-6">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 text-xs">
          <label className="flex flex-col gap-1">
            <span className="font-semibold text-[#384551] text-xs">Type</span>
            <select value={filters.event_type} onChange={(event) => change("event_type", event.target.value)} className="h-9 px-2.5 rounded-md border border-[#d9dee3] bg-white text-xs text-[#384551] focus:ring-2 focus:ring-[#696cff]/20 focus:border-[#696cff] outline-none">
              <option value="">All activity</option>
              <option value="URL">Websites</option>
              <option value="EMAIL">Emails</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-semibold text-[#384551] text-xs">Outcome</span>
            <select value={filters.outcome} onChange={(event) => change("outcome", event.target.value)} className="h-9 px-2.5 rounded-md border border-[#d9dee3] bg-white text-xs text-[#384551] focus:ring-2 focus:ring-[#696cff]/20 focus:border-[#696cff] outline-none">
              <option value="">All outcomes</option>
              {OUTCOMES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-semibold text-[#384551] text-xs">Email provider</span>
            <select value={filters.provider} onChange={(event) => change("provider", event.target.value)} className="h-9 px-2.5 rounded-md border border-[#d9dee3] bg-white text-xs text-[#384551] focus:ring-2 focus:ring-[#696cff]/20 focus:border-[#696cff] outline-none">
              <option value="">All providers</option>
              <option value="gmail">Gmail</option>
              <option value="outlook">Outlook</option>
              <option value="yahoo">Yahoo</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-semibold text-[#384551] text-xs">From</span>
            <input type="date" value={filters.date_from} onChange={(event) => change("date_from", event.target.value)} className="h-9 px-2.5 rounded-md border border-[#d9dee3] bg-white text-xs text-[#384551] focus:ring-2 focus:ring-[#696cff]/20 focus:border-[#696cff] outline-none"/>
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-semibold text-[#384551] text-xs">To</span>
            <input type="date" value={filters.date_to} onChange={(event) => change("date_to", event.target.value)} className="h-9 px-2.5 rounded-md border border-[#d9dee3] bg-white text-xs text-[#384551] focus:ring-2 focus:ring-[#696cff]/20 focus:border-[#696cff] outline-none"/>
          </label>
        </div>
      </section>
      {error && <Notice type="error">{error}</Notice>}
      {feedbackActivity && <DetectionFeedbackCard key={feedbackActivity.id} activity={feedbackActivity} onSubmitted={load} onClose={() => setFeedbackActivity(null)}/>}
      <section className="sneat-card p-5 sm:p-6">
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-[#e4e6e8]/70">
          <div>
            <p className="text-xs font-semibold text-[#696cff] uppercase tracking-wider">ALL CHECKS</p>
            <h2 className="text-base font-bold text-[#384551]">{data ? `${data.total} retained ${data.total === 1 ? "record" : "records"}` : "Loading activity…"}</h2>
          </div>
          <span className="text-xs font-medium text-[#8592a3] bg-[#f5f5f9] px-2.5 py-1 rounded-md border border-[#e4e6e8]">90-day retention</span>
        </div>
        {data ? <ActivityTable items={data.items} onFeedback={setFeedbackActivity}/> : <DashboardSkeleton />}
        {data && data.pages > 1 && (<div className="flex items-center justify-between pt-4 mt-4 border-t border-[#e4e6e8]/70 text-xs text-[#8592a3]">
            <button disabled={page <= 1} onClick={() => setPage((value) => value - 1)} className="px-3 py-1.5 rounded-md border border-[#d9dee3] font-semibold text-[#646e78] hover:bg-[#f5f5f9] disabled:opacity-40">
              ← Previous
            </button>
            <span>Page {page} of {data.pages}</span>
            <button disabled={page >= data.pages} onClick={() => setPage((value) => value + 1)} className="px-3 py-1.5 rounded-md border border-[#d9dee3] font-semibold text-[#646e78] hover:bg-[#f5f5f9] disabled:opacity-40">
              Next →
            </button>
          </div>)}
      </section>
    </>);
}

export default ActivityPage;
