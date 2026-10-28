export type ConnectionMode = 'API' | 'API-SSL' | 'REST' | 'DEMO';

export interface RouterConfig {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  encryptedPassword?: string;
  mode: ConnectionMode;
  notes?: string;
  isDemo?: boolean;
  status?: 'online' | 'offline' | 'checking';
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
  lastCallerId?: string;
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
  profile?: string;
  callerId?: string;
  address?: string;
  uptime?: string;
  encoding?: string;
  rxRate?: string;       // Router Rx = Client Upload (e.g. "2.4 Mbps")
  txRate?: string;       // Router Tx = Client Download (e.g. "18.5 Mbps")
  rxBps?: number;        // Client upload in bps
  txBps?: number;        // Client download in bps
  uploadRate?: string;   // User-friendly upload rate
  downloadRate?: string; // User-friendly download rate
  interfaceName?: string;// Dynamic interface name (e.g. <pppoe-user1>)
  routerId?: string;
  routerName?: string;
  sessionTime?: number;
}

export interface SessionTrafficInfo {
  name: string;
  interfaceName?: string;
  connected: boolean;
  rxBps: number;
  txBps: number;
  uploadBps?: number;
  downloadBps?: number;
  rxRate?: string;
  txRate?: string;
  uploadRate: string;
  downloadRate: string;
  rxBytes?: number;
  txBytes?: number;
  uptime?: string;
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

export interface IRouterDriver {
  testConnection(): Promise<RouterConnectionTestResult>;
  getSystemResource(): Promise<{
    identity: string;
    version: string;
    uptime: string;
    cpuLoad: number;
    freeMemory: number;
    totalMemory: number;
    boardName: string;
  }>;
  getSecrets(): Promise<PppSecret[]>;
  createSecret(secret: PppSecret): Promise<PppSecret>;
  updateSecret(name: string, secret: Partial<PppSecret>): Promise<PppSecret>;
  deleteSecret(name: string): Promise<boolean>;
  setSecretDisabled(name: string, disabled: boolean): Promise<boolean>;

  getActive(): Promise<PppActive[]>;
  disconnectActive(name: string): Promise<boolean>;
  getSessionTraffic(name: string): Promise<SessionTrafficInfo>;

  getProfiles(): Promise<PppProfile[]>;
  createProfile(profile: PppProfile): Promise<PppProfile>;
  updateProfile(name: string, profile: Partial<PppProfile>): Promise<PppProfile>;
  deleteProfile(name: string): Promise<boolean>;

  getQueues(): Promise<SimpleQueue[]>;
  createQueue(queue: SimpleQueue): Promise<SimpleQueue>;
  updateQueue(name: string, queue: Partial<SimpleQueue>): Promise<SimpleQueue>;
  deleteQueue(name: string): Promise<boolean>;

  getPools(): Promise<IpPool[]>;
  createPool(pool: IpPool): Promise<IpPool>;
  updatePool(name: string, pool: Partial<IpPool>): Promise<IpPool>;
  deletePool(name: string): Promise<boolean>;
}
