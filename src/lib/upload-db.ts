/**
 * IndexedDB wrapper for persisting upload queue
 * Allows resumable uploads even if the page is closed/refreshed
 */

const DB_NAME = 'user-test-recordings'
const DB_VERSION = 1
const STORE_NAME = 'upload-queue'

export interface UploadQueueItem {
  id: string // Unique identifier: recordingId-partIndex
  recordingId: string
  partIndex: number
  blob: Blob
  mimeType: string
  status: 'pending' | 'uploading' | 'uploaded' | 'failed'
  retries: number
  createdAt: string
  uploadedAt?: string
  error?: string
}

/**
 * Initialize IndexedDB
 */
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onerror = () => {
      reject(new Error('Failed to open IndexedDB'))
    }

    request.onsuccess = () => {
      resolve(request.result)
    }

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result

      // Create object store if it doesn't exist
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' })

        // Create indexes for efficient querying
        store.createIndex('recordingId', 'recordingId', { unique: false })
        store.createIndex('status', 'status', { unique: false })
        store.createIndex('createdAt', 'createdAt', { unique: false })
      }
    }
  })
}

/**
 * Add item to upload queue
 */
export async function addToUploadQueue(
  recordingId: string,
  partIndex: number,
  blob: Blob,
  mimeType: string
): Promise<void> {
  const db = await openDatabase()
  const transaction = db.transaction([STORE_NAME], 'readwrite')
  const store = transaction.objectStore(STORE_NAME)

  const item: UploadQueueItem = {
    id: `${recordingId}-${partIndex}`,
    recordingId,
    partIndex,
    blob,
    mimeType,
    status: 'pending',
    retries: 0,
    createdAt: new Date().toISOString(),
  }

  return new Promise((resolve, reject) => {
    const request = store.add(item)

    request.onsuccess = () => {
      db.close()
      resolve()
    }

    request.onerror = () => {
      db.close()
      reject(new Error('Failed to add item to upload queue'))
    }
  })
}

/**
 * Update upload queue item
 */
export async function updateUploadQueueItem(
  id: string,
  updates: Partial<UploadQueueItem>
): Promise<void> {
  const db = await openDatabase()
  const transaction = db.transaction([STORE_NAME], 'readwrite')
  const store = transaction.objectStore(STORE_NAME)

  return new Promise((resolve, reject) => {
    const getRequest = store.get(id)

    getRequest.onsuccess = () => {
      const item = getRequest.result
      if (!item) {
        db.close()
        reject(new Error('Item not found'))
        return
      }

      const updatedItem = { ...item, ...updates }
      const putRequest = store.put(updatedItem)

      putRequest.onsuccess = () => {
        db.close()
        resolve()
      }

      putRequest.onerror = () => {
        db.close()
        reject(new Error('Failed to update item'))
      }
    }

    getRequest.onerror = () => {
      db.close()
      reject(new Error('Failed to get item'))
    }
  })
}

/**
 * Get all pending uploads for a recording
 */
export async function getPendingUploads(
  recordingId: string
): Promise<UploadQueueItem[]> {
  const db = await openDatabase()
  const transaction = db.transaction([STORE_NAME], 'readonly')
  const store = transaction.objectStore(STORE_NAME)
  const index = store.index('recordingId')

  return new Promise((resolve, reject) => {
    const request = index.getAll(recordingId)

    request.onsuccess = () => {
      db.close()
      const items = request.result as UploadQueueItem[]
      // Filter for pending or failed items
      const pending = items.filter(
        (item) => item.status === 'pending' || item.status === 'failed'
      )
      resolve(pending)
    }

    request.onerror = () => {
      db.close()
      reject(new Error('Failed to get pending uploads'))
    }
  })
}

/**
 * Get all items for a recording (any status)
 */
export async function getAllUploadsByRecording(
  recordingId: string
): Promise<UploadQueueItem[]> {
  const db = await openDatabase()
  const transaction = db.transaction([STORE_NAME], 'readonly')
  const store = transaction.objectStore(STORE_NAME)
  const index = store.index('recordingId')

  return new Promise((resolve, reject) => {
    const request = index.getAll(recordingId)

    request.onsuccess = () => {
      db.close()
      resolve(request.result as UploadQueueItem[])
    }

    request.onerror = () => {
      db.close()
      reject(new Error('Failed to get uploads'))
    }
  })
}

/**
 * Get a specific upload queue item
 */
export async function getUploadQueueItem(
  id: string
): Promise<UploadQueueItem | null> {
  const db = await openDatabase()
  const transaction = db.transaction([STORE_NAME], 'readonly')
  const store = transaction.objectStore(STORE_NAME)

  return new Promise((resolve, reject) => {
    const request = store.get(id)

    request.onsuccess = () => {
      db.close()
      resolve(request.result || null)
    }

    request.onerror = () => {
      db.close()
      reject(new Error('Failed to get item'))
    }
  })
}

/**
 * Delete upload queue item
 */
export async function deleteUploadQueueItem(id: string): Promise<void> {
  const db = await openDatabase()
  const transaction = db.transaction([STORE_NAME], 'readwrite')
  const store = transaction.objectStore(STORE_NAME)

  return new Promise((resolve, reject) => {
    const request = store.delete(id)

    request.onsuccess = () => {
      db.close()
      resolve()
    }

    request.onerror = () => {
      db.close()
      reject(new Error('Failed to delete item'))
    }
  })
}

/**
 * Delete all uploads for a recording
 */
export async function deleteRecordingUploads(
  recordingId: string
): Promise<void> {
  const db = await openDatabase()
  const transaction = db.transaction([STORE_NAME], 'readwrite')
  const store = transaction.objectStore(STORE_NAME)
  const index = store.index('recordingId')

  return new Promise((resolve, reject) => {
    const request = index.getAllKeys(recordingId)

    request.onsuccess = () => {
      const keys = request.result
      let deletedCount = 0

      if (keys.length === 0) {
        db.close()
        resolve()
        return
      }

      keys.forEach((key) => {
        const deleteRequest = store.delete(key)
        deleteRequest.onsuccess = () => {
          deletedCount++
          if (deletedCount === keys.length) {
            db.close()
            resolve()
          }
        }
        deleteRequest.onerror = () => {
          db.close()
          reject(new Error('Failed to delete items'))
        }
      })
    }

    request.onerror = () => {
      db.close()
      reject(new Error('Failed to get recording uploads'))
    }
  })
}

/**
 * Get count of uploads by status for a recording
 */
export async function getUploadStats(recordingId: string): Promise<{
  total: number
  pending: number
  uploading: number
  uploaded: number
  failed: number
}> {
  const items = await getAllUploadsByRecording(recordingId)

  return {
    total: items.length,
    pending: items.filter((i) => i.status === 'pending').length,
    uploading: items.filter((i) => i.status === 'uploading').length,
    uploaded: items.filter((i) => i.status === 'uploaded').length,
    failed: items.filter((i) => i.status === 'failed').length,
  }
}

/**
 * Clear all completed uploads older than X days
 */
export async function cleanupOldUploads(daysOld: number = 7): Promise<number> {
  const db = await openDatabase()
  const transaction = db.transaction([STORE_NAME], 'readwrite')
  const store = transaction.objectStore(STORE_NAME)

  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - daysOld)

  return new Promise((resolve, reject) => {
    const request = store.getAll()

    request.onsuccess = () => {
      const items = request.result as UploadQueueItem[]
      const toDelete = items.filter((item) => {
        if (item.status !== 'uploaded') return false
        const itemDate = new Date(item.uploadedAt || item.createdAt)
        return itemDate < cutoffDate
      })

      if (toDelete.length === 0) {
        db.close()
        resolve(0)
        return
      }

      let deletedCount = 0
      toDelete.forEach((item) => {
        const deleteRequest = store.delete(item.id)
        deleteRequest.onsuccess = () => {
          deletedCount++
          if (deletedCount === toDelete.length) {
            db.close()
            resolve(deletedCount)
          }
        }
        deleteRequest.onerror = () => {
          db.close()
          reject(new Error('Failed to cleanup old uploads'))
        }
      })
    }

    request.onerror = () => {
      db.close()
      reject(new Error('Failed to get uploads for cleanup'))
    }
  })
}

/**
 * Clean up orphaned uploads (failed or pending for too long)
 */
export async function cleanupOrphanedUploads(hoursOld: number = 24): Promise<{
  deleted: number
  reset: number
}> {
  const db = await openDatabase()
  const transaction = db.transaction([STORE_NAME], 'readwrite')
  const store = transaction.objectStore(STORE_NAME)

  const cutoffDate = new Date()
  cutoffDate.setHours(cutoffDate.getHours() - hoursOld)

  return new Promise((resolve, reject) => {
    const request = store.getAll()

    request.onsuccess = () => {
      const items = request.result as UploadQueueItem[]
      let deletedCount = 0
      let resetCount = 0
      let processedCount = 0

      const orphaned = items.filter((item) => {
        // Check if it's an orphaned upload
        if (item.status === 'uploaded') return false

        const itemDate = new Date(item.createdAt)
        return itemDate < cutoffDate
      })

      if (orphaned.length === 0) {
        db.close()
        resolve({ deleted: 0, reset: 0 })
        return
      }

      orphaned.forEach((item) => {
        // Failed items with too many retries - delete
        if (item.status === 'failed' && item.retries >= 3) {
          const deleteRequest = store.delete(item.id)
          deleteRequest.onsuccess = () => {
            deletedCount++
            processedCount++
            if (processedCount === orphaned.length) {
              db.close()
              resolve({ deleted: deletedCount, reset: resetCount })
            }
          }
          deleteRequest.onerror = () => {
            processedCount++
            if (processedCount === orphaned.length) {
              db.close()
              resolve({ deleted: deletedCount, reset: resetCount })
            }
          }
        }
        // Pending or uploading items - reset to pending for retry
        else {
          const updatedItem = {
            ...item,
            status: 'pending' as const,
            retries: 0,
          }
          const putRequest = store.put(updatedItem)
          putRequest.onsuccess = () => {
            resetCount++
            processedCount++
            if (processedCount === orphaned.length) {
              db.close()
              resolve({ deleted: deletedCount, reset: resetCount })
            }
          }
          putRequest.onerror = () => {
            processedCount++
            if (processedCount === orphaned.length) {
              db.close()
              resolve({ deleted: deletedCount, reset: resetCount })
            }
          }
        }
      })
    }

    request.onerror = () => {
      db.close()
      reject(new Error('Failed to get uploads for cleanup'))
    }
  })
}

/**
 * Get all recordings with pending uploads
 */
export async function getRecordingsWithPendingUploads(): Promise<string[]> {
  const db = await openDatabase()
  const transaction = db.transaction([STORE_NAME], 'readonly')
  const store = transaction.objectStore(STORE_NAME)

  return new Promise((resolve, reject) => {
    const request = store.getAll()

    request.onsuccess = () => {
      const items = request.result as UploadQueueItem[]
      const recordingIds = new Set<string>()

      items.forEach((item) => {
        if (item.status === 'pending' || item.status === 'failed') {
          recordingIds.add(item.recordingId)
        }
      })

      db.close()
      resolve(Array.from(recordingIds))
    }

    request.onerror = () => {
      db.close()
      reject(new Error('Failed to get recordings with pending uploads'))
    }
  })
}
