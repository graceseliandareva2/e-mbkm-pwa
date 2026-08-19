import { useEffect, useState } from "react";
import {
  Search,
  Eye,
  FileText,
  X,
  Download,
  FileSpreadsheet,
  ChevronDown,
} from "lucide-react";
import api from "../../utils/api";
import toast from "react-hot-toast";
import usePeriodeFilter from "../../hooks/usePeriodeFilter";

const BASE_URL = import.meta.env.VITE_API_URL || "";

const getStatusBadge = (status) => {
  const map = {
    diajukan: { cls: "bg-yellow-100 text-yellow-800", label: "Diajukan" },
    disetujui_kaprodi: {
      cls: "bg-green-100 text-green-800",
      label: "Disetujui",
    },
    ditolak: { cls: "bg-red-100 text-red-800", label: "Ditolak" },
    revisi: { cls: "bg-orange-100 text-orange-800", label: "Revisi" },
  };
  return map[status] || { cls: "bg-gray-100 text-gray-600", label: status };
};

const sanitizeFilename = (name) =>
  (name || "")
    .replace(/[\\/]/g, "-")     
    .replace(/[:*?"<>|]/g, "")   
    .trim();

export default function StaffPengajuan() {
  const [pengajuan, setPengajuan] = useState([]);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [showDetail, setShowDetail] = useState(null);
  const [detailData, setDetailData] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);

  const {
    periodeId: selectedPeriode,
    periodeList: periode,
    setLocalPeriode,
  } = usePeriodeFilter('staff_akademik');

  useEffect(() => {
    const handler = () => setShowExportMenu(false);
    if (showExportMenu) window.addEventListener("click", handler);
    return () => window.removeEventListener("click", handler);
  }, [showExportMenu]);

  useEffect(() => {
  if (selectedPeriode) {
    fetchPengajuan();
  } else {
    setLoading(false);
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [selectedPeriode, filterStatus]);

  const fetchPengajuan = async () => {
    setLoading(true);
    try {
      const params = {};
      if (selectedPeriode) params.periode_id = selectedPeriode;
      if (filterStatus) params.status = filterStatus;
      const res = await api.get("/staff/pengajuan", { params });
      setPengajuan(res.data.data || []);
    } catch {
      setPengajuan([]);
    } finally {
      setLoading(false);
    }
  };

  const openDetail = async (p) => {
    setShowDetail(p);
    setDetailData(null);
    setLoadingDetail(true);
    try {
      const res = await api.get(`/staff/pengajuan/${p.id}`);
      setDetailData(res.data.data);
    } catch {
      toast.error("Gagal memuat detail!");
    } finally {
      setLoadingDetail(false);
    }
  };

  const closeDetail = () => {
    setShowDetail(null);
    setDetailData(null);
  };

  const getToken = () => localStorage.getItem("token") || "";

  const downloadWithAuth = async (url, filename) => {
    try {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) throw new Error("Export gagal");
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
      toast.error("Gagal mengekspor data!");
    }
  };

  const exportAll = (format) => {
    if (!selectedPeriode) return toast.error("Pilih periode terlebih dahulu");
    const ext = format === "excel" ? "xlsx" : "pdf";
    const periodeObj = periode.find(
      (p) => String(p.id) === String(selectedPeriode),
    );
    const namaPeriode = sanitizeFilename(periodeObj?.nama_periode || "periode");
    downloadWithAuth(
      `${BASE_URL}/staff/pengajuan/export-${format}?periode_id=${selectedPeriode}`,
      `Daftar pengajuan - ${namaPeriode}.${ext}`,
    );
    setShowExportMenu(false);
  };

  const exportSingle = (mahasiswaId, nama, nim, format) => {
    const ext = format === "excel" ? "xlsx" : "pdf";
    const namaFile = `${sanitizeFilename(nama)} - ${sanitizeFilename(nim)}`;
    downloadWithAuth(
      `${BASE_URL}/staff/pengajuan/export-${format}?mahasiswa_id=${mahasiswaId}&periode_id=${selectedPeriode}`,
      `${namaFile}.${ext}`,
    );
  };

  const filtered = pengajuan.filter(
    (p) =>
      p.nama?.toLowerCase().includes(search.toLowerCase()) ||
      p.nim?.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-800">Pengajuan MBKM</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Periksa data & dokumen mahasiswa
        </p>
      </div>
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari nama atau NIM..."
            className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
          />
        </div>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
        >
          <option value="">Semua Status</option>
          <option value="diajukan">Diajukan</option>
          <option value="disetujui_kaprodi">Disetujui</option>
          <option value="ditolak">Ditolak</option>
        </select>
        <select
          value={selectedPeriode ?? ""}
          onChange={(e) =>
            setLocalPeriode(periode.find(p => String(p.id) === String(e.target.value)))
          }
          className="px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
        >
          {periode.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nama_periode}
            </option>
          ))}
        </select>

        <div className="relative" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => setShowExportMenu((v) => !v)}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 rounded-xl text-sm font-medium transition-colors whitespace-nowrap"
          >
            <Download className="w-4 h-4" />
            Export
            <ChevronDown
              className={`w-3.5 h-3.5 transition-transform ${showExportMenu ? "rotate-180" : ""}`}
            />
          </button>
          {showExportMenu && (
            <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-20 min-w-[160px] overflow-hidden">
              <button
                onClick={() => exportAll("excel")}
                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <FileSpreadsheet className="w-4 h-4 text-green-600" />
                Export Excel
              </button>
              <button
                onClick={() => exportAll("pdf")}
                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <FileText className="w-4 h-4 text-red-500" />
                Export PDF
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-bold text-gray-800">Daftar Pengajuan</h2>
          <span className="text-sm text-gray-400">
            {filtered.length} pengajuan
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">
                  No
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">
                  Mahasiswa
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">
                  Program Studi
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">
                  Dosen Pembimbing
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">
                  Periode
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">
                  Status
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">
                  Aksi
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="text-center py-12">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mx-auto" />
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="text-center py-12 text-gray-400 text-sm"
                  >
                    <FileText className="w-10 h-10 mx-auto mb-2 text-gray-200" />
                    Belum ada pengajuan
                  </td>
                </tr>
              ) : (
                filtered.map((p, i) => {
                  const { cls, label } = getStatusBadge(p.status);
                  return (
                    <tr
                      key={p.id}
                      className="hover:bg-gray-50 transition-colors"
                    >
                      <td className="px-4 py-4 text-sm text-gray-500">
                        {i + 1}
                      </td>
                      <td className="px-4 py-4">
                        <p className="text-sm font-medium text-gray-800">
                          {p.nama}
                        </p>
                        <p className="text-xs text-gray-400">{p.nim}</p>
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-600">
                        {p.program_studi}
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-600">
                        {p.nama_dosen || "-"}
                      </td>
                      <td className="px-4 py-4 text-xs text-gray-500">
                        {p.nama_periode}
                      </td>
                      <td className="px-4 py-4">
                        <span
                          className={`px-2.5 py-1 rounded-full text-xs font-medium ${cls}`}
                        >
                          {label}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <button
                          onClick={() => openDetail(p)}
                          className="flex items-center gap-1.5 text-xs bg-blue-50 text-blue-700 hover:bg-blue-100 px-3 py-1.5 rounded-lg font-medium transition-colors"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          Detail
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showDetail && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeDetail();
          }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[92vh] overflow-y-auto">

            <div className="flex items-center justify-between p-6 border-b border-gray-100 sticky top-0 bg-white z-10">
              <h2 className="font-bold text-gray-800">
                Detail Pengajuan Mahasiswa
              </h2>
              <button
                onClick={closeDetail}
                className="p-2 hover:bg-gray-100 rounded-xl"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="p-6 space-y-4">

              <div className="bg-blue-50 rounded-xl p-4 space-y-2.5">
                {[
                  ["Mahasiswa", showDetail.nama],
                  ["NIM", showDetail.nim],
                  ["Program Studi", showDetail.program_studi],
                  ["Dosen Pembimbing", showDetail.nama_dosen || "-"],
                  ["Periode", showDetail.nama_periode],
                ].map(([label, val]) => (
                  <div key={label} className="flex justify-between gap-4">
                    <span className="text-xs text-gray-500 flex-shrink-0">
                      {label}
                    </span>
                    <span className="text-xs font-semibold text-gray-700 text-right">
                      {val}
                    </span>
                  </div>
                ))}
                <div className="flex justify-between gap-4">
                  <span className="text-xs text-gray-500 flex-shrink-0">
                    Status
                  </span>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full font-medium ${getStatusBadge(showDetail.status).cls}`}
                  >
                    {getStatusBadge(showDetail.status).label}
                  </span>
                </div>
              </div>

              {loadingDetail ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
                </div>
              ) : (
                detailData && (
                  <>

                    {detailData.pelatihan &&
                      detailData.pelatihan.length > 0 && (
                        <div className="space-y-2">
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                            Judul Pelatihan
                          </p>
                          {detailData.pelatihan.map((pt, idx) => (
                            <div
                              key={idx}
                              className="bg-gray-50 rounded-xl p-3.5 border border-gray-100 flex items-start justify-between gap-3"
                            >
                              <div className="flex items-start gap-2 flex-1 min-w-0">
                                <span className="text-xs font-bold text-gray-400 mt-0.5 flex-shrink-0">
                                  {idx + 1}.
                                </span>
                                <p className="text-sm font-medium text-gray-800 leading-snug break-words">
                                  {pt.nama_pelatihan || "-"}
                                </p>
                              </div>
                              <span
                                className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${getStatusBadge(pt.status).cls}`}
                              >
                                {getStatusBadge(pt.status).label}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}

                    <div className="pt-1">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                        Export Data Mahasiswa Ini
                      </p>
                      <div className="flex gap-2">
                        <button
                          onClick={() =>
                            exportSingle(
                              showDetail.mahasiswa_id,
                              showDetail.nama,
                              showDetail.nim,
                              "excel",
                            )
                          }
                          className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 rounded-xl text-xs font-semibold transition-colors"
                        >
                          <FileSpreadsheet className="w-3.5 h-3.5" />
                          Excel
                        </button>
                        <button
                          onClick={() =>
                            exportSingle(
                              showDetail.mahasiswa_id,
                              showDetail.nama,
                              showDetail.nim,
                              "pdf",
                            )
                          }
                          className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 rounded-xl text-xs font-semibold transition-colors"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          PDF
                        </button>
                      </div>
                    </div>
                  </>
                )
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}