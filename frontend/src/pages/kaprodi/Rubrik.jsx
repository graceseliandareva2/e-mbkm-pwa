import { useState, useEffect } from "react";
import { Save, Percent, AlertTriangle, CheckCircle2, Plus, Trash2, X } from "lucide-react";
import api from "../../utils/api";
import toast from "react-hot-toast";

function KonfirmasiHapusModal({ aspek, onCancel, onConfirm, deleting }) {
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl">
        <div className="p-5 space-y-4">
          <div className="w-12 h-12 bg-red-50 rounded-2xl flex items-center justify-center">
            <Trash2 className="w-6 h-6 text-red-500" />
          </div>
          <div>
            <h3 className="font-bold text-gray-800">Hapus Aspek Rubrik?</h3>
            <p className="text-sm text-gray-500 mt-1.5 leading-relaxed">
              Aspek <span className="font-semibold text-gray-700">"{aspek}"</span> akan dinonaktifkan.
              Riwayat nilai yang sudah pernah diisi tetap aman, tapi kamu perlu sesuaikan lagi total
              bobot aspek lain ke 100% setelah ini.
            </p>
          </div>
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onCancel}
              disabled={deleting}
              className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={deleting}
              className="flex-1 py-2.5 rounded-xl bg-red-500 text-white text-sm font-semibold hover:bg-red-600 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {deleting && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
              {deleting ? "Menghapus..." : "Ya, Hapus"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function TambahAspekForm({ onCancel, onSubmit, submitting }) {
  const [aspek, setAspek] = useState("");
  const [kodeCpl, setKodeCpl] = useState("");
  const [deskripsi, setDeskripsi] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!aspek.trim()) return toast.error("Nama aspek wajib diisi.");
    onSubmit({ aspek: aspek.trim(), kode_cpl: kodeCpl.trim() || null, deskripsi: deskripsi.trim() || null });
  };

  return (
    <form onSubmit={handleSubmit} className="p-4 sm:p-5 bg-blue-50/50 border-b border-gray-100 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-gray-700">Tambah Aspek Baru</p>
        <button type="button" onClick={onCancel} className="p-1 rounded-lg hover:bg-gray-100">
          <X className="w-4 h-4 text-gray-400" />
        </button>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <input
          type="text"
          placeholder="Nama aspek (wajib)"
          value={aspek}
          onChange={(e) => setAspek(e.target.value)}
          className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <input
          type="text"
          placeholder="Kode CPL (opsional)"
          value={kodeCpl}
          onChange={(e) => setKodeCpl(e.target.value)}
          className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>
      <textarea
        placeholder="Deskripsi (opsional)"
        value={deskripsi}
        onChange={(e) => setDeskripsi(e.target.value)}
        rows={2}
        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
      />
      <p className="text-xs text-gray-400">
        Aspek baru otomatis dibuat dengan bobot 0%. Atur bobotnya lewat input persen setelah muncul di daftar, lalu Simpan Semua.
      </p>
      <button
        type="submit"
        disabled={submitting}
        className="px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
      >
        {submitting && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
        Tambah Aspek
      </button>
    </form>
  );
}

export default function KaprodiRubrik() {
  const [rubrikList, setRubrikList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [bobot, setBobot] = useState({});
  const [saving, setSaving] = useState(false);
  const [showTambah, setShowTambah] = useState(false);
  const [tambahSubmitting, setTambahSubmitting] = useState(false);
  const [hapusTarget, setHapusTarget] = useState(null); // { id_rubrik, aspek }
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    fetchRubrik();
  }, []);

  const fetchRubrik = async () => {
    setLoading(true);
    try {
      const res = await api.get("/kaprodi/rubrik");
      // hanya tampilkan yang aktif di halaman kelola bobot
      const data = (res.data.data || []).filter((r) => !!r.is_active);
      setRubrikList(data);
      const initialBobot = {};
      data.forEach((r) => {
  initialBobot[r.id_rubrik] = String(parseFloat(r.bobot)); // jadi "15"
});
      setBobot(initialBobot);
    } catch (err) {
      console.error(err);
      toast.error("Gagal memuat rubrik penilaian.");
    } finally {
      setLoading(false);
    }
  };

  const totalBobot = rubrikList.reduce((sum, r) => {
    const v = parseFloat(bobot[r.id_rubrik]);
    return sum + (isNaN(v) ? 0 : v);
  }, 0);

  const totalValid = Math.abs(totalBobot - 100) < 0.01;

  const adaPerubahan = rubrikList.some(
  (r) => bobot[r.id_rubrik] !== String(parseFloat(r.bobot))
);

  const handleChange = (id, value) => {
    setBobot({ ...bobot, [id]: value });
  };

  const handleSimpanSemua = async () => {
    for (const r of rubrikList) {
      const v = parseFloat(bobot[r.id_rubrik]);
      if (isNaN(v) || v < 0 || v > 100) {
        return toast.error(`Bobot "${r.aspek}" harus angka 0-100.`);
      }
    }
    if (!totalValid) {
      return toast.error(`Total bobot harus 100%. Saat ini ${totalBobot.toFixed(2)}%.`);
    }

    setSaving(true);
    try {
      await api.put("/kaprodi/rubrik-bulk", {
        rubrik: rubrikList.map((r) => ({
          id_rubrik: r.id_rubrik,
          bobot: parseFloat(bobot[r.id_rubrik]),
        })),
      });
      toast.success("Semua bobot rubrik berhasil disimpan.");
      fetchRubrik();
    } catch (err) {
      toast.error(err.response?.data?.message || "Gagal menyimpan bobot.");
    } finally {
      setSaving(false);
    }
  };

  const handleTambahAspek = async (payload) => {
    setTambahSubmitting(true);
    try {
      const urutanBaru = rubrikList.length
        ? Math.max(...rubrikList.map((r) => r.urutan || 0)) + 1
        : 1;
      await api.post("/kaprodi/rubrik", {
        field_key: `aspek_${Date.now()}`, // slug internal, auto-generate biar unik
        aspek: payload.aspek,
        kode_cpl: payload.kode_cpl,
        deskripsi: payload.deskripsi,
        bobot: 0,
        urutan: urutanBaru,
        is_active: true,
      });
      toast.success("Aspek baru ditambahkan dengan bobot 0%. Atur bobotnya lalu Simpan Semua.");
      setShowTambah(false);
      fetchRubrik();
    } catch (err) {
      toast.error(err.response?.data?.message || "Gagal menambah aspek.");
    } finally {
      setTambahSubmitting(false);
    }
  };

  const handleHapus = async () => {
    if (!hapusTarget) return;
    setDeleting(true);
    try {
      await api.patch(`/kaprodi/rubrik/${hapusTarget.id_rubrik}/nonaktifkan`);
      toast.success(`Aspek "${hapusTarget.aspek}" dihapus. Sesuaikan bobot aspek lain ke 100%.`);
      setHapusTarget(null);
      fetchRubrik();
    } catch (err) {
      toast.error(err.response?.data?.message || "Gagal menghapus aspek.");
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Kelola Bobot Rubrik Penilaian</h1>
          <p className="text-sm text-gray-500 mt-1">
            Ubah persen bobot, tambah, atau hapus aspek. Total bobot aktif harus selalu 100%.
          </p>
        </div>
        {!showTambah && (
          <button
            onClick={() => setShowTambah(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-50 text-blue-700 text-sm font-semibold hover:bg-blue-100 transition"
          >
            <Plus className="w-4 h-4" /> Tambah Aspek
          </button>
        )}
      </div>

      <div
        className={`flex items-center gap-3 rounded-2xl px-4 py-3.5 border ${
          totalValid ? "bg-green-50 border-green-100" : "bg-orange-50 border-orange-100"
        }`}
      >
        <div
          className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
            totalValid ? "bg-green-100" : "bg-orange-100"
          }`}
        >
          {totalValid ? (
            <CheckCircle2 className="w-4 h-4 text-green-600" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-orange-500" />
          )}
        </div>
        <div>
          <p className={`text-sm font-semibold ${totalValid ? "text-green-700" : "text-orange-700"}`}>
            Total Bobot: {totalBobot.toFixed(2)}%
          </p>
          {!totalValid && (
            <p className="text-xs text-orange-500 mt-0.5">
              Belum 100%. Simpan Semua baru bisa dipakai kalau totalnya sudah pas.
            </p>
          )}
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {showTambah && (
          <TambahAspekForm
            onCancel={() => setShowTambah(false)}
            onSubmit={handleTambahAspek}
            submitting={tambahSubmitting}
          />
        )}

        <div className="divide-y divide-gray-50">
          {rubrikList.length === 0 ? (
            <div className="p-6 text-center text-sm text-gray-500">
              Belum ada aspek rubrik. Klik "Tambah Aspek" untuk mulai.
            </div>
          ) : (
            rubrikList.map((r, idx) => (
              <div key={r.id_rubrik} className="p-4 sm:p-5 flex items-center gap-4">
                <span className="w-6 h-6 bg-blue-100 text-blue-700 rounded-lg text-xs font-bold flex items-center justify-center flex-shrink-0">
                  {idx + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-800 text-sm">{r.aspek}</p>
                  {r.kode_cpl && <p className="text-xs text-gray-400">{r.kode_cpl}</p>}
                  {r.deskripsi && <p className="text-xs text-gray-500 mt-0.5">{r.deskripsi}</p>}
                </div>
                <div className="relative w-24 flex-shrink-0">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.5"
                    value={bobot[r.id_rubrik] ?? ""}
                    onChange={(e) => handleChange(r.id_rubrik, e.target.value)}
                    className="w-full border border-gray-200 rounded-xl pl-3 pr-7 py-2 text-sm text-center font-semibold text-gray-800 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  />
                  <Percent className="w-3.5 h-3.5 text-gray-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
                <button
                  onClick={() => setHapusTarget({ id_rubrik: r.id_rubrik, aspek: r.aspek })}
                  className="p-2 rounded-xl hover:bg-red-50 text-red-400 hover:text-red-600 transition flex-shrink-0"
                  title="Hapus aspek ini"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))
          )}
        </div>

        {rubrikList.length > 0 && (
          <div className="px-5 py-4 bg-gray-50 border-t border-gray-100">
            <button
              onClick={handleSimpanSemua}
              disabled={!adaPerubahan || !totalValid || saving}
              className="w-full py-3 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {saving ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              Simpan Semua
            </button>
          </div>
        )}
      </div>

      {hapusTarget && (
        <KonfirmasiHapusModal
          aspek={hapusTarget.aspek}
          deleting={deleting}
          onCancel={() => setHapusTarget(null)}
          onConfirm={handleHapus}
        />
      )}
    </div>
  );
}