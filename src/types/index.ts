export type ConnectionMode = 'API' | 'API-SSL' | 'REST' | 'DEMO';

export interface RouterSummary {
  id: string;
  name: string;
  host: string;
  port: number;
  mode: ConnectionMode;
  notes?: string;
  isDemo: boolean;
  hasPassword: boolean;
  status: 'online' | 'offline' | 'checking';
  lastSeen?: string;
  lastError?: string;
  identity?: string;
  version?: string;
  uptime?: string;
  cpuLoad?: number;
  freeMemory?: number;
  totalMemory?: number;
  boardName?: string;
}

export interface PppSecret {
  name: string;
  password?: string;
  service: string;
  profile: string;
  localAddress?: string;
  remoteAddress?: string;
  callerId?: string;
  disabled: boolean;
  comment?: string;
  lastLoggedOut?: string;
  routerId?: string;
  routerName?: string;
  isActive?: boolean;
}

export interface PppActive {
  name: string;
  service: string;
  callerId?: string;
  address?: string;
  uptime?: string;
  encoding?: string;
  rxRate?: string;       // Client Upload (Router Rx) formatted string (e.g. "1.2 Mbps")
  txRate?: string;       // Client Download (Router Tx) formatted string (e.g. "9.8 Mbps")
  rxBps?: number;        // Client Upload in raw bits per second
  txBps?: number;        // Client Download in raw bits per second
  downloadRate?: string; // Formatted client download rate
  uploadRate?: string;   // Formatted client upload rate
  interfaceName?: string;
  routerId?: string;
  routerName?: string;
  sessionTime?: number;
}

export interface SessionTrafficInfo {
  name: string;
  interfaceName?: string;
  connected: boolean;
  rxBps: number;       // Client Upload (bps)
  txBps: number;       // Client Download (bps)
  uploadRate: string;  // Formatted Upload
  downloadRate: string;// Formatted Download
  rxBytes?: number;    // Total uploaded bytes
  txBytes?: number;    // Total downloaded bytes
  timestamp: number;
}


export interface PppProfile {
  name: string;
  localAddress?: string;
  remoteAddress?: string;
  rateLimit?: string;
  parentQueue?: string;
  onlyOne?: boolean;
  dnsServer?: string;
  comment?: string;
  secretCount?: number;
  activeCount?: number;
  routerId?: string;
  routerName?: string;
}

export interface SimpleQueue {
  name: string;
  target?: string;
  maxLimit?: string;
  limitAt?: string;
  priority?: string;
  comment?: string;
  parent?: string;
  childCount?: number;
  routerId?: string;
  routerName?: string;
}

export interface IpPool {
  name: string;
  ranges: string;
  nextPool?: string;
  usedCount?: number;
  comment?: string;
  routerId?: string;
  routerName?: string;
}

export interface RouterConnectionTestResult {
  success: boolean;
  identity: string;
  version: string;
  uptime: string;
  cpuLoad: number;
  freeMemory: number;
  totalMemory: number;
  boardName: string;
  error?: string;
}

export interface OverviewData {
  stats: {
    totalRouters: number;
    onlineRouters: number;
    offlineRouters: number;
    totalSecrets: number;
    totalActive: number;
    totalDisabled: number;
    totalTrafficRx: string;
    totalTrafficTx: string;
    totalTraffic: string;
  };
  routerSummaries: Array<{
    id: string;
    name: string;
    status: 'online' | 'offline' | 'checking';
    activeCount: number;
    secretCount: number;
    disabledCount: number;
    cpuLoad: number;
    freeMemory: number;
    totalMemory: number;
    uptime: string;
    version: string;
    boardName: string;
    error?: string;
  }>;
  recentEvents: Array<{
    id: string;
    timestamp: string;
    type: 'connected' | 'disconnected';
    username: string;
    routerName: string;
    ipAddress: string;
  }>;
}

export interface AuditLogItem {
  id: string;
  timestamp: string;
  username: string;
  routerId: string;
  routerName: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'DISCONNECT' | 'ENABLE' | 'DISABLE' | 'TEST';
  targetType: 'SECRET' | 'ACTIVE' | 'PROFILE' | 'QUEUE' | 'POOL' | 'ROUTER';
  targetName: string;
  details?: string;
}

export interface User {
  id: string;
  username: string;
  name: string;
  role: 'superadmin' | 'operator' | 'technician';
  allowedMenus?: string[];
  status?: 'active' | 'suspended';
  lastLogin?: string;
  createdAt?: string;
}

export interface SessionHistoryItem {
  id: string;
  timestamp: string;
  type: 'connected' | 'disconnected';
  username: string;
  routerName: string;
  ipAddress: string;
  details?: string;
}
