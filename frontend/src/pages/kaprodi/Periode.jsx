import { useEffect, useState } from "react";
import {
  Plus,
  Edit,
  ToggleLeft,
  ToggleRight,
  Calendar,
  X,
  Save,
} from "lucide-react";
import api from "../../utils/api";
import toast from "react-hot-toast";
import { formatTanggal } from "../../utils/helpers";

const defaultForm = {
  nama_periode: "",
  jenis: "capstone",
  tanggal_mulai: "",
  tanggal_selesai: "",
  min_jam_pengajuan: 0,
  tanggal_mulai_pengajuan: "",
  tanggal_selesai_pengajuan: "",
  tanggal_mulai_logbook: "",
  tanggal_selesai_logbook: "",
  tanggal_mulai_ppt: "",
  tanggal_selesai_ppt: "",
  tanggal_mulai_laporan: "",
  tanggal_selesai_laporan: "",
  form_pengajuan_buka: 1,
  form_logbook_buka: 1,
  form_ppt_buka: 1,
  form_laporan_buka: 1,
  is_active: 1,
};

const toInputDate = (val) => {
  if (!val) return "";
  const d = new Date(val);
  if (isNaN(d.getTime())) return "";

  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

export default function KaprodiPeriode() {
  const [periode, setPeriode] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editData, setEditData] = useState(null);
  const [form, setForm] = useState(defaultForm);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchPeriode();
  }, []);

  const fetchPeriode = async () => {
    try {
      const res = await api.get("/kaprodi/periode");
      setPeriode(res.data.data || []);
    } catch {
      toast.error("Gagal memuat data periode!");
    } finally {
      setLoading(false);
    }
  };

  const openAdd = () => {
    setEditData(null);
    setForm(defaultForm);
    setShowModal(true);
  };

  const openEdit = (p) => {
    setEditData(p);
    setForm({
      nama_periode: p.nama_periode,
      jenis: p.jenis,
      tanggal_mulai: toInputDate(p.tanggal_mulai),
      tanggal_selesai: toInputDate(p.tanggal_selesai),
      min_jam_pengajuan: p.min_jam_pengajuan ?? 0,
      tanggal_mulai_pengajuan: toInputDate(p.tanggal_mulai_pengajuan),
      tanggal_selesai_pengajuan: toInputDate(p.tanggal_selesai_pengajuan),
      tanggal_mulai_logbook: toInputDate(p.tanggal_mulai_logbook),
      tanggal_selesai_logbook: toInputDate(p.tanggal_selesai_logbook),
      tanggal_mulai_ppt: toInputDate(p.tanggal_mulai_ppt),
      tanggal_selesai_ppt: toInputDate(p.tanggal_selesai_ppt),
      tanggal_mulai_laporan: toInputDate(p.tanggal_mulai_laporan),
      tanggal_selesai_laporan: toInputDate(p.tanggal_selesai_laporan),
      form_pengajuan_buka: p.form_pengajuan_buka,
      form_logbook_buka: p.form_logbook_buka,
      form_ppt_buka: p.form_ppt_buka ?? 1,
      form_laporan_buka: p.form_laporan_buka ?? 1,
      is_active: p.is_active,
    });
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editData) {
        await api.put(`/kaprodi/periode/${editData.id}`, form);
        toast.success("Periode berhasil diupdate!");
      } else {
        await api.post("/kaprodi/periode", form);
        toast.success("Periode berhasil ditambahkan!");
      }
      setShowModal(false);
      fetchPeriode();
    } catch (err) {
      toast.error(err.response?.data?.message || "Gagal menyimpan periode!");
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (p, field) => {
    try {
      await api.patch(`/kaprodi/periode/${p.id}/toggle-form`, {
        form_pengajuan_buka:
          field === "pengajuan"
            ? p.form_pengajuan_buka
              ? 0
              : 1
            : p.form_pengajuan_buka,
        form_logbook_buka:
          field === "logbook"
            ? p.form_logbook_buka
              ? 0
              : 1
            : p.form_logbook_buka,
        form_ppt_buka:
          field === "ppt"
            ? (p.form_ppt_buka ?? 1)
              ? 0
              : 1
            : (p.form_ppt_buka ?? 1),
        form_laporan_buka:
          field === "laporan"
            ? (p.form_laporan_buka ?? 1)
              ? 0
              : 1
            : (p.form_laporan_buka ?? 1),
      });
      toast.success("Status form berhasil diubah!");
      fetchPeriode();
    } catch (err) {
      toast.error(err.response?.data?.message || "Gagal mengubah status!");
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Kelola Periode</h1>
          <p className="text-gray-500 text-sm mt-1">
            Atur periode pengajuan capstone dan MBKM
          </p>
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors shadow-md"
        >
          <Plus className="w-4 h-4" />
          Tambah Periode
        </button>
      </div>

      <div className="space-y-4">
        {periode.length === 0 ? (
          <div className="bg-white rounded-2xl p-12 text-center border border-gray-100">
            <Calendar className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-400 font-medium">Belum ada periode</p>
          </div>
        ) : (
          periode.map((p) => (
            <div
              key={p.id}
              className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-bold text-gray-800">
                      {p.nama_periode}
                    </h3>
                    <span className="text-xs px-2.5 py-0.5 rounded-full font-medium bg-blue-50 text-blue-700">
                      Capstone
                    </span>
                    <span
                      className={`text-xs px-2.5 py-0.5 rounded-full font-medium capitalize
                    ${p.is_active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}
                    >
                      {p.is_active ? "Aktif" : "Nonaktif"}
                    </span>
                  </div>

                  {(p.tanggal_mulai || p.tanggal_selesai) && (
                    <p className="text-xs text-gray-400 mt-1">
                      {p.tanggal_mulai ? formatTanggal(p.tanggal_mulai) : "-"}
                      {" s/d "}
                      {p.tanggal_selesai
                        ? formatTanggal(p.tanggal_selesai)
                        : "-"}
                    </p>
                  )}

                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-4">
                    {[
                      {
                        label: "Mulai Pengajuan",
                        val: p.tanggal_mulai_pengajuan,
                      },
                      {
                        label: "Selesai Pengajuan",
                        val: p.tanggal_selesai_pengajuan,
                      },
                      {
                        label: "Selesai Logbook",
                        val: p.tanggal_selesai_logbook,
                      },
                      {
                        label: "Selesai Laporan",
                        val: p.tanggal_selesai_laporan,
                      },
                    ].map(({ label, val }) => (
                      <div key={label} className="bg-gray-50 rounded-xl p-2.5">
                        <p className="text-xs text-gray-400">{label}</p>
                        <p className="text-xs font-semibold text-gray-700 mt-0.5">
                          {val ? formatTanggal(val) : "-"}
                        </p>
                      </div>
                    ))}
                    <div className="bg-gray-50 rounded-xl p-2.5">
                      <p className="text-xs text-gray-400">
                        Min. Jam Pelatihan
                      </p>
                      <p className="text-xs font-semibold text-gray-700 mt-0.5">
                        {p.min_jam_pengajuan ?? 0} jam
                      </p>
                    </div>
                  </div>

                  {/* Toggle Form */}
                  <div className="flex items-center gap-3 mt-4 flex-wrap">
                    {[
                      {
                        field: "pengajuan",
                        label: "Form Pengajuan",
                        val: p.form_pengajuan_buka,
                      },
                      {
                        field: "logbook",
                        label: "Form Logbook",
                        val: p.form_logbook_buka,
                      },
                      {
                        field: "ppt",
                        label: "Form PPT",
                        val: p.form_ppt_buka ?? 1,
                      },
                      {
                        field: "laporan",
                        label: "Form Laporan",
                        val: p.form_laporan_buka ?? 1,
                      },
                    ].map(({ field, label, val }) => (
                      <div key={field} className="flex items-center gap-2">
                        <span className="text-xs text-gray-500 font-medium">
                          {label}:
                        </span>
                        <button
                          onClick={() => handleToggle(p, field)}
                          className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all
                          ${val ? "bg-green-100 text-green-700 hover:bg-green-200" : "bg-red-100 text-red-700 hover:bg-red-200"}`}
                        >
                          {val ? (
                            <ToggleRight className="w-3.5 h-3.5" />
                          ) : (
                            <ToggleLeft className="w-3.5 h-3.5" />
                          )}
                          {val ? "Buka" : "Tutup"}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                <button
                  onClick={() => openEdit(p)}
                  className="p-2 text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-xl transition-colors flex-shrink-0"
                >
                  <Edit className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Modal Tambah/Edit */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <h2 className="font-bold text-gray-800 text-lg">
                {editData ? "Edit Periode" : "Tambah Periode Baru"}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="p-2 hover:bg-gray-100 rounded-xl transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="text-xs font-semibold text-gray-600 block mb-1.5">
                    Nama Periode
                  </label>
                  <input
                    type="text"
                    value={form.nama_periode}
                    onChange={(e) =>
                      setForm({ ...form, nama_periode: e.target.value })
                    }
                    placeholder="contoh: 2025/2026 Genap"
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
                    required
                  />
                </div>
               <div>
  <label className="text-xs font-semibold text-gray-600 block mb-1.5">Jenis</label>
  <select value={form.jenis} onChange={e => setForm({ ...form, jenis: e.target.value })}
    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50">
    <option value="capstone">Capstone</option>
  </select>
</div>
                <div>
                  <label className="text-xs font-semibold text-gray-600 block mb-1.5">
                    Status
                  </label>
                  <select
                    value={form.is_active}
                    onChange={(e) =>
                      setForm({ ...form, is_active: parseInt(e.target.value) })
                    }
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
                  >
                    <option value={1}>Aktif</option>
                    <option value={0}>Nonaktif</option>
                  </select>
                </div>
              </div>

              <div className="border-t border-gray-100 pt-4">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                  Rentang Periode
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {[
                    { label: "Tanggal Mulai", key: "tanggal_mulai" },
                    { label: "Tanggal Selesai", key: "tanggal_selesai" },
                  ].map(({ label, key }) => (
                    <div key={key}>
                      <label className="text-xs font-medium text-gray-600 block mb-1.5">
                        {label}
                        <span className="text-red-500 ml-0.5">*</span>
                      </label>
                      <input
                        type="date"
                        value={form[key]}
                        required
                        onChange={(e) =>
                          setForm({ ...form, [key]: e.target.value })
                        }
                        className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="border-t border-gray-100 pt-4">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                  Ketentuan Pengajuan
                </p>
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1.5">
                    Minimal Total Jam Pelatihan/Bootcamp
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={form.min_jam_pengajuan}
                    onChange={(e) =>
                      setForm({ ...form, min_jam_pengajuan: e.target.value })
                    }
                    placeholder="0"
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    Total minimal jam pembelajaran yang harus dipenuhi mahasiswa
                    saat mengajukan Capstone/MBKM.
                  </p>
                </div>
              </div>

              <div className="border-t border-gray-100 pt-4">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                  Tanggal Pengajuan
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {[
                    {
                      label: "Mulai Pengajuan",
                      key: "tanggal_mulai_pengajuan",
                    },
                    {
                      label: "Selesai Pengajuan",
                      key: "tanggal_selesai_pengajuan",
                    },
                  ].map(({ label, key }) => (
                    <div key={key}>
                      <label className="text-xs font-medium text-gray-600 block mb-1.5">
                        {label}
                      </label>
                      <input
                        type="date"
                        value={form[key]}
                        onChange={(e) =>
                          setForm({ ...form, [key]: e.target.value })
                        }
                        className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="border-t border-gray-100 pt-4">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                  Deadline Dokumen
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {[
                    { label: "Mulai Logbook", key: "tanggal_mulai_logbook" },
                    {
                      label: "Selesai Logbook",
                      key: "tanggal_selesai_logbook",
                    },
                    { label: "Mulai PPT", key: "tanggal_mulai_ppt" },
                    { label: "Deadline PPT", key: "tanggal_selesai_ppt" },
                    {
                      label: "Mulai Laporan Akhir",
                      key: "tanggal_mulai_laporan",
                    },
                    {
                      label: "Deadline Laporan Akhir",
                      key: "tanggal_selesai_laporan",
                    },
                  ].map(({ label, key }) => (
                    <div key={key}>
                      <label className="text-xs font-medium text-gray-600 block mb-1.5">
                        {label}
                      </label>
                      <input
                        type="date"
                        value={form[key]}
                        onChange={(e) =>
                          setForm({ ...form, [key]: e.target.value })
                        }
                        className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 py-2.5 border border-gray-200 text-gray-600 rounded-xl text-sm font-semibold hover:bg-gray-50 transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  <Save className="w-4 h-4" />
                  {saving ? "Menyimpan..." : "Simpan"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
