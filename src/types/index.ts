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
  rxRate?: string;
  txRate?: string;
  routerId?: string;
  routerName?: string;
  sessionTime?: number;
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
