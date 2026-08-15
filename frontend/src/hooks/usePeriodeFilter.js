import { useEffect, useState, useRef, useCallback } from "react";
import usePeriodeStore from "../store/periodeStore";
import useAuthStore from "../store/authStore";
import api from "../utils/api";

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
  staff_akademik: {                         
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

    if (!globalPeriode) {
      const aktif = list.find(p => p.is_active) ?? list[0] ?? null;
      if (aktif) setGlobalPeriode(aktif);
    } else if (!list.some(p => p.id === globalPeriode.id)) {
      const aktif = list.find(p => p.is_active) ?? list[0] ?? null;
      setGlobalPeriode(aktif);
    }
  } catch (err) {
    console.error(`usePeriodeFilter(${resolvedRole}) GAGAL fetch dari ${cfg.endpoint}:`, err);
  } finally {
    if (!cancelled) setLoading(false);
  }
};
    resolve();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedRole]);

 
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