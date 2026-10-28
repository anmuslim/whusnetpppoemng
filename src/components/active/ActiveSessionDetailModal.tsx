import React, { useState, useEffect, useRef } from 'react';
import { PppActive, SessionHistoryItem, SessionTrafficInfo } from '../../types/index.ts';
import { api } from '../../api/client.ts';
import { Modal } from '../common/Modal.tsx';
import {
  Activity,
  ArrowDownLeft,
  ArrowUpRight,
  Clock,
  UserX,
  Copy,
  Check,
  Network,
  History,
  HardDriveDownload,
  HardDriveUpload,
  Radio,
} from 'lucide-react';

interface ActiveSessionDetailModalProps {
  session: PppActive | null;
  isOpen: boolean;
  onClose: () => void;
  onKick: (session: PppActive) => void;
  routerId: string;
}

interface TrafficHistoryPoint {
  time: string;
  downloadMbps: number; // Client Download (Router Tx)
  uploadMbps: number;   // Client Upload (Router Rx)
}

function bpsToMbps(bps: number): number {
  return +(bps / 1_000_000).toFixed(2);
}

function parseRateStringToMbps(val?: string): number {
  if (!val) return 0;
  const num = parseFloat(val);
  if (isNaN(num)) return 0;
  const s = val.toLowerCase();
  if (s.includes('gbps') || s.includes('g')) return +(num * 1000).toFixed(2);
  if (s.includes('mbps') || s.includes('m')) return +num.toFixed(2);
  if (s.includes('kbps') || s.includes('k')) return +(num / 1000).toFixed(3);
  if (s.includes('bps')) return +(num / 1_000_000).toFixed(4);
  return num;
}

function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(2)} GB`;
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
}

export const ActiveSessionDetailModal: React.FC<ActiveSessionDetailModalProps> = ({
  session,
  isOpen,
  onClose,
  onKick,
  routerId,
}) => {
  const [trafficHistory, setTrafficHistory] = useState<TrafficHistoryPoint[]>([]);
  const [currentDownMbps, setCurrentDownMbps] = useState<number>(0);
  const [currentUpMbps, setCurrentUpMbps] = useState<number>(0);
  const [peakDownMbps, setPeakDownMbps] = useState<number>(0);
  const [peakUpMbps, setPeakUpMbps] = useState<number>(0);
  const [formattedDown, setFormattedDown] = useState<string>('0 bps');
  const [formattedUp, setFormattedUp] = useState<string>('0 bps');
  const [totalRxBytes, setTotalRxBytes] = useState<number | undefined>(undefined);
  const [totalTxBytes, setTotalTxBytes] = useState<number | undefined>(undefined);
  const [isConnected, setIsConnected] = useState<boolean>(true);
  const [interfaceName, setInterfaceName] = useState<string>('');

  const [connectionHistory, setConnectionHistory] = useState<SessionHistoryItem[]>([]);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const isMountedRef = useRef(true);
  const consecutiveDisconnectRef = useRef(0);

  // Initialize and reset when modal opens or session changes
  useEffect(() => {
    isMountedRef.current = true;
    consecutiveDisconnectRef.current = 0;

    if (!session || !isOpen) {
      setTrafficHistory([]);
      return;
    }

    // In MikroTik: Tx is Download to client, Rx is Upload from client
    const initDown = typeof session.txBps === 'number' && session.txBps > 0
      ? bpsToMbps(session.txBps)
      : parseRateStringToMbps(session.downloadRate || session.txRate) || 8.5;

    const initUp = typeof session.rxBps === 'number' && session.rxBps > 0
      ? bpsToMbps(session.rxBps)
      : parseRateStringToMbps(session.uploadRate || session.rxRate) || 2.5;

    setCurrentDownMbps(initDown);
    setCurrentUpMbps(initUp);
    setPeakDownMbps(initDown);
    setPeakUpMbps(initUp);
    setFormattedDown(session.downloadRate || session.txRate || `${initDown} Mbps`);
    setFormattedUp(session.uploadRate || session.rxRate || `${initUp} Mbps`);
    setIsConnected(true);
    setInterfaceName(session.interfaceName || `<pppoe-${session.name}>`);

    // Seed initial 10-point rolling history curve so SVG graph renders immediately upon opening
    const initialPoints: TrafficHistoryPoint[] = [];
    const now = Date.now();
    for (let i = 9; i >= 0; i--) {
      const t = new Date(now - i * 1500).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const jitterDown = initDown > 0 ? +(Math.sin(i * 1.3) * (initDown * 0.08)).toFixed(2) : 0;
      const jitterUp = initUp > 0 ? +(Math.cos(i * 1.5) * (initUp * 0.08)).toFixed(2) : 0;
      initialPoints.push({
        time: t,
        downloadMbps: Math.max(0.1, +(initDown + jitterDown).toFixed(2)),
        uploadMbps: Math.max(0.1, +(initUp + jitterUp).toFixed(2)),
      });
    }
    setTrafficHistory(initialPoints);

    fetchHistory();
    fetchTraffic();

    // Poll live traffic from backend every 1.5 seconds
    const interval = setInterval(() => {
      if (isMountedRef.current && isOpen && session) {
        fetchTraffic();
      }
    }, 1500);

    return () => {
      isMountedRef.current = false;
      clearInterval(interval);
    };
  }, [session?.name, session?.routerId, isOpen]);

  const fetchTraffic = async () => {
    if (!session) return;
    try {
      const targetRouter = session.routerId || routerId || 'all';
      const res = await api.active.getTraffic(targetRouter, session.name, session.routerId);
      if (res.success && res.data && isMountedRef.current) {
        const info = res.data;

        if (info.connected) {
          consecutiveDisconnectRef.current = 0;
          setIsConnected(true);
        } else {
          consecutiveDisconnectRef.current += 1;
          // Only mark disconnected if 3 consecutive polls fail (grace period for network/query delay)
          if (consecutiveDisconnectRef.current >= 3) {
            setIsConnected(false);
          }
        }

        if (info.interfaceName) setInterfaceName(info.interfaceName);
        if (info.rxBytes !== undefined) setTotalRxBytes(info.rxBytes);
        if (info.txBytes !== undefined) setTotalTxBytes(info.txBytes);

        // In MikroTik: Tx = Client Download, Rx = Client Upload
        const downMbps = bpsToMbps(info.txBps);
        const upMbps = bpsToMbps(info.rxBps);

        // If connected or within disconnect grace period, update or preserve live rates
        if (info.connected || consecutiveDisconnectRef.current < 3) {
          if (downMbps > 0 || !session.downloadRate) {
            setCurrentDownMbps(downMbps);
            setFormattedDown(info.downloadRate || `${downMbps} Mbps`);
          }
          if (upMbps > 0 || !session.uploadRate) {
            setCurrentUpMbps(upMbps);
            setFormattedUp(info.uploadRate || `${upMbps} Mbps`);
          }

          setPeakDownMbps((prev) => Math.max(prev, downMbps));
          setPeakUpMbps((prev) => Math.max(prev, upMbps));

          const timeStr = new Date(info.timestamp || Date.now()).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          });

          setTrafficHistory((prev) => {
            const next = [...prev, { time: timeStr, downloadMbps: downMbps, uploadMbps: upMbps }];
            return next.slice(-25); // Keep last 25 readings (~37s)
          });
        } else {
          // Confirmed disconnected after 3 failed polls
          setCurrentDownMbps(0);
          setCurrentUpMbps(0);
          setFormattedDown('0 bps');
          setFormattedUp('0 bps');
        }
      }
    } catch {
      // Keep previous state if temporary network error
    }
  };

  const fetchHistory = async () => {
    if (!session) return;
    try {
      const targetRouter = session.routerId || routerId || 'all';
      const res = await api.active.getHistory(targetRouter, session.name);
      if (res.success && Array.isArray(res.data) && isMountedRef.current) {
        setConnectionHistory(res.data);
      }
    } catch {
      // Fallback
    }
  };

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 1500);
  };

  if (!session) return null;

  // SVG Chart Dimensions & Dynamic Scaling
  const chartHeight = 90;
  const chartWidth = 440;
  const maxRecorded = Math.max(0.5, peakDownMbps, peakUpMbps, currentDownMbps, currentUpMbps);
  const maxScale = Math.max(5, Math.ceil(maxRecorded * 1.25));

  const pointsDown = trafficHistory.length > 0
    ? trafficHistory
        .map((d, idx) => {
          const x = (idx / Math.max(1, trafficHistory.length - 1)) * chartWidth;
          const y = chartHeight - (d.downloadMbps / maxScale) * (chartHeight - 8) - 4;
          return `${x.toFixed(1)},${Math.max(2, Math.min(chartHeight - 2, y)).toFixed(1)}`;
        })
        .join(' ')
    : '';

  const pointsUp = trafficHistory.length > 0
    ? trafficHistory
        .map((d, idx) => {
          const x = (idx / Math.max(1, trafficHistory.length - 1)) * chartWidth;
          const y = chartHeight - (d.uploadMbps / maxScale) * (chartHeight - 8) - 4;
          return `${x.toFixed(1)},${Math.max(2, Math.min(chartHeight - 2, y)).toFixed(1)}`;
        })
        .join(' ')
    : '';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Live Monitor Sesi: ${session.name}`}
      subtitle={`Router: ${session.routerName || 'MikroTik'} • Interface: ${interfaceName || 'pppoe-in'}`}
      maxWidth="2xl"
    >
      <div className="space-y-4 text-xs">
        {/* Realtime Traffic Banner */}
        <div className="p-4 bg-slate-900 text-white rounded-xl border border-slate-800 shadow-md relative overflow-hidden">
          {/* Header & Status Indicator */}
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                {isConnected ? (
                  <>
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
                  </>
                ) : (
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-500" />
                )}
              </span>
              <span className="font-semibold text-slate-100 font-mono text-sm">{session.name}</span>
              <span
                className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${
                  isConnected
                    ? 'bg-emerald-950 text-emerald-400 border-emerald-800'
                    : 'bg-rose-950 text-rose-400 border-rose-800'
                }`}
              >
                {isConnected ? 'ONLINE' : 'TERPUTUS'}
              </span>
            </div>

            <div className="flex items-center gap-3 font-mono text-[11px] text-slate-400">
              <span className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                <span>
                  Uptime: <strong className="text-white">{session.uptime || '—'}</strong>
                </span>
              </span>
            </div>
          </div>

          {/* Current Rate Gauges: Tx (Download) & Rx (Upload) */}
          <div className="grid grid-cols-2 gap-4 my-3">
            {/* Client Download (Router Tx) */}
            <div className="bg-slate-800/80 p-3 rounded-lg border border-slate-700/80">
              <div className="flex items-center justify-between text-slate-400 mb-1">
                <span className="flex items-center gap-1 font-semibold text-emerald-400">
                  <ArrowDownLeft className="w-4 h-4" />
                  <span>Download (Tx Rate)</span>
                </span>
                <span className="text-[10px] text-slate-400">
                  Puncak: {peakDownMbps.toFixed(1)} Mbps
                </span>
              </div>
              <div className="flex items-baseline gap-1.5 font-mono">
                <span className="text-2xl font-black text-emerald-400 tabular-nums">
                  {formattedDown}
                </span>
              </div>
              {/* Progress bar relative to max scale */}
              <div className="w-full bg-slate-700 h-1.5 rounded-full mt-2 overflow-hidden">
                <div
                  className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, Math.max(3, (currentDownMbps / maxScale) * 100))}%` }}
                />
              </div>
              {totalTxBytes !== undefined && (
                <div className="mt-1.5 text-[10px] text-slate-400 flex items-center justify-between font-mono">
                  <span className="flex items-center gap-1">
                    <HardDriveDownload className="w-3 h-3 text-emerald-500" /> Total Kuota Tx:
                  </span>
                  <span className="text-slate-200 font-semibold">{formatBytes(totalTxBytes)}</span>
                </div>
              )}
            </div>

            {/* Client Upload (Router Rx) */}
            <div className="bg-slate-800/80 p-3 rounded-lg border border-slate-700/80">
              <div className="flex items-center justify-between text-slate-400 mb-1">
                <span className="flex items-center gap-1 font-semibold text-sky-400">
                  <ArrowUpRight className="w-4 h-4" />
                  <span>Upload (Rx Rate)</span>
                </span>
                <span className="text-[10px] text-slate-400">
                  Puncak: {peakUpMbps.toFixed(1)} Mbps
                </span>
              </div>
              <div className="flex items-baseline gap-1.5 font-mono">
                <span className="text-2xl font-black text-sky-400 tabular-nums">
                  {formattedUp}
                </span>
              </div>
              {/* Progress bar relative to max scale */}
              <div className="w-full bg-slate-700 h-1.5 rounded-full mt-2 overflow-hidden">
                <div
                  className="bg-sky-500 h-full rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, Math.max(3, (currentUpMbps / maxScale) * 100))}%` }}
                />
              </div>
              {totalRxBytes !== undefined && (
                <div className="mt-1.5 text-[10px] text-slate-400 flex items-center justify-between font-mono">
                  <span className="flex items-center gap-1">
                    <HardDriveUpload className="w-3 h-3 text-sky-500" /> Total Kuota Rx:
                  </span>
                  <span className="text-slate-200 font-semibold">{formatBytes(totalRxBytes)}</span>
                </div>
              )}
            </div>
          </div>

          {/* SVG Realtime Waveform Chart */}
          <div className="bg-slate-950/90 rounded-lg p-2.5 border border-slate-800">
            <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono mb-1.5">
              <span className="flex items-center gap-1">
                <Activity className="w-3 h-3 text-sky-400 animate-pulse" />
                <span>Grafik Trafik Realtime (Telemetri MikroTik)</span>
              </span>
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span>Download (Tx)</span>
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-sky-500" />
                  <span>Upload (Rx)</span>
                </span>
                <span className="text-slate-500">Skala: {maxScale} Mbps</span>
              </div>
            </div>

            <div className="w-full h-24 overflow-hidden relative">
              <svg
                viewBox={`0 0 ${chartWidth} ${chartHeight}`}
                className="w-full h-full overflow-visible"
                preserveAspectRatio="none"
              >
                {/* Horizontal Grid lines */}
                <line x1="0" y1={chartHeight * 0.25} x2={chartWidth} y2={chartHeight * 0.25} stroke="#334155" strokeDasharray="3,3" strokeWidth="0.5" />
                <line x1="0" y1={chartHeight * 0.5} x2={chartWidth} y2={chartHeight * 0.5} stroke="#334155" strokeDasharray="3,3" strokeWidth="0.5" />
                <line x1="0" y1={chartHeight * 0.75} x2={chartWidth} y2={chartHeight * 0.75} stroke="#334155" strokeDasharray="3,3" strokeWidth="0.5" />

                {/* Polylines: Tx (Download) in emerald, Rx (Upload) in sky */}
                {pointsDown && (
                  <polyline
                    fill="none"
                    stroke="#10b981"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    points={pointsDown}
                  />
                )}
                {pointsUp && (
                  <polyline
                    fill="none"
                    stroke="#38bdf8"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    points={pointsUp}
                  />
                )}
              </svg>
            </div>
          </div>
        </div>

        {/* Network & Session Details Card */}
        <div className="p-3.5 bg-slate-50 dark:bg-zinc-850 rounded-xl border border-slate-200 dark:border-zinc-800 space-y-2.5">
          <span className="font-semibold text-slate-800 dark:text-zinc-200 flex items-center gap-1.5">
            <Network className="w-4 h-4 text-sky-500" />
            <span>Parameter Jaringan & Sesi MikroTik</span>
          </span>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-slate-700 dark:text-zinc-300">
            <div className="flex items-center justify-between p-2 rounded-lg bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700/80">
              <div>
                <span className="text-[10px] text-slate-400 block">IP Address Klien</span>
                <span className="font-mono font-semibold text-slate-900 dark:text-white">
                  {session.address || '—'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => copyToClipboard(session.address || '', 'ip')}
                className="p-1 text-slate-400 hover:text-sky-600 rounded transition-colors"
                title="Salin IP"
                aria-label="Salin IP Address"
              >
                {copiedField === 'ip' ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>

            <div className="flex items-center justify-between p-2 rounded-lg bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700/80">
              <div>
                <span className="text-[10px] text-slate-400 block">Caller ID / MAC Address</span>
                <span className="font-mono text-[11px] font-semibold text-slate-900 dark:text-white">
                  {session.callerId || '—'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => copyToClipboard(session.callerId || '', 'mac')}
                className="p-1 text-slate-400 hover:text-sky-600 rounded transition-colors"
                title="Salin MAC"
                aria-label="Salin MAC Address"
              >
                {copiedField === 'mac' ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>

            <div className="p-2 rounded-lg bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700/80">
              <span className="text-[10px] text-slate-400 block">Interface Dynamically Bound</span>
              <span className="font-mono text-slate-800 dark:text-zinc-200 font-semibold">
                {interfaceName || `<pppoe-${session.name}>`}
              </span>
            </div>

            <div className="p-2 rounded-lg bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700/80">
              <span className="text-[10px] text-slate-400 block">Router Host Target</span>
              <span className="font-mono text-sky-600 dark:text-sky-400 font-semibold">
                {session.routerName || 'MikroTik Router'}
              </span>
            </div>
          </div>
        </div>

        {/* Riwayat Connect & Disconnect */}
        <div className="p-3.5 bg-slate-50 dark:bg-zinc-850 rounded-xl border border-slate-200 dark:border-zinc-800 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-slate-800 dark:text-zinc-200 flex items-center gap-1.5">
              <History className="w-4 h-4 text-indigo-500" />
              <span>Riwayat Connect & Disconnect</span>
            </span>
            <span className="text-[10px] text-slate-400">Jejak autentikasi pengguna ini</span>
          </div>

          <div className="max-h-44 overflow-y-auto space-y-2 pr-1">
            {connectionHistory.length === 0 ? (
              <div className="py-4 text-center text-slate-400 dark:text-zinc-500 italic bg-white dark:bg-zinc-800 rounded-lg border border-dashed border-slate-200 dark:border-zinc-700">
                Belum ada rekaman riwayat disconnect sebelumnya untuk pengguna ini.
              </div>
            ) : (
              connectionHistory.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between p-2 rounded-lg bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-750"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        item.type === 'connected' ? 'bg-emerald-500' : 'bg-rose-500'
                      }`}
                    />
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`font-semibold text-[11px] ${
                            item.type === 'connected'
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : 'text-rose-600 dark:text-rose-400'
                          }`}
                        >
                          {item.type === 'connected' ? 'CONNECT (Online)' : 'DISCONNECT (Putus)'}
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">
                          • {item.routerName}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-500 dark:text-zinc-400 mt-0.5">
                        {item.details || (item.type === 'connected' ? `IP Dial: ${item.ipAddress}` : 'Sesi di-kick / selesai')}
                      </p>
                    </div>
                  </div>

                  <span className="font-mono text-[10px] text-slate-400 tabular-nums shrink-0">
                    {new Date(item.timestamp).toLocaleString([], {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-between pt-3 border-t border-slate-200 dark:border-zinc-800">
          <button
            type="button"
            onClick={() => {
              onKick(session);
              onClose();
            }}
            className="flex items-center gap-1.5 px-3.5 py-2 font-semibold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 hover:bg-rose-100 rounded-lg transition-colors cursor-pointer"
          >
            <UserX className="w-4 h-4" />
            <span>Putuskan Sesi (Kick)</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 font-semibold text-slate-700 dark:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-lg transition-colors cursor-pointer"
          >
            Tutup
          </button>
        </div>
      </div>
    </Modal>
  );
};
