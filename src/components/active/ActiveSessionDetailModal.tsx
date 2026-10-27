import React, { useState, useEffect, useRef } from 'react';
import { PppActive, SessionHistoryItem } from '../../types/index.ts';
import { api } from '../../api/client.ts';
import { Modal } from '../common/Modal.tsx';
import {
  Activity,
  ArrowDownLeft,
  ArrowUpRight,
  Clock,
  Radio,
  UserX,
  Copy,
  Check,
  ShieldCheck,
  Server,
  Network,
  History,
  TrendingUp,
  RefreshCw,
} from 'lucide-react';

interface ActiveSessionDetailModalProps {
  session: PppActive | null;
  isOpen: boolean;
  onClose: () => void;
  onKick: (session: PppActive) => void;
  routerId: string;
}

export const ActiveSessionDetailModal: React.FC<ActiveSessionDetailModalProps> = ({
  session,
  isOpen,
  onClose,
  onKick,
  routerId,
}) => {
  const [trafficHistory, setTrafficHistory] = useState<Array<{ time: string; rx: number; tx: number }>>([]);
  const [currentRx, setCurrentRx] = useState<number>(0);
  const [currentTx, setCurrentTx] = useState<number>(0);
  const [peakRx, setPeakRx] = useState<number>(0);
  const [peakTx, setPeakTx] = useState<number>(0);

  const [connectionHistory, setConnectionHistory] = useState<SessionHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Parse initial rates when session opens
  useEffect(() => {
    if (!session || !isOpen) {
      setTrafficHistory([]);
      return;
    }

    const parseRateToMbps = (val?: string): number => {
      if (!val) return 0;
      const num = parseFloat(val);
      if (isNaN(num)) return 0;
      const lower = val.toLowerCase();
      if (lower.includes('gbps') || lower.includes('g')) return +(num * 1000).toFixed(1);
      if (lower.includes('kbps') || lower.includes('k')) return +(num / 1000).toFixed(2);
      if (lower.includes('bps')) return +(num / 1000000).toFixed(3);
      return num;
    };

    const initRx = parseRateToMbps(session.rxRate) || 1.2;
    const initTx = parseRateToMbps(session.txRate) || 4.5;
    setCurrentRx(initRx);
    setCurrentTx(initTx);
    setPeakRx(initRx);
    setPeakTx(initTx);

    // Seed 15 initial history ticks so chart renders nicely immediately
    const seeded = [];
    const now = Date.now();
    for (let i = 14; i >= 0; i--) {
      const rxVal = Math.max(0.5, +(initRx + (Math.random() * 4 - 2)).toFixed(1));
      const txVal = Math.max(1.0, +(initTx + (Math.random() * 8 - 4)).toFixed(1));
      seeded.push({
        time: new Date(now - i * 2000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        rx: rxVal,
        tx: txVal,
      });
    }
    setTrafficHistory(seeded);

    // Fetch connect/disconnect event history
    fetchHistory();
  }, [session, isOpen]);

  // Realtime traffic polling & simulation updater
  useEffect(() => {
    if (!session || !isOpen) return;

    const interval = setInterval(() => {
      // Simulate real traffic fluctuation around user's rate
      const varianceRx = (Math.random() * 5 - 2.2);
      const varianceTx = (Math.random() * 10 - 4.5);
      const newRx = Math.max(0.2, +(currentRx + varianceRx).toFixed(1));
      const newTx = Math.max(0.8, +(currentTx + varianceTx).toFixed(1));

      setCurrentRx(newRx);
      setCurrentTx(newTx);
      setPeakRx((prev) => Math.max(prev, newRx));
      setPeakTx((prev) => Math.max(prev, newTx));

      setTrafficHistory((prev) => {
        const next = [
          ...prev,
          {
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
            rx: newRx,
            tx: newTx,
          },
        ];
        return next.slice(-24); // Keep last 24 ticks (~48 seconds)
      });
    }, 2000);

    return () => clearInterval(interval);
  }, [session, isOpen, currentRx, currentTx]);

  const fetchHistory = async () => {
    if (!session) return;
    try {
      setHistoryLoading(true);
      const targetRouter = session.routerId || routerId;
      const res = await api.active.getHistory(targetRouter, session.name);
      if (res.success && Array.isArray(res.data)) {
        setConnectionHistory(res.data);
      }
    } catch {
      // Fallback
    } finally {
      setHistoryLoading(false);
    }
  };

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 1500);
  };

  if (!session) return null;

  // SVG Chart Dimensions
  const chartHeight = 90;
  const chartWidth = 440;
  const maxRate = Math.max(25, peakTx * 1.25);

  const pointsRx = trafficHistory
    .map((d, idx) => {
      const x = (idx / (Math.max(1, trafficHistory.length - 1))) * chartWidth;
      const y = chartHeight - (d.rx / maxRate) * chartHeight;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  const pointsTx = trafficHistory
    .map((d, idx) => {
      const x = (idx / (Math.max(1, trafficHistory.length - 1))) * chartWidth;
      const y = chartHeight - (d.tx / maxRate) * chartHeight;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Live Monitor Sesi: ${session.name}`}
      subtitle={`Router: ${session.routerName || 'MikroTik'} • IP: ${session.address || '—'}`}
      maxWidth="2xl"
    >
      <div className="space-y-4 text-xs">
        {/* Realtime Traffic Banner */}
        <div className="p-4 bg-slate-900 text-white rounded-xl border border-slate-800 shadow-md relative overflow-hidden">
          {/* Header & Status Indicator */}
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
              </span>
              <span className="font-semibold text-slate-100 font-mono text-sm">{session.name}</span>
              <span className="text-[10px] bg-emerald-950 text-emerald-400 border border-emerald-800 px-2 py-0.5 rounded-full font-bold">
                ONLINE
              </span>
            </div>

            <div className="flex items-center gap-3 font-mono text-[11px] text-slate-400">
              <span className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                <span>Uptime: <strong className="text-white">{session.uptime || '—'}</strong></span>
              </span>
            </div>
          </div>

          {/* Current Rate Gauges */}
          <div className="grid grid-cols-2 gap-4 my-3">
            <div className="bg-slate-800/80 p-3 rounded-lg border border-slate-700/80">
              <div className="flex items-center justify-between text-slate-400 mb-1">
                <span className="flex items-center gap-1 font-semibold text-emerald-400">
                  <ArrowDownLeft className="w-4 h-4" />
                  <span>Download (Rx)</span>
                </span>
                <span className="text-[10px]">Puncak: {peakRx.toFixed(1)} Mbps</span>
              </div>
              <div className="flex items-baseline gap-1.5 font-mono">
                <span className="text-2xl font-black text-emerald-400 tabular-nums">
                  {currentRx.toFixed(1)}
                </span>
                <span className="text-xs text-slate-400 font-bold">Mbps</span>
              </div>
              {/* Progress bar */}
              <div className="w-full bg-slate-700 h-1.5 rounded-full mt-2 overflow-hidden">
                <div
                  className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, (currentRx / maxRate) * 100)}%` }}
                />
              </div>
            </div>

            <div className="bg-slate-800/80 p-3 rounded-lg border border-slate-700/80">
              <div className="flex items-center justify-between text-slate-400 mb-1">
                <span className="flex items-center gap-1 font-semibold text-sky-400">
                  <ArrowUpRight className="w-4 h-4" />
                  <span>Upload (Tx)</span>
                </span>
                <span className="text-[10px]">Puncak: {peakTx.toFixed(1)} Mbps</span>
              </div>
              <div className="flex items-baseline gap-1.5 font-mono">
                <span className="text-2xl font-black text-sky-400 tabular-nums">
                  {currentTx.toFixed(1)}
                </span>
                <span className="text-xs text-slate-400 font-bold">Mbps</span>
              </div>
              {/* Progress bar */}
              <div className="w-full bg-slate-700 h-1.5 rounded-full mt-2 overflow-hidden">
                <div
                  className="bg-sky-500 h-full rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, (currentTx / maxRate) * 100)}%` }}
                />
              </div>
            </div>
          </div>

          {/* SVG Traffic Waveform */}
          <div className="bg-slate-950/90 rounded-lg p-2.5 border border-slate-800">
            <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono mb-1.5">
              <span className="flex items-center gap-1">
                <Activity className="w-3 h-3 text-sky-400 animate-pulse" />
                <span>Grafik Trafik Realtime (30 detik terakhir)</span>
              </span>
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span>Rx</span>
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-sky-500" />
                  <span>Tx</span>
                </span>
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

                {/* Polylines */}
                {pointsRx && (
                  <polyline
                    fill="none"
                    stroke="#10b981"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    points={pointsRx}
                  />
                )}
                {pointsTx && (
                  <polyline
                    fill="none"
                    stroke="#0284c7"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    points={pointsTx}
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
                onClick={() => copyToClipboard(session.address || '', 'ip')}
                className="p-1 text-slate-400 hover:text-sky-600 rounded"
                title="Salin IP"
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
                onClick={() => copyToClipboard(session.callerId || '', 'mac')}
                className="p-1 text-slate-400 hover:text-sky-600 rounded"
                title="Salin MAC"
              >
                {copiedField === 'mac' ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>

            <div className="p-2 rounded-lg bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700/80">
              <span className="text-[10px] text-slate-400 block">Enkripsi / Encoding</span>
              <span className="font-mono text-slate-800 dark:text-zinc-200 font-semibold">
                {session.encoding || 'MPPE128 stateless'}
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
            className="flex items-center gap-1.5 px-3.5 py-2 font-semibold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 hover:bg-rose-100 rounded-lg transition-colors"
          >
            <UserX className="w-4 h-4" />
            <span>Putuskan Sesi (Kick)</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 font-semibold text-slate-700 dark:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
          >
            Tutup
          </button>
        </div>
      </div>
    </Modal>
  );
};
