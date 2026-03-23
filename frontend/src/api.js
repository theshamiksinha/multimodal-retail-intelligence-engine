import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 60000,
});

// Video Analytics
export const getDemoAnalytics = () => api.get('/video/demo');
export const uploadVideo = (formData) => api.post('/video/upload', formData);
export const getHeatmap = (sessionId) => api.get(`/video/heatmap/${sessionId}`);

// Sales & Inventory
export const getSalesSummary = () => api.get('/sales/summary');
export const getInventoryStatus = () => api.get('/sales/inventory');
export const generateSampleData = () => api.post('/sales/generate-sample');

// Marketing
export const generateMarketing = (data) => api.post('/marketing/generate', data);
export const generateCampaign = (goal) => api.post(`/marketing/campaign?goal=${encodeURIComponent(goal)}`);

// AI Advisor
export const chatWithAdvisor = (message, sessionId = 'default') =>
  api.post('/advisor/chat', { message, session_id: sessionId });
export const clearAdvisorSession = (sessionId) => api.delete(`/advisor/session/${sessionId}`);

export default api;
