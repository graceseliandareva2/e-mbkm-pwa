import axios from "axios";

const api = axios.create({
  baseURL: "/api",
  headers: {
    "Content-Type": "application/json",
  },
});

// Request interceptor — tambahkan token di setiap request
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error),
);

// Response interceptor — handle token expired
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Hanya redirect jika token memang tidak ada atau server bilang token invalid/expired
      const message = error.response?.data?.message || "";
      const isTokenError =
        message.toLowerCase().includes("token") ||
        message.toLowerCase().includes("unauthorized") ||
        message.toLowerCase().includes("jwt") ||
        !localStorage.getItem("token");

      if (isTokenError) {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        window.location.href = "/login";
      }
    }
    // 403 (forbidden) jangan redirect — biarkan komponen handle sendiri
    return Promise.reject(error);
  },
);

export default api;
