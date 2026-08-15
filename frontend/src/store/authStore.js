import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const useAuthStore = create(
  persist(
    (set) => ({
      user: null,
      token: null,
      isAuthenticated: false,

     login: (user, token) => {
  localStorage.setItem('token', token);
  localStorage.setItem('user', JSON.stringify(user));
  localStorage.removeItem('cache_pengajuan');
  localStorage.removeItem('cache_logbooks');
  set({ user, token, isAuthenticated: true });
},

      logout: () => {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  localStorage.removeItem('cache_pengajuan');
  localStorage.removeItem('cache_logbooks');
  set({ user: null, token: null, isAuthenticated: false });
},

      updateUser: (user) => set({ user }),
    }),
    {
      name: 'auth-storage',
    }
  )
);

export default useAuthStore;