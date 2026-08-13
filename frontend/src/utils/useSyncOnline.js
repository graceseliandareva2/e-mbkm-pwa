import { useEffect, useRef } from 'react'
import { syncQueue } from './offlineQueue'
import api from './api'
import toast from 'react-hot-toast'

export const useSyncOnline = (onSyncDone) => {
  const callbackRef = useRef(onSyncDone)

  useEffect(() => {
    callbackRef.current = onSyncDone
  }, [onSyncDone])

  useEffect(() => {
    const runSync = async () => {
      try {
        const count = await syncQueue(api)

        if (count > 0) {
          toast.success(
            `✅ ${count} data offline berhasil tersinkronisasi!`
          )

          if (callbackRef.current) {
            callbackRef.current()
          }
        }
      } catch (err) {
        console.error(
          '[useSyncOnline] Error saat sync:',
          err
        )
      }
    }

    // 1. Langsung coba sync saat hook pertama kali aktif
    if (navigator.onLine) {
      runSync()
    }

    // 2. Coba sync ketika koneksi kembali
    window.addEventListener('online', runSync)

    // 3. Coba sync ketika aplikasi kembali aktif dari background
    const handleVisibilityChange = () => {
      if (
        document.visibilityState === 'visible' &&
        navigator.onLine
      ) {
        runSync()
      }
    }

    document.addEventListener(
      'visibilitychange',
      handleVisibilityChange
    )

    return () => {
      window.removeEventListener('online', runSync)

      document.removeEventListener(
        'visibilitychange',
        handleVisibilityChange
      )
    }
  }, [])
}