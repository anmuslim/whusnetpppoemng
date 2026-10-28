import {
  IRouterDriver,
  RouterConfig,
  RouterConnectionTestResult,
  PppSecret,
  PppActive,
  PppProfile,
  SimpleQueue,
  IpPool,
  SessionTrafficInfo,
} from './types.js';
import { storage } from '../storage.js';

export class DemoDriver implements IRouterDriver {
  private config: RouterConfig;
  private secrets: PppSecret[] = [];
  private activeSessions: PppActive[] = [];
  private profiles: PppProfile[] = [];
  private queues: SimpleQueue[] = [];
  private pools: IpPool[] = [];
  private startUptimeSeconds: number;

  constructor(config: RouterConfig, seedData?: {
    secrets?: PppSecret[];
    profiles?: PppProfile[];
    queues?: SimpleQueue[];
    pools?: IpPool[];
  }) {
    this.config = config;
    this.startUptimeSeconds = Math.floor(Date.now() / 1000) - 2450000; // ~4 weeks ago

    const saved = storage.getDemoData(this.config.id);
    if (saved && saved.secrets) {
      this.secrets = [...saved.secrets];
      this.profiles = saved.profiles ? [...saved.profiles] : [];
      this.queues = saved.queues ? [...saved.queues] : [];
      this.pools = saved.pools ? [...saved.pools] : [];
      this.activeSessions = saved.active ? [...saved.active] : [];
    } else if (seedData && seedData.secrets) {
      this.secrets = [...seedData.secrets];
      this.profiles = seedData.profiles ? [...seedData.profiles] : [];
      this.queues = seedData.queues ? [...seedData.queues] : [];
      this.pools = seedData.pools ? [...seedData.pools] : [];
      this.persist();
    } else {
      this.initDefaultMockData();
      this.persist();
    }
  }

  private persist() {
    try {
      storage.saveDemoData(this.config.id, {
        secrets: this.secrets,
        profiles: this.profiles,
        queues: this.queues,
        pools: this.pools,
        active: this.activeSessions,
      });
    } catch (e) {
      console.warn('Failed to persist demo driver data:', e);
    }
  }

  private initDefaultMockData() {
    const isIDC = this.config.id.includes('idc') || this.config.name.includes('IDC');
    const isDist = this.config.id.includes('dist') || this.config.name.includes('Dist');

    // Pools
    const baseSubnet = isIDC ? '10.10' : isDist ? '10.20' : '10.30';
    this.pools = [
      {
        name: 'pool-bronze',
        ranges: `${baseSubnet}.10.2-${baseSubnet}.10.254`,
        comment: 'Pool IP untuk paket 10 Mbps',
        routerId: this.config.id,
        routerName: this.config.name,
      },
      {
        name: 'pool-silver',
        ranges: `${baseSubnet}.20.2-${baseSubnet}.20.254`,
        comment: 'Pool IP untuk paket 20-50 Mbps',
        routerId: this.config.id,
        routerName: this.config.name,
      },
      {
        name: 'pool-gold',
        ranges: `${baseSubnet}.30.2-${baseSubnet}.30.120`,
        comment: 'Pool IP untuk pelanggan VIP & Bisnis',
        routerId: this.config.id,
        routerName: this.config.name,
      },
    ];

    // Queues
    this.queues = [
      {
        name: 'parent-total-pppoe',
        target: `${baseSubnet}.0.0/16`,
        maxLimit: '1G/1G',
        limitAt: '500M/500M',
        priority: '8',
        comment: 'Parent queue agregat seluruh traffic pelanggan PPPoE',
        childCount: 3,
        routerId: this.config.id,
        routerName: this.config.name,
      },
      {
        name: 'parent-broadband-retail',
        parent: 'parent-total-pppoe',
        target: `${baseSubnet}.10.0/24`,
        maxLimit: '600M/600M',
        limitAt: '200M/200M',
        priority: '8',
        comment: 'Parent untuk pelanggan rumahan bronze/silver',
        childCount: 2,
        routerId: this.config.id,
        routerName: this.config.name,
      },
      {
        name: 'parent-corporate-vip',
        parent: 'parent-total-pppoe',
        target: `${baseSubnet}.30.0/24`,
        maxLimit: '400M/400M',
        limitAt: '250M/250M',
        priority: '4',
        comment: 'Parent prioritas tinggi untuk pelanggan corporate',
        childCount: 1,
        routerId: this.config.id,
        routerName: this.config.name,
      },
    ];

    // Profiles
    this.profiles = [
      {
        name: 'profile-10M-Rumah',
        localAddress: `${baseSubnet}.10.1`,
        remoteAddress: 'pool-bronze',
        rateLimit: '10M/10M',
        parentQueue: 'parent-broadband-retail',
        onlyOne: true,
        dnsServer: '1.1.1.1,8.8.8.8',
        comment: 'Paket starter rumahan 10Mbps',
        routerId: this.config.id,
        routerName: this.config.name,
      },
      {
        name: 'profile-20M-Family',
        localAddress: `${baseSubnet}.20.1`,
        remoteAddress: 'pool-silver',
        rateLimit: '20M/20M',
        parentQueue: 'parent-broadband-retail',
        onlyOne: true,
        dnsServer: '1.1.1.1,8.8.8.8',
        comment: 'Paket keluarga 20Mbps',
        routerId: this.config.id,
        routerName: this.config.name,
      },
      {
        name: 'profile-50M-Gamer',
        localAddress: `${baseSubnet}.20.1`,
        remoteAddress: 'pool-silver',
        rateLimit: '50M/50M',
        parentQueue: 'parent-broadband-retail',
        onlyOne: true,
        dnsServer: '1.1.1.1,8.8.8.8',
        comment: 'Paket gaming low-latency 50Mbps',
        routerId: this.config.id,
        routerName: this.config.name,
      },
      {
        name: 'profile-100M-Bisnis',
        localAddress: `${baseSubnet}.30.1`,
        remoteAddress: 'pool-gold',
        rateLimit: '100M/100M 120M/120M 80M/80M 16/16 4 50M/50M',
        parentQueue: 'parent-corporate-vip',
        onlyOne: true,
        dnsServer: '1.1.1.1,8.8.8.8',
        comment: 'Paket bisnis priority 100Mbps dengan burst',
        routerId: this.config.id,
        routerName: this.config.name,
      },
    ];

    // Generate ~40 - 90 secrets per router
    const count = isIDC ? 92 : isDist ? 80 : 45;
    const activeTarget = isIDC ? 42 : isDist ? 34 : 18;

    const namesPrefix = isIDC
      ? ['cust-idc', 'cyber', 'pt-sinar', 'cv-maju', 'toko-laris', 'rt01', 'rt02', 'griya-indah', 'kost-melati']
      : isDist
      ? ['bsd-residence', 'serpong-net', 'warnet-jaya', 'pt-global', 'cluster-boulevard', 'user-doni', 'pak-rahmat']
      : ['pop-barat', 'kalideres-net', 'warga-blok-a', 'warga-blok-b', 'pos-satpam', 'klinik-sehat'];

    const profileNames = ['profile-10M-Rumah', 'profile-20M-Family', 'profile-50M-Gamer', 'profile-100M-Bisnis'];

    let activeCount = 0;
    for (let i = 1; i <= count; i++) {
      const prefix = namesPrefix[i % namesPrefix.length];
      const username = `${prefix}-${String(i).padStart(3, '0')}`;
      const profile = profileNames[i % profileNames.length];
      const isDisabled = i % 14 === 0;
      const willBeActive = !isDisabled && activeCount < activeTarget && i % 2 === 0;
      if (willBeActive) activeCount++;

      const octet = (i % 240) + 2;
      const remoteIp = profile.includes('10M')
        ? `${baseSubnet}.10.${octet}`
        : profile.includes('Bisnis')
        ? `${baseSubnet}.30.${octet}`
        : `${baseSubnet}.20.${octet}`;

      const mac = `68:D7:9A:${Math.floor(Math.random() * 89 + 10)}:${Math.floor(Math.random() * 89 + 10)}:${String(i).padStart(2, '0')}`;
      const hasLoggedOut = isDisabled || i % 3 === 0;
      const logoutDate = hasLoggedOut
        ? `2026-10-${String(Math.floor(18 + (i % 8))).padStart(2, '0')} ${String(Math.floor((i % 14) + 8)).padStart(2, '0')}:${String((i * 7) % 60).padStart(2, '0')}:15`
        : undefined;

      this.secrets.push({
        name: username,
        password: `pppoePass#${i * 7}`,
        service: 'pppoe',
        profile: profile,
        remoteAddress: remoteIp,
        callerId: i % 4 === 0 ? mac : undefined,
        lastCallerId: mac,
        disabled: isDisabled,
        comment: isDisabled ? 'Nonaktif: Tunggakan billing' : i % 5 === 0 ? 'Pelanggan FTTH OLT-01' : 'Pelanggan Reguler',
        lastLoggedOut: logoutDate,
        routerId: this.config.id,
        routerName: this.config.name,
      });

      if (willBeActive) {
        const uptimeHours = Math.floor(Math.random() * 120 + 2);
        const days = Math.floor(uptimeHours / 24);
        const hrs = uptimeHours % 24;
        const mins = Math.floor(Math.random() * 59);

        const rx = (Math.random() * 18 + 1.2).toFixed(1);
        const tx = (Math.random() * 35 + 2.5).toFixed(1);

        this.activeSessions.push({
          name: username,
          service: 'pppoe',
          profile: profile,
          callerId: mac,
          address: remoteIp,
          uptime: days > 0 ? `${days}d ${hrs}h ${mins}m` : `${hrs}h ${mins}m`,
          encoding: 'MPPE128 stateless',
          rxRate: `${rx} Mbps`,
          txRate: `${tx} Mbps`,
          routerId: this.config.id,
          routerName: this.config.name,
          sessionTime: uptimeHours * 3600 + mins * 60,
        });
      }
    }
  }

  async testConnection(): Promise<RouterConnectionTestResult> {
    const res = await this.getSystemResource();
    return {
      success: true,
      identity: res.identity,
      version: res.version,
      uptime: res.uptime,
      cpuLoad: res.cpuLoad,
      freeMemory: res.freeMemory,
      totalMemory: res.totalMemory,
      boardName: res.boardName,
    };
  }

  async getSystemResource() {
    const uptimeSec = Math.floor(Date.now() / 1000) - this.startUptimeSeconds;
    const days = Math.floor(uptimeSec / 86400);
    const hours = Math.floor((uptimeSec % 86400) / 3600);
    const mins = Math.floor((uptimeSec % 3600) / 60);

    const isIDC = this.config.id.includes('idc') || this.config.name.includes('IDC');
    const isDist = this.config.id.includes('dist') || this.config.name.includes('Dist');

    // Add mild random variance to simulate live router activity
    const cpuVariation = Math.floor(Math.random() * 8) - 4;
    const baseCpu = isIDC ? 18 : isDist ? 24 : 12;
    const cpuLoad = Math.max(3, Math.min(88, baseCpu + cpuVariation));

    const totalMem = isIDC ? 4096 : isDist ? 1024 : 512;
    const freeMem = isIDC ? 3120 : isDist ? 740 : 380;

    return {
      identity: this.config.name,
      version: isIDC ? 'RouterOS v7.14.3 (stable)' : isDist ? 'RouterOS v7.13.5 (stable)' : 'RouterOS v7.12.1 (stable)',
      uptime: `${days}d ${hours}h ${mins}m`,
      cpuLoad,
      freeMemory: freeMem,
      totalMemory: totalMem,
      boardName: isIDC ? 'CCR2004-16G-2S+' : isDist ? 'RB4011iGS+' : 'RB760iGS (hEX S)',
    };
  }

  async getSecrets(): Promise<PppSecret[]> {
    const activeNames = new Set(this.activeSessions.map((a) => a.name));
    return this.secrets.map((s) => ({
      ...s,
      lastCallerId: s.lastCallerId || s.callerId,
      routerId: this.config.id,
      routerName: this.config.name,
      isActive: activeNames.has(s.name),
    }));
  }

  async createSecret(secret: PppSecret): Promise<PppSecret> {
    if (this.secrets.some((s) => s.name.toLowerCase() === secret.name.toLowerCase())) {
      throw new Error(`Secret dengan nama '${secret.name}' sudah ada di router ini!`);
    }
    const newSecret: PppSecret = {
      ...secret,
      service: secret.service || 'pppoe',
      disabled: Boolean(secret.disabled),
      lastCallerId: secret.lastCallerId || secret.callerId,
      routerId: this.config.id,
      routerName: this.config.name,
    };
    this.secrets.push(newSecret);
    this.persist();
    return newSecret;
  }

  async updateSecret(name: string, patch: Partial<PppSecret>): Promise<PppSecret> {
    const idx = this.secrets.findIndex((s) => s.name === name);
    if (idx === -1) {
      throw new Error(`Secret '${name}' tidak ditemukan.`);
    }
    const newName = patch.name && patch.name.trim() ? patch.name.trim() : name;
    this.secrets[idx] = {
      ...this.secrets[idx],
      ...patch,
      name: newName,
      routerId: this.config.id,
      routerName: this.config.name,
    };

    // If username changed, update any active session name
    if (newName !== name) {
      this.activeSessions = this.activeSessions.map((a) => (a.name === name ? { ...a, name: newName } : a));
    }

    this.persist();
    return this.secrets[idx];
  }

  async deleteSecret(name: string): Promise<boolean> {
    const initialLen = this.secrets.length;
    this.secrets = this.secrets.filter((s) => s.name !== name);
    // Also disconnect active if deleted
    this.activeSessions = this.activeSessions.filter((a) => a.name !== name);
    const removed = this.secrets.length < initialLen;
    if (removed) this.persist();
    return removed;
  }

  async setSecretDisabled(name: string, disabled: boolean): Promise<boolean> {
    const secret = this.secrets.find((s) => s.name === name);
    if (!secret) return false;
    secret.disabled = disabled;
    if (disabled) {
      // Disconnect active session if disabled
      this.activeSessions = this.activeSessions.filter((a) => a.name !== name);
      secret.lastLoggedOut = new Date().toISOString().replace('T', ' ').substring(0, 19);
    }
    this.persist();
    return true;
  }

  private static sessionCounters: Map<string, { rxBytes: number; txBytes: number; lastTime: number }> = new Map();

  async getActive(): Promise<PppActive[]> {
    // Generate realistic, consistent rates based on each secret's profile limit
    const secretMap = new Map(this.secrets.map((s) => [s.name, s]));
    const now = Date.now();

    return this.activeSessions.map((session) => {
      const sec = secretMap.get(session.name);
      const profName = session.profile || sec?.profile || 'default';

      // Determine nominal speed based on package (Tx = Download, Rx = Upload)
      let nominalDown = 18.0;
      let nominalUp = 5.0;
      if (profName.includes('10M')) {
        nominalDown = 8.8;
        nominalUp = 2.4;
      } else if (profName.includes('20M')) {
        nominalDown = 18.2;
        nominalUp = 5.2;
      } else if (profName.includes('50M')) {
        nominalDown = 44.0;
        nominalUp = 12.0;
      } else if (profName.includes('100M') || profName.includes('Bisnis')) {
        nominalDown = 86.0;
        nominalUp = 36.0;
      }

      // Smooth realistic variance (+/- 12%)
      const hash = session.name.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
      const variance = Math.sin(now / 5000 + hash) * 0.12;
      const rxMbps = Math.max(0.3, +(nominalUp * (0.7 + variance)).toFixed(1)); // Upload (Router Rx)
      const txMbps = Math.max(0.8, +(nominalDown * (0.75 + variance)).toFixed(1)); // Download (Router Tx)
      const rxBps = Math.round(rxMbps * 1_000_000);
      const txBps = Math.round(txMbps * 1_000_000);

      return {
        ...session,
        profile: profName,
        rxRate: `${rxMbps} Mbps`,
        txRate: `${txMbps} Mbps`,
        rxBps,
        txBps,
        downloadRate: `${txMbps} Mbps`,
        uploadRate: `${rxMbps} Mbps`,
        interfaceName: `<pppoe-${session.name}>`,
        routerId: this.config.id,
        routerName: this.config.name,
      };
    });
  }

  async getSessionTraffic(name: string): Promise<SessionTrafficInfo> {
    const session = this.activeSessions.find((a) => a.name === name);
    const ifaceName = `<pppoe-${name}>`;
    const now = Date.now();

    if (!session) {
      return {
        name,
        interfaceName: ifaceName,
        connected: false,
        rxBps: 0,
        txBps: 0,
        uploadRate: '0 bps',
        downloadRate: '0 bps',
        timestamp: now,
      };
    }

    const sec = this.secrets.find((s) => s.name === name);
    const profName = sec?.profile || '';

    let nominalDown = 18.0;
    let nominalUp = 5.0;
    if (profName.includes('10M')) {
      nominalDown = 8.8;
      nominalUp = 2.4;
    } else if (profName.includes('20M')) {
      nominalDown = 18.2;
      nominalUp = 5.2;
    } else if (profName.includes('50M')) {
      nominalDown = 44.0;
      nominalUp = 12.0;
    } else if (profName.includes('100M') || profName.includes('Bisnis')) {
      nominalDown = 86.0;
      nominalUp = 36.0;
    }

    // Dynamic wave with secondary harmonics for organic real-world telemetry feel
    const hash = name.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
    const primary = Math.sin(now / 3500 + hash) * 0.15;
    const secondary = Math.cos(now / 1800 + hash) * 0.08;
    const factor = Math.max(0.2, 0.72 + primary + secondary);

    const rxBps = Math.round(Math.max(120_000, nominalUp * 1_000_000 * factor)); // Client Upload (Rx)
    const txBps = Math.round(Math.max(450_000, nominalDown * 1_000_000 * factor)); // Client Download (Tx)

    // Update cumulative byte counters
    const counterKey = `${this.config.id}:${name}`;
    let counter = DemoDriver.sessionCounters.get(counterKey);
    if (!counter) {
      counter = {
        rxBytes: Math.floor(Math.random() * 500_000_000 + 100_000_000),
        txBytes: Math.floor(Math.random() * 2_000_000_000 + 500_000_000),
        lastTime: now - 1500,
      };
    }
    const elapsedSec = Math.max(0.1, (now - counter.lastTime) / 1000);
    counter.rxBytes += Math.round((rxBps / 8) * elapsedSec);
    counter.txBytes += Math.round((txBps / 8) * elapsedSec);
    counter.lastTime = now;
    DemoDriver.sessionCounters.set(counterKey, counter);

    const formatRate = (bps: number): string => {
      if (!bps || bps <= 0) return '0 bps';
      if (bps >= 1_000_000_000) return `${(bps / 1_000_000_000).toFixed(2)} Gbps`;
      if (bps >= 1_000_000) return `${(bps / 1_000_000).toFixed(1)} Mbps`;
      if (bps >= 1_000) return `${(bps / 1_000).toFixed(1)} kbps`;
      return `${Math.round(bps)} bps`;
    };

    return {
      name,
      interfaceName: ifaceName,
      connected: true,
      rxBps,
      txBps,
      uploadRate: formatRate(rxBps),
      downloadRate: formatRate(txBps),
      rxBytes: counter.rxBytes,
      txBytes: counter.txBytes,
      timestamp: now,
    };
  }


  async disconnectActive(name: string): Promise<boolean> {
    const initialLen = this.activeSessions.length;
    this.activeSessions = this.activeSessions.filter((a) => a.name !== name);
    const removed = this.activeSessions.length < initialLen;
    if (removed) this.persist();
    return removed;
  }

  async getProfiles(): Promise<PppProfile[]> {
    return this.profiles.map((p) => {
      const secretCount = this.secrets.filter((s) => s.profile === p.name).length;
      return {
        ...p,
        secretCount,
        routerId: this.config.id,
        routerName: this.config.name,
      };
    });
  }

  async createProfile(profile: PppProfile): Promise<PppProfile> {
    if (this.profiles.some((p) => p.name.toLowerCase() === profile.name.toLowerCase())) {
      throw new Error(`Profile '${profile.name}' sudah ada.`);
    }
    const newProfile = {
      ...profile,
      routerId: this.config.id,
      routerName: this.config.name,
      secretCount: 0,
    };
    this.profiles.push(newProfile);
    this.persist();
    return newProfile;
  }

  async updateProfile(name: string, patch: Partial<PppProfile>): Promise<PppProfile> {
    const idx = this.profiles.findIndex((p) => p.name === name);
    if (idx === -1) throw new Error(`Profile '${name}' tidak ditemukan.`);
    const newName = patch.name && patch.name.trim() ? patch.name.trim() : name;
    this.profiles[idx] = {
      ...this.profiles[idx],
      ...patch,
      name: newName,
      routerId: this.config.id,
      routerName: this.config.name,
    };

    // If profile name changed, cascade to all secrets using this profile
    if (newName !== name) {
      this.secrets = this.secrets.map((s) => (s.profile === name ? { ...s, profile: newName } : s));
    }

    this.persist();
    return this.profiles[idx];
  }

  async deleteProfile(name: string): Promise<boolean> {
    const usedBy = this.secrets.filter((s) => s.profile === name);
    if (usedBy.length > 0) {
      throw new Error(`Tidak dapat menghapus profile '${name}' karena sedang digunakan oleh ${usedBy.length} secret.`);
    }
    const initialLen = this.profiles.length;
    this.profiles = this.profiles.filter((p) => p.name !== name);
    const removed = this.profiles.length < initialLen;
    if (removed) this.persist();
    return removed;
  }

  async getQueues(): Promise<SimpleQueue[]> {
    return this.queues.map((q) => {
      const childCount = this.queues.filter((child) => child.parent === q.name).length;
      return {
        ...q,
        childCount,
        routerId: this.config.id,
        routerName: this.config.name,
      };
    });
  }

  async createQueue(queue: SimpleQueue): Promise<SimpleQueue> {
    if (this.queues.some((q) => q.name.toLowerCase() === queue.name.toLowerCase())) {
      throw new Error(`Queue '${queue.name}' sudah ada.`);
    }
    const newQueue = {
      ...queue,
      routerId: this.config.id,
      routerName: this.config.name,
      childCount: 0,
    };
    this.queues.push(newQueue);
    this.persist();
    return newQueue;
  }

  async updateQueue(name: string, patch: Partial<SimpleQueue>): Promise<SimpleQueue> {
    const idx = this.queues.findIndex((q) => q.name === name);
    if (idx === -1) throw new Error(`Queue '${name}' tidak ditemukan.`);
    this.queues[idx] = {
      ...this.queues[idx],
      ...patch,
      name: patch.name || name,
      routerId: this.config.id,
      routerName: this.config.name,
    };
    this.persist();
    return this.queues[idx];
  }

  async deleteQueue(name: string): Promise<boolean> {
    // Check if used by any profiles
    const usedByProfile = this.profiles.filter((p) => p.parentQueue === name);
    if (usedByProfile.length > 0) {
      throw new Error(`Queue '${name}' sedang digunakan sebagai parent oleh profile: ${usedByProfile.map((p) => p.name).join(', ')}.`);
    }
    const hasChildren = this.queues.filter((q) => q.parent === name);
    if (hasChildren.length > 0) {
      throw new Error(`Queue '${name}' memiliki ${hasChildren.length} child queue aktif.`);
    }
    const initialLen = this.queues.length;
    this.queues = this.queues.filter((q) => q.name !== name);
    const removed = this.queues.length < initialLen;
    if (removed) this.persist();
    return removed;
  }

  async getPools(): Promise<IpPool[]> {
    return this.pools.map((p) => {
      // Calculate used IPs based on active sessions with IP in range
      const usedCount = this.activeSessions.filter((s) => {
        if (!s.address) return false;
        return p.ranges.includes(s.address.split('.').slice(0, 3).join('.'));
      }).length;

      return {
        ...p,
        usedCount,
        routerId: this.config.id,
        routerName: this.config.name,
      };
    });
  }

  async createPool(pool: IpPool): Promise<IpPool> {
    if (this.pools.some((p) => p.name.toLowerCase() === pool.name.toLowerCase())) {
      throw new Error(`IP Pool '${pool.name}' sudah ada.`);
    }
    const newPool = {
      ...pool,
      routerId: this.config.id,
      routerName: this.config.name,
      usedCount: 0,
    };
    this.pools.push(newPool);
    this.persist();
    return newPool;
  }

  async updatePool(name: string, patch: Partial<IpPool>): Promise<IpPool> {
    const idx = this.pools.findIndex((p) => p.name === name);
    if (idx === -1) throw new Error(`IP Pool '${name}' tidak ditemukan.`);
    this.pools[idx] = {
      ...this.pools[idx],
      ...patch,
      name: patch.name || name,
      routerId: this.config.id,
      routerName: this.config.name,
    };
    this.persist();
    return this.pools[idx];
  }

  async deletePool(name: string): Promise<boolean> {
    const usedBy = this.profiles.filter((p) => p.remoteAddress === name);
    if (usedBy.length > 0) {
      throw new Error(`Pool '${name}' tidak dapat dihapus karena digunakan oleh profile: ${usedBy.map((p) => p.name).join(', ')}.`);
    }
    const initialLen = this.pools.length;
    this.pools = this.pools.filter((p) => p.name !== name);
    const removed = this.pools.length < initialLen;
    if (removed) this.persist();
    return removed;
  }

  async ping(address: string, count: number = 4, size: number = 32) {
    const packetCount = Math.max(1, Math.min(20, Number(count) || 4));
    const packets = [];
    let received = 0;
    let minRtt = Infinity;
    let maxRtt = 0;
    let sumRtt = 0;

    for (let i = 1; i <= packetCount; i++) {
      const baseMs = 1.8 + Math.random() * 5.2;
      const jitter = (i % 4 === 0 ? Math.random() * 4.8 : 0);
      const timeMs = +(baseMs + jitter).toFixed(1);
      const ttl = 64;

      minRtt = Math.min(minRtt, timeMs);
      maxRtt = Math.max(maxRtt, timeMs);
      sumRtt += timeMs;
      received++;

      packets.push({
        seq: i,
        host: address,
        size: Number(size) || 32,
        ttl,
        timeMs,
        status: 'reply' as const,
      });
    }

    const avgRtt = +(sumRtt / received).toFixed(1);
    const packetLoss = +(((packetCount - received) / packetCount) * 100).toFixed(0);

    return {
      target: address,
      routerName: this.config.name,
      sent: packetCount,
      received,
      lost: packetCount - received,
      packetLoss,
      minRtt: minRtt === Infinity ? 0 : minRtt,
      avgRtt,
      maxRtt,
      packets,
      timestamp: Date.now(),
    };
  }
}
