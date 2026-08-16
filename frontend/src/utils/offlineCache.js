import useAuthStore from '../store/authStore'

const PREFIX = 'cache_'

function currentUserId() {
  const user = useAuthStore.getState().user
  return user?.id ?? user?.email ?? 'anon'
}

function scopedKey(key) {
  return `${PREFIX}${currentUserId()}_${key}`
}

export function setCache(key, data) {
  try {
    localStorage.setItem(scopedKey(key), JSON.stringify(data))
  } catch (err) {
    console.warn('[offlineCache] Gagal menyimpan cache untuk', key, err)
  }
}

export function getCache(key, defaultValue = null) {
  try {
    const raw = localStorage.getItem(scopedKey(key))
    if (raw === null) return defaultValue
    return JSON.parse(raw)
  } catch {
    return defaultValue
  }
}

export function clearCache(key) {
  try {
    localStorage.removeItem(scopedKey(key))
  } catch { /* ignore */ }
}

export function clearAllCache() {
  try {
    const ownPrefix = `${PREFIX}${currentUserId()}_`
    const keys = Object.keys(localStorage).filter(k => k.startsWith(ownPrefix))
    keys.forEach(k => localStorage.removeItem(k))
  } catch { /* ignore */ }
}