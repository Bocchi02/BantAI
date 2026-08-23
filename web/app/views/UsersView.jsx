"use client";
import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import { cx, userName, niceDate, Notice, PageHeader } from "../components/ViewShared";

function UsersPage({ currentUser }) {
    const [page, setPage] = useState(1);
    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState("");
    const [data, setData] = useState(null);
    const [error, setError] = useState("");
    const load = useCallback(() => {
        const params = new URLSearchParams({ page: String(page), page_size: "25" });
        if (search)
            params.set("search", search);
        if (statusFilter)
            params.set("account_status", statusFilter);
        api(`/admin/users?${params}`).then(setData).catch((reason) => setError(reason.message));
    }, [page, search, statusFilter]);
    useEffect(load, [load]);
    const toggle = async (user) => {
        const next = user.status === "SUSPENDED" ? "ACTIVE" : "SUSPENDED";
        if (!confirm(`${next === "SUSPENDED" ? "Suspend" : "Reactivate"} ${user.email}?`))
            return;
        try {
            await api(`/admin/users/${user.id}/status?account_status=${next}`, { method: "PATCH" });
            load();
        }
        catch (reason) {
            setError(reason.message);
        }
    };
    return (<>
      <PageHeader eyebrow="ADMINISTRATION" title="Users" description="Manage account access. Detection history and personal activity are not available to administrators."/>
      {error && <Notice type="error">{error}</Notice>}
      <section className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm mb-6 grid sm:grid-cols-2 gap-3 text-xs">
        <label className="flex flex-col gap-1">
          <span className="font-semibold text-slate-600">Search accounts</span>
          <input type="search" value={search} onChange={(event) => { setPage(1); setSearch(event.target.value); }} placeholder="Search by name or email" className="h-9 px-3 rounded-lg border border-slate-300 text-xs outline-none focus:ring-2 focus:ring-[#087EFF]"/>
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-semibold text-slate-600">Status</span>
          <select value={statusFilter} onChange={(event) => { setPage(1); setStatusFilter(event.target.value); }} className="h-9 px-2.5 rounded-lg border border-slate-300 bg-white text-xs">
            <option value="">All statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="SUSPENDED">Suspended</option>
          </select>
        </label>
      </section>
      <section className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm">
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
          <div>
            <p className="text-[10px] font-bold text-[#087EFF] uppercase tracking-wider">ACCOUNTS</p>
            <h2 className="text-base font-bold text-[#04142F]">{data ? `${data.total} users` : "Loading users…"}</h2>
          </div>
          <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full">No personal activity access</span>
        </div>
        {data && (<div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">
                <tr>
                  <th className="pb-3 px-3">User</th>
                  <th className="pb-3 px-3">Role</th>
                  <th className="pb-3 px-3">Status</th>
                  <th className="pb-3 px-3">Registered</th>
                  <th className="pb-3 px-3">Last sign-in</th>
                  <th className="pb-3 px-3"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.items.map((user) => (<tr key={user.id} className="hover:bg-slate-50">
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-2.5">
                        <span className="w-7 h-7 rounded-lg bg-[#071E4A] text-white flex items-center justify-center font-bold shrink-0">{userName(user).slice(0, 1).toUpperCase()}</span>
                        <div>
                          <strong className="text-slate-900 block font-semibold">{userName(user)}</strong>
                          <small className="text-slate-400 block">{user.email}</small>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-3">{user.role === "ADMIN" ? "Administrator" : "User"}</td>
                    <td className="py-3 px-3">
                      <span className={cx("text-[10px] font-bold px-2 py-0.5 rounded-full capitalize", user.status === "ACTIVE" ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800")}>
                        {user.status.replaceAll("_", " ").toLowerCase()}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-slate-400 whitespace-nowrap">{niceDate(user.created_at)}</td>
                    <td className="py-3 px-3 text-slate-400 whitespace-nowrap">{niceDate(user.last_login_at)}</td>
                    <td className="py-3 px-3">
                      {user.role !== "ADMIN" && user.id !== currentUser.id && (<button className={cx("text-xs font-bold px-3 py-1 rounded-lg border transition", user.status === "SUSPENDED" ? "border-slate-300 text-slate-700 hover:bg-slate-50" : "border-rose-200 text-rose-600 hover:bg-rose-50")} onClick={() => toggle(user)}>
                          {user.status === "SUSPENDED" ? "Reactivate" : "Suspend"}
                        </button>)}
                    </td>
                  </tr>))}
              </tbody>
            </table>
          </div>)}
        {data && data.pages > 1 && (<div className="flex items-center justify-between pt-4 mt-4 border-t border-slate-100 text-xs text-slate-500">
            <button disabled={page <= 1} onClick={() => setPage((value) => value - 1)} className="px-3 py-1.5 rounded-lg border border-slate-200 font-semibold hover:bg-slate-50 disabled:opacity-40">← Previous</button>
            <span>Page {page} of {data.pages}</span>
            <button disabled={page >= data.pages} onClick={() => setPage((value) => value + 1)} className="px-3 py-1.5 rounded-lg border border-slate-200 font-semibold hover:bg-slate-50 disabled:opacity-40">Next →</button>
          </div>)}
      </section>
    </>);
}

export default UsersPage;
