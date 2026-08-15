export function normalizeUrl(value) {
  if (!value) return value

  const trimmed = value.trim()
  if (!trimmed) return trimmed

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed
  }

  if (/^www\./i.test(trimmed)) {
    return `https://${trimmed}`
  }

  if (/^[a-z0-9-]+(\.[a-z0-9-]+)+([/?#].*)?$/i.test(trimmed)) {
    return `https://${trimmed}`
  }

  return trimmed
}