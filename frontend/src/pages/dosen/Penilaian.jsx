import { useState, useEffect } from "react";
import {
  Award,
  Save,
  CheckCircle,
  FileDown,
  Users,
  ChevronLeft,
  CheckSquare,
  Clock,
  Search,
  X,
  Lock,
  ShieldAlert,
} from "lucide-react";
import api from "../../utils/api";
import toast from "react-hot-toast";
import usePeriodeFilter from '../../hooks/usePeriodeFilter'
import PeriodeDropdown from '../../components/common/PeriodeDropdown'

const formatDurasi = (jam) => {
  const total = Number(jam) || 0;
  const j = Math.floor(total);
  const m = Math.round((total - j) * 60);
  if (m === 0) return `${j} jam`;
  if (j === 0) return `${m} menit`;
  return `${j} jam ${m} menit`;
};

const RUBRIK = [
  {
    no: 1,
    aspek: "Kesesuaian Program dan Topik Pembelajaran",
    kode: "CPL03, CPMK033",
    bobot: 15,
    field: "nilai_kesesuaian",
    deskripsi:
      "Linearitas topik studi independen dengan bidang prodi serta pemenuhan terhadap kebutuhan industri atau penguataan kompetensi profesional",
  },
  {
    no: 2,
    aspek: "Proyek/Karya Tugas Akhir",
    kode: "CPL09, CPMK091, CPMK092",
    bobot: 30,
    field: "nilai_proyek",
    deskripsi:
      "Kualitas hasil proyek akhir selama pelatihan, baik berupa aplikasi, modul, laporan, atau prototipe",
  },
  {
    no: 3,
    aspek: "Evaluasi Pembelajaran Mandiri dan Pemanfaatan",
    kode: "CPL09, CPMK093",
    bobot: 15,
    field: "nilai_evaluasi",
    deskripsi:
      "Refleksi dan penjabaran bagaimana mahasiswa menerapkan ilmu dari bootcamp dalam studi atau dunia kerja nyata",
  },
  {
    no: 4,
    aspek: "Laporan Akhir dan Portofolio",
    kode: "CPL07, CPMK072",
    bobot: 20,
    field: "nilai_laporan",
    deskripsi:
      "Kelengkapan dokumentasi hasil pembelajaran, portofolio proyek, serta refleksi proses pembelajaran selama studi independen",
  },
  {
    no: 5,
    aspek: "Presentasi Refleksi Pembelajaran",
    kode: "CPL06, CPMK063",
    bobot: 20,
    field: "nilai_presentasi",
    deskripsi:
      "Kemampuan menyampaikan capaian pembelajaran, tantangan, serta nilai-nilai yang diperoleh dari studi independen secara lisan",
  },
];

const getGrade = (nilai) => {
  if (nilai >= 85) return { grade: "A", color: "text-green-600 bg-green-50" };
  if (nilai >= 75) return { grade: "B", color: "text-blue-600 bg-blue-50" };
  if (nilai >= 65) return { grade: "C", color: "text-yellow-600 bg-yellow-50" };
  if (nilai >= 55) return { grade: "D", color: "text-orange-600 bg-orange-50" };
  return { grade: "E", color: "text-red-600 bg-red-50" };
};

const inputClass =
  "w-full border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-800 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-center font-semibold disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed";

// ─── Modal konfirmasi kedua sebelum nilai dikunci permanen ─────────────────
// Ini sengaja dibuat modal terpisah (bukan window.confirm) supaya dosen
// benar-benar sadar konsekuensinya: setelah dikunci, nilai tidak bisa
// diedit lagi dan langsung tampil ke dashboard Kaprodi & Staff.
function KonfirmasiKuncModal({ nilaiAkhir, grade, onCancel, onConfirm, locking }) {
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl">
        <div className="p-5 space-y-4">
          <div className="w-12 h-12 bg-orange-50 rounded-2xl flex items-center justify-center">
            <ShieldAlert className="w-6 h-6 text-orange-500" />
          </div>
          <div>
            <h3 className="font-bold text-gray-800">Kunci Nilai Permanen?</h3>
            <p className="text-sm text-gray-500 mt-1.5 leading-relaxed">
              Nilai akhir <span className="font-semibold text-gray-700">{nilaiAkhir.toFixed(1)} ({grade})</span> akan
              dikunci dan <span className="font-semibold text-red-600">tidak bisa diubah lagi</span>. Kaprodi dan
              Staff akan langsung bisa melihat nilai ini di dashboard mereka.
            </p>
          </div>
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onCancel}
              disabled={locking}
              className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={locking}
              className="flex-1 py-2.5 rounded-xl bg-orange-500 text-white text-sm font-semibold hover:bg-orange-600 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {locking && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
              {locking ? "Mengunci..." : "Ya, Kunci Nilai"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function DosenPenilaian() {
  const [view, setView] = useState("list");
  const [mahasiswaList, setMahasiswaList] = useState([]);
  const [selectedMhs, setSelectedMhs] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [saved, setSaved] = useState(false);
  const [search, setSearch] = useState('');
  const [nilai, setNilai] = useState({
    nilai_kesesuaian: "",
    nilai_proyek: "",
    nilai_evaluasi: "",
    nilai_laporan: "",
    nilai_presentasi: "",
    catatan: "",
  });

  // ── State untuk fitur kunci nilai (finalisasi) ──
  const [hasPenilaian, setHasPenilaian] = useState(false); // sudah pernah disimpan sebelumnya?
  const [finalizedAt, setFinalizedAt] = useState(null);    // null = belum dikunci
  const [showLockConfirm, setShowLockConfirm] = useState(false);
  const [locking, setLocking] = useState(false);
  const isLocked = !!finalizedAt;

  const {
    periodeId: selectedPeriode,
    periodeList: periode,
    loading: loadingPeriode,
    setLocalPeriode,
  } = usePeriodeFilter('dosen_pembimbing')

  // Kalau ternyata tidak ada periode, hentikan loading & kosongkan list
  useEffect(() => {
    if (loadingPeriode) return
    if (periode.length === 0) {
      setMahasiswaList([])
      setLoading(false)
    }
  }, [periode, loadingPeriode])

  useEffect(() => {
    if (selectedPeriode) fetchList(selectedPeriode)

  }, [selectedPeriode])

  const fetchList = async (periodeId) => {
    setLoading(true)
    try {
      const params = periodeId ? { periode_id: periodeId } : {}
      const res = await api.get("/dosen/mahasiswa-siap-dinilai", { params })
      setMahasiswaList(res.data.data || [])
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const refetchList = () => fetchList(selectedPeriode)

  const handlePilihMhs = (mhs) => {
    setSelectedMhs(mhs);
    setSaved(false);
    setHasPenilaian(!!mhs.penilaian_id);
    setFinalizedAt(mhs.finalized_at ?? null);
    setNilai({
      nilai_kesesuaian: mhs.nilai_kesesuaian ?? "",
      nilai_proyek:     mhs.nilai_proyek     ?? "",
      nilai_evaluasi:   mhs.nilai_evaluasi   ?? "",
      nilai_laporan:    mhs.nilai_laporan    ?? "",
      nilai_presentasi: mhs.nilai_presentasi ?? "",
      catatan:          mhs.catatan          ?? "",
    });
    setView("form");
  };

  const handleBack = () => {
    setView("list");
    setSelectedMhs(null);
  };

  const nilaiAkhir = RUBRIK.reduce((sum, r) => {
    const val = parseFloat(nilai[r.field]) || 0;
    return sum + (val * r.bobot) / 100;
  }, 0);

  const allFilled = RUBRIK.every(
    (r) => nilai[r.field] !== "" && !isNaN(parseFloat(nilai[r.field])),
  );
  const { grade, color } = getGrade(nilaiAkhir);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isLocked) return; // safety net -- form seharusnya sudah disabled
    if (!allFilled) return toast.error("Semua nilai rubrik wajib diisi!");
    for (const r of RUBRIK) {
      const v = parseFloat(nilai[r.field]);
      if (v < 0 || v > 100)
        return toast.error(`Nilai ${r.aspek} harus antara 0-100!`);
    }
    setSubmitting(true);
    try {
      // FIX: backend (berikanPenilaian di dosenController.js) mewajibkan
      // pengajuan_id di body dan tidak pernah membaca mahasiswa_id/periode_id.
      // Sebelumnya di sini yang dikirim mahasiswa_id & periode_id, jadi
      // pengajuan_id selalu kosong -> backend selalu balas 400 "pengajuan_id
      // wajib diisi". Datanya sudah ada di selectedMhs.pengajuan_id (dikirim
      // oleh endpoint /dosen/mahasiswa-siap-dinilai), tinggal dipakai.
      await api.post("/dosen/penilaian", {
        pengajuan_id: selectedMhs.pengajuan_id,
        ...Object.fromEntries(
          RUBRIK.map((r) => [r.field, parseFloat(nilai[r.field])]),
        ),
        nilai_akhir: nilaiAkhir.toFixed(2),
        catatan: nilai.catatan,
      });
      toast.success("Penilaian berhasil disimpan!");
      setSaved(true);
      setHasPenilaian(true);
      refetchList();
    } catch (err) {
      toast.error(err.response?.data?.message || "Gagal menyimpan penilaian.");
    } finally {
      setSubmitting(false);
    }
  };

  // ── Kunci nilai (finalisasi) -- ini adalah konfirmasi KEDUA setelah
  // dosen klik tombol "Kunci Nilai". Setelah berhasil, backend menolak
  // semua perubahan lebih lanjut (lihat berikanPenilaian di
  // dosenController.js: 403 kalau finalized_at sudah terisi), dan nilai
  // otomatis mulai muncul di dashboard Kaprodi/Staff (query mereka sudah
  // difilter WHERE pn.finalized_at IS NOT NULL).
  const handleLock = async () => {
    setLocking(true);
    try {
      // NOTE: sesuaikan path ini kalau route asli finalisasiNilai di
      // dosenRoutes.js berbeda -- ini asumsi mengikuti pola nama fungsi
      // finalisasiNilai & konvensi POST /dosen/penilaian yang sudah ada.
      await api.post("/dosen/penilaian/finalisasi", {
        pengajuan_id: selectedMhs.pengajuan_id,
      });
      toast.success("Nilai berhasil dikunci dan tidak bisa diubah lagi.");
      setFinalizedAt(new Date().toISOString());
      setShowLockConfirm(false);
      refetchList();
    } catch (err) {
      toast.error(err.response?.data?.message || "Gagal mengunci nilai.");
    } finally {
      setLocking(false);
    }
  };

  const handleEksporSatu = async () => {
    try {
      const res = await api.get(
        `/dosen/penilaian/ekspor?mahasiswa_id=${selectedMhs.id}&periode_id=${selectedMhs.periode_id}`,
        { responseType: "blob" },
      );
      const url = window.URL.createObjectURL(
        new Blob([res.data], { type: "application/pdf" }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = `penilaian_${selectedMhs.nim}.pdf`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch {
      toast.error("Gagal mengunduh PDF.");
    }
  };

  const handleEksporSemua = async () => {
    const periodeId = selectedPeriode || mahasiswaList[0]?.periode_id;
    if (!periodeId) return toast.error("Belum ada data penilaian.");
    try {
      const res = await api.get(
        `/dosen/penilaian/ekspor-semua?periode_id=${periodeId}`,
        { responseType: "blob" },
      );
      const url = window.URL.createObjectURL(
        new Blob([res.data], { type: "application/pdf" }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = `rekap_penilaian_semua.pdf`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch {
      toast.error("Gagal mengunduh PDF.");
    }
  };

  // ── VIEW: DAFTAR MAHASISWA ──
  if (view === "list") {
    const filteredList = mahasiswaList.filter(m =>
      m.nama?.toLowerCase().includes(search.toLowerCase()) ||
      m.nim?.toLowerCase().includes(search.toLowerCase())
    )

    return (
      <div className="space-y-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-xl font-bold text-gray-800">Penilaian Akhir</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Mahasiswa yang dokumennya sudah lengkap dan siap dinilai
            </p>
          </div>
          {mahasiswaList.some((m) => m.penilaian_id) && (
            <button
              onClick={handleEksporSemua}
              className="flex items-center gap-2 px-4 py-2 rounded-xl border border-green-200 text-green-600 text-sm font-semibold hover:bg-green-50 transition"
            >
              <Users className="w-4 h-4" /> Ekspor PDF Semua
            </button>
          )}
        </div>

        {/* Search & Filter Periode */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Cari nama atau NIM..."
              className="w-full pl-9 pr-9 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <PeriodeDropdown
            value={selectedPeriode}
            onChange={(id) => setLocalPeriode(periode.find(p => String(p.id) === String(id)))}
            options={periode}
          />
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filteredList.length === 0 ? (
          <div className="bg-white rounded-2xl p-10 text-center border border-dashed border-gray-200">
            <Award className="w-10 h-10 text-gray-300 mx-auto mb-2" />
            <p className="text-gray-500 font-medium">
              {search
                ? `Tidak ada hasil untuk "${search}"`
                : 'Belum ada mahasiswa yang dokumennya lengkap'}
            </p>
            {!search && (
              <p className="text-xs text-gray-400 mt-1">
                Mahasiswa perlu upload PPT, laporan akhir, dan logbook ≥48 jam yang sudah diverifikasi
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {filteredList.map((mhs) => {
              const mhsLocked = !!mhs.finalized_at;
              return (
                <div
                  key={mhs.id}
                  className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex items-center justify-between gap-4 hover:border-blue-200 transition"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 font-bold text-sm flex items-center justify-center flex-shrink-0">
                      {mhs.nama?.charAt(0)}
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-800 text-sm truncate">
                        {mhs.nama}
                      </p>
                      <p className="text-xs text-gray-400">
                        {mhs.nim} · {mhs.nama_periode}
                      </p>
                      {mhs.judul && (
                        <p className="text-xs text-gray-500 truncate mt-0.5">
                          {mhs.judul}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    <div className="flex items-center gap-1 text-xs text-green-600 bg-green-50 px-2 py-1 rounded-lg">
                      <Clock className="w-3 h-3" />
                      {formatDurasi(mhs.total_jam_logbook)}
                    </div>

                    {mhsLocked ? (
                      <span className="flex items-center gap-1 text-xs text-violet-600 bg-violet-50 px-2 py-1 rounded-lg font-semibold">
                        <Lock className="w-3 h-3" /> Terkunci ({mhs.grade})
                      </span>
                    ) : mhs.penilaian_id ? (
                      <span className="flex items-center gap-1 text-xs text-green-600 bg-green-50 px-2 py-1 rounded-lg font-semibold">
                        <CheckSquare className="w-3 h-3" /> Sudah Dinilai ({mhs.grade})
                      </span>
                    ) : (
                      <span className="text-xs text-orange-500 bg-orange-50 px-2 py-1 rounded-lg font-semibold">
                        Belum Dinilai
                      </span>
                    )}

                    <button
                      onClick={() => handlePilihMhs(mhs)}
                      className="px-4 py-2 bg-blue-600 text-white text-xs font-semibold rounded-xl hover:bg-blue-700 transition"
                    >
                      {mhsLocked ? "Lihat Nilai" : mhs.penilaian_id ? "Edit Nilai" : "Beri Nilai"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ── VIEW: FORM PENILAIAN ──
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <button
            onClick={handleBack}
            className="p-2 rounded-xl hover:bg-gray-100 transition"
          >
            <ChevronLeft className="w-5 h-5 text-gray-600" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-gray-800">Form Penilaian</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {selectedMhs?.nama} · {selectedMhs?.nim}
            </p>
          </div>
        </div>
        {(saved || hasPenilaian) && (
          <button
            onClick={handleEksporSatu}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-blue-200 text-blue-600 text-sm font-semibold hover:bg-blue-50 transition"
          >
            <FileDown className="w-4 h-4" /> Ekspor PDF
          </button>
        )}
      </div>

      {/* Banner nilai terkunci */}
      {isLocked && (
        <div className="flex items-center gap-3 bg-violet-50 border border-violet-100 rounded-2xl px-4 py-3.5">
          <div className="w-9 h-9 bg-violet-100 rounded-xl flex items-center justify-center flex-shrink-0">
            <Lock className="w-4 h-4 text-violet-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-violet-700">Nilai Sudah Dikunci</p>
            <p className="text-xs text-violet-500 mt-0.5">
              Nilai ini sudah difinalisasi dan tidak bisa diubah lagi. Kaprodi dan Staff sudah bisa melihatnya di dashboard mereka.
            </p>
          </div>
        </div>
      )}

      {/* Info mahasiswa */}
      <div className="bg-blue-50 rounded-2xl p-4 border border-blue-100">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div>
            <p className="text-gray-400">Periode</p>
            <p className="font-semibold text-gray-700">{selectedMhs?.nama_periode}</p>
          </div>
          <div>
            <p className="text-gray-400">Total Jam</p>
            <p className="font-semibold text-green-600">
              {formatDurasi(selectedMhs?.total_jam_logbook)}
            </p>
          </div>
          <div>
            <p className="text-gray-400">PPT</p>
            <p className="font-semibold text-green-600">✓ Terverifikasi</p>
          </div>
          <div>
            <p className="text-gray-400">Laporan Akhir</p>
            <p className="font-semibold text-green-600">✓ Terverifikasi</p>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-800">Rubrik Penilaian</h2>
          </div>

          <div className="divide-y divide-gray-50">
            {RUBRIK.map((r) => (
              <div key={r.field} className="p-4 sm:p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="w-6 h-6 bg-blue-100 text-blue-700 rounded-lg text-xs font-bold flex items-center justify-center flex-shrink-0">
                        {r.no}
                      </span>
                      <p className="font-semibold text-gray-800 text-sm">{r.aspek}</p>
                      <span className="text-xs text-gray-400">({r.kode})</span>
                      <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                        Bobot {r.bobot}%
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 ml-8">{r.deskripsi}</p>
                  </div>
                  <div className="w-24 flex-shrink-0">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.5"
                      value={nilai[r.field]}
                      disabled={isLocked}
                      onChange={(e) => {
                        setNilai({ ...nilai, [r.field]: e.target.value });
                        setSaved(false);
                      }}
                      className={inputClass}
                    />
                    <p className="text-xs text-center text-gray-400 mt-1">0 – 100</p>
                  </div>
                </div>
                {nilai[r.field] !== "" && !isNaN(parseFloat(nilai[r.field])) && (
                  <div className="mt-2 ml-8">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-gray-100 rounded-full h-1.5">
                        <div
                          className="bg-blue-400 h-1.5 rounded-full transition-all"
                          style={{ width: `${Math.min(parseFloat(nilai[r.field]), 100)}%` }}
                        />
                      </div>
                      <span className="text-xs text-gray-500 flex-shrink-0">
                        +{((parseFloat(nilai[r.field]) * r.bobot) / 100).toFixed(1)} poin
                      </span>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="px-5 py-4 bg-gray-50 border-t border-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-gray-700">Nilai Akhir</p>
                <p className="text-xs text-gray-400">Akumulasi berbobot seluruh aspek</p>
              </div>
              <div className="flex items-center gap-3">
                <p className="text-3xl font-bold text-gray-800">
                  {allFilled ? nilaiAkhir.toFixed(1) : "—"}
                </p>
                {allFilled && (
                  <span className={`text-lg font-bold px-3 py-1 rounded-xl ${color}`}>
                    {grade}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Catatan (opsional)
          </label>
          <textarea
            value={nilai.catatan}
            disabled={isLocked}
            onChange={(e) => setNilai({ ...nilai, catatan: e.target.value })}
            rows={3}
            className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-blue-500 resize-none disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed"
          />
        </div>

        {!isLocked && (
          <button
            type="submit"
            disabled={submitting || !allFilled}
            className="w-full py-3 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {submitting ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Menyimpan...
              </>
            ) : saved ? (
              <>
                <CheckCircle className="w-4 h-4" /> Penilaian Tersimpan
              </>
            ) : (
              <>
                <Save className="w-4 h-4" /> Simpan Penilaian
              </>
            )}
          </button>
        )}

        {/* Tombol kunci nilai -- hanya muncul kalau nilai sudah pernah
            disimpan dan belum dikunci. Klik ini membuka modal konfirmasi
            kedua (KonfirmasiKuncModal) sebelum benar-benar difinalisasi. */}
        {!isLocked && hasPenilaian && (
          <button
            type="button"
            onClick={() => setShowLockConfirm(true)}
            className="w-full py-3 rounded-xl border-2 border-orange-200 text-orange-600 text-sm font-semibold hover:bg-orange-50 transition flex items-center justify-center gap-2"
          >
            <Lock className="w-4 h-4" /> Kunci Nilai (Tidak Bisa Diubah Lagi)
          </button>
        )}
      </form>

      {showLockConfirm && (
        <KonfirmasiKuncModal
          nilaiAkhir={nilaiAkhir}
          grade={grade}
          locking={locking}
          onCancel={() => setShowLockConfirm(false)}
          onConfirm={handleLock}
        />
      )}
    </div>
  );
}