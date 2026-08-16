import { useEffect, useRef } from 'react'
import { syncQueue } from './offlineQueue'
import api from './api'
import toast from 'react-hot-toast'

export const useSyncOnline = (onSyncDone) => {
  const callbackRef = useRef(onSyncDone)
  useEffect(() => { callbackRef.current = onSyncDone }, [onSyncDone])

  useEffect(() => {
    let cancelled = false
    const isSyncingRef = { current: false } 

    const attemptSync = async () => {
      if (!navigator.onLine) return
      if (isSyncingRef.current) {
        console.log('[useSyncOnline] Sync sedang berjalan, skip pemanggilan ini')
        return
      }

      isSyncingRef.current = true
      try {
        const count = await syncQueue(api)
        if (cancelled) return
        if (count > 0) {
          toast.success(` ${count} data offline berhasil tersinkronisasi!`)
          if (callbackRef.current) callbackRef.current()
        }
      } catch (err) {
        console.error('[useSyncOnline] Error saat sync:', err)
      } finally {
        isSyncingRef.current = false
      }
    }

    attemptSync()

    window.addEventListener('online', attemptSync)

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') attemptSync()
    }
    document.addEventListener('visibilitychange', handleVisibility)

    const interval = setInterval(attemptSync, 30000)

    return () => {
      cancelled = true
      window.removeEventListener('online', attemptSync)
      document.removeEventListener('visibilitychange', handleVisibility)
      clearInterval(interval)
    }
  }, [])
}