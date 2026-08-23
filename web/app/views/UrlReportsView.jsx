"use client";
import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import { GlobeIcon } from "../Icons";
import { OUTCOMES, cx, userClassificationLabel, feedbackVerdictLabel, feedbackReasonLabel, trainingStatusLabel, niceDate, StatusBadge, Notice, EmptyState, PageHeader, DashboardSkeleton } from "../components/ViewShared";

function UrlReportsPage() {
    const [page, setPage] = useState(1);
    const [data, setData] = useState(null);
    const [url, setUrl] = useState("");
    const [detectorOutcome, setDetectorOutcome] = useState("");
    const [classification, setClassification] = useState("LEGITIMATE");
    const [reason, setReason] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [message, setMessage] = useState("");
    const load = useCallback(() => {
        return api(`/url-reports?page=${page}&page_size=25`)
            .then(setData)
            .catch((reason) => setError(reason.message || "BantAI could not load website reports."));
    }, [page]);
    useEffect(() => { void load(); }, [load]);
    const submit = async (event) => {
        event.preventDefault();
        if (!url.trim() || !detectorOutcome)
            return;
        setBusy(true);
        setError("");
        setMessage("");
        try {
            const result = await api("/url-reports", {
                method: "POST",
                body: JSON.stringify({ url: url.trim(), detector_outcome: detectorOutcome, classification, reason: reason || undefined }),
            });
            setUrl("");
            setDetectorOutcome("");
            setReason("");
            setMessage(result.message);
            setPage(1);
            await load();
        }
        catch (reason) {
            setError(reason instanceof Error ? reason.message : "BantAI could not submit this website report.");
        }
        finally {
            setBusy(false);
        }
    };
    return (<>
      <PageHeader eyebrow="RESULT FEEDBACK" title="Report a website result" description="Paste the complete website address, including its path, when you believe BantAI classified it incorrectly."/>
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
              <input type="url" inputMode="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://example.com" maxLength={2048} autoCapitalize="none" autoComplete="off" spellCheck={false} aria-describedby="url-report-help" required className="h-10 px-3 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-[#087EFF] outline-none"/>
            </label>
            <p id="url-report-help" className="text-[11px] text-slate-400">Paste the complete address from your browser. BantAI retains its path for administrator review and future training-data assessment.</p>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-slate-700">What result did BantAI show?</span>
              <select value={detectorOutcome} onChange={(event) => setDetectorOutcome(event.target.value)} required className="h-10 px-3 rounded-xl border border-slate-300 text-xs bg-white focus:ring-2 focus:ring-[#087EFF] outline-none">
                <option value="">Select the displayed result</option>
                {OUTCOMES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </label>
            <fieldset className="space-y-1 border-0 p-0 m-0">
              <legend className="text-xs font-semibold text-slate-700 mb-2">What do you believe about this website?</legend>
              <div className="grid sm:grid-cols-2 gap-3">
                <label className={cx("p-3.5 rounded-xl border cursor-pointer flex gap-3 items-start transition", classification === "LEGITIMATE" ? "bg-emerald-50 border-emerald-300 text-emerald-950 ring-2 ring-emerald-200" : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50")}>
                  <input type="radio" name="classification" value="LEGITIMATE" checked={classification === "LEGITIMATE"} onChange={() => setClassification("LEGITIMATE")} className="sr-only"/>
                  <span className="w-6 h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center text-xs font-bold shrink-0">✓</span>
                  <div>
                    <strong className="text-xs font-bold block">Legitimate website</strong>
                    <small className="text-[11px] text-slate-500 leading-snug">The detection may have been too cautious.</small>
                  </div>
                </label>
                <label className={cx("p-3.5 rounded-xl border cursor-pointer flex gap-3 items-start transition", classification === "SUSPICIOUS" ? "bg-rose-50 border-rose-300 text-rose-950 ring-2 ring-rose-200" : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50")}>
                  <input type="radio" name="classification" value="SUSPICIOUS" checked={classification === "SUSPICIOUS"} onChange={() => setClassification("SUSPICIOUS")} className="sr-only"/>
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
              <select value={reason} onChange={(event) => setReason(event.target.value)} className="h-10 px-3 rounded-xl border border-slate-300 text-xs bg-white focus:ring-2 focus:ring-[#087EFF] outline-none">
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
              <GlobeIcon className="w-5 h-5"/>
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
        {data && data.items.length > 0 ? (<div className="overflow-x-auto">
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
                {data.items.map((report) => (<tr key={report.id} className="hover:bg-slate-50">
                    <td className="py-3 px-3 max-w-xs">
                      <strong className="block truncate font-semibold text-slate-900" title={report.url}>{report.url}</strong>
                      <small className="text-slate-400 block">{feedbackReasonLabel(report.feedback_reason)}</small>
                    </td>
                    <td className="py-3 px-3"><StatusBadge outcome={report.detector_outcome}/></td>
                    <td className="py-3 px-3">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-[#071E4A]">{feedbackVerdictLabel(report.feedback_verdict)}</span>
                      <small className="text-slate-400 block mt-0.5">{userClassificationLabel(report.user_classification)}</small>
                    </td>
                    <td className="py-3 px-3">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">{trainingStatusLabel(report.training_status)}</span>
                      {report.reviewed_at && <small className="text-slate-400 block mt-0.5">Reviewed {niceDate(report.reviewed_at)}</small>}
                    </td>
                    <td className="py-3 px-3 text-slate-400 whitespace-nowrap">{niceDate(report.submitted_at)}</td>
                  </tr>))}
              </tbody>
            </table>
          </div>) : data ? (<EmptyState icon="!" title="No website reports" text="Enter a website address above when you believe its detection outcome may be wrong."/>) : (<DashboardSkeleton />)}
        {data && data.pages > 1 && (<div className="flex items-center justify-between pt-4 mt-4 border-t border-slate-100 text-xs text-slate-500">
            <button disabled={page <= 1} onClick={() => setPage((value) => value - 1)} className="px-3 py-1.5 rounded-lg border border-slate-200 font-semibold hover:bg-slate-50 disabled:opacity-40">← Previous</button>
            <span>Page {page} of {data.pages}</span>
            <button disabled={page >= data.pages} onClick={() => setPage((value) => value + 1)} className="px-3 py-1.5 rounded-lg border border-slate-200 font-semibold hover:bg-slate-50 disabled:opacity-40">Next →</button>
          </div>)}
      </section>
      <p className="text-[11px] text-slate-400 text-center max-w-2xl mx-auto mt-6 leading-relaxed"><strong>Reports are decision-support feedback.</strong> They do not automatically retrain the frozen detector or guarantee that a website is legitimate or malicious.</p>
    </>);
}

export default UrlReportsPage;
