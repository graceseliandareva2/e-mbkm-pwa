// utils/offlineCache.js
// Helper ringan untuk menyimpan & membaca cache data riwayat dari localStorage.
// Tujuan: saat offline, halaman tetap bisa menampilkan data terakhir yang dilihat.
//
// Strategi:
//   - Saat fetch sukses  → simpan data ke localStorage (setCache)
//   - Saat komponen mount → langsung load dari localStorage dulu (getCache)
//     sehingga konten muncul instan, kemudian di-replace data terbaru setelah fetch selesai
//   - Saat offline & fetch gagal → tetap pakai data dari localStorage
//
// Keterbatasan yang disengaja:
//   - Hanya menyimpan data JSON (tidak ada binary/file)
//   - Tidak ada TTL otomatis — data dihapus sendiri saat user login/logout
//   - Ukuran total dibatasi oleh browser (~5-10 MB)

const PREFIX = 'cache_'

/**
 * Simpan data ke cache.
 * @param {string} key   - nama unik, contoh: 'logbooks', 'pengajuan', 'dosen_logbook'
 * @param {any}    data  - nilai apapun yang bisa di-JSON.stringify
 */
export function setCache(key, data) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(data))
  } catch (err) {
    // localStorage penuh atau private mode — abaikan saja
    console.warn('[offlineCache] Gagal menyimpan cache untuk', key, err)
  }
}

/**
 * Baca data dari cache. Mengembalikan nilai default jika tidak ada.
 * @param {string} key
 * @param {any}    defaultValue  - nilai yang dikembalikan jika key tidak ada
 */
export function getCache(key, defaultValue = null) {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    if (raw === null) return defaultValue
    return JSON.parse(raw)
  } catch {
    return defaultValue
  }
}

/**
 * Hapus satu cache key.
 */
export function clearCache(key) {
  try {
    localStorage.removeItem(PREFIX + key)
  } catch { /* ignore */ }
}

/**
 * Hapus semua cache yang dibuat oleh helper ini.
 * Dipanggil saat logout supaya data tidak tertinggal di perangkat bersama.
 */
export function clearAllCache() {
  try {
    const keys = Object.keys(localStorage).filter(k => k.startsWith(PREFIX))
    keys.forEach(k => localStorage.removeItem(k))
  } catch { /* ignore */ }
}