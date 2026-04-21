import axios from 'axios';

const api = axios.create({
  baseURL: '/api'
});

export const getBangumiCollections = (type?: number) => {
  const query = type ? `?type=${type}` : '';
  return api.get(`/bangumi/collections${query}`);
};

export const searchMikan = (q: string) => {
  return api.get(`/mikan/search?q=${encodeURIComponent(q)}`);
};

export const getMikanBangumi = (id: number) => {
  return api.get(`/mikan/bangumi/${id}`);
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