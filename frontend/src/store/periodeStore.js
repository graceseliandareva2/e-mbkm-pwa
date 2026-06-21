import { create } from 'zustand'
import { persist } from 'zustand/middleware'

const usePeriodeStore = create(
  persist(
    (set, get) => ({
      // ── dosen ──
      selectedPeriode: null,
      setSelectedPeriode: (periode) => set({ selectedPeriode: periode }),
      clearPeriode: () => set({ selectedPeriode: null }),

      // ── kaprodi ──
      selectedPeriodeKaprodi: null,
      setSelectedPeriodeKaprodi: (periode) => set({ selectedPeriodeKaprodi: periode }),
      clearPeriodeKaprodi: () => set({ selectedPeriodeKaprodi: null }),

      getDosenPeriodeId: () => {
        const { selectedPeriode } = get()
        return selectedPeriode?.id ?? null
      },

      getKaprodiPeriodeId: () => {
        const { selectedPeriodeKaprodi } = get()
        return selectedPeriodeKaprodi?.id ?? null
      },
    }),
    {
      name: 'periode-store',
    }
  )
)

export default usePeriodeStore