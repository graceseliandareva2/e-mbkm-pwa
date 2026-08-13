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

export async function saveToQueue(item) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx    = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const req   = store.add({ ...item, createdAt: new Date().toISOString() })
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

export async function syncQueue(apiInstance) {
  console.log('🔄 [offlineQueue] syncQueue DIPANGGIL')

  const queue = await getAllQueue()

  console.log('📦 [offlineQueue] Jumlah queue:', queue.length)
  console.log('📦 [offlineQueue] Isi queue:', queue)

  if (queue.length === 0) return 0

  let successCount = 0

  for (const item of queue) {
    try {
      console.log('🚀 [offlineQueue] Mulai sync item:', item.id)
      console.log('📄 URL:', item.url)
      console.log('📄 Data:', item.data)

      if (item.file && item.file.blob) {
        console.log('📎 File ditemukan:', item.file.filename)

        const formData = new FormData()

        Object.entries(item.data || {}).forEach(([key, value]) => {
          if (value !== undefined && value !== null) {
            formData.append(key, value)
          }
        })

        formData.append(
          item.file.fieldName,
          item.file.blob,
          item.file.filename
        )

        if (item.method === 'POST') {
          await apiInstance.post(item.url, formData)
        } else if (item.method === 'PUT') {
          await apiInstance.put(item.url, formData)
        }
      } else if (item.method === 'POST') {
        await apiInstance.post(item.url, item.data)
      } else if (item.method === 'PUT') {
        await apiInstance.put(item.url, item.data)
      }

      await deleteFromQueue(item.id)

      console.log('✅ [offlineQueue] Sync BERHASIL:', item.id)

      successCount++
    } catch (err) {
      console.error(
        '❌ [offlineQueue] Sync GAGAL:',
        item.id,
        err?.response?.status,
        err?.response?.data || err.message
      )
    }
  }

  return successCount
}


export async function getPendingCount() {
  const queue = await getAllQueue()
  return queue.length
}