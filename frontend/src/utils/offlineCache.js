const PREFIX = 'cache_'
export function setCache(key, data) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(data))
  } catch (err) {

    console.warn('[offlineCache] Gagal menyimpan cache untuk', key, err)
  }
}

export function getCache(key, defaultValue = null) {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    if (raw === null) return defaultValue
    return JSON.parse(raw)
  } catch {
    return defaultValue
  }
}


export function clearCache(key) {
  try {
    localStorage.removeItem(PREFIX + key)
  } catch { /* ignore */ }
}


export function clearAllCache() {
  try {
    const keys = Object.keys(localStorage).filter(k => k.startsWith(PREFIX))
    keys.forEach(k => localStorage.removeItem(k))
  } catch { /* ignore */ }
}