"use client";
import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import { GlobeIcon, LockIcon } from "../Icons";
import { OUTCOMES, cx, feedbackReasonLabel, niceDate, trainingStatusLabel, userClassificationLabel, StatusBadge, Notice, EmptyState, PageHeader, DashboardSkeleton } from "../components/ViewShared";

function UrlReportsPage() {
    const [page, setPage] = useState(1);
    const [data, setData] = useState(null);
    const [url, setUrl] = useState("");
    const [observedOutcome, setObservedOutcome] = useState("SUSPICIOUS_SIGNS_FOUND");
    const [classification, setClassification] = useState("LEGITIMATE");
    const [reason, setReason] = useState("");
    const [error, setError] = useState("");
    const [message, setMessage] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const load = useCallback(() => {
        return api(`/url-reports?page=${page}&page_size=20`)
            .then(setData)
            .catch((reason) => setError(reason.message));
    }, [page]);
    useEffect(() => { void load(); }, [load]);
    const submit = async (event) => {
        event.preventDefault();
        setSubmitting(true);
        setError("");
        setMessage("");
        try {
            await api("/url-reports", {
                method: "POST",
                body: JSON.stringify({
                    url: url.trim(),
                    detector_outcome: observedOutcome,
                    classification,
                    reason: reason || undefined,
                }),
            });
            setUrl("");
            setReason("");
            setMessage("Report submitted for administrator review.");
            setPage(1);
            await load();
        }
        catch (reason) {
            setError(reason instanceof Error ? reason.message : "BantAI could not submit this report.");
        }
        finally {
            setSubmitting(false);
        }
    };
    return (<>
      <PageHeader eyebrow="COMMUNITY SIGNALS" title="URL reports" description="Report a website result that looked incorrect so an administrator can review it."/>
      <div className="p-4 rounded-lg bg-[#e7e7ff]/50 border border-[#c3c4ff] flex items-center gap-3 text-xs text-[#4347d9] mb-6">
        <LockIcon className="w-5 h-5 text-[#696cff] shrink-0"/>
        <div>
          <strong className="block font-bold">Routine history keeps only website origins</strong>
          <p className="text-[#646e78] mt-0.5">Full URLs can be collected through explicit reports or optional automatic contribution. When you report a website result, the complete website address, including its path, is sent for review.</p>
        </div>
      </div>
      <div className="grid lg:grid-cols-12 gap-6">
        <section className="lg:col-span-5 sneat-card p-5 sm:p-6" aria-labelledby="url-report-form-title">
          <h2 id="url-report-form-title" className="text-base font-bold text-[#384551] mb-1">Submit a URL report</h2>
          <p className="text-xs text-[#8592a3] mb-4">Paste the complete address that you believe produced an incorrect outcome.</p>
          {error && <Notice type="error">{error}</Notice>}
          {message && <Notice type="success">{message}</Notice>}
          <form className="space-y-4" onSubmit={submit}>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-[#384551]">Complete website address</span>
              <input type="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://example.com/login" maxLength={2048} required className="h-10 px-3.5 rounded-md border border-[#d9dee3] text-xs bg-white text-[#384551] focus:ring-2 focus:ring-[#696cff]/20 focus:border-[#696cff] outline-none"/>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-[#384551]">What result did BantAI show?</span>
              <select value={observedOutcome} onChange={(event) => setObservedOutcome(event.target.value)} className="h-10 px-3 rounded-md border border-[#d9dee3] text-xs bg-white text-[#384551] focus:ring-2 focus:ring-[#696cff]/20 focus:border-[#696cff] outline-none">
                {OUTCOMES.map((item) => (<option key={item.value} value={item.value}>{item.label}</option>))}
              </select>
            </label>
            <fieldset className="space-y-1 border-0 p-0 m-0">
              <legend className="text-xs font-semibold text-[#384551] mb-1.5">Do you think BantAI got this result right?</legend>
              <div className="grid grid-cols-2 gap-2">
                <label className={cx("p-3 rounded-lg border cursor-pointer text-xs transition", classification === "LEGITIMATE" ? "bg-[#e8fadf] border-[#c6f1af] text-[#2d5816] font-semibold ring-2 ring-[#c6f1af]" : "bg-white border-[#d9dee3] text-[#646e78] hover:bg-[#f5f5f9]")}>
                  <input type="radio" name="url-class" className="sr-only" checked={classification === "LEGITIMATE"} onChange={() => setClassification("LEGITIMATE")}/>
                  <strong className="block font-bold text-[#384551]">Seems legitimate</strong>
                  <span className="text-[11px] text-[#8592a3] block mt-0.5">Warning was too cautious</span>
                </label>
                <label className={cx("p-3 rounded-lg border cursor-pointer text-xs transition", classification === "SUSPICIOUS" ? "bg-[#ffe0db] border-[#ffb2a5] text-[#66190c] font-semibold ring-2 ring-[#ffb2a5]" : "bg-white border-[#d9dee3] text-[#646e78] hover:bg-[#f5f5f9]")}>
                  <input type="radio" name="url-class" className="sr-only" checked={classification === "SUSPICIOUS"} onChange={() => setClassification("SUSPICIOUS")}/>
                  <strong className="block font-bold text-[#384551]">Seems suspicious</strong>
                  <span className="text-[11px] text-[#8592a3] block mt-0.5">Missed warning signs</span>
                </label>
              </div>
            </fieldset>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-[#384551]">Reason <small className="text-[#8592a3] font-normal">(optional)</small></span>
              <select value={reason} onChange={(event) => setReason(event.target.value)} className="h-10 px-3 rounded-md border border-[#d9dee3] text-xs bg-white text-[#384551] focus:ring-2 focus:ring-[#696cff]/20 focus:border-[#696cff] outline-none">
                <option value="">Select a reason</option>
                <option value="TRUSTED_OR_OFFICIAL">Trusted or official website</option>
                <option value="INCORRECT_WARNING">Incorrect warning</option>
                <option value="MISSED_WARNING">Missed suspicious behavior</option>
                <option value="IMPERSONATION_OR_DECEPTIVE">Impersonation or deceptive domain</option>
                <option value="OTHER">Other</option>
              </select>
            </label>
            <button type="submit" disabled={submitting || !url.trim()} className="w-full mt-2 py-2.5 px-4 rounded-md bg-[#696cff] hover:bg-[#5f61e6] text-white text-xs font-bold shadow-[0_2px_4px_0_rgba(105,108,255,0.4)] transition disabled:opacity-50">
              {submitting ? "Submitting…" : "Submit feedback"}
            </button>
          </form>
        </section>
        <section className="lg:col-span-7 sneat-card p-5 sm:p-6" aria-labelledby="url-reports-list-title">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-[#e4e6e8]/70">
            <div>
              <p className="text-xs font-semibold text-[#696cff] uppercase tracking-wider">YOUR SUBMISSIONS</p>
              <h2 id="url-reports-list-title" className="text-base font-bold text-[#384551]">Reported website addresses</h2>
            </div>
            <span className="text-xs font-medium text-[#8592a3] bg-[#f5f5f9] px-2.5 py-1 rounded-md border border-[#e4e6e8]">{data ? `${data.total} total` : "—"}</span>
          </div>
          {data && data.items.length > 0 ? (<div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-[#646e78]">
                <thead className="text-[11px] font-bold text-[#8592a3] uppercase tracking-wider bg-[#f5f5f9]/80 border-b border-[#e4e6e8]">
                  <tr>
                    <th className="py-3 px-3.5">Address</th>
                    <th className="py-3 px-3.5">Result</th>
                    <th className="py-3 px-3.5">Your review</th>
                    <th className="py-3 px-3.5">Status</th>
                    <th className="py-3 px-3.5">Submitted</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e4e6e8]/70">
                  {data.items.map((report) => (<tr key={report.id} className="hover:bg-[#fbfbfd]">
                      <td className="py-3 px-3.5 max-w-[200px]">
                        <strong className="block truncate font-semibold text-[#384551]" title={report.url}>{report.url}</strong>
                        <small className="text-[#8592a3] block text-[11px]">{feedbackReasonLabel(report.feedback_reason)}</small>
                      </td>
                      <td className="py-3 px-3.5"><StatusBadge outcome={report.detector_outcome}/></td>
                      <td className="py-3 px-3.5 text-[11px] font-medium">{userClassificationLabel(report.user_classification)}</td>
                      <td className="py-3 px-3.5"><span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-[#f5f5f9] text-[#646e78] border border-[#e4e6e8]">{trainingStatusLabel(report.training_status)}</span>{report.review_history?.map((review, index) => <small key={`${review.reviewed_at}-${index}`} className="block text-xs text-[#8592a3] mt-1 max-w-[220px]">{review.assessment ? `Admin label: ${review.assessment === "LEGITIMATE" ? "Legitimate" : "Suspicious"}. ` : ""}{review.reason || "No review reason provided."} Reviewed by {review.reviewer} on {niceDate(review.reviewed_at)}.</small>)}</td>
                      <td className="py-3 px-3.5 text-[11px] text-[#8592a3] whitespace-nowrap">{niceDate(report.submitted_at)}</td>
                    </tr>))}
                </tbody>
              </table>
            </div>) : data ? (<EmptyState icon="◎" title="No URL reports yet" text="When you report a website result, your submission and its review status will appear here."/>) : (<DashboardSkeleton />)}
          {data && data.pages > 1 && (<div className="flex items-center justify-between pt-4 mt-4 border-t border-[#e4e6e8]/70 text-xs text-[#8592a3]">
              <button disabled={page <= 1} onClick={() => setPage((value) => value - 1)} className="px-3 py-1.5 rounded-md border border-[#d9dee3] font-semibold text-[#646e78] hover:bg-[#f5f5f9] disabled:opacity-40">← Previous</button>
              <span>Page {page} of {data.pages}</span>
              <button disabled={page >= data.pages} onClick={() => setPage((value) => value + 1)} className="px-3 py-1.5 rounded-md border border-[#d9dee3] font-semibold text-[#646e78] hover:bg-[#f5f5f9] disabled:opacity-40">Next →</button>
            </div>)}
        </section>
      </div>
    </>);
}

export default UrlReportsPage;
