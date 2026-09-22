"use client";
import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import { UsersIcon, SearchIcon } from "../Icons";
import { cx, niceDate, userName, Notice, EmptyState, PageHeader, DashboardSkeleton } from "../components/ViewShared";

function UsersPage({ currentUser }) {
    const [page, setPage] = useState(1);
    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState("");
    const [data, setData] = useState(null);
    const [error, setError] = useState("");
    const [message, setMessage] = useState("");
    const [busyId, setBusyId] = useState(null);
    const load = useCallback(() => {
        const params = new URLSearchParams({ page: String(page), page_size: "20" });
        if (search) params.set("search", search);
        if (statusFilter) params.set("account_status", statusFilter);
        return api(`/admin/users?${params}`)
            .then(setData)
            .catch((reason) => setError(reason.message));
    }, [page, search, statusFilter]);
    useEffect(() => { void load(); }, [load]);
    const toggleStatus = async (user) => {
        const nextStatus = user.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE";
        if (user.id === currentUser.id) {
            setError("You cannot suspend your own administrative account.");
            return;
        }
        if (!confirm(`Are you sure you want to ${nextStatus === "SUSPENDED" ? "suspend" : "reactivate"} ${userName(user)}?`))
            return;
        setBusyId(user.id);
        setError("");
        setMessage("");
        try {
            await api(`/admin/users/${user.id}/status?account_status=${nextStatus}`, {
                method: "PATCH",
            });
            setMessage(`User account ${nextStatus.toLowerCase()}.`);
            await load();
        }
        catch (reason) {
            setError(reason instanceof Error ? reason.message : "Signalam could not update that user’s status.");
        }
        finally {
            setBusyId(null);
        }
    };
    return (<>
      <PageHeader eyebrow="ADMINISTRATION" title="Users" description="Manage registered Signalam accounts and review active devices."/>
      {error && <Notice type="error">{error}</Notice>}
      {message && <Notice type="success">{message}</Notice>}
      <section className="sneat-card p-4 sm:p-5 mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex flex-1 items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <SearchIcon className="w-4 h-4 text-[#8592a3] absolute left-3 top-1/2 -translate-y-1/2"/>
            <input type="search" placeholder="Search by name or email..." value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} className="w-full h-9 pl-9 pr-3 rounded-md border border-[#d9dee3] text-xs bg-white text-[#384551] focus:ring-2 focus:ring-[#696cff]/20 focus:border-[#696cff] outline-none"/>
          </div>
          <select value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setPage(1); }} className="h-9 px-2.5 rounded-md border border-[#d9dee3] text-xs bg-white text-[#384551] focus:ring-2 focus:ring-[#696cff]/20 focus:border-[#696cff] outline-none">
            <option value="">All statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="SUSPENDED">Suspended</option>
          </select>
        </div>
        <span className="text-xs text-[#8592a3] shrink-0">{data ? `${data.total} registered accounts` : "Loading…"}</span>
      </section>
      <section className="sneat-card p-5 sm:p-6">
        {!data ? (<DashboardSkeleton />) : data.items.length === 0 ? (<EmptyState icon="👤" title="No users found" text="No registered accounts match your current search and status filter."/>) : (<div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-[#646e78]">
              <thead className="text-[11px] font-bold text-[#8592a3] uppercase tracking-wider bg-[#f5f5f9]/80 border-b border-[#e4e6e8]">
                <tr>
                  <th className="py-3 px-3.5">User</th>
                  <th className="py-3 px-3.5">Role</th>
                  <th className="py-3 px-3.5">Status</th>
                  <th className="py-3 px-3.5">Paired devices</th>
                  <th className="py-3 px-3.5">Registered</th>
                  <th className="py-3 px-3.5"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e4e6e8]/70">
                {data.items.map((item) => (<tr key={item.id} className="hover:bg-[#fbfbfd]">
                    <td className="py-3 px-3.5">
                      <div className="flex items-center gap-3">
                        <span className="w-8 h-8 rounded-full bg-[#696cff] text-white flex items-center justify-center text-xs font-bold shrink-0 shadow-2xs">
                          {userName(item).slice(0, 1).toUpperCase()}
                        </span>
                        <div>
                          <strong className="block font-semibold text-[#384551]">{userName(item)}</strong>
                          <small className="text-[#8592a3] block text-[11px]">{item.email}</small>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-3.5">
                      <span className={cx("text-[11px] font-semibold px-2 py-0.5 rounded-full", item.role === "ADMIN" ? "bg-[#e7e7ff] text-[#696cff] border border-[#c3c4ff]" : "bg-[#ebeef0] text-[#646e78]")}>
                        {item.role}
                      </span>
                    </td>
                    <td className="py-3 px-3.5">
                      <span className={cx("text-[11px] font-semibold px-2 py-0.5 rounded-full", item.status === "ACTIVE" ? "bg-[#e8fadf] text-[#2d5816] border border-[#c6f1af]" : "bg-[#ffe0db] text-[#66190c] border border-[#ffb2a5]")}>
                        {item.status}
                      </span>
                    </td>
                    <td className="py-3 px-3.5 text-xs text-[#646e78]">
                      <strong className="text-[#384551]">{item.active_device_count} active</strong>
                      <small className="block text-[#8592a3]">{item.device_count} {item.device_count === 1 ? "paired device" : "paired devices"} total</small>
                    </td>
                    <td className="py-3 px-3.5 text-xs text-[#8592a3] whitespace-nowrap">
                      {niceDate(item.created_at)}
                    </td>
                    <td className="py-3 px-3.5 text-right">
                      {item.id !== currentUser.id && (<button className={cx("text-xs font-semibold hover:underline", item.status === "ACTIVE" ? "text-[#ff3e1d]" : "text-[#71dd37]")} onClick={() => void toggleStatus(item)} disabled={busyId === item.id} type="button">
                          {item.status === "ACTIVE" ? "Suspend" : "Reactivate"}
                        </button>)}
                    </td>
                  </tr>))}
              </tbody>
            </table>
          </div>)}
        {data && data.pages > 1 && (<div className="flex items-center justify-between pt-4 mt-4 border-t border-[#e4e6e8]/70 text-xs text-[#8592a3]">
            <button disabled={page <= 1} onClick={() => setPage((v) => v - 1)} className="px-3 py-1.5 rounded-md border border-[#d9dee3] font-semibold text-[#646e78] hover:bg-[#f5f5f9] disabled:opacity-40">← Previous</button>
            <span>Page {page} of {data.pages}</span>
            <button disabled={page >= data.pages} onClick={() => setPage((v) => v + 1)} className="px-3 py-1.5 rounded-md border border-[#d9dee3] font-semibold text-[#646e78] hover:bg-[#f5f5f9] disabled:opacity-40">Next →</button>
          </div>)}
      </section>
    </>);
}

export default UsersPage;
