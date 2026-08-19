const DB_NAME = 'capstone-offline-db'
const STORE_NAME = 'offline-queue'

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = function (e) {
      const db = e.target.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true })
      }
    }
    req.onsuccess = function (e) { resolve(e.target.result) }
    req.onerror  = function (e) { reject(e.target.error) }
  })
}

function generateClientRefId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

// clientRefId dipertahankan kalau item ini hasil requeue (retry) dari runSync,
// biar backend tetap kenal ini submission yang SAMA, bukan yang baru.
export async function saveToQueue(item) {
  const db = await openDB()
  const clientRefId = item.clientRefId || generateClientRefId()
  const dataWithRef = { ...(item.data || {}), client_ref_id: clientRefId }

  return new Promise((resolve, reject) => {
    const tx    = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const req   = store.add({
      ...item,
      data: dataWithRef,
      clientRefId,
      createdAt: item.createdAt || new Date().toISOString(),
    })
    req.onsuccess = function () { resolve(req.result) }
    req.onerror   = function (e) { reject(e.target.error) }
  })
}

export async function getAllQueue() {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx    = db.transaction(STORE_NAME, 'readonly')
    const store = tx.objectStore(STORE_NAME)
    const req   = store.getAll()
    req.onsuccess = function () { resolve(req.result) }
    req.onerror   = function (e) { reject(e.target.error) }
  })
}

export async function deleteFromQueue(id) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx    = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const req   = store.delete(id)
    req.onsuccess = function () { resolve() }
    req.onerror   = function (e) { reject(e.target.error) }
  })
}

let isSyncing = false

export async function syncQueue(apiInstance) {
  if (isSyncing) {
    console.log('[offlineQueue] syncQueue sedang berjalan, skip pemanggilan ini')
    return 0
  }

  isSyncing = true
  console.log('[offlineQueue] syncQueue DIPANGGIL')

  try {
    return await runSync(apiInstance)
  } finally {
    isSyncing = false
  }
}

async function sendItem(apiInstance, item) {
  if (item.file && item.file.blob) {
    const formData = new FormData()

    Object.entries(item.data || {}).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        formData.append(key, value)
      }
    })

    formData.append(item.file.fieldName, item.file.blob, item.file.filename)

    const fileHeaders = { headers: { 'Content-Type': undefined } }

    if (item.method === 'POST') {
      await apiInstance.post(item.url, formData, fileHeaders)
    } else if (item.method === 'PUT') {
      await apiInstance.put(item.url, formData, fileHeaders)
    }
  } else if (item.method === 'POST') {
    await apiInstance.post(item.url, item.data)
  } else if (item.method === 'PUT') {
    await apiInstance.put(item.url, item.data)
  }
}

async function runSync(apiInstance) {
  const queue = await getAllQueue()

  console.log('[offlineQueue] Jumlah queue:', queue.length)
  console.log('[offlineQueue] Isi queue:', queue)

  if (queue.length === 0) return 0

  let successCount = 0

  for (const item of queue) {
    
    try {
      await deleteFromQueue(item.id)
    } catch (e) {
      console.error('[offlineQueue] Gagal hapus item sebelum kirim, skip item ini:', item.id, e)
      continue
    }

    try {
      console.log('[offlineQueue] Mulai sync item:', item.id, 'ref:', item.clientRefId)
      console.log('URL:', item.url)
      console.log('Data:', item.data)

      await sendItem(apiInstance, item)

      console.log('[offlineQueue] Sync BERHASIL:', item.id)
      successCount++
    } catch (err) {
      console.error(
        '[offlineQueue] Sync GAGAL, dimasukin lagi ke queue:',
        item.id,
        err?.response?.status,
        err?.response?.data || err.message
      )

      try {
        const { id, ...rest } = item
        await saveToQueue(rest)
      } catch (requeueErr) {
        console.error('[offlineQueue] Gagal requeue item, data offline ini HILANG:', item.id, requeueErr)
      }
    }
  }

  return successCount
}

export async function getPendingCount() {
  const queue = await getAllQueue()
  return queue.length
}