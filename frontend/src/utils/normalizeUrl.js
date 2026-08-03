// utils/normalizeUrl.js

/**
 * Normalisasi input jadi URL lengkap.
 * - "https://x.com" / "http://x.com" -> dibiarkan apa adanya
 * - "www.x.com"                      -> jadi "https://www.x.com"
 * - "x.com" / "e-mbkmonline.com/abc" -> jadi "https://x.com" (dianggap domain)
 * - selain pola di atas (bukan URL sama sekali) -> dibiarkan apa adanya
 */
export function normalizeUrl(value) {
  if (!value) return value

  const trimmed = value.trim()
  if (!trimmed) return trimmed

  // udah ada http:// atau https:// -> biarin apa adanya
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed
  }

  // mulai dengan www. -> tinggal tambahin https://
  if (/^www\./i.test(trimmed)) {
    return `https://${trimmed}`
  }

  // domain-like (ada titik, contoh: e-mbkmonline.com) -> anggap domain, tambahin https://
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)+([/?#].*)?$/i.test(trimmed)) {
    return `https://${trimmed}`
  }

  // gak match pola URL sama sekali -> biarin apa adanya, gak dipaksa
  return trimmed
}