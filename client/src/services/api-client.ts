import axios from 'axios';

const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

export const apiClient = axios.create({
  baseURL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add interceptor for consistent error handling if needed
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    // Standardize error reporting here if needed
    console.error('API Error:', error.response?.data?.error || error.message);
    return Promise.reject(error);
  }
);
