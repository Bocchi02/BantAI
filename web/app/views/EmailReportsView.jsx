"use client";
import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import { MailIcon } from "../Icons";
import { OUTCOMES, cx, userClassificationLabel, trainingStatusLabel, niceDate, StatusBadge, Notice, EmptyState, PageHeader, DashboardSkeleton } from "../components/ViewShared";

function EmailReportsPage() {
    const [page, setPage] = useState(1);
    const [data, setData] = useState(null);
    const [provider, setProvider] = useState("gmail");
    const [sender, setSender] = useState("");
    const [subject, setSubject] = useState("");
    const [body, setBody] = useState("");
    const [detectorOutcome, setDetectorOutcome] = useState("");
    const [classification, setClassification] = useState("LEGITIMATE");
    const [reason, setReason] = useState("");
    const [confirmed, setConfirmed] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [message, setMessage] = useState("");
    const load = useCallback(() => api(`/email-reports?page=${page}&page_size=25`)
        .then(setData)
        .catch((problem) => setError(problem.message || "BantAI could not load email reports.")), [page]);
    useEffect(() => { void load(); }, [load]);
    const submit = async (event) => {
        event.preventDefault();
        if (!sender.trim() || !body.trim() || !detectorOutcome || !confirmed) {
            setError("Complete the required fields and confirm the encrypted training submission.");
            return;
        }
        setBusy(true);
        setError("");
        setMessage("");
        try {
            const result = await api("/email-reports", {
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
        }
        catch (problem) {
            setError(problem instanceof Error ? problem.message : "BantAI could not submit this email report.");
        }
        finally {
            setBusy(false);
        }
    };
    return (<>
      <PageHeader eyebrow="RESULT FEEDBACK" title="Submit an email report" description="Provide an email only when you want it considered as an encrypted reference for a future model-training cycle."/>
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
                <select value={provider} onChange={(event) => setProvider(event.target.value)} className="h-10 px-3 rounded-xl border border-slate-300 text-xs bg-white focus:ring-2 focus:ring-[#087EFF] outline-none">
                  <option value="gmail">Gmail</option>
                  <option value="outlook">Outlook</option>
                  <option value="yahoo">Yahoo Mail</option>
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-slate-700">Sender</span>
                <input value={sender} onChange={(event) => setSender(event.target.value)} maxLength={320} placeholder="Sender name or address" required className="h-10 px-3 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-[#087EFF] outline-none"/>
              </label>
            </div>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-slate-700">Subject</span>
              <input value={subject} onChange={(event) => setSubject(event.target.value)} maxLength={500} placeholder="Email subject, if available" className="h-10 px-3 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-[#087EFF] outline-none"/>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-slate-700">Email body</span>
              <textarea value={body} onChange={(event) => setBody(event.target.value)} maxLength={10000} rows={6} placeholder="Paste the email message here" aria-describedby="email-body-help" required className="w-full p-3 rounded-xl border border-slate-300 text-xs font-mono focus:ring-2 focus:ring-[#087EFF] outline-none"/>
            </label>
            <p id="email-body-help" className="text-[11px] text-slate-400">The body is encrypted before database storage. It cannot be read from the user or administrator interface and is reserved for an approved offline training process.</p>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-slate-700">What result did BantAI show?</span>
              <select value={detectorOutcome} onChange={(event) => setDetectorOutcome(event.target.value)} required className="h-10 px-3 rounded-xl border border-slate-300 text-xs bg-white focus:ring-2 focus:ring-[#087EFF] outline-none">
                <option value="">Select the displayed result</option>
                {OUTCOMES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </label>
            <fieldset className="space-y-1 border-0 p-0 m-0">
              <legend className="text-xs font-semibold text-slate-700 mb-2">What do you believe about this email?</legend>
              <div className="grid sm:grid-cols-2 gap-3">
                <label className={cx("p-3.5 rounded-xl border cursor-pointer flex gap-3 items-start transition", classification === "LEGITIMATE" ? "bg-emerald-50 border-emerald-300 text-emerald-950 ring-2 ring-emerald-200" : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50")}>
                  <input type="radio" name="email-classification" checked={classification === "LEGITIMATE"} onChange={() => setClassification("LEGITIMATE")} className="sr-only"/>
                  <span className="w-6 h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center text-xs font-bold shrink-0">✓</span>
                  <div>
                    <strong className="text-xs font-bold block">Seems legitimate</strong>
                    <small className="text-[11px] text-slate-500">The warning may have been too cautious.</small>
                  </div>
                </label>
                <label className={cx("p-3.5 rounded-xl border cursor-pointer flex gap-3 items-start transition", classification === "SUSPICIOUS" ? "bg-rose-50 border-rose-300 text-rose-950 ring-2 ring-rose-200" : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50")}>
                  <input type="radio" name="email-classification" checked={classification === "SUSPICIOUS"} onChange={() => setClassification("SUSPICIOUS")} className="sr-only"/>
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
              <select value={reason} onChange={(event) => setReason(event.target.value)} className="h-10 px-3 rounded-xl border border-slate-300 text-xs bg-white focus:ring-2 focus:ring-[#087EFF] outline-none">
                <option value="">Select a reason</option>
                <option value="TRUSTED_OR_OFFICIAL">Trusted or official sender</option>
                <option value="INCORRECT_WARNING">Incorrect warning</option>
                <option value="MISSED_WARNING">Missed suspicious behavior</option>
                <option value="IMPERSONATION_OR_DECEPTIVE">Impersonation or deceptive message</option>
                <option value="OTHER">Other</option>
              </select>
            </label>
            <label className="flex items-start gap-3 p-3.5 rounded-xl bg-blue-50/60 border border-blue-200 cursor-pointer">
              <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} className="mt-0.5 rounded text-[#087EFF]"/>
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
              <MailIcon className="w-5 h-5"/>
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
        {data && data.items.length > 0 ? (<div className="overflow-x-auto">
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
                {data.items.map((report) => (<tr key={report.id} className="hover:bg-slate-50">
                    <td className="py-3 px-3 max-w-xs">
                      <strong className="block truncate font-semibold text-slate-900" title={report.subject || "No subject"}>{report.subject || "No subject"}</strong>
                      <small className="text-slate-400 block">{report.sender} · {report.provider.toUpperCase()} · Encrypted body included</small>
                    </td>
                    <td className="py-3 px-3"><StatusBadge outcome={report.detector_outcome}/></td>
                    <td className="py-3 px-3"><span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-[#071E4A]">{userClassificationLabel(report.user_classification)}</span></td>
                    <td className="py-3 px-3"><span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">{trainingStatusLabel(report.training_status)}</span></td>
                    <td className="py-3 px-3 text-slate-400 whitespace-nowrap">{niceDate(report.submitted_at)}</td>
                  </tr>))}
              </tbody>
            </table>
          </div>) : data ? (<EmptyState icon="✉" title="No email reports" text="Submit an email above only when you want it considered for future training."/>) : (<DashboardSkeleton />)}
        {data && data.pages > 1 && (<div className="flex items-center justify-between pt-4 mt-4 border-t border-slate-100 text-xs text-slate-500">
            <button disabled={page <= 1} onClick={() => setPage((value) => value - 1)} className="px-3 py-1.5 rounded-lg border border-slate-200 font-semibold hover:bg-slate-50 disabled:opacity-40">← Previous</button>
            <span>Page {page} of {data.pages}</span>
            <button disabled={page >= data.pages} onClick={() => setPage((value) => value + 1)} className="px-3 py-1.5 rounded-lg border border-slate-200 font-semibold hover:bg-slate-50 disabled:opacity-40">Next →</button>
          </div>)}
      </section>
      <p className="text-[11px] text-slate-400 text-center max-w-2xl mx-auto mt-6 leading-relaxed"><strong>Training reference only.</strong> Submission does not retrain XLM-R V1 or guarantee that the email is legitimate or malicious.</p>
    </>);
}

export default EmailReportsPage;
