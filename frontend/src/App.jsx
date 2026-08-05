import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useLocation,
} from "react-router-dom";
import { useEffect, useState, Suspense, lazy } from "react";
import useAuthStore from "./store/authStore";
import NProgress from "nprogress";
import "nprogress/nprogress.css";
import LoginPage from "./pages/auth/LoginPage";
import ForgotPasswordPage from "./pages/auth/ForgotPasswordPage";
import { subscribeToPush } from "./utils/push";

NProgress.configure({ showSpinner: false, speed: 400, minimum: 0.2 });

const NavigationProgress = () => {
  const location = useLocation();

  useEffect(() => {
    NProgress.start();
    const timer = setTimeout(() => NProgress.done(), 300);
    return () => {
      clearTimeout(timer);
      NProgress.done();
    };
  }, [location.pathname]);

  return null;
};

const PageLoader = () => (
  <div className="fixed top-0 left-0 right-0 z-50 pointer-events-none">
    <div className="h-[3px] bg-primary-600 animate-nprogress rounded-r-full" />
  </div>
);

const MahasiswaDashboard = lazy(() => import("./pages/mahasiswa/Dashboard"));
const MahasiswaPengajuan = lazy(() => import("./pages/mahasiswa/Pengajuan"));
const MahasiswaLogbook = lazy(() => import("./pages/mahasiswa/Logbook"));
const MahasiswaDokumen = lazy(() => import("./pages/mahasiswa/Dokumen"));
const MahasiswaRiwayat = lazy(() => import("./pages/mahasiswa/Riwayat"));

const DosenDashboard = lazy(() => import("./pages/dosen/Dashboard"));
const DosenMahasiswa = lazy(() => import("./pages/dosen/MahasiswaBimbingan"));
const DosenLogbook = lazy(() => import("./pages/dosen/Logbook"));
const DosenDokumen = lazy(() => import("./pages/dosen/Dokumen"));
const DosenPenilaian = lazy(() => import("./pages/dosen/Penilaian"));

const KaprodiDashboard = lazy(() => import("./pages/kaprodi/Dashboard"));
const KaprodiPeriode = lazy(() => import("./pages/kaprodi/Periode"));
const KaprodiDataMahasiswa = lazy(
  () => import("./pages/kaprodi/DataMahasiswa"),
);
const KaprodiAssignDosen = lazy(() => import("./pages/kaprodi/AssignDosen"));
const KaprodiDosen = lazy(() => import("./pages/kaprodi/Dosen"));
const KaprodiMonitoring = lazy(() => import("./pages/kaprodi/Monitoring"));
const KaprodiVerifikasi = lazy(() => import("./pages/kaprodi/Verifikasi"));
const KaprodiBiodata = lazy(() => import("./pages/kaprodi/Biodata"));

const StaffDashboard = lazy(() => import("./pages/staff/Dashboard"));
const StaffPengajuan = lazy(() => import("./pages/staff/Pengajuan"));
// PERUBAHAN (item #6): halaman CRUD mahasiswa/dosen pindah ke area Staff.
const StaffDataMahasiswa = lazy(() => import("./pages/staff/DataMahasiswa"));
// PERUBAHAN: "Data Dosen" balik jadi 1 halaman tunggal (bukan 2 halaman
// MBKM/Akademik lagi). Dosen cuma 1 tabel (users role='dosen'), gak ada
// tabel roster per-periode, jadi gak ada alasan buat dipisah.
const StaffDosen = lazy(() => import("./pages/staff/Dosen"));
const StaffMonitoring = lazy(() => import("./pages/staff/Monitoring"));
const BiodataPage = lazy(() => import("./components/common/BiodataPage"));

import MahasiswaLayout from "./components/layout/MahasiswaLayout";
import DosenLayout from "./components/layout/DosenLayout";
import KaprodiLayout from "./components/layout/KaprodiLayout";
import StaffLayout from "./components/layout/StaffLayout";

const ProtectedRoute = ({ children, allowedRoles }) => {
  const { isAuthenticated, user } = useAuthStore();

  const [hydrated, setHydrated] = useState(
    () => useAuthStore.persist?.hasHydrated() ?? true,
  );

  useEffect(() => {
    if (!hydrated) {
      const unsub = useAuthStore.persist.onHydrate(() => setHydrated(true));
      return unsub;
    }
  }, [hydrated]);

  // TAMBAHAN: subscribe push setiap kali ProtectedRoute ke-render dengan user
  // yang sudah authenticated -- ini cover kasus sesi lama yang gak sempat
  // trigger subscribe waktu di LoginPage (refresh, buka tab baru, dll).
  // subscribeToPush() sendiri sudah punya guard internal (gak subscribe ulang
  // kalau browser udah punya subscription aktif), jadi aman dipanggil berkali-kali.
  useEffect(() => {
    if (hydrated && isAuthenticated && user) {
      subscribeToPush();
    }
  }, [hydrated, isAuthenticated, user]);

  if (!hydrated) return null;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (allowedRoles && !allowedRoles.includes(user?.role))
    return <Navigate to="/login" replace />;
  return children;
};

const RoleRedirect = () => {
  const { user, isAuthenticated } = useAuthStore();

  const [hydrated, setHydrated] = useState(
    () => useAuthStore.persist?.hasHydrated() ?? true,
  );

  useEffect(() => {
    if (!hydrated) {
      const unsub = useAuthStore.persist.onHydrate(() => setHydrated(true));
      return unsub;
    }
  }, [hydrated]);

  if (!hydrated) return null;
  if (!isAuthenticated) return <Navigate to="/login" replace />;

  // PERUBAHAN: role dosen sekarang 'dosen' (bukan 'dosen_pembimbing' lagi --
  // sudah disederhanakan pas migrasi restrukturisasi users).
  const redirectMap = {
    mahasiswa: "/mahasiswa/dashboard",
    dosen: "/dosen/dashboard",
    kaprodi: "/kaprodi/dashboard",
    staff_akademik: "/staff/dashboard",
  };
  return <Navigate to={redirectMap[user?.role] || "/login"} replace />;
};

export default function App() {
  // TAMBAHAN: clear app badge (icon notif seperti WA/IG) begitu app
  // dibuka/difokus, tanpa harus nunggu user klik notifikasi dulu.
  // Kirim pesan ke service worker (yang nyimpen & reset counter badge),
  // plus langsung clearAppBadge() dari sisi window kalau API-nya tersedia.
  useEffect(() => {
    const clearBadge = () => {
      if (document.visibilityState === "visible") {
        if (navigator.serviceWorker?.controller) {
          navigator.serviceWorker.controller.postMessage({
            type: "CLEAR_BADGE",
          });
        }
        if ("clearAppBadge" in navigator) {
          navigator.clearAppBadge();
        }
      }
    };

    clearBadge(); // langsung clear pas app pertama kali dibuka/mount
    document.addEventListener("visibilitychange", clearBadge);
    return () => document.removeEventListener("visibilitychange", clearBadge);
  }, []);

  return (
    <BrowserRouter>
      <NavigationProgress />
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/" element={<RoleRedirect />} />

          <Route
            path="/mahasiswa"
            element={
              <ProtectedRoute allowedRoles={["mahasiswa"]}>
                <MahasiswaLayout />
              </ProtectedRoute>
            }
          >
            <Route path="dashboard" element={<MahasiswaDashboard />} />
            <Route path="pengajuan" element={<MahasiswaPengajuan />} />
            <Route path="logbook" element={<MahasiswaLogbook />} />
            <Route path="dokumen" element={<MahasiswaDokumen />} />
            <Route path="riwayat" element={<MahasiswaRiwayat />} />
            <Route path="biodata" element={<BiodataPage />} />
          </Route>

          {/* PERUBAHAN: allowedRoles pakai 'dosen' (bukan 'dosen_pembimbing' lagi) */}
          <Route
            path="/dosen"
            element={
              <ProtectedRoute allowedRoles={["dosen"]}>
                <DosenLayout />
              </ProtectedRoute>
            }
          >
            <Route path="dashboard" element={<DosenDashboard />} />
            <Route path="mahasiswa" element={<DosenMahasiswa />} />
            <Route path="logbook" element={<DosenLogbook />} />
            <Route path="dokumen" element={<DosenDokumen />} />
            <Route path="penilaian" element={<DosenPenilaian />} />
            <Route path="biodata" element={<BiodataPage />} />
          </Route>

          <Route
            path="/kaprodi"
            element={
              <ProtectedRoute allowedRoles={["kaprodi"]}>
                <KaprodiLayout />
              </ProtectedRoute>
            }
          >
            <Route path="dashboard" element={<KaprodiDashboard />} />
            <Route path="periode" element={<KaprodiPeriode />} />
            <Route path="mahasiswa" element={<KaprodiDataMahasiswa />} />
            {/* BARU: route "verifikasi" & "monitoring" sebelumnya hilang -- 
                komponennya sudah di-import tapi belum didaftarkan sebagai Route,
                jadi navigate('/kaprodi/verifikasi') & ('/kaprodi/monitoring')
                jatuh ke catch-all "*" dan balik ke dashboard. */}
            <Route path="verifikasi" element={<KaprodiVerifikasi />} />
            <Route path="assign-dosen" element={<KaprodiAssignDosen />} />
            <Route path="dosen" element={<KaprodiDosen />} />
            <Route path="monitoring" element={<KaprodiMonitoring />} />
            <Route path="biodata" element={<KaprodiBiodata />} />
          </Route>

          <Route
            path="/staff"
            element={
              <ProtectedRoute allowedRoles={["staff_akademik"]}>
                <StaffLayout />
              </ProtectedRoute>
            }
          >
            <Route path="dashboard" element={<StaffDashboard />} />
            <Route path="pengajuan" element={<StaffPengajuan />} />
            <Route path="mahasiswa" element={<StaffDataMahasiswa />} />
            {/* FIX: sebelumnya <staffDosen /> (huruf kecil) -- React menganggap ini
                tag HTML biasa, bukan komponen, sekarang dibetulkan ke <StaffDosen />. */}
            <Route path="dosen" element={<StaffDosen />} />
            <Route path="biodata" element={<BiodataPage />} />
            <Route path="monitoring" element={<StaffMonitoring />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
