import {
  RouterSummary,
  PppSecret,
  PppActive,
  PppProfile,
  SimpleQueue,
  IpPool,
  RouterConnectionTestResult,
  OverviewData,
  AuditLogItem,
  User,
  SessionTrafficInfo,
} from '../types/index.ts';

const TOKEN_KEY = 'pppoe_manager_jwt';

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setStoredToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function removeStoredToken() {
  localStorage.removeItem(TOKEN_KEY);
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = getStoredToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(endpoint, {
    ...options,
    headers,
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    if (response.status === 401 && !endpoint.includes('/api/auth/login')) {
      removeStoredToken();
      window.dispatchEvent(new Event('auth:unauthorized'));
    }
    const message = data.error || `Terjadi kesalahan (HTTP ${response.status})`;
    throw new Error(message);
  }

  return data;
}

export const api = {
  auth: {
    login: (credentials: { username: string; password: string }) =>
      request<{ success: boolean; token: string; user: User }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify(credentials),
      }),
    me: () => request<{ success: boolean; user: User }>('/api/auth/me'),
    changePassword: (body: { currentPassword: string; newPassword: string }) =>
      request<{ success: boolean; message: string }>('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
  },

  routers: {
    getAll: () => request<{ success: boolean; data: RouterSummary[] }>('/api/routers'),
    create: (data: any) =>
      request<{ success: boolean; data: RouterSummary }>('/api/routers', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (id: string, data: any) =>
      request<{ success: boolean; data: RouterSummary }>(`/api/routers/${encodeURIComponent(id)}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    delete: (id: string) =>
      request<{ success: boolean; message: string }>(`/api/routers/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      }),
    testConnection: (id: string) =>
      request<{ success: boolean; data: RouterConnectionTestResult }>(`/api/routers/${encodeURIComponent(id)}/test`, {
        method: 'POST',
      }),
  },

  secrets: {
    getAll: (routerId: string) =>
      request<{ success: boolean; data: PppSecret[]; errors?: Record<string, string> }>(
        `/api/routers/${encodeURIComponent(routerId)}/ppp/secrets`
      ),
    create: (routerId: string, secret: Partial<PppSecret>) =>
      request<{ success: boolean; data: PppSecret }>(`/api/routers/${encodeURIComponent(routerId)}/ppp/secrets`, {
        method: 'POST',
        body: JSON.stringify(secret),
      }),
    update: (routerId: string, name: string, patch: Partial<PppSecret>) =>
      request<{ success: boolean; data: PppSecret }>(
        `/api/routers/${encodeURIComponent(routerId)}/ppp/secrets/${encodeURIComponent(name)}`,
        {
          method: 'PUT',
          body: JSON.stringify(patch),
        }
      ),
    delete: (routerId: string, name: string) =>
      request<{ success: boolean; message: string }>(
        `/api/routers/${encodeURIComponent(routerId)}/ppp/secrets/${encodeURIComponent(name)}`,
        {
          method: 'DELETE',
        }
      ),
    bulkAction: (routerId: string, body: { action: string; items: Array<{ name: string; routerId?: string }>; targetProfile?: string }) =>
      request<{ success: boolean; successCount: number; total: number; errors?: Record<string, string> }>(
        `/api/routers/${encodeURIComponent(routerId)}/ppp/secrets/bulk-action`,
        {
          method: 'POST',
          body: JSON.stringify(body),
        }
      ),
  },

  active: {
    getAll: (routerId: string) =>
      request<{ success: boolean; data: PppActive[]; errors?: Record<string, string> }>(
        `/api/routers/${encodeURIComponent(routerId)}/ppp/active`
      ),
    disconnect: (routerId: string, name: string, targetRouterId?: string) =>
      request<{ success: boolean; message: string }>(
        `/api/routers/${encodeURIComponent(routerId)}/ppp/active/${encodeURIComponent(name)}${
          targetRouterId ? `?routerId=${encodeURIComponent(targetRouterId)}` : ''
        }`,
        {
          method: 'DELETE',
        }
      ),
    bulkDisconnect: (routerId: string, items: Array<{ name: string; routerId?: string }>) =>
      request<{ success: boolean; disconnectedCount: number }>(
        `/api/routers/${encodeURIComponent(routerId)}/ppp/active/bulk-disconnect`,
        {
          method: 'POST',
          body: JSON.stringify({ items }),
        }
      ),
    getHistory: (routerId: string, name: string) =>
      request<{ success: boolean; data: Array<{ id: string; timestamp: string; type: 'connected' | 'disconnected'; username: string; routerName: string; ipAddress: string; details?: string }> }>(
        `/api/routers/${encodeURIComponent(routerId)}/ppp/active/${encodeURIComponent(name)}/history`
      ),
    getTraffic: (routerId: string, name: string, targetRouterId?: string) =>
      request<{ success: boolean; data: SessionTrafficInfo }>(
        `/api/routers/${encodeURIComponent(routerId)}/ppp/active/${encodeURIComponent(name)}/traffic${
          targetRouterId ? `?routerId=${encodeURIComponent(targetRouterId)}` : ''
        }`
      ),
    ping: (routerId: string, body: { address: string; count?: number; size?: number; targetRouterId?: string }) =>
      request<{
        success: boolean;
        data: {
          target: string;
          routerName: string;
          sent: number;
          received: number;
          lost: number;
          packetLoss: number;
          minRtt: number;
          avgRtt: number;
          maxRtt: number;
          packets: Array<{
            seq: number;
            host: string;
            size: number;
            ttl: number;
            timeMs: number;
            status: 'reply' | 'timeout';
          }>;
          timestamp: number;
        };
      }>(
        `/api/routers/${encodeURIComponent(routerId)}/ppp/active/ping${
          body.targetRouterId ? `?routerId=${encodeURIComponent(body.targetRouterId)}` : ''
        }`,
        {
          method: 'POST',
          body: JSON.stringify({ address: body.address, count: body.count, size: body.size }),
        }
      ),
  },

  profiles: {
    getAll: (routerId: string) =>
      request<{ success: boolean; data: PppProfile[]; errors?: Record<string, string> }>(
        `/api/routers/${encodeURIComponent(routerId)}/ppp/profiles`
      ),
    create: (routerId: string, profile: Partial<PppProfile>) =>
      request<{ success: boolean; data: PppProfile }>(`/api/routers/${encodeURIComponent(routerId)}/ppp/profiles`, {
        method: 'POST',
        body: JSON.stringify(profile),
      }),
    update: (routerId: string, name: string, patch: Partial<PppProfile>) =>
      request<{ success: boolean; data: PppProfile }>(
        `/api/routers/${encodeURIComponent(routerId)}/ppp/profiles/${encodeURIComponent(name)}`,
        {
          method: 'PUT',
          body: JSON.stringify(patch),
        }
      ),
    delete: (routerId: string, name: string) =>
      request<{ success: boolean; message: string }>(
        `/api/routers/${encodeURIComponent(routerId)}/ppp/profiles/${encodeURIComponent(name)}`,
        {
          method: 'DELETE',
        }
      ),
    bulkAction: (
      routerId: string,
      body: {
        action: 'change_dns' | 'change_rate_limit' | 'change_local_address' | 'change_remote_address' | 'delete';
        items: Array<{ name: string; routerId?: string }>;
        dnsServer?: string;
        rateLimit?: string;
        localAddress?: string;
        remoteAddress?: string;
      }
    ) =>
      request<{ success: boolean; successCount: number; total: number; errors?: Record<string, string> }>(
        `/api/routers/${encodeURIComponent(routerId)}/ppp/profiles/bulk-action`,
        {
          method: 'POST',
          body: JSON.stringify(body),
        }
      ),
  },

  queues: {
    getAll: (routerId: string) =>
      request<{ success: boolean; data: SimpleQueue[]; errors?: Record<string, string> }>(
        `/api/routers/${encodeURIComponent(routerId)}/queues`
      ),
    create: (routerId: string, queue: Partial<SimpleQueue>) =>
      request<{ success: boolean; data: SimpleQueue }>(`/api/routers/${encodeURIComponent(routerId)}/queues`, {
        method: 'POST',
        body: JSON.stringify(queue),
      }),
    update: (routerId: string, name: string, patch: Partial<SimpleQueue>) =>
      request<{ success: boolean; data: SimpleQueue }>(
        `/api/routers/${encodeURIComponent(routerId)}/queues/${encodeURIComponent(name)}`,
        {
          method: 'PUT',
          body: JSON.stringify(patch),
        }
      ),
    delete: (routerId: string, name: string) =>
      request<{ success: boolean; message: string }>(
        `/api/routers/${encodeURIComponent(routerId)}/queues/${encodeURIComponent(name)}`,
        {
          method: 'DELETE',
        }
      ),
  },

  pools: {
    getAll: (routerId: string) =>
      request<{ success: boolean; data: IpPool[]; errors?: Record<string, string> }>(
        `/api/routers/${encodeURIComponent(routerId)}/ip-pools`
      ),
    create: (routerId: string, pool: Partial<IpPool>) =>
      request<{ success: boolean; data: IpPool }>(`/api/routers/${encodeURIComponent(routerId)}/ip-pools`, {
        method: 'POST',
        body: JSON.stringify(pool),
      }),
    update: (routerId: string, name: string, patch: Partial<IpPool>) =>
      request<{ success: boolean; data: IpPool }>(
        `/api/routers/${encodeURIComponent(routerId)}/ip-pools/${encodeURIComponent(name)}`,
        {
          method: 'PUT',
          body: JSON.stringify(patch),
        }
      ),
    delete: (routerId: string, name: string) =>
      request<{ success: boolean; message: string }>(
        `/api/routers/${encodeURIComponent(routerId)}/ip-pools/${encodeURIComponent(name)}`,
        {
          method: 'DELETE',
        }
      ),
  },

  overview: {
    get: () => request<{ success: boolean; data: OverviewData }>('/api/overview'),
  },

  audit: {
    getAll: () => request<{ success: boolean; data: AuditLogItem[] }>('/api/audit-logs'),
    resetDemo: () => request<{ success: boolean; message: string }>('/api/demo/reset-demo', { method: 'POST' }),
  },

  users: {
    getAll: () => request<{ success: boolean; data: User[] }>('/api/users'),
    create: (data: Partial<User> & { password?: string }) =>
      request<{ success: boolean; data: User }>('/api/users', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (id: string, data: Partial<User> & { password?: string }) =>
      request<{ success: boolean; data: User }>(`/api/users/${encodeURIComponent(id)}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    delete: (id: string) =>
      request<{ success: boolean; message: string }>(`/api/users/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      }),
  },
};
