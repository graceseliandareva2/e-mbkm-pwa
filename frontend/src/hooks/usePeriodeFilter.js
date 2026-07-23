import { useEffect, useState, useRef, useCallback } from "react";
import usePeriodeStore from "../store/periodeStore";
import useAuthStore from "../store/authStore";
import api from "../utils/api";

// Satu sumber konfigurasi per role -- endpoint periode & field store yang dipakai.
// Nambah role baru = nambah satu entri di sini, nggak perlu duplikat logic.
const ROLE_CONFIG = {
  dosen_pembimbing: {
    endpoint: "/dosen/periode",
    get: (s) => s.selectedPeriode,
    set: (s) => s.setSelectedPeriode,
  },
  kaprodi: {
    endpoint: "/kaprodi/periode",
    get: (s) => s.selectedPeriodeKaprodi,
    set: (s) => s.setSelectedPeriodeKaprodi,
  },
  staff_akademik: {                         // BARU
    endpoint: "/staff/periode",
    get: (s) => s.selectedPeriodeStaff,
    set: (s) => s.setSelectedPeriodeStaff,
  },
};

export default function usePeriodeFilter(role) {
  const { user } = useAuthStore();
  const resolvedRole = role ?? user?.role;
  const cfg = ROLE_CONFIG[resolvedRole];

  const globalPeriode    = usePeriodeStore(cfg ? cfg.get : () => null);
  const setGlobalPeriode = usePeriodeStore(cfg ? cfg.set : () => () => {});

  const [periodeList, setPeriodeList] = useState([]);
  const [loading, setLoading] = useState(true);

  // Override lokal per-halaman -- begitu diisi, menang dari global sampai
  // komponen yang manggil hook ini di-unmount (pindah halaman = reset).
  const overrideRef = useRef(null);
  const [, bump] = useState(0);

  useEffect(() => {
    let cancelled = false;
    if (!cfg) { setLoading(false); return; }

    const resolve = async () => {
      setLoading(true);
      try {
        const res = await api.get(cfg.endpoint);
        const list = res.data.data || [];
        if (cancelled) return;
        setPeriodeList(list);

        // Auto-init global CUMA kalau global masih kosong -- jangan
        // pernah menimpa pilihan yang sudah ada (baik dari user maupun
        // dari inisialisasi halaman lain sebelumnya).
        if (!globalPeriode) {
          const aktif = list.find(p => p.is_active) ?? list[0] ?? null;
          if (aktif) setGlobalPeriode(aktif);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    resolve();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedRole]);

  // Dipanggil dari dropdown LOKAL di halaman (bukan dari PeriodeSelector global)
  const setLocalPeriode = useCallback((periodeObj) => {
    overrideRef.current = periodeObj;
    bump(n => n + 1);
  }, []);

  const active = overrideRef.current ?? globalPeriode ?? null;

  return {
    periodeId: active?.id ?? null,
    activePeriode: active,
    periodeList,
    loading,
    setLocalPeriode,   
  };
}