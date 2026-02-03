import axios from 'axios';

const API_URL = '/api/v1';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor for adding auth token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('accessToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor for handling token refresh
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        const refreshToken = localStorage.getItem('refreshToken');
        if (!refreshToken) {
          throw new Error('No refresh token');
        }

        const response = await axios.post(`${API_URL}/auth/refresh`, {
          refreshToken,
        });

        const { accessToken } = response.data.data;
        localStorage.setItem('accessToken', accessToken);

        originalRequest.headers.Authorization = `Bearer ${accessToken}`;
        return api(originalRequest);
      } catch (refreshError) {
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        window.location.href = '/login';
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

// Auth API
export const authApi = {
  register: (data) => api.post('/auth/register', data),
  login: (data) => api.post('/auth/login', data),
  refresh: (refreshToken) => api.post('/auth/refresh', { refreshToken }),
  logout: (refreshToken) => api.post('/auth/logout', { refreshToken }),
};

// User API
export const userApi = {
  getMe: () => api.get('/users/me'),
  updateProfile: (data) => api.patch('/users/me', data),
  getExamHistory: (params) => api.get('/users/me/exams', { params }),
  getExamAttempt: (attemptId) => api.get(`/users/me/exams/${attemptId}`),
  getStats: () => api.get('/users/me/stats'),
};

// Session API
export const sessionApi = {
  listSessions: () => api.get('/sessions'),
  createSession: () => api.post('/sessions', { mode: 'SHARED' }),
  clearAllSessions: () => api.delete('/sessions/all'),
};

// Exam API
export const examApi = {
  listLabs: () => api.get('/exams/labs'),
  createExam: (labId) => api.post('/exams', { labId }),
  getCurrentExam: () => api.get('/exams/current'),
  getExamQuestions: (examId) => api.get(`/exams/${examId}/questions`),
  evaluateExam: (examId) => api.post(`/exams/${examId}/evaluate`),
  endExam: (examId) => api.post(`/exams/${examId}/end`),
};

// Billing API
export const billingApi = {
  getPlans: () => api.get('/billing/plans'),
  createCheckout: (passTypeId) => api.post('/billing/checkout', { passTypeId }),
  verifyCheckout: (sessionId) => api.get(`/billing/verify/${sessionId}`),
};

// Access API
export const accessApi = {
  getStatus: () => api.get('/access/status'),
  getPasses: () => api.get('/access/passes'),
  activatePass: (passId) => api.post(`/access/activate/${passId}`),
};

export default api;
