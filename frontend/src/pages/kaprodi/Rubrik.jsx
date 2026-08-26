import { useState, useEffect } from "react";
import { Save, Percent, AlertTriangle, CheckCircle2 } from "lucide-react";
import api from "../../utils/api";
import toast from "react-hot-toast";

export default function KaprodiRubrik() {
  const [rubrikList, setRubrikList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [bobot, setBobot] = useState({}); // { [id_rubrik]: "20" }
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchRubrik();
  }, []);

  const fetchRubrik = async () => {
    setLoading(true);
    try {
      const res = await api.get("/kaprodi/rubrik");
      const data = res.data.data || [];
      setRubrikList(data);
      const initialBobot = {};
      data.forEach((r) => {
        initialBobot[r.id_rubrik] = String(r.bobot);
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
    (r) => bobot[r.id_rubrik] !== String(r.bobot)
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-800">Kelola Bobot Rubrik Penilaian</h1>
        <p className="text-sm text-gray-500 mt-1">
          Ubah persentase bobot tiap aspek sesuka kamu, lalu klik "Simpan Semua" di akhir. Total harus 100%.
        </p>
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
        <div className="divide-y divide-gray-50">
          {rubrikList.map((r, idx) => (
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
            </div>
          ))}
        </div>

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
      </div>
    </div>
  );
}