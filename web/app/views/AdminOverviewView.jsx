"use client";
import { useEffect, useState } from "react";
import { api } from "../api";
import { LockIcon } from "../Icons";
import { Notice, PageHeader, OutcomeChart, RangePicker, DashboardSkeleton } from "../components/ViewShared";

function AdminDashboardPage() {
    const [days, setDays] = useState(30);
    const [data, setData] = useState(null);
    const [error, setError] = useState("");
    useEffect(() => { api(`/admin/dashboard?days=${days}`).then(setData).catch((reason) => setError(reason.message)); }, [days]);
    return (<>
      <PageHeader eyebrow="ADMINISTRATION" title="Platform overview" description="Aggregate outcomes across BantAI. Personal browsing and email metadata remain private." actions={<RangePicker value={days} onChange={setDays}/>}/>
      {error && <Notice type="error">{error}</Notice>}
      <div className="p-4 rounded-xl bg-blue-50 border border-blue-200 flex items-center gap-3 text-xs text-[#071E4A] mb-6">
        <LockIcon className="w-5 h-5 text-[#087EFF] shrink-0"/>
        <div>
          <strong className="block font-bold">Aggregate view only</strong>
          <p className="text-slate-600 mt-0.5">This page intentionally cannot open an individual user’s activity.</p>
        </div>
      </div>
      {data ? <OutcomeChart distribution={data.distribution}/> : <DashboardSkeleton />}
    </>);
}

export default AdminDashboardPage;
