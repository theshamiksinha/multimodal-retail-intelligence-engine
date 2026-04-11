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
export const postToBuffer = (data) => api.post('/marketing/post-to-buffer', data);

// AI Advisor
export const chatWithAdvisor = (message, sessionId = 'default') =>
  api.post('/advisor/chat', { message, session_id: sessionId });
export const clearAdvisorSession = (sessionId) => api.delete(`/advisor/session/${sessionId}`);

// Floor Plan & Multi-Camera Heatmap
export const createFloorPlanSession = (formData) =>
  api.post('/floorplan/session', formData, { timeout: 30000 });
export const saveCameraLayout = (sessionId, cameras) =>
  api.post(`/floorplan/session/${sessionId}/cameras`, { cameras });
export const uploadCameraVideo = (sessionId, cameraId, formData) =>
  api.post(`/floorplan/session/${sessionId}/camera/${cameraId}/video`, formData, { timeout: 120000 });
export const processFloorPlan = (sessionId) =>
  api.post(`/floorplan/session/${sessionId}/process`);
export const getFloorPlanStatus = (sessionId) =>
  api.get(`/floorplan/session/${sessionId}/status`);
export const listFloorPlans = () =>
  api.get('/floorplan/sessions');
export const deleteFloorPlan = (sessionId) =>
  api.delete(`/floorplan/session/${sessionId}`);

export default api;
