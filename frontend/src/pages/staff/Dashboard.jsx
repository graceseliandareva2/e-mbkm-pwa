import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FileText, Clock, BookOpen, Upload, Users, UserCheck } from "lucide-react";
import api from "../../utils/api";
import usePeriodeFilter from "../../hooks/usePeriodeFilter";

const formatWaktu = (date) => {
  if (!date) return "Baru saja";
  const d = new Date(date);
  if (isNaN(d.getTime())) return "Baru saja";
  const now = new Date();
  const diff = Math.floor((now - d) / 1000);
  if (diff < 60) return "Baru saja";
  if (diff < 3600) return `${Math.floor(diff / 60)} menit lalu`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} jam lalu`;
  return `${Math.floor(diff / 86400)} hari lalu`;
};

const getStatusBadge = (status) => {
  const map = {
    diajukan:          { cls: "bg-yellow-100 text-yellow-800", label: "Diajukan" },
    disetujui_kaprodi: { cls: "bg-green-100 text-green-800",   label: "Disetujui" },
    ditolak:           { cls: "bg-red-100 text-red-800",       label: "Ditolak" },
    revisi:            { cls: "bg-orange-100 text-orange-800", label: "Revisi" },
    diarsipkan:        { cls: "bg-blue-100 text-blue-800",     label: "Diarsipkan" },
    diupload:          { cls: "bg-yellow-100 text-yellow-800", label: "Diupload" },
    diverifikasi:      { cls: "bg-green-100 text-green-800",   label: "Terverifikasi" },
    disetujui_dospem:  { cls: "bg-green-100 text-green-800",   label: "Terverifikasi" },
  };
  return map[status] || { cls: "bg-gray-100 text-gray-800", label: status };
};

export default function StaffDashboard() {
  const [stats, setStats] = useState({
    total_pengajuan: 0,
    total_mahasiswa: 0,
    total_dosen: 0,
  });
  const [aktivitas, setAktivitas] = useState([]);
  const [loading, setLoading]   = useState(true);
  const navigate = useNavigate();

 const { periodeId } = usePeriodeFilter('staff_akademik');

  useEffect(() => { fetchData(); }, [periodeId]);

  const fetchData = async () => {
    try {
      const params = periodeId ? { periode_id: periodeId } : {};
      const [statsRes, aktivitasRes] = await Promise.all([
        api.get("/staff/dashboard-stats", { params }),
        api.get("/staff/aktivitas-terbaru", { params }),
      ]);
      setStats(statsRes.data.data || {});
      setAktivitas(aktivitasRes.data.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (loading)
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-800">Dashboard Staff Akademik</h1>
        <p className="text-sm text-gray-500">Selamat datang kembali</p>
      </div>

      {/* Stat Cards — Total Pengajuan, Total Mahasiswa, Total Dosen */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:max-w-3xl">
        <div
          onClick={() => navigate("/staff/pengajuan")}
          className="bg-blue-500 rounded-2xl p-5 text-white shadow-md cursor-pointer hover:bg-blue-600 active:scale-95 transition-all"
        >
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium opacity-90">Total Pengajuan</p>
            <FileText className="w-5 h-5 opacity-70" />
          </div>
          <p className="text-4xl font-bold">{stats.total_pengajuan}</p>
        </div>

        <div
          onClick={() => navigate("/staff/mahasiswa")}
          className="bg-emerald-500 rounded-2xl p-5 text-white shadow-md cursor-pointer hover:bg-emerald-600 active:scale-95 transition-all"
        >
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium opacity-90">Total Mahasiswa</p>
            <Users className="w-5 h-5 opacity-70" />
          </div>
          <p className="text-4xl font-bold">{stats.total_mahasiswa}</p>
        </div>

        <div
          onClick={() => navigate("/staff/dosen")}
          className="bg-orange-500 rounded-2xl p-5 text-white shadow-md cursor-pointer hover:bg-orange-600 active:scale-95 transition-all"
        >
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium opacity-90">Total Pembimbing MBKM</p>
            <UserCheck className="w-5 h-5 opacity-70" />
          </div>
          <p className="text-4xl font-bold">{stats.total_dosen}</p>
        </div>
      </div>

      {/* Aktivitas Terbaru */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="font-bold text-gray-800">Aktivitas Terbaru</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Pengajuan & dokumen terbaru dari mahasiswa
          </p>
        </div>
        <div className="divide-y divide-gray-50">
          {aktivitas.length === 0 ? (
            <div className="py-10 text-center text-gray-400 text-sm">
              <Clock className="w-8 h-8 mx-auto mb-2 text-gray-200" />
              Belum ada aktivitas terbaru
            </div>
          ) : (
            aktivitas.map((a, i) => {
              const { cls, label } = getStatusBadge(a.status);
              return (
                <div
                  key={i}
                  className="px-6 py-3.5 flex items-center gap-3 hover:bg-gray-50 cursor-pointer"
                  onClick={() => navigate("/staff/pengajuan")}
                >
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0
                    ${a.tipe === "pengajuan" ? "bg-blue-100" : "bg-red-100"}`}>
                    {a.tipe === "pengajuan"
                      ? <BookOpen className="w-4 h-4 text-blue-600" />
                      : <Upload className="w-4 h-4 text-red-500" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800">
                      {a.nama_mahasiswa}
                      <span className="font-normal text-gray-500"> · {a.nim}</span>
                    </p>
                    <p className="text-xs text-gray-500 truncate mt-0.5">
                      {a.tipe === "pengajuan" ? "📋 Pengajuan: " : "📎 Dokumen: "}
                      {a.deskripsi}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    <span className="text-xs text-gray-400">{formatWaktu(a.created_at)}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cls}`}>{label}</span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}