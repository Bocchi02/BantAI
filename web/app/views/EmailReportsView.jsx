"use client";
import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import { MailIcon, LockIcon } from "../Icons";
import { OUTCOMES, cx, feedbackReasonLabel, niceDate, trainingStatusLabel, userClassificationLabel, StatusBadge, Notice, EmptyState, PageHeader, DashboardSkeleton } from "../components/ViewShared";

function EmailReportsPage() {
    const [page, setPage] = useState(1);
    const [data, setData] = useState(null);
    const [provider, setProvider] = useState("gmail");
    const [sender, setSender] = useState("");
    const [subject, setSubject] = useState("");
    const [body, setBody] = useState("");
    const [observedOutcome, setObservedOutcome] = useState("SUSPICIOUS_SIGNS_FOUND");
    const [classification, setClassification] = useState("LEGITIMATE");
    const [reason, setReason] = useState("");
    const [error, setError] = useState("");
    const [message, setMessage] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const load = useCallback(() => {
        return api(`/email-reports?page=${page}&page_size=20`)
            .then(setData)
            .catch((reason) => setError(reason.message));
    }, [page]);
    useEffect(() => { void load(); }, [load]);
    const submit = async (event) => {
        event.preventDefault();
        if (!body.trim() || body.length < 10) {
            setError("Paste at least 10 characters of the email body.");
            return;
        }
        setSubmitting(true);
        setError("");
        setMessage("");
        try {
            await api("/email-reports", {
                method: "POST",
                body: JSON.stringify({
                    provider,
                    sender: sender.trim() || undefined,
                    subject: subject.trim() || undefined,
                    body: body.trim(),
                    observed_outcome: observedOutcome,
                    classification,
                    reason: reason || undefined,
                    confirmed: true,
                }),
            });
            setSender("");
            setSubject("");
            setBody("");
            setReason("");
            setMessage("Encrypted email report submitted for administrator review.");
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
      <PageHeader eyebrow="COMMUNITY SIGNALS" title="Email reports" description="Submit an encrypted report for an email that received an incorrect outcome."/>
      <div className="p-4 rounded-lg bg-[#e7e7ff]/50 border border-[#c3c4ff] flex items-center gap-3 text-xs text-[#4347d9] mb-6">
        <LockIcon className="w-5 h-5 text-[#696cff] shrink-0"/>
        <div>
          <strong className="block font-bold">Email bodies cannot be opened from this interface</strong>
          <p className="text-[#646e78] mt-0.5">The message body is encrypted immediately upon submission and stored solely for offline training preparation. It cannot be viewed by users or administrators in this dashboard.</p>
        </div>
      </div>
      <div className="grid lg:grid-cols-12 gap-6">
        <section className="lg:col-span-5 sneat-card p-5 sm:p-6" aria-labelledby="email-report-form-title">
          <h2 id="email-report-form-title" className="text-base font-bold text-[#384551] mb-1">Submit an email report</h2>
          <p className="text-xs text-[#8592a3] mb-4">Paste the email metadata and body to contribute to future model training.</p>
          {error && <Notice type="error">{error}</Notice>}
          {message && <Notice type="success">{message}</Notice>}
          <form className="space-y-4" onSubmit={submit}>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-[#384551]">Provider</span>
                <select value={provider} onChange={(event) => setProvider(event.target.value)} className="h-10 px-3 rounded-md border border-[#d9dee3] text-xs bg-white text-[#384551] focus:ring-2 focus:ring-[#696cff]/20 focus:border-[#696cff] outline-none">
                  <option value="gmail">Gmail</option>
                  <option value="outlook">Outlook</option>
                  <option value="yahoo">Yahoo</option>
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-[#384551]">Sender <small className="text-[#8592a3] font-normal">(optional)</small></span>
                <input value={sender} onChange={(event) => setSender(event.target.value)} placeholder="sender@example.com" maxLength={254} className="h-10 px-3 rounded-md border border-[#d9dee3] text-xs bg-white text-[#384551] focus:ring-2 focus:ring-[#696cff]/20 focus:border-[#696cff] outline-none"/>
              </label>
            </div>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-[#384551]">Subject <small className="text-[#8592a3] font-normal">(optional)</small></span>
              <input value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="Email subject line" maxLength={500} className="h-10 px-3 rounded-md border border-[#d9dee3] text-xs bg-white text-[#384551] focus:ring-2 focus:ring-[#696cff]/20 focus:border-[#696cff] outline-none"/>
            </label>
            <label className="flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#384551]">Message body</span>
                <span className="text-[11px] text-[#8592a3] font-mono">{body.length.toLocaleString()} chars</span>
              </div>
              <textarea value={body} onChange={(event) => setBody(event.target.value)} placeholder="Paste the email message text (minimum 10 characters)..." rows={5} maxLength={20000} required className="p-3 rounded-md border border-[#d9dee3] text-xs bg-white text-[#384551] focus:ring-2 focus:ring-[#696cff]/20 focus:border-[#696cff] outline-none resize-y"/>
              <small className="text-[11px] text-[#8592a3]">The body is never displayed after submission and remains encrypted.</small>
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
                  <input type="radio" name="email-class" className="sr-only" checked={classification === "LEGITIMATE"} onChange={() => setClassification("LEGITIMATE")}/>
                  <strong className="block font-bold text-[#384551]">Seems legitimate</strong>
                  <span className="text-[11px] text-[#8592a3] block mt-0.5">Warning was too cautious</span>
                </label>
                <label className={cx("p-3 rounded-lg border cursor-pointer text-xs transition", classification === "SUSPICIOUS" ? "bg-[#ffe0db] border-[#ffb2a5] text-[#66190c] font-semibold ring-2 ring-[#ffb2a5]" : "bg-white border-[#d9dee3] text-[#646e78] hover:bg-[#f5f5f9]")}>
                  <input type="radio" name="email-class" className="sr-only" checked={classification === "SUSPICIOUS"} onChange={() => setClassification("SUSPICIOUS")}/>
                  <strong className="block font-bold text-[#384551]">Seems suspicious</strong>
                  <span className="text-[11px] text-[#8592a3] block mt-0.5">Missed warning signs</span>
                </label>
              </div>
            </fieldset>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-[#384551]">Reason <small className="text-[#8592a3] font-normal">(optional)</small></span>
              <select value={reason} onChange={(event) => setReason(event.target.value)} className="h-10 px-3 rounded-md border border-[#d9dee3] text-xs bg-white text-[#384551] focus:ring-2 focus:ring-[#696cff]/20 focus:border-[#696cff] outline-none">
                <option value="">Select a reason</option>
                <option value="TRUSTED_OR_OFFICIAL">Trusted or official sender</option>
                <option value="INCORRECT_WARNING">Incorrect warning</option>
                <option value="MISSED_WARNING">Missed suspicious behavior</option>
                <option value="IMPERSONATION_OR_DECEPTIVE">Impersonation or deceptive email</option>
                <option value="OTHER">Other</option>
              </select>
            </label>
            <button type="submit" disabled={submitting || body.length < 10} className="w-full mt-2 py-2.5 px-4 rounded-md bg-[#696cff] hover:bg-[#5f61e6] text-white text-xs font-bold shadow-[0_2px_4px_0_rgba(105,108,255,0.4)] transition disabled:opacity-50">
              {submitting ? "Encrypting & submitting…" : "Submit encrypted report"}
            </button>
          </form>
        </section>
        <section className="lg:col-span-7 sneat-card p-5 sm:p-6" aria-labelledby="email-reports-list-title">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-[#e4e6e8]/70">
            <div>
              <p className="text-xs font-semibold text-[#696cff] uppercase tracking-wider">YOUR SUBMISSIONS</p>
              <h2 id="email-reports-list-title" className="text-base font-bold text-[#384551]">Reported emails</h2>
            </div>
            <span className="text-xs font-medium text-[#8592a3] bg-[#f5f5f9] px-2.5 py-1 rounded-md border border-[#e4e6e8]">{data ? `${data.total} total` : "—"}</span>
          </div>
          {data && data.items.length > 0 ? (<div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-[#646e78]">
                <thead className="text-[11px] font-bold text-[#8592a3] uppercase tracking-wider bg-[#f5f5f9]/80 border-b border-[#e4e6e8]">
                  <tr>
                    <th className="py-3 px-3.5">Email</th>
                    <th className="py-3 px-3.5">Result</th>
                    <th className="py-3 px-3.5">Your review</th>
                    <th className="py-3 px-3.5">Status</th>
                    <th className="py-3 px-3.5">Submitted</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e4e6e8]/70">
                  {data.items.map((report) => (<tr key={report.id} className="hover:bg-[#fbfbfd]">
                      <td className="py-3 px-3.5 max-w-[200px]">
                        <strong className="block truncate font-semibold text-[#384551]" title={report.subject || "No subject"}>{report.subject || "No subject"}</strong>
                        <small className="text-[#8592a3] block text-[11px] truncate">{report.sender || "No sender"} · {report.provider.toUpperCase()}</small>
                      </td>
                      <td className="py-3 px-3.5"><StatusBadge outcome={report.observed_outcome}/></td>
                      <td className="py-3 px-3.5 text-[11px] font-medium">{userClassificationLabel(report.classification)}</td>
                      <td className="py-3 px-3.5"><span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[#f5f5f9] text-[#646e78] border border-[#e4e6e8]">{trainingStatusLabel(report.training_status)}</span></td>
                      <td className="py-3 px-3.5 text-[11px] text-[#8592a3] whitespace-nowrap">{niceDate(report.created_at)}</td>
                    </tr>))}
                </tbody>
              </table>
            </div>) : data ? (<EmptyState icon="✉" title="No email reports yet" text="When you report an email result, its metadata and review status will appear here."/>) : (<DashboardSkeleton />)}
          {data && data.pages > 1 && (<div className="flex items-center justify-between pt-4 mt-4 border-t border-[#e4e6e8]/70 text-xs text-[#8592a3]">
              <button disabled={page <= 1} onClick={() => setPage((value) => value - 1)} className="px-3 py-1.5 rounded-md border border-[#d9dee3] font-semibold text-[#646e78] hover:bg-[#f5f5f9] disabled:opacity-40">← Previous</button>
              <span>Page {page} of {data.pages}</span>
              <button disabled={page >= data.pages} onClick={() => setPage((value) => value + 1)} className="px-3 py-1.5 rounded-md border border-[#d9dee3] font-semibold text-[#646e78] hover:bg-[#f5f5f9] disabled:opacity-40">Next →</button>
            </div>)}
        </section>
      </div>
    </>);
}

export default EmailReportsPage;
