import { useEffect, useState } from "react";
import usePeriodeStore from "../store/periodeStore";
import useAuthStore from "../store/authStore";
import api from "../utils/api";

export default function usePeriodeFilter(role) {
  const selectedPeriode           = usePeriodeStore(s => s.selectedPeriode)
  const selectedPeriodeKaprodi    = usePeriodeStore(s => s.selectedPeriodeKaprodi)
  const setSelectedPeriodeKaprodi = usePeriodeStore(s => s.setSelectedPeriodeKaprodi)

  const { user } = useAuthStore();

  const resolvedRole = role ?? user?.role;
  const isDosen  = resolvedRole === "dosen_pembimbing";
  const isKaprodi = resolvedRole === "kaprodi";

  const [resolvedPeriode, setResolvedPeriode] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const resolve = async () => {
      setLoading(true);

      if (isDosen) {
        if (!cancelled) {
          setResolvedPeriode(selectedPeriode ?? null);
          setLoading(false);
        }
        return;
      }

      if (isKaprodi) {
        if (selectedPeriodeKaprodi) {
          if (!cancelled) {
            setResolvedPeriode(selectedPeriodeKaprodi);
            setLoading(false);
          }
          return;
        }

        try {
          const res = await api.get("/kaprodi/periode");
          const list = res.data.data || [];
          const aktif = list.find((p) => p.is_active) ?? list[0] ?? null;

          if (!cancelled) {
            setResolvedPeriode(aktif);
            if (aktif) setSelectedPeriodeKaprodi(aktif);
            setLoading(false);
          }
        } catch {
          if (!cancelled) {
            setResolvedPeriode(null);
            setLoading(false);
          }
        }
        return;
      }

      if (!cancelled) {
        setResolvedPeriode(null);
        setLoading(false);
      }
    };

    resolve();
    return () => {
      cancelled = true;
    };
  }, [isDosen, isKaprodi, selectedPeriode, selectedPeriodeKaprodi]);

  return {
    periodeId: resolvedPeriode?.id ?? null,
    activePeriode: resolvedPeriode,
    loading,
  };
}