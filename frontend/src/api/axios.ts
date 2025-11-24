import axios, { type AxiosInstance, type AxiosRequestConfig, type AxiosResponse } from 'axios';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:4000/api';

type Subscriber = (token: string | null) => void;
const authState = { accessToken: null as string | null, subscribers: new Set<Subscriber>(), onLogout: null as any };
export const tokenService = {
  getAccessToken: () => authState.accessToken,
  setAccessToken: (t: string | null) => { authState.accessToken = t; authState.subscribers.forEach(s => s(t)); },
  subscribe: (s: Subscriber) => { authState.subscribers.add(s); return () => authState.subscribers.delete(s); },
  setLogoutHandler: (fn: () => void) => { authState.onLogout = fn; },
  logout: () => { tokenService.setAccessToken(null); if (authState.onLogout) authState.onLogout(); }
};

export const refreshClient: AxiosInstance = axios.create({ baseURL: API_BASE, withCredentials: true, timeout: 10000 });
export const api: AxiosInstance = axios.create({ baseURL: API_BASE, withCredentials: true, timeout: 20000 });

let isRefreshing = false;
let failedQueue: Array<{ resolve: (value?: AxiosResponse<any>) => void; reject: (error: any) => void; config: AxiosRequestConfig; }> = [];

const processQueue = (error: any, token: string | null = null) => {
  failedQueue.forEach(p => {
    if (error) {
      p.reject(error);
    } else {
      if (token) {
        if (!p.config.headers) p.config.headers = {};
        (p.config.headers as any)['Authorization'] = `Bearer ${token}`;
      }
      api.request(p.config)
        .then((response) => {
          p.resolve(response);
        })
        .catch((err) => {
          p.reject(err);
        });
    }
  });
  
  failedQueue = [];
};

api.interceptors.request.use((config) => {
  const token = tokenService.getAccessToken();
  if (token) {
    // Use .set(key, value) instead of object assignment
    config.headers.set('Authorization', `Bearer ${token}`);
  }
  return config;
});

api.interceptors.response.use(
  res => res,
  async err => {
    const originalConfig = err.config as AxiosRequestConfig & { _retry?: boolean };
    if (!err.response) return Promise.reject(err);
    if (err.response.status !== 401 || originalConfig._retry) return Promise.reject(err);
    originalConfig._retry = true;
    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        failedQueue.push({ resolve, reject, config: originalConfig });
      });
    }
    isRefreshing = true;
    try {
      const r = await refreshClient.post('/auth/refresh', {});
      const { accessToken } = r.data as { accessToken?: string };
      if (!accessToken) throw new Error('No accessToken in refresh response');
      tokenService.setAccessToken(accessToken);
      processQueue(null, accessToken);
      if (!originalConfig.headers) originalConfig.headers = {};
      originalConfig.headers['Authorization'] = `Bearer ${accessToken}`;
      return api.request(originalConfig);
    } catch (refreshError) {
      processQueue(refreshError, null);
      tokenService.logout();
      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  }
);
