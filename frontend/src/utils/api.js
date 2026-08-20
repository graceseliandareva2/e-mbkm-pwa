import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "/api",
  headers: {
    "Content-Type": "application/json",
  },
});

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

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const isLoginRequest = error.config?.url?.includes("/auth/login");
    const status = error.response?.status;
    const message = error.response?.data?.message || "";

    // Token invalid/expired dari middleware auth (403) ATAU unauthorized standar (401)
    const isTokenError =
      (status === 401 || status === 403) &&
      message.toLowerCase().includes("token");

    if ((status === 401 || isTokenError) && !isLoginRequest) {
      localStorage.removeItem("auth-storage");
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      window.location.href = "/login";
    }

    return Promise.reject(error);
  },
);

export default api;