"use client";
import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import { LockIcon } from "../Icons";
import { Notice, PageHeader, OutcomeChart, RangePicker, DashboardSkeleton } from "../components/ViewShared";

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
    useEffect(() => { void load(); }, [load]);
    return (<>
      <PageHeader eyebrow="ADMINISTRATION" title="Admin overview" description="Aggregated, privacy-preserving metrics across all registered BantAI accounts." actions={<RangePicker value={days} onChange={setDays}/>}/>
      <div className="p-4 rounded-lg bg-[#e7e7ff]/50 border border-[#c3c4ff] flex items-center gap-3 text-xs text-[#4347d9] mb-6">
        <LockIcon className="w-5 h-5 text-[#696cff] shrink-0"/>
        <div>
          <strong className="block font-bold">Aggregate privacy guarantees</strong>
          <p className="text-[#646e78] mt-0.5">Individual user browsing paths and routine email content are never visible here. Metrics reflect categorical totals only.</p>
        </div>
      </div>
      {error && <Notice type="error">{error}</Notice>}
      {!data ? <DashboardSkeleton /> : <OutcomeChart distribution={data.distribution}/>}
    </>);
}

export default AdminOverviewPage;
