import axios from 'axios';

const api = axios.create({
  baseURL: '/api'
});

export const getBangumiCollections = (type?: number, offset = 0, limit = 30) => {
  const params = new URLSearchParams();
  if (type) params.set('type', String(type));
  params.set('offset', String(offset));
  params.set('limit', String(limit));
  return api.get(`/bangumi/collections?${params.toString()}`);
};

export const searchMikan = (q: string) => {
  return api.get(`/mikan/search?q=${encodeURIComponent(q)}`);
};

export const getMikanBangumi = (id: number) => {
  return api.get(`/mikan/bangumi-detail/${id}?ts=${Date.now()}`);
};

export const getConfig = () => {
  return api.get('/config');
};

export const updateConfig = (payload: any) => {
  return api.patch('/config', payload);
};

export const getSubscriptions = () => {
  return api.get('/rss');
};

export const getRules = () => {
  return api.get('/rules');
};