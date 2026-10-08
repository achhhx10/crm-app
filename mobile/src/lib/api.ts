// Same API contract as the desktop app. In production set VITE_API_URL
// to the Railway API, e.g. https://crm-api.up.railway.app/api
export const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) || '/api';

function getToken(): string | null {
  return localStorage.getItem('crm_token');
}

function clearSession() {
  localStorage.removeItem('crm_token');
  localStorage.removeItem('crm_user');
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  if (res.status === 401) {
    clearSession();
    window.location.href = '/login';
    throw new Error('Non autorisé');
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as any).error || 'Erreur serveur');
  }
  return data as T;
}

export function getStoredUser(): any | null {
  try {
    const raw = localStorage.getItem('crm_user');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export const api = {
  auth: {
    login: async (email: string, password: string) => {
      const data = await request<{ token: string; user: any }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      localStorage.setItem('crm_token', data.token);
      localStorage.setItem('crm_user', JSON.stringify(data.user));
      return data;
    },
    logout: () => {
      clearSession();
      window.location.href = '/login';
    },
    users: () => request<any[]>('/auth/users'),
    createUser: (data: { name: string; email: string; password: string; role: string }) =>
      request<any>('/auth/register', { method: 'POST', body: JSON.stringify(data) }),
    deleteUser: (id: number) => request<any>(`/auth/users/${id}`, { method: 'DELETE' }),
  },
  contacts: {
    list: (params?: Record<string, string>) => {
      const query = params ? '?' + new URLSearchParams(params).toString() : '';
      return request<{ contacts: any[]; total: number }>(`/contacts${query}`);
    },
    get: (id: number) => request<any>(`/contacts/${id}`),
    create: (data: any) => request<any>('/contacts', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: number, data: any) => request<any>(`/contacts/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    bulkStage: (ids: number[], stage: string) =>
      request<any>('/contacts/bulk-stage', { method: 'PUT', body: JSON.stringify({ ids, stage }) }),
  },
  calls: {
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
  },
  referrals: {
    list: (params?: Record<string, string>) => {
      const query = params ? '?' + new URLSearchParams(params).toString() : '';
      return request<{ referrals: any[]; total: number; page: number; limit: number }>(`/referrals${query}`);
    },
    create: (data: any) => request<any>('/referrals', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: number, data: any) => request<any>(`/referrals/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  },
  dashboard: {
    summary: () => request<any>('/dashboard/summary'),
    pipeline: () => request<any>('/dashboard/pipeline'),
    performance: () => request<any[]>('/dashboard/performance'),
    activity: () => request<any[]>('/dashboard/activity'),
  },
};
