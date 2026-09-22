"use client";
import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import { LockIcon } from "../Icons";
import { niceDate, Notice, PageHeader, OutcomeChart, RangePicker, DashboardSkeleton } from "../components/ViewShared";

function ageLabel(seconds) {
    if (!Number.isFinite(seconds)) return "No pending reviews";
    if (seconds < 3600) return `${Math.max(1, Math.round(seconds / 60))} min`;
    if (seconds < 86400) return `${Math.round(seconds / 3600)} hr`;
    return `${Math.round(seconds / 86400)} days`;
}

function AdminOverviewPage() {
    const [days, setDays] = useState(30);
    const [data, setData] = useState(null);
    const [error, setError] = useState("");
    const load = useCallback(() => {
        setError("");
        setData(null);
        return api(`/admin/dashboard?days=${days}`)
            .then(setData)
            .catch((reason) => setError(reason.message));
    }, [days]);
    useEffect(() => {
        const initial = window.setTimeout(() => void load(), 0);
        return () => window.clearTimeout(initial);
    }, [load]);
    return (<>
      <PageHeader eyebrow="ADMINISTRATION" title="Admin overview" description="Aggregated, privacy-preserving metrics across all registered Signalam accounts." actions={<RangePicker value={days} onChange={setDays}/>}/>
      <div className="p-4 rounded-lg bg-[#e7e7ff]/50 border border-[#c3c4ff] flex items-center gap-3 text-xs text-[#4347d9] mb-6">
        <LockIcon className="w-5 h-5 text-[#696cff] shrink-0"/>
        <div>
          <strong className="block font-bold">Aggregate privacy guarantees</strong>
          <p className="text-[#646e78] mt-0.5">Individual user browsing paths and routine email content are never visible here. Metrics reflect categorical totals only.</p>
        </div>
      </div>
      {error && <Notice type="error">{error}</Notice>}
      {!data ? <DashboardSkeleton /> : (<>
          <section className="sneat-card p-5 sm:p-6 mb-6" aria-labelledby="service-status-title">
            <h2 id="service-status-title" className="text-base font-bold text-[#384551]">Service status</h2>
            <p className="text-sm text-[#8592a3] mt-1">Current operational readiness. No credentials, server addresses, or analysis payloads are shown.</p>
            <div className="grid sm:grid-cols-2 gap-3 mt-4 text-sm">
              <div className={`p-4 rounded-lg border ${data.service.server_models.connected ? "bg-[#e8fadf]/60 border-[#c6f1af]" : "bg-[#fff1d6]/60 border-[#ffdd99]"}`}>
                <strong className="text-[#384551] block">Server models · {data.service.server_models.connected ? "Ready" : "Unavailable"}</strong>
                <span className="text-[#646e78]">{data.service.server_models.message}</span>
              </div>
              <div className={`p-4 rounded-lg border ${data.service.cloud_ai.connected ? "bg-[#e8fadf]/60 border-[#c6f1af]" : "bg-[#fff1d6]/60 border-[#ffdd99]"}`}>
                <strong className="text-[#384551] block">Cloud AI · {data.service.cloud_ai.connected ? "Available" : "Unavailable"}</strong>
                <span className="text-[#646e78]">{data.service.cloud_ai.message}</span>
              </div>
            </div>
          </section>
          <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6" aria-label="Operational status">
            <article className="sneat-card p-5"><p className="text-xs font-bold text-[#696cff] uppercase tracking-wider">Retained detections</p><strong className="text-2xl text-[#384551] block mt-1">{data.operations.retained_detection_count.toLocaleString()}</strong><span className="text-sm text-[#8592a3]">Selected {days}-day range</span></article>
            <article className="sneat-card p-5"><p className="text-xs font-bold text-[#696cff] uppercase tracking-wider">Average latency</p><strong className="text-2xl text-[#384551] block mt-1">{Number.isFinite(data.operations.average_detection_latency_ms) ? `${data.operations.average_detection_latency_ms.toLocaleString()} ms` : "Not yet measured"}</strong><span className="text-sm text-[#8592a3]">Completed records with timing</span></article>
            <article className="sneat-card p-5"><p className="text-xs font-bold text-[#696cff] uppercase tracking-wider">Pending reviews</p><strong className="text-2xl text-[#384551] block mt-1">{data.operations.pending_review_count.toLocaleString()}</strong><span className="text-sm text-[#8592a3]">{data.operations.pending_url_review_count} URL · {data.operations.pending_email_review_count} email</span><small className="block text-[#8592a3] mt-1">Oldest age: {ageLabel(data.operations.oldest_pending_age_seconds)}</small></article>
            <article className="sneat-card p-5"><p className="text-xs font-bold text-[#008f7a] uppercase tracking-wider">Automatic samples</p><strong className="text-2xl text-[#384551] block mt-1">{data.operations.automatic_sample_count.toLocaleString()}</strong><span className="text-sm text-[#8592a3]">Last accepted: {niceDate(data.operations.last_automatic_sample_at)}</span></article>
          </div>
          <section className="sneat-card p-5 sm:p-6 mb-6" aria-labelledby="cloud-operations-title">
            <h2 id="cloud-operations-title" className="text-base font-bold text-[#384551]">Cloud availability</h2>
            <p className="text-sm text-[#8592a3] mt-1">Aggregate states only; no URLs, messages, sender identities, or cloud payloads are collected here.</p>
            <div className="grid sm:grid-cols-3 gap-3 mt-4 text-sm">
              <div className="p-3 rounded-lg bg-[#e8fadf]/60 border border-[#c6f1af]"><strong className="text-[#2d5816] block">Complete</strong>{data.operations.cloud_status_counts.COMPLETE.toLocaleString()}</div>
              <div className="p-3 rounded-lg bg-[#f5f5f9] border border-[#e4e6e8]"><strong className="text-[#384551] block">Not required</strong>{data.operations.cloud_status_counts.SKIPPED.toLocaleString()}</div>
              <div className="p-3 rounded-lg bg-[#fff1d6]/60 border border-[#ffdd99]"><strong className="text-[#664400] block">Unavailable</strong>{data.operations.cloud_status_counts.UNAVAILABLE.toLocaleString()}</div>
            </div>
            <div className="mt-4 text-sm">
              <strong className="text-[#384551]">Failure categories</strong>
              {Object.keys(data.operations.cloud_failure_categories).length ? (<ul className="flex flex-wrap gap-2 mt-2">{Object.entries(data.operations.cloud_failure_categories).map(([category, count]) => <li key={category} className="px-2.5 py-1 rounded-md bg-[#f5f5f9] border border-[#e4e6e8]"><span className="font-mono">{category}</span>: {count}</li>)}</ul>) : <p className="text-[#8592a3] mt-1">No categorized failures in this range.</p>}
            </div>
            <p className="text-xs text-[#8592a3] mt-4">{data.operations.accuracy_statement}</p>
          </section>
          <OutcomeChart distribution={data.distribution}/>
        </>)}
    </>);
}

export default AdminOverviewPage;
