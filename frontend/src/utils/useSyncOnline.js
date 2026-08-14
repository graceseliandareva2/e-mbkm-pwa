import { useEffect, useRef } from 'react'
import { syncQueue } from './offlineQueue'
import api from './api'
import toast from 'react-hot-toast'

export const useSyncOnline = (onSyncDone) => {
  // Simpan referensi terbaru ke onSyncDone tanpa memicu re-register listener
  const callbackRef = useRef(onSyncDone)
  useEffect(() => { callbackRef.current = onSyncDone }, [onSyncDone])

  useEffect(() => {
    let cancelled = false

    const attemptSync = async () => {
      if (!navigator.onLine) return
      try {
        const count = await syncQueue(api)
        if (cancelled) return
        if (count > 0) {
          toast.success(`✅ ${count} data offline berhasil tersinkronisasi!`)
          if (callbackRef.current) callbackRef.current()
        }
      } catch (err) {
        console.error('[useSyncOnline] Error saat sync:', err)
      }
    }

    // 1) Coba sync begitu hook ini mount. Ini yang selama ini bolong:
    //    kalau app dibuka ulang pas udah online (misal ditutup saat offline,
    //    dibuka lagi nanti), event 'online' ga akan pernah nembak karena
    //    ga ada transisi offline->online yang kedetect browser.
    attemptSync()

    // 2) Event 'online' bawaan browser -- tetap dipasang, ini yang bikin
    //    berhasil di desktop (tab-nya selalu aktif jadi event-nya reliable).
    window.addEventListener('online', attemptSync)

    // 3) Di Android, kalau PWA di-background/di-suspend pas koneksi balik,
    //    event 'online' sering ga fired karena JS-nya lagi di-throttle OS.
    //    visibilitychange nembak begitu app di-foreground lagi -- re-check di situ.
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') attemptSync()
    }
    document.addEventListener('visibilitychange', handleVisibility)

    // 4) Jaring pengaman terakhir: cek berkala. syncQueue sendiri no-op
    //    kalau antrian kosong, jadi ini murah.
    const interval = setInterval(attemptSync, 30000)

    return () => {
      cancelled = true
      window.removeEventListener('online', attemptSync)
      document.removeEventListener('visibilitychange', handleVisibility)
      clearInterval(interval)
    }
  }, [])
}