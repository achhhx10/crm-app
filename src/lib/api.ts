const API_BASE = '/api';

function getToken(): string | null {
  return localStorage.getItem('crm_token');
}

function parseJwt(token: string): any {
  try {
    return JSON.parse(atob(token.split('.')[1]));
  } catch {
    return null;
  }
}

function isTokenExpiringSoon(): boolean {
  const token = getToken();
  if (!token) return true;
  const payload = parseJwt(token);
  if (!payload || !payload.exp) return true;
  const now = Math.floor(Date.now() / 1000);
  return payload.exp - now < 600;
}

let refreshPromise: Promise<void> | null = null;

async function refreshTokenIfNeeded(): Promise<void> {
  if (!isTokenExpiringSoon()) return;
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    try {
      const token = getToken();
      if (!token) return;
      const res = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      });
      if (res.ok) {
        const data = await res.json();
        localStorage.setItem('crm_token', data.token);
      }
    } catch {
      // Ignore refresh errors - will be caught by 401 handler
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  await refreshTokenIfNeeded();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  if (res.status === 401) {
    localStorage.removeItem('crm_token');
    localStorage.removeItem('crm_user');
    window.location.href = '/login';
    throw new Error('Non autorisé');
  }

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Erreur serveur');
  }
  return data;
}

export const api = {
  auth: {
    login: (email: string, password: string) =>
      request<{ token: string; user: any }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      }),
    register: (name: string, email: string, password: string, role?: string) =>
      request<{ token: string; user: any }>('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ name, email, password, role }),
      }),
    me: () => request<any>('/auth/me'),
    users: () => request<any[]>('/auth/users'),
    createUser: (data: { name: string; email: string; password: string; role: string }) =>
      request<any>('/auth/register', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    deleteUser: (id: number) => request<any>(`/auth/users/${id}`, { method: 'DELETE' }),
  },

  contacts: {
    list: (params?: Record<string, string>) => {
      const query = params ? '?' + new URLSearchParams(params).toString() : '';
      return request<{ contacts: any[]; total: number }>(`/contacts${query}`);
    },
    activities: () => request<string[]>('/contacts/activities'),
    cities: () => request<string[]>('/contacts/cities'),
    get: (id: number) => request<any>(`/contacts/${id}`),
    create: (data: any) => request<any>('/contacts', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: number, data: any) => request<any>(`/contacts/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: number) => request<any>(`/contacts/${id}`, { method: 'DELETE' }),
    bulkStage: (ids: number[], stage: string) =>
      request<any>('/contacts/bulk-stage', { method: 'PUT', body: JSON.stringify({ ids, stage }) }),
    bulkDelete: (ids: number[]) =>
      request<any>('/contacts/bulk', { method: 'DELETE', body: JSON.stringify({ ids }) }),
    exportCsv: (params?: Record<string, string>) => {
      const query = params ? '?' + new URLSearchParams(params).toString() : '';
      const token = getToken();
      return fetch(`${API_BASE}/contacts/export${query}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
    },
  },

  calls: {
    list: (params?: Record<string, string>) => {
      const query = params ? '?' + new URLSearchParams(params).toString() : '';
      return request<any[]>(`/calls${query}`);
    },
    byContact: (contactId: number) => request<any[]>(`/calls/contact/${contactId}`),
    stats: () => request<any>('/calls/stats'),
    create: (data: any) => request<any>('/calls', { method: 'POST', body: JSON.stringify(data) }),
  },

  deals: {
    list: (params?: Record<string, string>) => {
      const query = params ? '?' + new URLSearchParams(params).toString() : '';
      return request<{ deals: any[]; total: number; page: number; limit: number }>(`/deals${query}`);
    },
    stats: () => request<any>('/deals/stats'),
    create: (data: any) => request<any>('/deals', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: number, data: any) => request<any>(`/deals/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: number) => request<any>(`/deals/${id}`, { method: 'DELETE' }),
  },

  referrals: {
    list: (params?: Record<string, string>) => {
      const query = params ? '?' + new URLSearchParams(params).toString() : '';
      return request<{ referrals: any[]; total: number; page: number; limit: number }>(`/referrals${query}`);
    },
    byContact: (contactId: number) => request<any>(`/referrals/contact/${contactId}`),
    stats: () => request<any>('/referrals/stats'),
    create: (data: any) => request<any>('/referrals', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: number, data: any) => request<any>(`/referrals/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  },

  dashboard: {
    summary: () => request<any>('/dashboard/summary'),
    pipeline: () => request<any>('/dashboard/pipeline'),
    performance: () => request<any[]>('/dashboard/performance'),
    activity: () => request<any[]>('/dashboard/activity'),
  },

  import: {
    excel: (formData: FormData) => {
      const token = getToken();
      return fetch(`${API_BASE}/import/excel`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      }).then(async (res) => {
        if (res.status === 401) {
          localStorage.removeItem('crm_token');
          localStorage.removeItem('crm_user');
          window.location.href = '/login';
          throw new Error('Non autorisé');
        }
        if (!res.ok) {
          const data = await res.json().catch(() => ({ error: 'Erreur serveur' }));
          throw new Error(data.error || 'Erreur serveur');
        }
        return res.json();
      });
    },
    importWithProgress: (formData: FormData, onProgress: (percent: number) => void) => {
      return new Promise<any>((resolve, reject) => {
        const token = getToken();
        const xhr = new XMLHttpRequest();
        xhr.open('POST', `${API_BASE}/import/excel`);
        if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
        
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            onProgress(Math.round((e.loaded / e.total) * 100));
          }
        };
        
        xhr.onload = () => {
          if (xhr.status === 401) {
            localStorage.removeItem('crm_token');
            localStorage.removeItem('crm_user');
            window.location.href = '/login';
            reject(new Error('Non autorisé'));
            return;
          }
          try {
            const data = JSON.parse(xhr.responseText);
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve(data);
            } else {
              reject(new Error(data.error || 'Erreur serveur'));
            }
          } catch {
            reject(new Error('Erreur serveur'));
          }
        };
        
        xhr.onerror = () => reject(new Error('Erreur réseau'));
        xhr.send(formData);
      });
    },
  },
};
