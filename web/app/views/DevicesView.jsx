"use client";
import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import { LaptopIcon, CopyIcon, RefreshCwIcon } from "../Icons";
import { cx, niceDate, Notice, PageHeader, DashboardSkeleton } from "../components/ViewShared";

function DevicesPage() {
    const [devices, setDevices] = useState([]);
    const [loading, setLoading] = useState(true);
    const [pairing, setPairing] = useState(null);
    const [generating, setGenerating] = useState(false);
    const [error, setError] = useState("");
    const [message, setMessage] = useState("");
    const load = useCallback(() => {
        setLoading(true);
        setError("");
        return api("/devices")
            .then((data) => {
            if (!Array.isArray(data?.items))
                throw new Error("Signalam received an invalid paired-device list.");
            setDevices(data.items);
        })
            .catch((reason) => {
            setDevices([]);
            setError(reason instanceof Error ? reason.message : "Signalam could not load paired devices.");
        })
            .finally(() => setLoading(false));
    }, []);
    useEffect(() => {
        const initial = window.setTimeout(() => void load(), 0);
        return () => window.clearTimeout(initial);
    }, [load]);
    const generateCode = async () => {
        setGenerating(true);
        setError("");
        setMessage("");
        try {
            const data = await api("/pairing", { method: "POST" });
            setPairing(data);
        }
        catch (reason) {
            setError(reason instanceof Error ? reason.message : "Signalam could not create a pairing code.");
        }
        finally {
            setGenerating(false);
        }
    };
    const revoke = async (deviceId) => {
        if (!confirm("Revoke this device? It will no longer be able to record activity or request Cloud AI explanations."))
            return;
        try {
            await api(`/devices/${deviceId}`, { method: "DELETE" });
            setMessage("Device revoked.");
            await load();
        }
        catch (reason) {
            setError(reason instanceof Error ? reason.message : "Signalam could not revoke that device.");
        }
    };
    const copyCode = async () => {
        if (!pairing) return;
        try {
            await navigator.clipboard.writeText(pairing.code);
            setMessage("Pairing code copied to clipboard.");
        }
        catch {
            setError("Could not copy pairing code automatically.");
        }
    };
    return (<>
      <PageHeader eyebrow="BROWSER PROTECTION" title="Paired devices" description="Connect and revoke browser extensions authorized to use the Signalam server for this account."/>
      {error && <Notice type="error">{error}</Notice>}
      {message && <Notice type="success">{message}</Notice>}
      <div className="grid lg:grid-cols-12 gap-6">
        <section className="lg:col-span-5 sneat-card p-5 sm:p-6" aria-labelledby="pair-device-title">
          <div className="flex items-center gap-3.5 mb-4">
            <div className="w-10 h-10 rounded-lg bg-[#e7e7ff] text-[#696cff] flex items-center justify-center shrink-0 shadow-2xs">
              <LaptopIcon className="w-5 h-5"/>
            </div>
            <div>
              <p className="text-xs font-semibold text-[#696cff] uppercase tracking-wider">ONE-TIME PAIRING</p>
              <h2 id="pair-device-title" className="text-base font-bold text-[#384551]">Connect a browser extension</h2>
            </div>
          </div>
          <p className="text-xs text-[#8592a3] mb-4 leading-relaxed">
            Generate a one-time code and enter it in the Signalam browser extension. Codes expire in 5 minutes.
          </p>
          {pairing ? (<div className="p-4 rounded-lg bg-[#f5f5f9] border border-[#d9dee3] text-center space-y-3">
              <span className="text-xs text-[#8592a3] uppercase font-bold tracking-wider block">Your 8-digit pairing code</span>
              <div className="text-2xl sm:text-3xl font-mono font-bold tracking-widest text-[#696cff] bg-white py-2.5 px-4 rounded-md border border-[#c3c4ff] select-all shadow-xs">
                {pairing.code.slice(0, 4)} {pairing.code.slice(4)}
              </div>
              <p className="text-[11px] text-[#8592a3]">Expires at {niceDate(pairing.expires_at)}</p>
              <div className="flex gap-2">
                <button className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-md bg-[#696cff] hover:bg-[#5f61e6] text-white text-xs font-bold transition shadow-[0_2px_4px_0_rgba(105,108,255,0.4)]" onClick={copyCode} type="button">
                  <CopyIcon className="w-3.5 h-3.5"/>
                  <span>Copy code</span>
                </button>
                <button className="py-2 px-3 rounded-md border border-[#d9dee3] text-xs font-semibold text-[#646e78] hover:bg-white transition" onClick={generateCode} type="button" disabled={generating}>
                  <RefreshCwIcon className={cx("w-3.5 h-3.5", generating && "animate-spin text-[#696cff]")}/>
                </button>
              </div>
            </div>) : (<button className="w-full py-2.5 px-4 rounded-md bg-[#696cff] hover:bg-[#5f61e6] text-white text-xs font-bold shadow-[0_2px_4px_0_rgba(105,108,255,0.4)] transition disabled:opacity-50 flex items-center justify-center gap-2" onClick={generateCode} disabled={generating}>
              <RefreshCwIcon className={cx("w-4 h-4", generating && "animate-spin")}/>
              <span>{generating ? "Generating code..." : "Generate pairing code"}</span>
            </button>)}
        </section>
        <section className="lg:col-span-7 sneat-card p-5 sm:p-6" aria-labelledby="devices-list-title">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-[#e4e6e8]/70">
            <div>
              <p className="text-xs font-semibold text-[#696cff] uppercase tracking-wider">AUTHORIZED ACCESS</p>
              <h2 id="devices-list-title" className="text-base font-bold text-[#384551]">Your paired devices</h2>
            </div>
            <span className="text-xs font-medium text-[#8592a3] bg-[#f5f5f9] px-2.5 py-1 rounded-md border border-[#e4e6e8]">{loading ? "—" : `${devices.filter((device) => device.status === "ACTIVE").length} active`}</span>
          </div>
          {loading ? (<DashboardSkeleton />) : devices.length === 0 ? (<div className="text-center py-8 text-xs text-[#8592a3]">
              No paired devices. Generate a pairing code to link your first computer.
            </div>) : (<ul className="divide-y divide-[#e4e6e8]/70">
              {devices.map((device) => (<li key={device.id} className="py-3.5 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="w-9 h-9 rounded-md bg-[#e7e7ff] text-[#696cff] flex items-center justify-center shrink-0 shadow-2xs">
                      <LaptopIcon className="w-4 h-4"/>
                    </span>
                    <div className="min-w-0">
                      <strong className="text-xs sm:text-sm font-semibold text-[#384551] block truncate">{device.label || "Signalam browser extension"}</strong>
                      <small className="text-[#8592a3] block text-[11px]">Paired {niceDate(device.paired_at)} · Last active {niceDate(device.last_seen_at)}</small>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className={cx("text-[11px] font-semibold px-2 py-0.5 rounded-full", device.status === "ACTIVE" ? "bg-[#e8fadf] text-[#2d5816] border border-[#c6f1af]" : "bg-[#ebeef0] text-[#8592a3]")}>
                      {device.status}
                    </span>
                    {device.status === "ACTIVE" && (<button className="text-xs font-semibold text-[#ff3e1d] hover:underline" onClick={() => void revoke(device.id)} type="button">
                        Revoke
                      </button>)}
                  </div>
                </li>))}
            </ul>)}
        </section>
      </div>
    </>);
}

export default DevicesPage;
