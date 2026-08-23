"use client";
import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import { LockIcon } from "../Icons";
import { userClassificationLabel, feedbackReasonLabel, trainingStatusLabel, niceDate, StatusBadge, Notice, EmptyState, PageHeader, DashboardSkeleton } from "../components/ViewShared";

function AdminEmailReportsPage() {
    const [page, setPage] = useState(1);
    const [trainingFilter, setTrainingFilter] = useState("");
    const [classificationFilter, setClassificationFilter] = useState("");
    const [data, setData] = useState(null);
    const [busyId, setBusyId] = useState("");
    const [error, setError] = useState("");
    const [message, setMessage] = useState("");
    const load = useCallback(() => {
        const params = new URLSearchParams({ page: String(page), page_size: "25" });
        if (trainingFilter)
            params.set("training_status", trainingFilter);
        if (classificationFilter)
            params.set("classification", classificationFilter);
        return api(`/admin/email-reports?${params}`)
            .then(setData)
            .catch((problem) => setError(problem.message || "BantAI could not load email reports."));
    }, [classificationFilter, page, trainingFilter]);
    useEffect(() => { void load(); }, [load]);
    const review = async (report, action, assessment) => {
        setBusyId(report.id);
        setError("");
        setMessage("");
        try {
            const result = await api(`/admin/email-reports/${report.id}`, { method: "PATCH", body: JSON.stringify({ action, assessment }) });
            setMessage(result.message);
            await load();
        }
        catch (problem) {
            setError(problem instanceof Error ? problem.message : "BantAI could not save this email report.");
        }
        finally {
            setBusyId("");
        }
    };
    return (<>
      <PageHeader eyebrow="ADMINISTRATION" title="Email reports" description="Assess explicit email submissions without exposing their encrypted body content."/>
      <div className="p-4 rounded-xl bg-blue-50 border border-blue-200 flex items-center gap-3 text-xs text-[#071E4A] mb-6">
        <LockIcon className="w-5 h-5 text-[#087EFF] shrink-0"/>
        <div>
          <strong className="block font-bold">Email bodies cannot be opened from this interface</strong>
          <p className="text-slate-600 mt-0.5">You can review sender, subject, detector outcome, and the user’s suggested label. Approval copies the existing ciphertext into the de-identified training inventory.</p>
        </div>
      </div>
      {error && <Notice type="error">{error}</Notice>}
      {message && <Notice type="success">{message}</Notice>}
      <section className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm mb-6 grid sm:grid-cols-2 gap-3 text-xs">
        <label className="flex flex-col gap-1">
          <span className="font-semibold text-slate-600">Training status</span>
          <select value={trainingFilter} onChange={(event) => { setPage(1); setTrainingFilter(event.target.value); }} className="h-9 px-2.5 rounded-lg border border-slate-300 bg-white text-xs">
            <option value="">All feedback</option>
            <option value="PENDING">Awaiting review</option>
            <option value="APPROVED">Training candidates</option>
            <option value="REJECTED">Rejected</option>
            <option value="INCONCLUSIVE">Inconclusive</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-semibold text-slate-600">User classification</span>
          <select value={classificationFilter} onChange={(event) => { setPage(1); setClassificationFilter(event.target.value); }} className="h-9 px-2.5 rounded-lg border border-slate-300 bg-white text-xs">
            <option value="">All classifications</option>
            <option value="LEGITIMATE">Believes legitimate</option>
            <option value="SUSPICIOUS">Believes suspicious</option>
          </select>
        </label>
      </section>

      <section className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm">
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
          <div>
            <p className="text-[10px] font-bold text-[#087EFF] uppercase tracking-wider">ENCRYPTED EMAIL REPORT QUEUE</p>
            <h2 className="text-base font-bold text-[#04142F]">{data ? `${data.total} ${data.total === 1 ? "submission" : "submissions"}` : "Loading submissions..."}</h2>
          </div>
          <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full">{data ? `${data.training_candidate_total} approved candidates` : "Body unavailable"}</span>
        </div>

        {data && data.items.length > 0 ? (<div className="space-y-4">
            {data.items.map((report) => (<article className="p-5 rounded-xl border border-slate-200 bg-slate-50/50 space-y-4" key={report.id}>
                <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-200/60">
                  <div>
                    <p className="text-[9px] font-bold text-[#087EFF] uppercase tracking-wider">{report.provider.toUpperCase()} EMAIL</p>
                    <h3 className="text-sm font-bold text-slate-900">{report.subject || "No subject"}</h3>
                    <p className="text-xs text-slate-400 mt-0.5">From {report.sender} · {report.body_character_count.toLocaleString()} encrypted characters · {report.similar_report_count || 1} similar {(report.similar_report_count || 1) === 1 ? "submission" : "submissions"} · Submitted {niceDate(report.submitted_at)}</p>
                  </div>
                  <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-blue-50 text-[#071E4A] border border-blue-200 shrink-0">Encrypted body</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Detector result</span>
                    <StatusBadge outcome={report.detector_outcome}/>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1">User label</span>
                    <strong className="text-xs font-bold text-slate-800">{userClassificationLabel(report.user_classification)}</strong>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Reason</span>
                    <strong className="text-xs font-bold text-slate-800">{feedbackReasonLabel(report.feedback_reason)}</strong>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Training status</span>
                    <strong className="text-xs font-bold text-[#087EFF]">{trainingStatusLabel(report.training_status)}</strong>
                  </div>
                </div>
                {report.training_status === "PENDING" ? (<fieldset className="pt-3 border-t border-slate-200/60 flex flex-wrap items-center gap-2" disabled={busyId === report.id}>
                    <legend className="text-xs font-semibold text-slate-700 mr-2">Store encrypted content for future training?</legend>
                    <button type="button" className="px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-300 text-emerald-800 hover:bg-emerald-100 text-xs font-bold" onClick={() => void review(report, "APPROVE", "LEGITIMATE")}>Approve legitimate</button>
                    <button type="button" className="px-3 py-1.5 rounded-lg bg-rose-50 border border-rose-300 text-rose-800 hover:bg-rose-100 text-xs font-bold" onClick={() => void review(report, "APPROVE", "SUSPICIOUS")}>Approve suspicious</button>
                    <button type="button" className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100 text-xs font-semibold" onClick={() => void review(report, "REJECT")}>Reject feedback</button>
                    <button type="button" className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100 text-xs font-semibold" onClick={() => void review(report, "INCONCLUSIVE")}>Inconclusive</button>
                  </fieldset>) : (<div className="pt-3 border-t border-slate-200/60 flex items-center justify-between text-xs text-slate-500">
                    <strong className="text-slate-800">Review complete</strong>
                    <span>{trainingStatusLabel(report.training_status)} · {report.reviewed_at ? niceDate(report.reviewed_at) : "Review time unavailable"}</span>
                  </div>)}
              </article>))}
          </div>) : data ? (<EmptyState icon="✉" title="No email reports in this view" text="Explicit email submissions will appear here without readable body content."/>) : (<DashboardSkeleton />)}

        {data && data.pages > 1 && (<div className="flex items-center justify-between pt-4 mt-4 border-t border-slate-100 text-xs text-slate-500">
            <button disabled={page <= 1} onClick={() => setPage((value) => value - 1)} className="px-3 py-1.5 rounded-lg border border-slate-200 font-semibold hover:bg-slate-50 disabled:opacity-40">← Previous</button>
            <span>Page {page} of {data.pages}</span>
            <button disabled={page >= data.pages} onClick={() => setPage((value) => value + 1)} className="px-3 py-1.5 rounded-lg border border-slate-200 font-semibold hover:bg-slate-50 disabled:opacity-40">Next →</button>
          </div>)}
      </section>
      <p className="text-[11px] text-slate-400 text-center max-w-2xl mx-auto mt-6 leading-relaxed"><strong>Encrypted reports only.</strong> Approval does not expose the email body or retrain the frozen XLM-R V1 model.</p>
    </>);
}

export default AdminEmailReportsPage;
