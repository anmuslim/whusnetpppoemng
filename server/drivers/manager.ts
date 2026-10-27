import { IRouterDriver, RouterConfig, RouterSummary } from './types.js';
import { DemoDriver } from './demoDriver.js';
import { RouterosRestDriver } from './routerosRestDriver.js';
import { RouterosApiDriver } from './routerosApiDriver.js';
import { storage } from '../storage.js';
import { decrypt } from '../crypto.js';

class RouterConnectionManager {
  private driverCache: Map<string, IRouterDriver> = new Map();

  public getDriver(routerConfig: RouterConfig): IRouterDriver {
    if (this.driverCache.has(routerConfig.id)) {
      return this.driverCache.get(routerConfig.id)!;
    }

    let driver: IRouterDriver;
    const decryptedPass = routerConfig.encryptedPassword ? decrypt(routerConfig.encryptedPassword) : undefined;

    if (routerConfig.isDemo) {
      driver = new DemoDriver(routerConfig);
    } else if (routerConfig.mode === 'REST') {
      driver = new RouterosRestDriver(routerConfig, decryptedPass);
    } else {
      // API or API-SSL
      driver = new RouterosApiDriver(routerConfig, decryptedPass);
    }

    this.driverCache.set(routerConfig.id, driver);
    return driver;
  }

  public invalidateRouter(routerId: string) {
    this.driverCache.delete(routerId);
  }

  public clearAllDrivers() {
    this.driverCache.clear();
  }

  public getRouterSummaries(): RouterSummary[] {
    const routers = storage.getRouters();
    return routers.map((r) => ({
      id: r.id,
      name: r.name,
      host: r.host,
      port: r.port,
      mode: r.mode,
      notes: r.notes,
      isDemo: Boolean(r.isDemo),
      hasPassword: Boolean(r.encryptedPassword),
      status: r.status || 'online',
      lastSeen: r.lastSeen,
      lastError: r.lastError,
      identity: r.identity,
      version: r.version,
      uptime: r.uptime,
      cpuLoad: r.cpuLoad,
      freeMemory: r.freeMemory,
      totalMemory: r.totalMemory,
      boardName: r.boardName,
    }));
  }

  public async getTargetDrivers(routerId: string): Promise<Array<{ config: RouterConfig; driver: IRouterDriver }>> {
    const allRouters = storage.getRouters();
    if (routerId === 'all') {
      return allRouters.map((r) => ({ config: r, driver: this.getDriver(r) }));
    }
    const single = allRouters.find((r) => r.id === routerId);
    if (!single) {
      throw new Error(`Router ID '${routerId}' tidak ditemukan.`);
    }
    return [{ config: single, driver: this.getDriver(single) }];
  }

  /**
   * Run a query across one or all routers safely with timeout
   */
  public async executeOnRouters<T>(
    routerId: string,
    action: (driver: IRouterDriver, config: RouterConfig) => Promise<T[]>
  ): Promise<{ data: T[]; errors: Record<string, string> }> {
    const targets = await this.getTargetDrivers(routerId);
    const errors: Record<string, string> = {};
    const results: T[] = [];

    const promises = targets.map(async ({ config, driver }) => {
      try {
        // Enforce 6-second timeout per router
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Timeout menghubungi router ${config.name} (${config.host})`)), 6000)
        );
        const data = await Promise.race([action(driver, config), timeoutPromise]);
        results.push(...data);
        storage.updateRouter(config.id, {
          status: 'online',
          lastSeen: new Date().toISOString(),
          lastError: undefined,
        });
      } catch (err: any) {
        const msg = err.message || 'Koneksi gagal';
        errors[config.name] = msg;
        storage.updateRouter(config.id, {
          status: 'offline',
          lastError: msg,
        });
      }
    });

    await Promise.allSettled(promises);
    return { data: results, errors };
  }
}

export const routerManager = new RouterConnectionManager();
