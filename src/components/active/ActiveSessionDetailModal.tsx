import React, { useState, useEffect, useRef } from 'react';
import { PppActive, SessionHistoryItem, SessionTrafficInfo } from '../../types/index.ts';
import { api } from '../../api/client.ts';
import { useRouterContext } from '../../context/RouterContext.tsx';
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
  Zap,
  Play,
  RotateCw,
  Terminal,
  ShieldCheck,
  AlertCircle,
  Layers,
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
  const { refreshRouters } = useRouterContext();
  const [activeTab, setActiveTab] = useState<'traffic' | 'ping' | 'history'>('traffic');

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

  // Ping Tool State
  const [pingAddress, setPingAddress] = useState<string>('');
  const [pingCount, setPingCount] = useState<number>(4);
  const [pingSize, setPingSize] = useState<number>(32);
  const [isPinging, setIsPinging] = useState<boolean>(false);
  const [pingPackets, setPingPackets] = useState<
    Array<{ seq: number; host: string; size: number; ttl: number; timeMs: number; status: 'reply' | 'timeout' }>
  >([]);
  const [pingStats, setPingStats] = useState<{
    sent: number;
    received: number;
    lost: number;
    packetLoss: number;
    minRtt: number;
    avgRtt: number;
    maxRtt: number;
  } | null>(null);
  const [pingError, setPingError] = useState<string | null>(null);
  const [pingCopied, setPingCopied] = useState<boolean>(false);

  const isMountedRef = useRef(true);
  const consecutiveDisconnectRef = useRef(0);
  const activeTabRef = useRef(activeTab);
  const isPingingRef = useRef(isPinging);

  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  useEffect(() => {
    isPingingRef.current = isPinging;
  }, [isPinging]);

  // When switching to traffic tab, trigger an immediate fetch
  useEffect(() => {
    if (activeTab === 'traffic' && isOpen && session && !isPingingRef.current) {
      fetchTraffic();
    }
  }, [activeTab]);

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

    // Poll live traffic from backend every 2 seconds ONLY when traffic tab is open and ping is NOT running
    const interval = setInterval(() => {
      if (isMountedRef.current && isOpen && session && activeTabRef.current === 'traffic' && !isPingingRef.current) {
        fetchTraffic();
      }
    }, 2000);

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
          // Only mark disconnected if 5 consecutive polls fail (grace period for network/query delay)
          if (consecutiveDisconnectRef.current >= 5) {
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

  const handleRunPing = async (customIp?: string) => {
    const target = (customIp || pingAddress || session?.address || '').trim();
    if (!target) {
      setPingError('Alamat IP target kosong.');
      return;
    }
    try {
      setIsPinging(true);
      setPingError(null);
      const targetRouter = session?.routerId || routerId || 'all';
      const res = await api.active.ping(targetRouter, {
        address: target,
        count: pingCount,
        size: pingSize,
        targetRouterId: session?.routerId,
      });
      if (res.success && res.data) {
        setPingPackets(res.data.packets || []);
        setPingStats({
          sent: res.data.sent,
          received: res.data.received,
          lost: res.data.lost,
          packetLoss: res.data.packetLoss,
          minRtt: res.data.minRtt,
          avgRtt: res.data.avgRtt,
          maxRtt: res.data.maxRtt,
        });
        refreshRouters().catch(() => {});
      } else {
        setPingError('Gagal menerima data respon ping.');
      }
    } catch (err: any) {
      setPingError(err.message || 'Gagal mengirim paket ping.');
    } finally {
      setIsPinging(false);
    }
  };

  const copyPingResults = () => {
    if (!pingStats || pingPackets.length === 0) return;
    const targetHost = pingAddress || session?.address || '127.0.0.1';
    const lines = [
      `PING ${targetHost} with ${pingSize} bytes of data:`,
      ...pingPackets.map((p) =>
        p.status === 'reply'
          ? `Reply from ${p.host}: bytes=${p.size} time=${p.timeMs}ms TTL=${p.ttl}`
          : `Request timed out for ${p.host}`
      ),
      '',
      `--- ${targetHost} ping statistics ---`,
      `${pingStats.sent} packets transmitted, ${pingStats.received} received, ${pingStats.packetLoss}% packet loss`,
      `rtt min/avg/max = ${pingStats.minRtt}/${pingStats.avgRtt}/${pingStats.maxRtt} ms`,
    ];
    navigator.clipboard.writeText(lines.join('\n'));
    setPingCopied(true);
    setTimeout(() => setPingCopied(false), 1500);
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
      subtitle={`Router: ${session.routerName || 'MikroTik'} • Profile: ${session.profile || 'default'} • Interface: ${interfaceName || 'pppoe-in'}`}
      maxWidth="2xl"
    >
      <div className="space-y-4 text-xs">
        {/* Navigation Tabs */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-100 dark:bg-zinc-800/80 rounded-xl border border-slate-200 dark:border-zinc-700/80">
          <button
            type="button"
            onClick={() => setActiveTab('traffic')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg font-semibold transition-all cursor-pointer ${
              activeTab === 'traffic'
                ? 'bg-white dark:bg-zinc-900 text-sky-600 dark:text-sky-400 shadow-2xs'
                : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>Telemetri & Trafik</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('ping');
              if (!pingAddress && session.address) {
                setPingAddress(session.address);
              }
            }}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg font-semibold transition-all cursor-pointer ${
              activeTab === 'ping'
                ? 'bg-white dark:bg-zinc-900 text-amber-600 dark:text-amber-400 shadow-2xs'
                : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200'
            }`}
          >
            <Zap className="w-3.5 h-3.5 text-amber-500" />
            <span>Tool Ping ({session.address || 'IP Klien'})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg font-semibold transition-all cursor-pointer ${
              activeTab === 'history'
                ? 'bg-white dark:bg-zinc-900 text-indigo-600 dark:text-indigo-400 shadow-2xs'
                : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>Riwayat Sesi ({connectionHistory.length})</span>
          </button>
        </div>

        {/* TAB 1: Telemetri & Trafik */}
        {activeTab === 'traffic' && (
          <div className="space-y-4">
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
                  {session.profile && (
                    <span className="text-[10px] px-2 py-0.5 rounded-md font-mono font-semibold bg-indigo-950 text-indigo-300 border border-indigo-800">
                      Profile: {session.profile}
                    </span>
                  )}
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
                    <span className="text-[10px] text-slate-400">Puncak: {peakDownMbps.toFixed(1)} Mbps</span>
                  </div>
                  <div className="flex items-baseline gap-1.5 font-mono">
                    <span className="text-2xl font-black text-emerald-400 tabular-nums">{formattedDown}</span>
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
                    <span className="text-[10px] text-slate-400">Puncak: {peakUpMbps.toFixed(1)} Mbps</span>
                  </div>
                  <div className="flex items-baseline gap-1.5 font-mono">
                    <span className="text-2xl font-black text-sky-400 tabular-nums">{formattedUp}</span>
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

            {/* Network & Session Parameters Card */}
            <div className="p-3.5 bg-slate-50 dark:bg-zinc-850 rounded-xl border border-slate-200 dark:border-zinc-800 space-y-2.5">
              <span className="font-semibold text-slate-800 dark:text-zinc-200 flex items-center gap-1.5">
                <Network className="w-4 h-4 text-sky-500" />
                <span>Parameter Jaringan & Sesi MikroTik</span>
              </span>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-slate-700 dark:text-zinc-300">
                {/* 1. IP Address Klien with Ping trigger */}
                <div className="p-2.5 rounded-lg bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700/80 flex flex-col justify-between">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] text-slate-400 block">IP Address Klien</span>
                    <div className="flex items-center gap-1">
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
                  </div>
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-mono font-bold text-slate-900 dark:text-white text-xs">
                      {session.address || '—'}
                    </span>
                    {session.address && (
                      <button
                        type="button"
                        onClick={() => {
                          setPingAddress(session.address || '');
                          setActiveTab('ping');
                          handleRunPing(session.address);
                        }}
                        className="flex items-center gap-1 text-[10px] font-semibold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/50 hover:bg-amber-100 dark:hover:bg-amber-900/50 px-2 py-0.5 rounded border border-amber-200 dark:border-amber-800 transition-colors cursor-pointer"
                        title="Ping IP Klien Sekarang"
                      >
                        <Zap className="w-3 h-3 text-amber-500" />
                        <span>Ping IP</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* 2. Profile PPPoE Terpilih */}
                <div className="p-2.5 rounded-lg bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700/80 flex flex-col justify-between">
                  <span className="text-[10px] text-slate-400 block mb-1">Profile Paket Terpilih</span>
                  <div className="flex items-center gap-1.5">
                    <span className="px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 font-mono font-bold text-xs">
                      {session.profile || 'default'}
                    </span>
                  </div>
                </div>

                {/* 3. Caller ID / MAC Address */}
                <div className="p-2.5 rounded-lg bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700/80 flex flex-col justify-between">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] text-slate-400 block">Caller ID / MAC Dial-in</span>
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
                  <span className="font-mono text-[11px] font-semibold text-slate-900 dark:text-white">
                    {session.callerId || '—'}
                  </span>
                </div>

                {/* 4. Interface Bound */}
                <div className="p-2.5 rounded-lg bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700/80">
                  <span className="text-[10px] text-slate-400 block mb-1">Interface Dynamically Bound</span>
                  <span className="font-mono text-slate-800 dark:text-zinc-200 font-semibold">
                    {interfaceName || `<pppoe-${session.name}>`}
                  </span>
                </div>

                {/* 5. Router Host */}
                <div className="p-2.5 rounded-lg bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700/80">
                  <span className="text-[10px] text-slate-400 block mb-1">Router Host MikroTik</span>
                  <span className="font-mono text-sky-600 dark:text-sky-400 font-semibold">
                    {session.routerName || 'MikroTik Router'}
                  </span>
                </div>

                {/* 6. Enkripsi Sesi */}
                <div className="p-2.5 rounded-lg bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700/80">
                  <span className="text-[10px] text-slate-400 block mb-1">Enkripsi / Encoding</span>
                  <span className="font-mono text-slate-700 dark:text-zinc-300">
                    {session.encoding || 'MPPE128 stateless'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: Tool Ping IP Address */}
        {activeTab === 'ping' && (
          <div className="space-y-3.5">
            {/* Ping Configuration Bar */}
            <div className="p-3.5 bg-slate-50 dark:bg-zinc-850 rounded-xl border border-slate-200 dark:border-zinc-800 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex-1">
                  <label className="block text-[11px] font-semibold text-slate-700 dark:text-zinc-300 mb-1">
                    Target IP Address *
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={pingAddress}
                      onChange={(e) => setPingAddress(e.target.value)}
                      placeholder="e.g. 10.10.10.25"
                      className="w-full pl-3 pr-20 py-2 font-mono text-xs bg-white dark:bg-zinc-800 border border-slate-300 dark:border-zinc-700 rounded-lg text-slate-900 dark:text-white focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 focus:outline-hidden"
                    />
                    {session.address && pingAddress !== session.address && (
                      <button
                        type="button"
                        onClick={() => setPingAddress(session.address || '')}
                        className="absolute right-2 top-1.5 px-2 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/40 rounded transition-colors"
                      >
                        Reset ke IP Klien
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 dark:text-zinc-300 mb-1">
                      Jumlah Paket
                    </label>
                    <select
                      value={pingCount}
                      onChange={(e) => setPingCount(Number(e.target.value))}
                      className="px-3 py-2 bg-white dark:bg-zinc-800 border border-slate-300 dark:border-zinc-700 rounded-lg text-slate-900 dark:text-white text-xs font-mono focus:outline-hidden"
                    >
                      <option value={4}>4 Paket (Cepat)</option>
                      <option value={8}>8 Paket</option>
                      <option value={10}>10 Paket</option>
                      <option value={20}>20 Paket (Mendalam)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 dark:text-zinc-300 mb-1">
                      Ukuran Paket
                    </label>
                    <select
                      value={pingSize}
                      onChange={(e) => setPingSize(Number(e.target.value))}
                      className="px-3 py-2 bg-white dark:bg-zinc-800 border border-slate-300 dark:border-zinc-700 rounded-lg text-slate-900 dark:text-white text-xs font-mono focus:outline-hidden"
                    >
                      <option value={32}>32 Bytes</option>
                      <option value={64}>64 Bytes</option>
                      <option value={128}>128 Bytes</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Quick Presets */}
              <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[10px]">
                <span className="text-slate-400 font-medium">Preset Cepat:</span>
                {session.address && (
                  <button
                    type="button"
                    onClick={() => {
                      setPingAddress(session.address || '');
                      handleRunPing(session.address);
                    }}
                    className="px-2 py-0.5 rounded bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-slate-700 dark:text-zinc-300 hover:border-amber-500 font-mono"
                  >
                    IP Klien ({session.address})
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    const gw = session.address ? `${session.address.split('.').slice(0, 3).join('.')}.1` : '10.10.10.1';
                    setPingAddress(gw);
                    handleRunPing(gw);
                  }}
                  className="px-2 py-0.5 rounded bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-slate-700 dark:text-zinc-300 hover:border-amber-500 font-mono"
                >
                  Gateway ({session.address ? `${session.address.split('.').slice(0, 3).join('.')}.1` : '10.10.10.1'})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPingAddress('1.1.1.1');
                    handleRunPing('1.1.1.1');
                  }}
                  className="px-2 py-0.5 rounded bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-slate-700 dark:text-zinc-300 hover:border-amber-500 font-mono"
                >
                  DNS Cloudflare (1.1.1.1)
                </button>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-zinc-800">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleRunPing()}
                    disabled={isPinging || !pingAddress}
                    className="flex items-center gap-1.5 px-4 py-2 font-semibold text-white bg-amber-600 hover:bg-amber-500 disabled:opacity-50 rounded-lg shadow-2xs transition-colors cursor-pointer"
                  >
                    {isPinging ? (
                      <>
                        <RotateCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Sedang Ping...</span>
                      </>
                    ) : (
                      <>
                        <Play className="w-3.5 h-3.5 fill-current" />
                        <span>Mulai Ping</span>
                      </>
                    )}
                  </button>

                  {pingPackets.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setPingPackets([]);
                        setPingStats(null);
                        setPingError(null);
                      }}
                      className="px-3 py-2 text-slate-600 dark:text-zinc-400 hover:bg-slate-200 dark:hover:bg-zinc-800 rounded-lg transition-colors"
                    >
                      Bersihkan
                    </button>
                  )}
                </div>

                {pingPackets.length > 0 && (
                  <button
                    type="button"
                    onClick={copyPingResults}
                    className="flex items-center gap-1 px-3 py-1.5 text-[11px] font-medium text-slate-700 dark:text-zinc-300 bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-lg hover:bg-slate-100 transition-colors"
                  >
                    {pingCopied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{pingCopied ? 'Tersalin!' : 'Salin Log'}</span>
                  </button>
                )}
              </div>
            </div>

            {/* Error Message */}
            {pingError && (
              <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-400 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{pingError}</span>
              </div>
            )}

            {/* Terminal Console Output */}
            <div className="bg-[#0b0f19] text-zinc-100 rounded-xl border border-slate-800 shadow-inner overflow-hidden font-mono text-[11px]">
              {/* Terminal Title Bar */}
              <div className="flex items-center justify-between px-3.5 py-2 bg-slate-900 border-b border-slate-800 text-slate-400 text-[10px]">
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500/80 inline-block" />
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500/80 inline-block" />
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80 inline-block" />
                  <span className="ml-2 font-semibold text-slate-300">
                    terminal ~ ping {pingAddress || session.address || 'host'}
                  </span>
                </div>
                <span>MikroTik RouterOS ICMP Tool</span>
              </div>

              {/* Console Body */}
              <div className="p-3.5 min-h-[160px] max-h-[220px] overflow-y-auto space-y-1.5 selection:bg-amber-500/30 selection:text-white">
                {pingPackets.length === 0 && !isPinging && !pingError && (
                  <div className="py-6 text-center text-slate-500 italic space-y-1 font-sans">
                    <Terminal className="w-6 h-6 mx-auto text-slate-600 mb-1" />
                    <p>Klik tombol "Mulai Ping" di atas untuk mengirim paket ICMP ke IP {pingAddress || session.address}.</p>
                    <p className="text-[10px] text-slate-600">Alat ini memverifikasi latensi RTT (Round-Trip Time) dan kestabilan transmisi.</p>
                  </div>
                )}

                {isPinging && pingPackets.length === 0 && (
                  <div className="text-amber-400 flex items-center gap-2 py-4">
                    <RotateCw className="w-4 h-4 animate-spin text-amber-500" />
                    <span>Mengirim {pingCount} paket ICMP ({pingSize} bytes) ke {pingAddress}...</span>
                  </div>
                )}

                {pingPackets.length > 0 && (
                  <>
                    <div className="text-slate-400 text-[10px] pb-1 border-b border-slate-800/80">
                      PING {pingAddress} ({pingAddress}) with {pingSize} bytes of data:
                    </div>

                    {pingPackets.map((pkt) => {
                      const isFast = pkt.timeMs < 20;
                      const isMed = pkt.timeMs >= 20 && pkt.timeMs < 60;
                      const isSlow = pkt.timeMs >= 60;

                      return (
                        <div key={pkt.seq} className="flex items-center justify-between hover:bg-slate-900/60 py-0.5 px-1 rounded">
                          <div className="flex items-center gap-2">
                            <span className="text-slate-500">#{pkt.seq}</span>
                            {pkt.status === 'reply' ? (
                              <span>
                                Reply from <strong className="text-white">{pkt.host}</strong>: bytes={pkt.size}{' '}
                                <span
                                  className={`font-bold ${
                                    isFast
                                      ? 'text-emerald-400'
                                      : isMed
                                      ? 'text-amber-300'
                                      : 'text-orange-400'
                                  }`}
                                >
                                  time={pkt.timeMs}ms
                                </span>{' '}
                                TTL={pkt.ttl}
                              </span>
                            ) : (
                              <span className="text-rose-400 font-semibold">Request timed out.</span>
                            )}
                          </div>

                          <span
                            className={`text-[9px] px-1.5 py-0.2 rounded font-sans uppercase font-bold ${
                              pkt.status === 'timeout'
                                ? 'bg-rose-950 text-rose-400'
                                : isFast
                                ? 'bg-emerald-950/80 text-emerald-400'
                                : isMed
                                ? 'bg-amber-950/80 text-amber-300'
                                : 'bg-orange-950/80 text-orange-400'
                            }`}
                          >
                            {pkt.status === 'timeout' ? 'RTO' : isFast ? '<20ms' : isMed ? 'Normal' : 'Tinggi'}
                          </span>
                        </div>
                      );
                    })}
                  </>
                )}
              </div>
            </div>

            {/* Ping Statistics Card */}
            {pingStats && (
              <div className="p-3.5 bg-slate-50 dark:bg-zinc-850 rounded-xl border border-slate-200 dark:border-zinc-800 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-800 dark:text-zinc-200 flex items-center gap-1.5 font-sans">
                    <ShieldCheck className="w-4 h-4 text-emerald-500" />
                    <span>Statistik & Diagnostik Ping</span>
                  </span>
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full font-bold font-sans ${
                      pingStats.packetLoss === 0 && pingStats.avgRtt < 30
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400'
                        : pingStats.packetLoss === 0
                        ? 'bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-400'
                        : pingStats.packetLoss < 100
                        ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400'
                        : 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400'
                    }`}
                  >
                    {pingStats.packetLoss === 0 && pingStats.avgRtt < 30
                      ? 'Koneksi Klien Sangat Stabil'
                      : pingStats.packetLoss === 0
                      ? 'Koneksi Terhubung Normal'
                      : pingStats.packetLoss < 100
                      ? `Terdeteksi Packet Loss ${pingStats.packetLoss}%`
                      : 'Request Timed Out (Tidak Terhubung)'}
                  </span>
                </div>

                <div className="grid grid-cols-4 gap-2 text-center font-mono">
                  <div className="p-2 rounded-lg bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700">
                    <span className="text-[9px] text-slate-400 block font-sans">Paket Tx/Rx</span>
                    <span className="font-bold text-slate-800 dark:text-zinc-200 text-xs">
                      {pingStats.sent}/{pingStats.received} ({pingStats.packetLoss}% loss)
                    </span>
                  </div>

                  <div className="p-2 rounded-lg bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700">
                    <span className="text-[9px] text-slate-400 block font-sans">Min RTT</span>
                    <span className="font-bold text-emerald-600 dark:text-emerald-400 text-xs">
                      {pingStats.minRtt} ms
                    </span>
                  </div>

                  <div className="p-2 rounded-lg bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700">
                    <span className="text-[9px] text-slate-400 block font-sans">Avg RTT</span>
                    <span className="font-bold text-sky-600 dark:text-sky-400 text-xs">
                      {pingStats.avgRtt} ms
                    </span>
                  </div>

                  <div className="p-2 rounded-lg bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700">
                    <span className="text-[9px] text-slate-400 block font-sans">Max RTT</span>
                    <span className="font-bold text-slate-800 dark:text-zinc-200 text-xs">
                      {pingStats.maxRtt} ms
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: Riwayat Connect & Disconnect */}
        {activeTab === 'history' && (
          <div className="p-3.5 bg-slate-50 dark:bg-zinc-850 rounded-xl border border-slate-200 dark:border-zinc-800 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-800 dark:text-zinc-200 flex items-center gap-1.5 font-sans">
                <History className="w-4 h-4 text-indigo-500" />
                <span>Riwayat Connect & Disconnect Pengguna</span>
              </span>
              <span className="text-[10px] text-slate-400">Jejak autentikasi pengguna '{session.name}'</span>
            </div>

            <div className="max-h-64 overflow-y-auto space-y-2 pr-1">
              {connectionHistory.length === 0 ? (
                <div className="py-8 text-center text-slate-400 dark:text-zinc-500 italic bg-white dark:bg-zinc-800 rounded-lg border border-dashed border-slate-200 dark:border-zinc-700 font-sans">
                  Belum ada rekaman riwayat disconnect sebelumnya untuk pengguna ini.
                </div>
              ) : (
                connectionHistory.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between p-2.5 rounded-lg bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-750"
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
                            className={`font-semibold text-[11px] font-sans ${
                              item.type === 'connected'
                                ? 'text-emerald-700 dark:text-emerald-400'
                                : 'text-rose-600 dark:text-rose-400'
                            }`}
                          >
                            {item.type === 'connected' ? 'CONNECT (Online)' : 'DISCONNECT (Putus)'}
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono">• {item.routerName}</span>
                        </div>
                        <p className="text-[10px] text-slate-500 dark:text-zinc-400 mt-0.5 font-sans">
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
        )}

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
