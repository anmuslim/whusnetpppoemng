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

export class RouterosRestDriver implements IRouterDriver {
  private config: RouterConfig;
  private password?: string;
  private baseUrl: string;

  constructor(config: RouterConfig, password?: string) {
    this.config = config;
    this.password = password;
    const protocol = config.mode === 'API-SSL' || config.port === 443 ? 'https' : 'http';
    const port = config.port || (protocol === 'https' ? 443 : 80);
    this.baseUrl = `${protocol}://${config.host}:${port}/rest`;
  }

  private getAuthHeader(): string {
    const userPass = `${this.config.username}:${this.password || ''}`;
    return `Basic ${Buffer.from(userPass).toString('base64')}`;
  }

  private async request<T = any>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          Authorization: this.getAuthHeader(),
          'Content-Type': 'application/json',
          ...(options.headers || {}),
        },
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        let errMsg = `RouterOS REST error HTTP ${response.status}: ${response.statusText}`;
        try {
          const parsed = JSON.parse(errorText);
          if (parsed.detail || parsed.message) {
            errMsg = parsed.detail || parsed.message;
          }
        } catch {
          if (errorText) errMsg = `${errMsg} - ${errorText.substring(0, 100)}`;
        }
        throw new Error(errMsg);
      }

      const text = await response.text();
      if (!text) return {} as T;
      return JSON.parse(text);
    } catch (err: any) {
      if (err.name === 'AbortError') {
        throw new Error(`Koneksi ke router ${this.config.name} (${this.config.host}) timeout setelah 6 detik.`);
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async findItemId(menu: string, name: string): Promise<string> {
    try {
      const list = await this.request<any[]>(`/${menu}`);
      const match = Array.isArray(list) ? list.find((item: any) => item && (item.name === name || item['.id'] === name)) : null;
      if (match && match['.id']) {
        return match['.id'];
      }
    } catch {}
    return name;
  }

  private async createResource(menu: string, body: Record<string, any>): Promise<any> {
    try {
      return await this.request(`/${menu}`, {
        method: 'PUT',
        body: JSON.stringify(body),
      });
    } catch (err: any) {
      if (err.message && err.message.includes('405')) {
        return await this.request(`/${menu}`, {
          method: 'POST',
          body: JSON.stringify(body),
        });
      }
      throw err;
    }
  }

  async testConnection(): Promise<RouterConnectionTestResult> {
    try {
      const [res, identityRes] = await Promise.all([
        this.request<any>('/system/resource'),
        this.request<any>('/system/identity').catch(() => ({ name: this.config.name })),
      ]);

      const totalMem = Math.round((Number(res['total-memory']) || 0) / 1048576);
      const freeMem = Math.round((Number(res['free-memory']) || 0) / 1048576);

      return {
        success: true,
        identity: identityRes?.name || res['platform'] || this.config.name,
        version: res?.version || 'RouterOS v7',
        uptime: res?.uptime || 'Unknown',
        cpuLoad: Number(res['cpu-load']) || 0,
        freeMemory: freeMem,
        totalMemory: totalMem,
        boardName: res['board-name'] || 'MikroTik Router',
      };
    } catch (err: any) {
      return {
        success: false,
        identity: this.config.name,
        version: '',
        uptime: '',
        cpuLoad: 0,
        freeMemory: 0,
        totalMemory: 0,
        boardName: '',
        error: err.message || 'Gagal tersambung ke REST API MikroTik',
      };
    }
  }

  async getSystemResource() {
    const test = await this.testConnection();
    if (!test.success) throw new Error(test.error || 'Gagal mengambil informasi resource');
    return {
      identity: test.identity,
      version: test.version,
      uptime: test.uptime,
      cpuLoad: test.cpuLoad,
      freeMemory: test.freeMemory,
      totalMemory: test.totalMemory,
      boardName: test.boardName,
    };
  }

  async getSecrets(): Promise<PppSecret[]> {
    const raw = await this.request<any[]>('/ppp/secret');
    return raw.map((item) => ({
      name: item.name,
      password: item.password,
      service: item.service || 'any',
      profile: item.profile || 'default',
      localAddress: item['local-address'],
      remoteAddress: item['remote-address'],
      callerId: item['caller-id'],
      disabled: item.disabled === 'true' || item.disabled === true,
      comment: item.comment,
      lastLoggedOut: item['last-logged-out'],
      routerId: this.config.id,
      routerName: this.config.name,
    }));
  }

  async createSecret(secret: PppSecret): Promise<PppSecret> {
    const body: Record<string, any> = {
      name: secret.name,
      password: secret.password || '',
      service: secret.service || 'pppoe',
      profile: secret.profile || 'default',
      disabled: secret.disabled ? 'yes' : 'no',
    };
    if (secret.localAddress) body['local-address'] = secret.localAddress;
    if (secret.remoteAddress) body['remote-address'] = secret.remoteAddress;
    if (secret.callerId) body['caller-id'] = secret.callerId;
    if (secret.comment) body.comment = secret.comment;

    await this.createResource('ppp/secret', body);
    return { ...secret, routerId: this.config.id, routerName: this.config.name };
  }

  async updateSecret(name: string, secret: Partial<PppSecret>): Promise<PppSecret> {
    const id = await this.findItemId('ppp/secret', name);
    const body: Record<string, any> = {};
    if (secret.name !== undefined && secret.name !== name) body.name = secret.name;
    if (secret.password !== undefined) body.password = secret.password;
    if (secret.service !== undefined) body.service = secret.service;
    if (secret.profile !== undefined) body.profile = secret.profile;
    if (secret.localAddress !== undefined) body['local-address'] = secret.localAddress;
    if (secret.remoteAddress !== undefined) body['remote-address'] = secret.remoteAddress;
    if (secret.callerId !== undefined) body['caller-id'] = secret.callerId;
    if (secret.comment !== undefined) body.comment = secret.comment;
    if (secret.disabled !== undefined) body.disabled = secret.disabled ? 'yes' : 'no';

    await this.request(`/ppp/secret/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });

    return { name: secret.name || name, ...secret, routerId: this.config.id, routerName: this.config.name } as PppSecret;
  }

  async deleteSecret(name: string): Promise<boolean> {
    const id = await this.findItemId('ppp/secret', name);
    await this.request(`/ppp/secret/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    return true;
  }

  async setSecretDisabled(name: string, disabled: boolean): Promise<boolean> {
    const id = await this.findItemId('ppp/secret', name);
    await this.request(`/ppp/secret/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ disabled: disabled ? 'yes' : 'no' }),
    });
    return true;
  }

  private static trafficCache: Map<string, { rxBytes: number; txBytes: number; timestamp: number }> = new Map();

  async getActive(): Promise<PppActive[]> {
    const [rawActive, rawQueues] = await Promise.all([
      this.request<any[]>('/ppp/active').catch(() => []),
      this.request<any[]>('/queue/simple').catch(() => []),
    ]);

    const queueMap = new Map<string, any>();
    if (Array.isArray(rawQueues)) {
      for (const q of rawQueues) {
        if (q && q.name) {
          queueMap.set(q.name.toLowerCase(), q);
          const stripped = q.name.replace(/^<pppoe-/, '').replace(/>$/, '').toLowerCase();
          queueMap.set(stripped, q);
        }
        if (q && q.target) {
          const targetIp = String(q.target).split('/')[0].trim();
          if (targetIp) queueMap.set(targetIp, q);
        }
      }
    }

    const now = Date.now();

    return (Array.isArray(rawActive) ? rawActive : []).map((item) => {
      const username = item.name;
      const qKey = username.toLowerCase();
      const qKeyWithBracket = `<pppoe-${username}>`.toLowerCase();
      const q = queueMap.get(qKeyWithBracket) || queueMap.get(qKey) || (item.address ? queueMap.get(item.address) : null);

      let rxBps = 0;
      let txBps = 0;

      if (q && q.rate) {
        // RouterOS simple queue rate format: "upload/download" (Rx into router / Tx to client in bps)
        const parts = String(q.rate).split('/');
        if (parts.length >= 2) {
          rxBps = Number(parts[0]) || 0;
          txBps = Number(parts[1]) || 0;
        }
      }

      // If rate is 0 or queue rate not available, try computing from byte deltas
      if (q && q.bytes && (rxBps === 0 && txBps === 0)) {
        const byteParts = String(q.bytes).split('/');
        if (byteParts.length >= 2) {
          const currRx = Number(byteParts[0]) || 0;
          const currTx = Number(byteParts[1]) || 0;
          const cacheKey = `${this.config.id}:::${username}`;
          const prev = RouterosRestDriver.trafficCache.get(cacheKey);

          if (prev && currRx >= prev.rxBytes && currTx >= prev.txBytes) {
            const deltaSec = (now - prev.timestamp) / 1000;
            if (deltaSec > 0.5 && deltaSec < 30) {
              rxBps = Math.round(((currRx - prev.rxBytes) * 8) / deltaSec);
              txBps = Math.round(((currTx - prev.txBytes) * 8) / deltaSec);
            }
          }
          RouterosRestDriver.trafficCache.set(cacheKey, { rxBytes: currRx, txBytes: currTx, timestamp: now });
        }
      }

      const formatRate = (bps: number): string => {
        if (!bps || bps <= 0) return '0 bps';
        if (bps >= 1_000_000_000) return `${(bps / 1_000_000_000).toFixed(1)} Gbps`;
        if (bps >= 1_000_000) return `${(bps / 1_000_000).toFixed(1)} Mbps`;
        if (bps >= 1_000) return `${(bps / 1_000).toFixed(1)} kbps`;
        return `${Math.round(bps)} bps`;
      };

      return {
        name: item.name,
        service: item.service || 'pppoe',
        callerId: item['caller-id'],
        address: item.address,
        uptime: item.uptime,
        encoding: item.encoding,
        rxRate: formatRate(rxBps),
        txRate: formatRate(txBps),
        rxBps,
        txBps,
        downloadRate: formatRate(txBps),
        uploadRate: formatRate(rxBps),
        interfaceName: `<pppoe-${item.name}>`,
        routerId: this.config.id,
        routerName: this.config.name,
      };
    });
  }

  async getSessionTraffic(name: string): Promise<SessionTrafficInfo> {
    const ifaceName = `<pppoe-${name}>`;
    let rxBps = 0; // Router Rx = Client Upload
    let txBps = 0; // Router Tx = Client Download
    let rxBytes: number | undefined;
    let txBytes: number | undefined;
    let connected = false;

    try {
      // 1. Check whether session is active via getActive or direct REST endpoint
      const allActive = await this.getActive().catch(() => []);
      const found = allActive.find((a) => a.name === name || a.name.toLowerCase() === name.toLowerCase());
      if (found) {
        connected = true;
        rxBps = found.rxBps || 0;
        txBps = found.txBps || 0;
      } else {
        const active = await this.request<any[]>(`/ppp/active?name=${encodeURIComponent(name)}`).catch(() => []);
        if (Array.isArray(active) && active.length > 0) {
          connected = true;
        }
      }
    } catch {
      // ignore
    }

    if (connected) {
      // 2. Try monitor-traffic POST
      try {
        const mon = await this.request<any[]>('/interface/monitor-traffic', {
          method: 'POST',
          body: JSON.stringify({
            interface: ifaceName,
            once: true,
          }),
        }).catch(() => null);

        if (Array.isArray(mon) && mon.length > 0) {
          const rawRx = Number(mon[0]['rx-bits-per-second']) || 0;
          const rawTx = Number(mon[0]['tx-bits-per-second']) || 0;
          if (rawRx > 0 || rawTx > 0) {
            rxBps = rawRx;
            txBps = rawTx;
          }
        }
      } catch {
        // ignore
      }

      // 3. Fall back to /queue/simple
      if (rxBps === 0 && txBps === 0) {
        try {
          const queues = await this.request<any[]>('/queue/simple').catch(() => []);
          const q = Array.isArray(queues) && queues.find((item: any) => item && (item.name === ifaceName || item.name === name));
          if (q) {
            if (q.rate) {
              const parts = String(q.rate).split('/');
              if (parts.length >= 2) {
                rxBps = Number(parts[0]) || 0;
                txBps = Number(parts[1]) || 0;
              }
            }
            if (q.bytes) {
              const byteParts = String(q.bytes).split('/');
              if (byteParts.length >= 2) {
                rxBytes = Number(byteParts[0]) || 0;
                txBytes = Number(byteParts[1]) || 0;
              }
            }
          }
        } catch {
          // ignore
        }
      }
    }

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
      connected,
      rxBps,
      txBps,
      uploadRate: formatRate(rxBps),
      downloadRate: formatRate(txBps),
      rxBytes,
      txBytes,
      timestamp: Date.now(),
    };
  }

  async disconnectActive(name: string): Promise<boolean> {
    const id = await this.findItemId('ppp/active', name);
    await this.request(`/ppp/active/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    return true;
  }

  async getProfiles(): Promise<PppProfile[]> {
    const raw = await this.request<any[]>('/ppp/profile');
    return raw.map((item) => ({
      name: item.name,
      localAddress: item['local-address'],
      remoteAddress: item['remote-address'],
      rateLimit: item['rate-limit'],
      parentQueue: item['parent-queue'],
      onlyOne: item['only-one'] === 'yes' || item['only-one'] === true,
      dnsServer: item['dns-server'],
      comment: item.comment,
      routerId: this.config.id,
      routerName: this.config.name,
    }));
  }

  async createProfile(profile: PppProfile): Promise<PppProfile> {
    const body: Record<string, any> = {
      name: profile.name,
    };
    if (profile.localAddress) body['local-address'] = profile.localAddress;
    if (profile.remoteAddress) body['remote-address'] = profile.remoteAddress;
    if (profile.rateLimit) body['rate-limit'] = profile.rateLimit;
    if (profile.parentQueue) body['parent-queue'] = profile.parentQueue;
    if (profile.onlyOne !== undefined) body['only-one'] = profile.onlyOne ? 'yes' : 'no';
    if (profile.dnsServer) body['dns-server'] = profile.dnsServer;
    if (profile.comment) body.comment = profile.comment;

    await this.createResource('ppp/profile', body);
    return { ...profile, routerId: this.config.id, routerName: this.config.name };
  }

  async updateProfile(name: string, profile: Partial<PppProfile>): Promise<PppProfile> {
    const id = await this.findItemId('ppp/profile', name);
    const body: Record<string, any> = {};
    if (profile.name !== undefined && profile.name !== name) body.name = profile.name;
    if (profile.localAddress !== undefined) body['local-address'] = profile.localAddress;
    if (profile.remoteAddress !== undefined) body['remote-address'] = profile.remoteAddress;
    if (profile.rateLimit !== undefined) body['rate-limit'] = profile.rateLimit;
    if (profile.parentQueue !== undefined) body['parent-queue'] = profile.parentQueue;
    if (profile.onlyOne !== undefined) body['only-one'] = profile.onlyOne ? 'yes' : 'no';
    if (profile.dnsServer !== undefined) body['dns-server'] = profile.dnsServer;
    if (profile.comment !== undefined) body.comment = profile.comment;

    await this.request(`/ppp/profile/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });

    return { name: profile.name || name, ...profile, routerId: this.config.id, routerName: this.config.name } as PppProfile;
  }

  async deleteProfile(name: string): Promise<boolean> {
    const id = await this.findItemId('ppp/profile', name);
    await this.request(`/ppp/profile/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    return true;
  }

  async getQueues(): Promise<SimpleQueue[]> {
    const raw = await this.request<any[]>('/queue/simple');
    return raw.map((item) => ({
      name: item.name,
      target: item.target,
      maxLimit: item['max-limit'],
      limitAt: item['limit-at'],
      priority: item.priority,
      comment: item.comment,
      parent: item.parent && item.parent !== 'none' ? item.parent : undefined,
      routerId: this.config.id,
      routerName: this.config.name,
    }));
  }

  async createQueue(queue: SimpleQueue): Promise<SimpleQueue> {
    const body: Record<string, any> = {
      name: queue.name,
      target: queue.target || '0.0.0.0/0',
    };
    if (queue.maxLimit) body['max-limit'] = queue.maxLimit;
    if (queue.limitAt) body['limit-at'] = queue.limitAt;
    if (queue.priority) body.priority = queue.priority;
    if (queue.parent) body.parent = queue.parent;
    if (queue.comment) body.comment = queue.comment;

    await this.createResource('queue/simple', body);
    return { ...queue, routerId: this.config.id, routerName: this.config.name };
  }

  async updateQueue(name: string, queue: Partial<SimpleQueue>): Promise<SimpleQueue> {
    const id = await this.findItemId('queue/simple', name);
    const body: Record<string, any> = {};
    if (queue.name !== undefined && queue.name !== name) body.name = queue.name;
    if (queue.target !== undefined) body.target = queue.target;
    if (queue.maxLimit !== undefined) body['max-limit'] = queue.maxLimit;
    if (queue.limitAt !== undefined) body['limit-at'] = queue.limitAt;
    if (queue.priority !== undefined) body.priority = queue.priority;
    if (queue.parent !== undefined) body.parent = queue.parent || 'none';
    if (queue.comment !== undefined) body.comment = queue.comment;

    await this.request(`/queue/simple/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });

    return { name: queue.name || name, ...queue, routerId: this.config.id, routerName: this.config.name } as SimpleQueue;
  }

  async deleteQueue(name: string): Promise<boolean> {
    const id = await this.findItemId('queue/simple', name);
    await this.request(`/queue/simple/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    return true;
  }

  async getPools(): Promise<IpPool[]> {
    const raw = await this.request<any[]>('/ip/pool');
    return raw.map((item) => ({
      name: item.name,
      ranges: item.ranges,
      nextPool: item['next-pool'] && item['next-pool'] !== 'none' ? item['next-pool'] : undefined,
      comment: item.comment,
      routerId: this.config.id,
      routerName: this.config.name,
    }));
  }

  async createPool(pool: IpPool): Promise<IpPool> {
    const body: Record<string, any> = {
      name: pool.name,
      ranges: pool.ranges,
    };
    if (pool.nextPool) body['next-pool'] = pool.nextPool;
    if (pool.comment) body.comment = pool.comment;

    await this.createResource('ip/pool', body);
    return { ...pool, routerId: this.config.id, routerName: this.config.name };
  }

  async updatePool(name: string, pool: Partial<IpPool>): Promise<IpPool> {
    const id = await this.findItemId('ip/pool', name);
    const body: Record<string, any> = {};
    if (pool.name !== undefined && pool.name !== name) body.name = pool.name;
    if (pool.ranges !== undefined) body.ranges = pool.ranges;
    if (pool.nextPool !== undefined) body['next-pool'] = pool.nextPool || 'none';
    if (pool.comment !== undefined) body.comment = pool.comment;

    await this.request(`/ip/pool/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });

    return { name: pool.name || name, ...pool, routerId: this.config.id, routerName: this.config.name } as IpPool;
  }

  async deletePool(name: string): Promise<boolean> {
    const id = await this.findItemId('ip/pool', name);
    await this.request(`/ip/pool/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    return true;
  }
}
