import { useEffect, useRef } from 'react'
import { syncQueue } from './offlineQueue'
import api from './api'
import toast from 'react-hot-toast'

export const useSyncOnline = (onSyncDone) => {
  // Simpan referensi terbaru ke onSyncDone tanpa memicu re-register listener
  const callbackRef = useRef(onSyncDone)
  useEffect(() => { callbackRef.current = onSyncDone }, [onSyncDone])

  useEffect(() => {
    const handleOnline = async () => {
      try {
        const count = await syncQueue(api)
        if (count > 0) {
          toast.success(`✅ ${count} data offline berhasil tersinkronisasi!`)
          if (callbackRef.current) callbackRef.current()
        }
      } catch (err) {
        console.error('[useSyncOnline] Error saat sync:', err)
      }
    }

    window.addEventListener('online', handleOnline)
    return () => window.removeEventListener('online', handleOnline)
  }, []) // ← intentionally empty: listener hanya didaftarkan sekali
}