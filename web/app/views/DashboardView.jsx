"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api";
import { GlobeIcon, MailIcon, LaptopIcon, RefreshCwIcon, AlertTriangleIcon, ArrowRightIcon } from "../Icons";
import { cx, niceDate, relativeTime, StatusBadge, Notice, PageHeader, OutcomeChart, ActivityTable, RangePicker, DashboardSkeleton } from "../components/ViewShared";
import DetectionDetailsModal from "../components/DetectionDetailsModal";

function LatestCard({ type, item, onMoreDetails }) {
    const isUrl = type === "URL";
    return (<section className="sneat-card p-5 sm:p-6 flex gap-4">
      <div className="w-11 h-11 rounded-lg bg-[#e7e7ff] text-[#696cff] flex items-center justify-center shrink-0 shadow-2xs">
        {isUrl ? <GlobeIcon className="w-5 h-5"/> : <MailIcon className="w-5 h-5"/>}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-[#696cff] tracking-wider uppercase mb-1">LAST {isUrl ? "WEBSITE" : "EMAIL"} CHECKED</p>
        {item ? (<>
            <h2 className="text-sm sm:text-base font-semibold text-[#384551] truncate">{isUrl ? item.origin : item.subject || "No subject"}</h2>
            <p className="text-xs text-[#8592a3] truncate mt-0.5">{isUrl ? "Address-bar origin only" : `${item.sender || "Sender not shown"} · ${item.provider}`}</p>
            <div className="flex items-center justify-between gap-2 mt-4 pt-3 border-t border-[#e4e6e8]/70">
              <StatusBadge outcome={item.outcome}/>
              <time className="text-xs text-[#8592a3]" title={niceDate(item.occurred_at)}>{relativeTime(item.occurred_at)}</time>
            </div>
            <button type="button" onClick={() => onMoreDetails(item)} className="w-full mt-3 h-9 px-3 rounded-md border border-[#c3c4ff] bg-[#e7e7ff]/40 text-[#696cff] hover:bg-[#e7e7ff] text-xs font-semibold flex items-center justify-center gap-1.5 transition focus:outline-none focus:ring-2 focus:ring-[#696cff]">
              <span>More details</span>
              <ArrowRightIcon className="w-3.5 h-3.5"/>
            </button>
          </>) : (<>
            <h2 className="text-sm sm:text-base font-semibold text-[#384551]">No {isUrl ? "website" : "email"} checks yet</h2>
            <p className="text-xs text-[#8592a3] mt-1">{isUrl ? "Browse to an HTTP or HTTPS website after pairing." : "Open an email in Gmail, Outlook, or Yahoo after pairing."}</p>
          </>)}
      </div>
    </section>);
}

function DashboardPage({ onViewActivity, onPairDevice, onOpenHelp }) {
    const [days, setDays] = useState(30);
    const [data, setData] = useState(null);
    const [error, setError] = useState("");
    const [detailsItem, setDetailsItem] = useState(null);
    const [details, setDetails] = useState(null);
    const [detailsLoading, setDetailsLoading] = useState(false);
    const [detailsError, setDetailsError] = useState("");
    const detailsCache = useRef(new Map());
    const detailsRequest = useRef(0);
    const load = useCallback(() => {
        return api(`/dashboard?days=${days}`).then(setData).catch((reason) => setError(reason.message));
    }, [days]);
    useEffect(() => { void load(); }, [load]);
    const openDetails = useCallback(async (item, force = false) => {
        const cached = detailsCache.current.get(item.id);
        setDetailsItem(item);
        setDetailsError("");
        if (cached && !force) {
            setDetails(cached);
            setDetailsLoading(false);
            return;
        }
        setDetails(null);
        setDetailsLoading(true);
        const requestId = ++detailsRequest.current;
        try {
            if (!item.detail_reference)
                throw new Error("This detection was recorded before full-detail explanations were enabled. Check it again first.");
            const result = await api(`/activities/${item.id}/explanation`, {method: "POST"});
            if (result.status === "COMPLETE" && (item.event_type !== "EMAIL" || result.full_context_available === true)) detailsCache.current.set(item.id, result);
            else detailsCache.current.delete(item.id);
            if (detailsRequest.current === requestId) setDetails(result);
        }
        catch (reason) {
            if (detailsRequest.current === requestId)
                setDetailsError(reason?.name === "AbortError" ? "The explanation took too long. Try again." : reason.message || "Signalam could not prepare this explanation.");
        }
        finally {
            if (detailsRequest.current === requestId) setDetailsLoading(false);
        }
    }, []);
    const closeDetails = useCallback(() => {
        detailsRequest.current += 1;
        setDetailsItem(null);
        setDetails(null);
        setDetailsError("");
        setDetailsLoading(false);
    }, []);
    const retryDetails = useCallback(async () => {
        if (!detailsItem) return;

        try {
            const refreshed = await api(`/dashboard?days=${days}`);
            setData(refreshed);
            setError("");
            const latestItem = detailsItem.event_type === "EMAIL" ? refreshed.last_email : refreshed.last_url;
            await openDetails(latestItem || detailsItem, true);
        }
        catch (reason) {
            setDetailsError(reason.message || "Signalam could not refresh the latest detection.");
        }
    }, [days, detailsItem, openDetails]);
    return (<>
      <PageHeader eyebrow="PERSONAL OVERVIEW" title="Good to see you." description="A clear view of your recent Signalam checks—without storing sensitive content." actions={<RangePicker value={days} onChange={setDays}/>}/>
      {error && <Notice type="error">{error} <button className="ml-2 font-bold underline" onClick={load}>Try again</button></Notice>}
      <ConnectionPanel onPairDevice={onPairDevice} onOpenHelp={onOpenHelp}/>
      {!data ? <DashboardSkeleton /> : (<>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
            <LatestCard type="URL" item={data.last_url} onMoreDetails={openDetails}/>
            <LatestCard type="EMAIL" item={data.last_email} onMoreDetails={openDetails}/>
          </div>
          <OutcomeChart distribution={data.distribution}/>
          <section className="sneat-card p-5 sm:p-6 mt-6">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-[#e4e6e8]/70">
              <div>
                <p className="text-xs font-semibold text-[#696cff] tracking-wider uppercase">RECENT ACTIVITY</p>
                <h2 className="text-base font-bold text-[#384551]">Your latest checks</h2>
              </div>
              <button className="flex items-center gap-1 text-xs font-semibold text-[#696cff] hover:underline" onClick={onViewActivity}>
                <span>View all activity</span>
                <ArrowRightIcon className="w-3.5 h-3.5"/>
              </button>
            </div>
            <ActivityTable items={data.recent} compact/>
          </section>
          <p className="text-xs text-[#8592a3] text-center max-w-2xl mx-auto mt-6 leading-relaxed">
            <strong>Remember:</strong> “No strong warning signs.” means Signalam did not detect strong warning signs in the checked module. It is not a guarantee that an email or website is legitimate.
          </p>
        </>)}
      {detailsItem && <DetectionDetailsModal item={detailsItem} detail={details} loading={detailsLoading} error={detailsError} onClose={closeDetails} onRetry={() => void retryDetails()}/>}
    </>);
}

function ConnectionItem({ title, label, message, state, detail, }) {
    return (<article className={cx("p-4 sm:p-5 rounded-lg border flex flex-col justify-between transition", state === "connected" ? "bg-[#e8fadf]/40 border-[#c6f1af]" : state === "waiting" ? "bg-[#fff1d6]/40 border-[#ffdd99]" : "bg-[#f5f5f9] border-[#e4e6e8]")}>
      <div className="flex items-start justify-between gap-2 mb-3">
        <div>
          {detail && <p className="text-[10px] font-bold text-[#8592a3] uppercase tracking-wider mb-0.5">{detail}</p>}
          <h3 className="text-sm font-semibold text-[#384551]">{title}</h3>
        </div>
        <span className={cx("text-xs font-semibold px-2 py-0.5 rounded-full", state === "connected" ? "bg-[#e8fadf] text-[#2d5816]" : state === "waiting" ? "bg-[#fff1d6] text-[#664400]" : "bg-[#ebeef0] text-[#8592a3]")}>
          {label}
        </span>
      </div>
      <p className="text-xs text-[#646e78] leading-snug">{message}</p>
    </article>);
}

function collectionOutcomeLabel(value) {
    const labels = {
        NOT_ATTEMPTED: "No completed check attempted yet",
        NOT_ENABLED: "Optional collection is disabled",
        NOT_SELECTED: "Not selected by the 10% sample",
        DUPLICATE: "Duplicate sample not stored",
        OVERSIZED: "Input exceeded the collection limit",
        INVALID: "Input did not pass collection validation",
        CONSENT_UNAVAILABLE: "Consent could not be verified",
        CONSENT_VERSION_MISMATCH: "Consent changed before ingestion",
        SERVICE_UNAVAILABLE: "Collection service unavailable",
        ACCEPTED: "Sample accepted and encrypted",
    };
    return labels[value] || "Collection outcome unavailable";
}

function ConnectionPanel({ onPairDevice, onOpenHelp }) {
    const [status, setStatus] = useState(null);
    const [error, setError] = useState("");
    const [refreshing, setRefreshing] = useState(false);
    const load = useCallback(async () => {
        setRefreshing(true);
        try {
            setStatus(await api("/protection-status"));
            setError("");
        }
        catch {
            setStatus(null);
            setError("Service unavailable. Signalam could not check protection connections.");
        }
        finally {
            setRefreshing(false);
        }
    }, []);
    useEffect(() => {
        const initial = window.setTimeout(() => void load(), 0);
        const poll = window.setInterval(() => void load(), 15000);
        return () => {
            window.clearTimeout(initial);
            window.clearInterval(poll);
        };
    }, [load]);
    const modelState = status?.server_models.connected ? "connected" : "unavailable";
    const cloudState = status?.cloud_ai.connected
        ? "connected"
        : status?.cloud_ai.platform_reachable
            ? "waiting"
            : "unavailable";
    return (<section className="sneat-card p-5 sm:p-6 mb-6" aria-labelledby="connections-title" aria-live="polite">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4 pb-3 border-b border-[#e4e6e8]/70">
        <div>
          <p className="text-xs font-semibold text-[#696cff] tracking-wider uppercase">LIVE PROTECTION STATUS</p>
          <h2 id="connections-title" className="text-base font-bold text-[#384551]">Protection connections</h2>
        </div>
        <div className="flex items-center gap-3">
          {status && <time className="text-xs text-[#8592a3]" title={niceDate(status.checked_at)}>Checked {relativeTime(status.checked_at)}</time>}
          <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-[#d9dee3] text-xs font-semibold text-[#646e78] hover:bg-[#f5f5f9] transition" onClick={() => void load()} disabled={refreshing}>
            <RefreshCwIcon className={cx("w-3.5 h-3.5", refreshing && "animate-spin text-[#696cff]")}/>
            <span>{refreshing ? "Checking..." : "Refresh status"}</span>
          </button>
        </div>
      </div>

      {error ? (<div className="p-4 rounded-lg bg-[#fff1d6] border border-[#ffdd99] flex items-center gap-3 text-xs text-[#664400]" role="status">
          <AlertTriangleIcon className="w-5 h-5 text-[#ffab00] shrink-0"/>
          <div className="flex-1">
            <strong className="block font-bold">Service unavailable</strong>
            <span>{error}</span>
            <button type="button" className="block mt-2 font-bold text-[#696cff] hover:underline" onClick={onOpenHelp}>Open setup help</button>
          </div>
        </div>) : status && !status.extension.connected ? (<div className="p-5 sm:p-6 rounded-lg bg-[#e7e7ff]/40 border border-[#c3c4ff] flex flex-col sm:flex-row items-center justify-between gap-4" role="status">
          <div className="flex items-center gap-4">
            <div className="w-11 h-11 rounded-lg bg-[#e7e7ff] text-[#696cff] flex items-center justify-center shrink-0 shadow-2xs">
              <LaptopIcon className="w-5 h-5"/>
            </div>
            <div>
              <p className="text-xs font-semibold text-[#696cff] uppercase tracking-wider">ACCOUNT CONNECTION REQUIRED</p>
              <h3 className="text-sm font-bold text-[#384551]">Detection is off</h3>
              <p className="text-xs text-[#646e78] mt-0.5 max-w-xl">Connect this browser extension to your Signalam account to enable authenticated website and email checks.</p>
            </div>
          </div>
          <button className="px-4 py-2 rounded-md bg-[#696cff] hover:bg-[#5f61e6] text-white text-xs font-bold transition shadow-[0_2px_4px_0_rgba(105,108,255,0.4)] shrink-0" onClick={onPairDevice}>
            Connect extension
          </button>
        </div>) : status ? (<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <ConnectionItem icon="◉" title="Server models" label={status.server_models.connected ? "Ready" : "Unavailable"} state={modelState} detail="Frozen RF URL + XLM-R email" message={status.server_models.message}/>
          <ConnectionItem icon="☁" title="Cloud AI" label={status.cloud_ai.connected ? "Connected" : status.cloud_ai.configured ? "Unavailable" : "Setup needed"} state={cloudState} detail="Privacy-minimized review" message={status.cloud_ai.message}/>
          <ConnectionItem icon="◇" title="Browser extension" label="Connected" state="connected" detail={status.extension.device_label || "This browser"} message={status.extension.message}/>
        </div>) : (<div className="grid grid-cols-1 md:grid-cols-3 gap-4" aria-busy="true">
          <div className="h-24 rounded-lg bg-[#f5f5f9] animate-shimmer"/>
          <div className="h-24 rounded-lg bg-[#f5f5f9] animate-shimmer"/>
          <div className="h-24 rounded-lg bg-[#f5f5f9] animate-shimmer"/>
        </div>)}
      {status?.operations && (<div className="grid sm:grid-cols-3 gap-3 mt-4 pt-4 border-t border-[#e4e6e8]/70 text-sm" aria-label="Privacy-safe operational diagnostics">
          <div className="p-3 rounded-lg bg-[#f5f5f9] border border-[#e4e6e8]">
            <strong className="block text-[#384551]">Remote activity</strong>
            <span>Completed checks are recorded by the Signalam server.</span>
          </div>
          <div className="p-3 rounded-lg bg-[#f5f5f9] border border-[#e4e6e8] sm:col-span-2">
            <strong className="block text-[#384551]">Optional automatic contribution</strong>
            <span>{collectionOutcomeLabel(status.operations.automatic_collection?.last_outcome)}</span>
            <small className="block text-[#8592a3] mt-1">Last attempt: {niceDate(status.operations.automatic_collection?.last_attempt_at)} · Last accepted: {niceDate(status.operations.automatic_collection?.last_accepted_at)}</small>
          </div>
        </div>)}
    </section>);
}

export default DashboardPage;
