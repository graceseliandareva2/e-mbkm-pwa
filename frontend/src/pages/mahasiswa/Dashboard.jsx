import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  BookOpen,
  CalendarClock,
  ArrowRight,
  GraduationCap,
  FileText,
} from "lucide-react";
import api from "../../utils/api";

const STATUS_CONFIG = {
  menunggu: {
    label: "Menunggu Persetujuan",
    color: "text-yellow-700",
    bg: "bg-yellow-50",
    border: "border-yellow-200",
    dot: "bg-yellow-400",
    icon: Clock,
  },
  diajukan: {
    label: "Menunggu Persetujuan",
    color: "text-yellow-700",
    bg: "bg-yellow-50",
    border: "border-yellow-200",
    dot: "bg-yellow-400",
    icon: Clock,
  },
  disetujui_kaprodi: {
    label: "Disetujui",
    color: "text-green-700",
    bg: "bg-green-50",
    border: "border-green-200",
    dot: "bg-green-500",
    icon: CheckCircle,
  },
  ditolak: {
    label: "Ditolak",
    color: "text-red-700",
    bg: "bg-red-50",
    border: "border-red-200",
    dot: "bg-red-500",
    icon: XCircle,
  },
  revisi: {
    label: "Perlu Revisi",
    color: "text-purple-700",
    bg: "bg-purple-50",
    border: "border-purple-200",
    dot: "bg-purple-500",
    icon: AlertCircle,
  },
};

const formatDurasi = (menit) => {
  const totalMenit = Math.round(Number(menit) || 0);
  const j = Math.floor(totalMenit / 60);
  const m = totalMenit % 60;
  if (m === 0) return `${j} jam`;
  if (j === 0) return `${m} menit`;
  return `${j} jam ${m} menit`;
};

export default function MahasiswaDashboard() {
  const navigate = useNavigate();
  const [pengajuan, setPengajuan] = useState(null);
  const [logbookStats, setLogbookStats] = useState({ count: 0, totalMenit: 0 });
  const [periode, setPeriode] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [pRes, lRes, periodeRes] = await Promise.all([
        api.get("/mahasiswa/pengajuan").catch(() => ({ data: null })),
        api.get("/mahasiswa/logbook").catch(() => ({ data: { data: [] } })),
        api
          .get("/mahasiswa/periode-aktif")
          .catch(() => ({ data: { data: [] } })),
      ]);

      setPengajuan(pRes.data);

      const logbooks = Array.isArray(lRes.data?.data) ? lRes.data.data : [];
      const totalMenit = logbooks.reduce(
        (sum, l) => sum + (Number(l.durasi_menit) || 0),
        0,
      );
      setLogbookStats({ count: logbooks.length, totalMenit });

      const periodeList = periodeRes.data?.data || [];
      setPeriode(periodeList[0] || null);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const statusCfg = pengajuan
    ? STATUS_CONFIG[pengajuan.status] || STATUS_CONFIG.menunggu
    : null;
  const StatusIcon = statusCfg?.icon;

  const formatDeadline = (dateStr) => {
    if (!dateStr) return null;
    return new Date(dateStr).toLocaleDateString("id-ID", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  };

  const now = new Date();
  const todayMidnight = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  );

  const deadlines = periode
    ? [
        {
          label: "Pengajuan",
          mulai: periode.tanggal_mulai_pengajuan
            ? new Date(periode.tanggal_mulai_pengajuan)
            : null,
          selesai: periode.tanggal_selesai_pengajuan
            ? new Date(periode.tanggal_selesai_pengajuan)
            : null,
        },
        {
          label: "Logbook",
          mulai: periode.tanggal_mulai_logbook
            ? new Date(periode.tanggal_mulai_logbook)
            : null,
          selesai: periode.tanggal_selesai_logbook
            ? new Date(periode.tanggal_selesai_logbook)
            : null,
        },
        {
          label: "Laporan Akhir",
          mulai: null, 
          selesai: periode.tanggal_selesai_laporan
            ? new Date(periode.tanggal_selesai_laporan)
            : null,
        },
      ].filter((d) => d.selesai)
    : [];

  const TARGET_MENIT = 30 * 60;
  const logbookPct = Math.min(
    (logbookStats.totalMenit / TARGET_MENIT) * 100,
    100,
  );
  const sisaMenit = Math.max(0, TARGET_MENIT - logbookStats.totalMenit);

  if (loading)
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );

  const needsAction =
    pengajuan?.status === "ditolak" || pengajuan?.status === "revisi";

  return (
    <div className="space-y-4">
      {deadlines.length > 0 ? (
        <div className="relative overflow-hidden bg-gradient-to-br from-blue-700 via-blue-600 to-blue-500 rounded-2xl shadow-sm text-white">
          <div className="absolute -top-6 -right-6 w-32 h-32 rounded-full bg-white/5" />
          <div className="absolute -bottom-8 -right-2 w-48 h-48 rounded-full bg-white/5" />

          <div className="relative flex items-center justify-between px-5 pt-4 pb-3 border-b border-white/10">
            <div className="flex items-center gap-2">
              <CalendarClock className="w-3.5 h-3.5 text-blue-100" />
              <p className="text-xs font-semibold text-blue-100 uppercase tracking-wide">
                Periode Aktif
              </p>
            </div>
            {periode && (
              <span className="text-xs font-bold text-white">
                {periode.nama_periode}{" "}
                {periode.jenis && (
                  <span className="text-blue-100 font-semibold">
                    · {periode.jenis}
                  </span>
                )}
              </span>
            )}
          </div>

          <div className="relative px-5 py-4 flex flex-col sm:flex-row divide-y sm:divide-y-0 sm:divide-x divide-white/10">
            {deadlines.map((d, i) => {
              const mulaiMidnight = d.mulai
                ? new Date(
                    d.mulai.getFullYear(),
                    d.mulai.getMonth(),
                    d.mulai.getDate(),
                  )
                : null;
              const selesaiMidnight = new Date(
                d.selesai.getFullYear(),
                d.selesai.getMonth(),
                d.selesai.getDate(),
              );

              const belumMulai = mulaiMidnight && todayMidnight < mulaiMidnight;
              const isLewat = todayMidnight > selesaiMidnight;
              const sisa = Math.ceil(
                (selesaiMidnight - todayMidnight) / (1000 * 60 * 60 * 24),
              );
              const isUrgent = !belumMulai && !isLewat && sisa <= 7;

              let badge;
              if (belumMulai) {
                badge = (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-xs font-medium text-gray-500 bg-gray-50 border-gray-200">
                    <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />{" "}
                    Belum mulai
                  </span>
                );
              } else if (isLewat) {
                badge = (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-xs font-medium text-red-700 bg-red-50 border-red-200">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500" />{" "}
                    Lewat
                  </span>
                );
              } else if (sisa === 0) {
                badge = (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-xs font-medium text-yellow-700 bg-yellow-50 border-yellow-200">
                    <span className="w-1.5 h-1.5 rounded-full bg-yellow-400" />{" "}
                    Hari ini
                  </span>
                );
              } else if (isUrgent) {
                badge = (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-xs font-medium text-yellow-700 bg-yellow-50 border-yellow-200">
                    <span className="w-1.5 h-1.5 rounded-full bg-yellow-400" />{" "}
                    {sisa} hari lagi
                  </span>
                );
              } else {
                badge = (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-xs font-medium text-green-700 bg-green-50 border-green-200">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500" />{" "}
                    Berjalan
                  </span>
                );
              }

              return (
                <div
                  key={i}
                  className="flex-1 py-2.5 sm:py-0 sm:px-5 first:sm:pl-0 last:sm:pr-0"
                >
                  <div className="flex items-center justify-between sm:flex-col sm:items-start sm:gap-1.5">
                    <p className="text-sm text-white font-medium">{d.label}</p>
                    {badge}
                  </div>
                  <p className="text-xs text-blue-100 mt-0.5">
                    {d.mulai ? `${formatDeadline(d.mulai)} — ` : ""}
                    {formatDeadline(d.selesai)}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm flex flex-col items-center justify-center px-5 py-8 text-center gap-1">
          <CalendarClock className="w-6 h-6 text-gray-200 mb-1" />
          <p className="text-sm font-medium text-gray-400">
            Tidak ada periode aktif
          </p>
        </div>
      )}

      <div
        className={`grid grid-cols-1 gap-4 ${pengajuan?.status === "disetujui_kaprodi" ? "sm:grid-cols-2" : ""}`}
      >
        {/* Status Pengajuan */}
        <div
          onClick={() => navigate("/mahasiswa/pengajuan")}
          className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer group flex flex-col"
        >
          <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-gray-50">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
              Status Pengajuan
            </p>
            <ArrowRight className="w-3.5 h-3.5 text-gray-300 group-hover:text-blue-500 group-hover:translate-x-0.5 transition-all" />
          </div>

          <div className="px-5 py-4 flex flex-col gap-3 flex-1">
            {pengajuan ? (
              <>
                <div
                  className={`self-start inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-xs font-medium
                  ${statusCfg.color} ${statusCfg.bg} ${statusCfg.border}`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${statusCfg.dot}`}
                  />
                  {statusCfg.label}
                </div>

                <div className="pt-2.5 border-t border-gray-50">
                  <p className="text-sm text-gray-400 mb-0.5">
                    Dosen Pembimbing
                  </p>
                  {pengajuan.nama_dosen ? (
                    <p className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
                      <GraduationCap className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
                      {pengajuan.nama_dosen}
                    </p>
                  ) : (
                    <p className="text-xs text-gray-400">Belum ditentukan</p>
                  )}
                </div>

                {pengajuan.catatan_kaprodi && (
                  <div className="p-2.5 bg-purple-50 rounded-xl border border-purple-100">
                    <p className="text-xs font-semibold text-purple-500 mb-0.5">
                      Catatan Kaprodi
                    </p>
                    <p className="text-xs text-purple-800 leading-relaxed line-clamp-2">
                      {pengajuan.catatan_kaprodi}
                    </p>
                  </div>
                )}

                {needsAction && (
                  <p className="text-xs text-blue-500 font-semibold mt-auto">
                    Klik untuk edit dan ajukan ulang →
                  </p>
                )}
              </>
            ) : (
              <div className="flex flex-col gap-2 flex-1">
                <div
                  className="self-start inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-xs font-medium
                  text-gray-500 bg-gray-50 border-gray-200"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
                  Belum diajukan
                </div>
                <p className="text-xs text-blue-500 font-semibold mt-auto">
                  Ajukan sekarang →
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Progres Logbook */}
        {pengajuan?.status === "disetujui_kaprodi" && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm flex flex-col">
            <div className="flex items-center gap-2 px-5 pt-4 pb-3 border-b border-gray-50">
              <BookOpen className="w-3.5 h-3.5 text-gray-400" />
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                Progres Logbook
              </p>
            </div>
            <div className="px-5 py-4 flex flex-col gap-4 flex-1">
              {/* Jam + bar */}
              <div>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-2xl font-bold text-gray-800">
                    {formatDurasi(logbookStats.totalMenit)}
                  </span>
                  <span className="text-sm text-gray-400">/ 30 jam</span>
                </div>
                <div className="flex items-center gap-2 mt-1.5">
                  <div className="flex-1 bg-gray-100 rounded-full h-1.5">
                    <div
                      className={`h-1.5 rounded-full transition-all duration-500 ${logbookStats.totalMenit >= TARGET_MENIT ? "bg-green-500" : "bg-blue-500"}`}
                      style={{ width: `${logbookPct}%` }}
                    />
                  </div>
                  <span className="text-xs font-semibold text-blue-500 flex-shrink-0">
                    {Math.round(logbookPct)}%
                  </span>
                </div>
              </div>
              {/* Entri */}
              <div className="flex items-center gap-2.5 pt-1 border-t border-gray-50">
                <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0">
                  <FileText className="w-4 h-4 text-blue-500" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-700">
                    {logbookStats.count} entri
                  </p>
                  <p className="text-xs text-gray-400">Tercatat</p>
                </div>
              </div>
              {/* Status + Tombol */}
              <div className="flex items-center justify-between pt-1 border-t border-gray-50 mt-auto">
                <div className="flex items-center gap-2">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${logbookStats.totalMenit >= TARGET_MENIT ? "bg-green-50" : "bg-orange-50"}`}
                  >
                    {logbookStats.totalMenit >= TARGET_MENIT ? (
                      <CheckCircle className="w-4 h-4 text-green-500" />
                    ) : (
                      <Clock className="w-4 h-4 text-orange-500" />
                    )}
                  </div>
                  <div>
                    {logbookStats.totalMenit >= TARGET_MENIT ? (
                      <p className="text-xs font-semibold text-green-600">
                        Target tercapai
                      </p>
                    ) : (
                      <p className="text-xs font-semibold text-orange-500">
                        Belum memenuhi target
                      </p>
                    )}
                    <p className="text-xs text-gray-400">
                      Sisa {formatDurasi(sisaMenit)}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => navigate("/mahasiswa/logbook")}
                  className="flex items-center gap-1.5 px-3 py-1.5 border-2 border-blue-200 text-blue-600 text-xs font-semibold rounded-xl hover:bg-blue-50 transition-colors whitespace-nowrap"
                >
                  Lihat <ArrowRight className="w-3 h-3" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
