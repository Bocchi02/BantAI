"use client";
import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import { MailIcon, LockIcon } from "../Icons";
import { feedbackReasonLabel, niceDate, trainingStatusLabel, userClassificationLabel, StatusBadge, Notice, EmptyState, PageHeader, DashboardSkeleton } from "../components/ViewShared";

function queueAge(seconds) {
    if (!Number.isFinite(seconds)) return "none pending";
    if (seconds < 3600) return `${Math.max(1, Math.round(seconds / 60))} min old`;
    if (seconds < 86400) return `${Math.round(seconds / 3600)} hr old`;
    return `${Math.round(seconds / 86400)} days old`;
}

function AdminEmailReportsPage() {
    const [page, setPage] = useState(1);
    const [statusFilter, setStatusFilter] = useState("PENDING");
    const [data, setData] = useState(null);
    const [error, setError] = useState("");
    const [message, setMessage] = useState("");
    const [actionBusy, setActionBusy] = useState(null);
    const [adminNotes, setAdminNotes] = useState({});
    const load = useCallback(() => {
        const params = new URLSearchParams({ page: String(page), page_size: "15" });
        if (statusFilter) params.set("training_status", statusFilter);
        return api(`/admin/email-reports?${params}`)
            .then(setData)
            .catch((reason) => setError(reason.message));
    }, [page, statusFilter]);
    useEffect(() => { void load(); }, [load]);
    const decide = async (reportId, status, label) => {
        setActionBusy(reportId);
        setError("");
        setMessage("");
        try {
            await api(`/admin/email-reports/${reportId}`, {
                method: "PATCH",
                body: JSON.stringify({
                    action: { APPROVED: "APPROVE", REJECTED: "REJECT", INCONCLUSIVE: "INCONCLUSIVE" }[status],
                    assessment: label || undefined,
                    reason: adminNotes[reportId]?.trim() || undefined,
                }),
            });
            setMessage(`Email report marked as ${trainingStatusLabel(status)}.`);
            await load();
        }
        catch (reason) {
            setError(reason instanceof Error ? reason.message : "Signalam could not complete that review.");
        }
        finally {
            setActionBusy(null);
        }
    };
    return (<>
      <PageHeader eyebrow="ADMINISTRATION" title="Email reports" description="Review encrypted email submissions and assign approved labels for future training datasets."/>
      <div className="p-4 rounded-lg bg-[#e7e7ff]/50 border border-[#c3c4ff] flex items-center gap-3 text-xs text-[#4347d9] mb-6">
        <LockIcon className="w-5 h-5 text-[#696cff] shrink-0"/>
        <div>
          <strong className="block font-bold">Email bodies cannot be opened from this interface</strong>
          <p className="text-[#646e78] mt-0.5">The message body remains encrypted and inaccessible in this dashboard. Reviewers assign training labels based on reported subject, sender domain, and detector outcome.</p>
        </div>
      </div>
      {error && <Notice type="error">{error}</Notice>}
      {message && <Notice type="success">{message}</Notice>}
      <section className="sneat-card p-4 sm:p-5 mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <label className="flex items-center gap-3 text-xs">
          <span className="font-semibold text-[#384551]">Filter queue:</span>
          <select value={statusFilter} onChange={(event) => { setPage(1); setStatusFilter(event.target.value); }} className="h-9 px-2.5 rounded-md border border-[#d9dee3] text-xs bg-white text-[#384551] focus:ring-2 focus:ring-[#696cff]/20 focus:border-[#696cff] outline-none">
            <option value="">All statuses</option>
            <option value="PENDING">Pending review</option>
            <option value="APPROVED">Approved candidates</option>
            <option value="REJECTED">Rejected</option>
            <option value="INCONCLUSIVE">Inconclusive</option>
          </select>
        </label>
        <span className="text-xs text-[#8592a3]">{data ? `${data.total} shown · ${data.pending_count} pending · oldest ${queueAge(data.oldest_pending_age_seconds)}` : "Loading queue…"}</span>
      </section>
      {!data ? (<DashboardSkeleton />) : data.items.length === 0 ? (<EmptyState icon="✉" title="No email reports in this queue" text="No encrypted email submissions match the selected filter."/>) : (<div className="space-y-4">
          {data.items.map((report) => (<article key={report.id} className="sneat-card p-5 sm:p-6 border-l-4 border-l-[#696cff]">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-3 pb-3 border-b border-[#e4e6e8]/70">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[11px] font-bold text-[#696cff] uppercase tracking-wider">{report.provider.toUpperCase()}</span>
                    <span className="text-[#d9dee3]">·</span>
                    <span className="text-[11px] text-[#8592a3]">{niceDate(report.submitted_at)}</span>
                  </div>
                  <h2 className="text-sm sm:text-base font-bold text-[#384551] truncate" title={report.subject || "No subject"}>{report.subject || "No subject"}</h2>
                  <p className="text-xs text-[#8592a3] mt-0.5">{report.sender || "Sender not provided"}</p>
                </div>
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-[#f5f5f9] text-[#646e78] border border-[#e4e6e8] self-start">{trainingStatusLabel(report.training_status)}</span>
              </div>
              <div className="grid sm:grid-cols-3 gap-3 text-xs mb-4">
                <div className="p-3 rounded-lg bg-[#f5f5f9] border border-[#e4e6e8]">
                  <span className="text-[11px] text-[#8592a3] uppercase font-bold block mb-1">Detector outcome</span>
                  <StatusBadge outcome={report.detector_outcome}/>
                  <small className="text-[#8592a3] block mt-1 font-mono text-[10px]">{report.detector_model_version}</small>
                </div>
                <div className="p-3 rounded-lg bg-[#f5f5f9] border border-[#e4e6e8]">
                  <span className="text-[11px] text-[#8592a3] uppercase font-bold block mb-1">User review</span>
                  <strong className="text-[#384551] block font-semibold">{userClassificationLabel(report.user_classification)}</strong>
                  <span className="text-[11px] text-[#8592a3]">{feedbackReasonLabel(report.feedback_reason)}</span>
                </div>
                <div className="p-3 rounded-lg bg-[#f5f5f9] border border-[#e4e6e8]">
                  <span className="text-[11px] text-[#8592a3] uppercase font-bold block mb-1">Encrypted content</span>
                  <strong className="text-[#384551] block font-semibold">{report.body_character_count.toLocaleString()} characters</strong>
                  <span className="text-[11px] text-[#8592a3]">Body encrypted & isolated</span>
                </div>
              </div>
              {report.conflicting_label && (<div className="p-3 mb-4 rounded-lg bg-[#ffe0db] border border-[#ffb2a5] text-xs text-[#66190c]" role="alert"><strong>Conflicting approved label:</strong> this encrypted, model-specific candidate is already labeled {report.existing_candidate_label === "LEGITIMATE" ? "legitimate" : "suspicious"}. Approval with the opposite label will be blocked.</div>)}
              {report.review_history?.length > 0 && (<section className="p-3 mb-4 rounded-lg bg-[#f5f5f9] border border-[#e4e6e8] text-xs" aria-label="Review history">
                  <strong className="text-[#384551] block">Review history</strong>
                  {report.review_history.map((review, index) => (<div key={`${review.reviewed_at}-${index}`} className="mt-1 text-[#646e78]">{trainingStatusLabel(review.status)}{review.assessment ? ` as ${review.assessment === "LEGITIMATE" ? "legitimate" : "suspicious"}` : ""} by {review.reviewer} on {niceDate(review.reviewed_at)}{review.reason ? ` — ${review.reason}` : " — No review reason provided."}</div>))}
                </section>)}
              {report.training_status === "PENDING" && (<div className="space-y-3 pt-3 border-t border-[#e4e6e8]/70">
                  <label className="block"><span className="text-xs font-semibold text-[#384551] block mb-1">Review reason <span className="font-normal text-[#8592a3]">(optional)</span></span><input placeholder="Explain the review decision" maxLength={1000} value={adminNotes[report.id] || ""} onChange={(e) => setAdminNotes({ ...adminNotes, [report.id]: e.target.value })} className="w-full h-10 px-3 rounded-md border border-[#d9dee3] text-xs bg-white text-[#384551] focus:ring-2 focus:ring-[#696cff]/20 focus:border-[#696cff] outline-none"/></label>
                  <div className="flex flex-wrap items-center gap-2">
                    <button className="px-3 py-1.5 rounded-md bg-[#e8fadf] border border-[#c6f1af] text-[#2d5816] text-xs font-bold hover:bg-[#c6f1af] transition disabled:opacity-50" onClick={() => void decide(report.id, "APPROVED", "LEGITIMATE")} disabled={actionBusy === report.id} type="button">
                      Approve legitimate
                    </button>
                    <button className="px-3 py-1.5 rounded-md bg-[#ffe0db] border border-[#ffb2a5] text-[#66190c] text-xs font-bold hover:bg-[#ffb2a5] transition disabled:opacity-50" onClick={() => void decide(report.id, "APPROVED", "SUSPICIOUS")} disabled={actionBusy === report.id} type="button">
                      Approve suspicious
                    </button>
                    <button className="px-3 py-1.5 rounded-md bg-white border border-[#d9dee3] text-[#646e78] text-xs font-semibold hover:bg-[#f5f5f9] transition disabled:opacity-50" onClick={() => void decide(report.id, "REJECTED")} disabled={actionBusy === report.id} type="button">
                      Reject report
                    </button>
                    <button className="px-3 py-1.5 rounded-md bg-white border border-[#d9dee3] text-[#8592a3] text-xs font-semibold hover:bg-[#f5f5f9] transition disabled:opacity-50" onClick={() => void decide(report.id, "INCONCLUSIVE")} disabled={actionBusy === report.id} type="button">
                      Inconclusive
                    </button>
                  </div>
                </div>)}
            </article>))}
        </div>)}
      {data && data.pages > 1 && (<div className="flex items-center justify-between pt-4 mt-4 border-t border-[#e4e6e8]/70 text-xs text-[#8592a3]">
          <button disabled={page <= 1} onClick={() => setPage((v) => v - 1)} className="px-3 py-1.5 rounded-md border border-[#d9dee3] font-semibold text-[#646e78] hover:bg-[#f5f5f9] disabled:opacity-40">← Previous</button>
          <span>Page {page} of {data.pages}</span>
          <button disabled={page >= data.pages} onClick={() => setPage((v) => v + 1)} className="px-3 py-1.5 rounded-md border border-[#d9dee3] font-semibold text-[#646e78] hover:bg-[#f5f5f9] disabled:opacity-40">Next →</button>
        </div>)}
    </>);
}

export default AdminEmailReportsPage;
