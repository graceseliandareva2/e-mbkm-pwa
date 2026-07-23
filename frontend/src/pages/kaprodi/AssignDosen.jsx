import { useEffect, useState } from "react";
import {
  Search,
  UserCheck,
  X,
  Check,
  GraduationCap,
  BookOpen,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import api from "../../utils/api";
import toast from "react-hot-toast";
import usePeriodeFilter from "../../hooks/usePeriodeFilter";

function JudulCapstone({ pelatihan = [] }) {
  const [expanded, setExpanded] = useState(false);

  if (pelatihan.length === 0) {
    return <span className="text-gray-400 italic text-xs">-</span>;
  }

  if (pelatihan.length === 1) {
    return (
      <p className="text-sm text-gray-600 leading-relaxed">{pelatihan[0]}</p>
    );
  }

  return (
    <div className="space-y-0">
      {(expanded ? pelatihan : pelatihan.slice(0, 1)).map((judul, idx, arr) => (
        <div key={idx}>
          <p className="text-sm text-gray-700 leading-relaxed py-2">{judul}</p>
          {idx < arr.length - 1 && <div className="border-t border-gray-200" />}
        </div>
      ))}
      {!expanded && (
        <div className="border-t border-gray-200">
          <button
            onClick={() => setExpanded(true)}
            className="flex items-center gap-1 text-xs text-blue-500 hover:text-blue-700 font-medium pt-2"
          >
            <ChevronDown className="w-3 h-3" />+{pelatihan.length - 1} pelatihan
            lainnya
          </button>
        </div>
      )}
      {expanded && (
        <div className="border-t border-gray-200">
          <button
            onClick={() => setExpanded(false)}
            className="flex items-center gap-1 text-xs text-blue-500 hover:text-blue-700 font-medium pt-2"
          >
            <ChevronUp className="w-3 h-3" />
            Sembunyikan
          </button>
        </div>
      )}
    </div>
  );
}

export default function KaprodiAssignDosen() {
  const [pengajuanList, setPengajuanList] = useState([]);
  // PERUBAHAN: dosen sekarang berisi roster MBKM periode terpilih (bukan
  // seluruh master dosen), diambil dari GET /kaprodi/dosen-roster-mbkm.
  // Setiap baris punya bentuk { roster_id, dosen_id, id_dosen, nama, ... }
  // -- yang dipakai buat assign adalah `dosen_id` (id master dosen), karena
  // itu yang divalidasi & disimpan backend ke bimbingan.dosen_id.
  const [dosen, setDosen] = useState([]);
  const [dosenLoading, setDosenLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 10;

  const [showAssign, setShowAssign] = useState(null);
  const [selectedDosen, setSelectedDosen] = useState("");
  const [assigning, setAssigning] = useState(false);

  const {
    periodeId: selectedPeriode,
    periodeList: periode,
    setLocalPeriode,
  } = usePeriodeFilter('kaprodi');

  useEffect(() => {
    if (selectedPeriode) {
      fetchPengajuan();
      fetchDosenRoster(selectedPeriode);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPeriode]);

  // PERUBAHAN: dulu dosen di-fetch sekali dari /kaprodi/dosen (master list)
  // di fetchAll(). Sekarang di-fetch ulang tiap ganti periode dari roster
  // MBKM periode itu -- supaya dropdown assign cuma nampilin dosen yang
  // memang tersedia di periode yang sedang dikerjakan kaprodi.
  const fetchDosenRoster = async (periodeId) => {
    setDosenLoading(true);
    try {
      const res = await api.get("/kaprodi/dosen-roster-mbkm", {
        params: { periode_id: periodeId },
      });
      setDosen(res.data.data || []);
    } catch {
      toast.error("Gagal memuat roster dosen MBKM!");
      setDosen([]);
    } finally {
      setDosenLoading(false);
    }
  };

  const fetchPengajuan = async () => {
    setLoading(true);
    try {
      const res = await api.get("/kaprodi/pengajuan-disetujui", {
        params: { periode_id: selectedPeriode, _t: Date.now() },
      });
      setPengajuanList(res.data.data || []);
    } catch {
      toast.error("Gagal memuat data pengajuan!");
    } finally {
      setLoading(false);
    }
  };

  const handleAssign = async () => {
    if (!selectedDosen || !showAssign) {
      toast.error("Pilih dosen terlebih dahulu!");
      return;
    }
    setAssigning(true);
    try {
      await api.post("/kaprodi/assign-dosen", {
        mahasiswa_id: showAssign.mahasiswa_id,
        dosen_id: selectedDosen,
        periode_id: showAssign.periode_id || selectedPeriode,
      });
      toast.success("Dosen pembimbing berhasil di-assign!");
      setShowAssign(null);
      setSelectedDosen("");
      fetchPengajuan();
    } catch (err) {
      toast.error(err.response?.data?.message || "Gagal assign dosen!");
    } finally {
      setAssigning(false);
    }
  };

  const filtered = pengajuanList.filter(
    (p) =>
      p.nama?.toLowerCase().includes(search.toLowerCase()) ||
      p.nim?.toLowerCase().includes(search.toLowerCase()) ||
      (p.pelatihan || []).some((judul) =>
        judul.toLowerCase().includes(search.toLowerCase()),
      ),
  );
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">
          Assign Dosen Pembimbing
        </h1>
        <p className="text-gray-500 text-sm mt-1">
          Penugasan dosen pembimbing untuk mahasiswa yang pengajuannya telah
          disetujui
        </p>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setCurrentPage(1);
            }}
            placeholder="Cari nama, NIM, atau judul pelatihan..."
            className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
          />
        </div>
        <select
          value={selectedPeriode}
          onChange={(e) => {
            setLocalPeriode(periode.find(p => String(p.id) === String(e.target.value)));
            setCurrentPage(1);
          }}
          className="px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
        >
          {periode.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nama_periode}
            </option>
          ))}
        </select>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-bold text-gray-800">Pengajuan Disetujui</h2>
          <span className="text-sm text-gray-400">
            {filtered.length} mahasiswa
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50">
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">
                  No
                </th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">
                  NIM
                </th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">
                  Nama
                </th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">
                  Program Studi
                </th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">
                  Judul Capstone
                </th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">
                  Dosen Pembimbing
                </th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">
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
                    <BookOpen className="w-10 h-10 mx-auto mb-2 text-gray-200" />
                    Belum ada pengajuan yang disetujui
                  </td>
                </tr>
              ) : (
                paginated.map((p, i) => (
                  <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {(currentPage - 1) * PAGE_SIZE + i + 1}
                    </td>
                    <td className="px-6 py-4 text-sm font-mono text-gray-700">
                      {p.nim}
                    </td>
                    <td className="px-6 py-4 text-sm font-medium text-gray-800">
                      {p.nama}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {p.program_studi || "-"}
                    </td>
                    <td className="px-6 py-4 max-w-[260px]">
                      <JudulCapstone pelatihan={p.pelatihan || []} />
                    </td>
                    <td className="px-6 py-4 text-sm">
                      {p.nama_dosen ? (
                        <span className="flex items-center gap-1.5 text-green-700">
                          <UserCheck className="w-3.5 h-3.5 flex-shrink-0" />
                          <span className="line-clamp-1">{p.nama_dosen}</span>
                        </span>
                      ) : (
                        <span className="text-gray-400 italic text-xs">
                          Belum di-assign
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <button
                        onClick={() => {
                          setShowAssign(p);
                          setSelectedDosen(p.dosen_id || "");
                        }}
                        className="text-xs bg-blue-50 text-blue-700 hover:bg-blue-100 px-3 py-1.5 rounded-lg font-medium transition-colors whitespace-nowrap"
                      >
                        {p.nama_dosen ? "Ganti Dosen" : "Assign Dosen"}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {!loading && totalPages > 1 && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 px-6 py-3 flex items-center justify-between">
          <span className="text-sm text-gray-500">
            Menampilkan {(currentPage - 1) * PAGE_SIZE + 1}–
            {Math.min(currentPage * PAGE_SIZE, filtered.length)} dari{" "}
            {filtered.length} pengajuan
          </span>
          <div className="flex items-center gap-1">
            {(() => {
              const GROUP = 5;
              const groupIndex = Math.floor((currentPage - 1) / GROUP);
              const groupStart = groupIndex * GROUP + 1;
              const groupEnd = Math.min(groupStart + GROUP - 1, totalPages);
              return (
                <>
                  <button
                    onClick={() => setCurrentPage(groupStart - GROUP)}
                    disabled={groupStart === 1}
                    className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    ‹ Prev
                  </button>
                  {Array.from(
                    { length: groupEnd - groupStart + 1 },
                    (_, i) => groupStart + i,
                  ).map((page) => (
                    <button
                      key={page}
                      onClick={() => setCurrentPage(page)}
                      className={`px-3 py-1.5 text-sm rounded-lg border font-medium transition-colors ${
                        page === currentPage
                          ? "bg-blue-600 text-white border-blue-600"
                          : "border-gray-200 text-gray-600 hover:bg-gray-50"
                      }`}
                    >
                      {page}
                    </button>
                  ))}
                  <button
                    onClick={() => setCurrentPage(groupStart + GROUP)}
                    disabled={groupEnd === totalPages}
                    className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Next ›
                  </button>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* Modal Assign Dosen */}
      {showAssign && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <UserCheck className="w-5 h-5 text-blue-600" />
                <h2 className="font-bold text-gray-800">
                  Assign Dosen Pembimbing
                </h2>
              </div>
              <button
                onClick={() => {
                  setShowAssign(null);
                  setSelectedDosen("");
                }}
                className="p-2 hover:bg-gray-100 rounded-xl"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-blue-50 rounded-xl p-4 space-y-1.5">
                <div className="flex items-center gap-2">
                  <GraduationCap className="w-4 h-4 text-blue-600 flex-shrink-0" />
                  <p className="font-semibold text-gray-800 text-sm">
                    {showAssign.nama}
                  </p>
                </div>
                <p className="text-xs text-blue-600 font-mono ml-6">
                  {showAssign.nim}
                </p>
                {showAssign.program_studi && (
                  <p className="text-xs text-gray-500 ml-6">
                    {showAssign.program_studi}
                  </p>
                )}
                {(showAssign.pelatihan || []).length > 0 && (
                  <div className="ml-6 mt-2 space-y-1">
                    <div className="flex items-center gap-1.5 mb-1">
                      <BookOpen className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                      <span className="text-xs text-gray-500 font-medium">
                        Pelatihan:
                      </span>
                    </div>
                    {showAssign.pelatihan.map((judul, idx) => (
                      <p
                        key={idx}
                        className="text-xs text-gray-600 italic leading-relaxed ml-5"
                      >
                        {judul}
                      </p>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1.5">
                  Pilih Dosen Pembimbing <span className="text-red-500">*</span>
                </label>
                {/* PERUBAHAN: dropdown ini sekarang cuma menampilkan dosen
                    yang ada di roster_dosen_mbkm untuk periode terpilih --
                    bukan seluruh master dosen. Kalau roster kosong, tampil
                    pesan supaya kaprodi tahu perlu minta staff mengisi
                    roster dulu di halaman Pembimbing MBKM. */}
                <select
                  value={selectedDosen}
                  onChange={(e) => setSelectedDosen(e.target.value)}
                  disabled={dosenLoading}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 disabled:opacity-60"
                >
                  <option value="">
                    {dosenLoading ? "Memuat roster dosen..." : "-- Pilih Dosen --"}
                  </option>
                  {dosen.map((d) => (
                    <option key={d.dosen_id} value={d.dosen_id}>
                      {d.nama} ({d.id_dosen})
                    </option>
                  ))}
                </select>
                {!dosenLoading && dosen.length === 0 && (
                  <p className="text-xs text-amber-600 mt-1.5">
                    Belum ada dosen di roster MBKM untuk periode ini. Minta staff akademik menambahkannya lewat halaman Pembimbing MBKM.
                  </p>
                )}
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => {
                    setShowAssign(null);
                    setSelectedDosen("");
                  }}
                  className="flex-1 py-2.5 border border-gray-200 text-gray-600 rounded-xl text-sm font-semibold hover:bg-gray-50"
                >
                  Batal
                </button>
                <button
                  onClick={handleAssign}
                  disabled={assigning}
                  className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  <Check className="w-4 h-4" />
                  {assigning ? "Menyimpan..." : "Simpan"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}