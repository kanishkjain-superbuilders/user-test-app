import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import {
  getPendingUploads,
  updateUploadQueueItem,
  getUploadStats,
  getAllUploadsByRecording,
  cleanupOldUploads,
  cleanupOrphanedUploads,
  type UploadQueueItem,
} from '../lib/upload-db'
import type { RecordingManifest } from '../lib/recording-utils'

interface UploadProgress {
  uploadedParts: number
  totalParts: number
  uploadedBytes: number
  totalBytes: number
  percentComplete: number
  currentlyUploading: number
  failed: number
}

interface UploadManager {
  progress: UploadProgress
  isUploading: boolean
  error: string | null
  isOnline: boolean
  startUploading: (recordingId: string) => Promise<void>
  finalizeRecording: (
    recordingId: string,
    manifest: RecordingManifest
  ) => Promise<void>
  retryFailedUploads: (recordingId: string) => Promise<void>
  resumePendingUploads: () => Promise<void>
}

const MAX_RETRIES = 3
const RETRY_DELAYS = [1000, 2000, 4000] // Exponential backoff in milliseconds
const MAX_CONCURRENT_UPLOADS = 3
const UPLOAD_PROGRESS_KEY = 'upload-progress'

export function useUploadManager(): UploadManager {
  const [progress, setProgress] = useState<UploadProgress>({
    uploadedParts: 0,
    totalParts: 0,
    uploadedBytes: 0,
    totalBytes: 0,
    percentComplete: 0,
    currentlyUploading: 0,
    failed: 0,
  })

  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isOnline, setIsOnline] = useState(navigator.onLine)

  const uploadingRef = useRef(false)
  const activeUploadsRef = useRef(0)
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map())
  const currentRecordingIdRef = useRef<string | null>(null)

  /**
   * Sleep for a given duration with jitter for better backoff
   */
  const sleep = (ms: number) => {
    // Add jitter (±20%) to prevent thundering herd
    const jitter = ms * 0.2 * (Math.random() - 0.5)
    return new Promise((resolve) => setTimeout(resolve, ms + jitter))
  }

  /**
   * Save progress to localStorage for persistence
   */
  const saveProgress = useCallback(
    (recordingId: string) => {
      try {
        const progressData = {
          recordingId,
          timestamp: Date.now(),
          progress: progress,
        }
        localStorage.setItem(
          `${UPLOAD_PROGRESS_KEY}-${recordingId}`,
          JSON.stringify(progressData)
        )
      } catch (err) {
        console.warn('Failed to save upload progress:', err)
      }
    },
    [progress]
  )

  /**
   * Load progress from localStorage
   */
  const loadProgress = useCallback((recordingId: string) => {
    try {
      const saved = localStorage.getItem(
        `${UPLOAD_PROGRESS_KEY}-${recordingId}`
      )
      if (saved) {
        const data = JSON.parse(saved)
        // Only restore if less than 24 hours old
        if (Date.now() - data.timestamp < 24 * 60 * 60 * 1000) {
          setProgress(data.progress)
          return true
        }
      }
    } catch (err) {
      console.warn('Failed to load upload progress:', err)
    }
    return false
  }, [])

  /**
   * Get signed upload URL from Edge Function
   */
  const getSignedUploadUrl = async (
    recordingId: string,
    partIndex: number,
    mimeType: string
  ): Promise<{ signedUrl: string; path: string; token: string }> => {
    const {
      data: { session },
    } = await supabase.auth.getSession()

    // Use session token if authenticated, otherwise use anon key
    const authHeader = session
      ? `Bearer ${session.access_token}`
      : `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`

    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/issue-upload-url`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: authHeader,
        },
        body: JSON.stringify({
          recordingId,
          partIndex,
          mimeType,
        }),
      }
    )

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.error || 'Failed to get upload URL')
    }

    const data = await response.json()
    return { signedUrl: data.signedUrl, path: data.path, token: data.token }
  }

  /**
   * Upload a single chunk with retry logic and network awareness
   */
  const uploadChunk = async (item: UploadQueueItem): Promise<void> => {
    const itemId = item.id
    let attempt = 0

    while (attempt <= MAX_RETRIES) {
      // Check network status before attempting
      if (!navigator.onLine) {
        console.log('Network offline, pausing upload for', itemId)
        await sleep(5000) // Wait 5 seconds before checking again
        continue
      }

      try {
        // Update status to uploading
        await updateUploadQueueItem(itemId, {
          status: 'uploading',
          retries: attempt,
        })

        // Get signed URL + token
        const { path, token } = await getSignedUploadUrl(
          item.recordingId,
          item.partIndex,
          item.mimeType
        )

        // Create abort controller for this upload
        const abortController = new AbortController()
        abortControllersRef.current.set(itemId, abortController)

        // Set a timeout for the upload (30 seconds)
        const timeoutId = setTimeout(() => abortController.abort(), 30000)

        try {
          // Upload the blob using Supabase helper to the signed URL token
          const { error: uploadError } = await supabase.storage
            .from('recordings')
            .uploadToSignedUrl(path, token, item.blob, {
              upsert: true,
              contentType: item.mimeType,
            })

          clearTimeout(timeoutId)

          if (uploadError) {
            throw new Error(uploadError.message || 'Upload failed')
          }

          // Verify the upload was successful by checking if the file exists
          // This adds an extra safety check
          const { error: existsError } = await supabase.storage
            .from('recordings')
            .list(path.substring(0, path.lastIndexOf('/')), {
              search: path.substring(path.lastIndexOf('/') + 1),
              limit: 1,
            })

          if (existsError) {
            console.warn('Could not verify upload, assuming success')
          }
        } finally {
          clearTimeout(timeoutId)
        }

        // Remove abort controller
        abortControllersRef.current.delete(itemId)

        // Mark as uploaded
        await updateUploadQueueItem(itemId, {
          status: 'uploaded',
          uploadedAt: new Date().toISOString(),
        })

        return // Success!
      } catch (err) {
        attempt++

        // Clean up abort controller
        abortControllersRef.current.delete(itemId)

        const errorMessage =
          err instanceof Error ? err.message : 'Upload failed'
        const isNetworkError =
          errorMessage.includes('network') ||
          errorMessage.includes('fetch') ||
          errorMessage.includes('abort')

        if (attempt > MAX_RETRIES) {
          // Max retries exceeded, mark as failed
          await updateUploadQueueItem(itemId, {
            status: 'failed',
            retries: attempt - 1,
            error: errorMessage,
          })
          throw err
        }

        // Use longer delay for network errors
        const baseDelay = RETRY_DELAYS[attempt - 1] || 4000
        const delay = isNetworkError ? baseDelay * 2 : baseDelay

        console.log(
          `Upload attempt ${attempt} failed for part ${item.partIndex}: ${errorMessage}`,
          `Retrying in ${delay}ms...`
        )
        await sleep(delay)
      }
    }
  }

  /**
   * Update progress from IndexedDB stats and save to localStorage
   */
  const updateProgress = async (recordingId: string) => {
    try {
      const stats = await getUploadStats(recordingId)

      const newProgress = {
        uploadedParts: stats.uploaded,
        totalParts: stats.total,
        uploadedBytes: 0, // Would need to track individually
        totalBytes: 0, // Would need to track individually
        percentComplete:
          stats.total > 0
            ? Math.round((stats.uploaded / stats.total) * 100)
            : 0,
        currentlyUploading: stats.uploading,
        failed: stats.failed,
      }

      setProgress(newProgress)

      // Save progress for recovery
      if (recordingId) {
        saveProgress(recordingId)
      }
    } catch (err) {
      console.error('Failed to update progress:', err)
    }
  }

  /**
   * Process upload queue with network awareness
   */
  const processQueue = async (recordingId: string) => {
    currentRecordingIdRef.current = recordingId

    while (uploadingRef.current) {
      // Check network status
      if (!navigator.onLine) {
        console.log('Network offline, pausing queue processing')
        await sleep(5000) // Wait 5 seconds before checking again
        continue
      }

      try {
        // Get pending uploads (including failed ones for retry)
        const pending = await getPendingUploads(recordingId)

        if (pending.length === 0) {
          // All done!
          break
        }

        // Sort by part index to maintain order, with failed items first
        pending.sort((a, b) => {
          if (a.status === 'failed' && b.status !== 'failed') return -1
          if (a.status !== 'failed' && b.status === 'failed') return 1
          return a.partIndex - b.partIndex
        })

        // Process uploads with concurrency limit
        const uploadPromises: Promise<void>[] = []

        for (const item of pending) {
          if (activeUploadsRef.current >= MAX_CONCURRENT_UPLOADS) {
            break // Wait for some to complete
          }

          // Skip if we're shutting down
          if (!uploadingRef.current) break

          activeUploadsRef.current++

          const uploadPromise = uploadChunk(item)
            .catch((err) => {
              console.error(`Failed to upload part ${item.partIndex}:`, err)
              // Don't set error for individual chunk failures
              // We'll retry them
            })
            .finally(() => {
              activeUploadsRef.current--
              updateProgress(recordingId)
            })

          uploadPromises.push(uploadPromise)
        }

        // Wait for current batch to complete
        if (uploadPromises.length > 0) {
          await Promise.all(uploadPromises)
        }

        // Update progress
        await updateProgress(recordingId)

        // Small delay before next iteration
        await sleep(100)
      } catch (err) {
        console.error('Error processing upload queue:', err)
        setError('Error processing upload queue')

        // Wait longer before retrying on error
        await sleep(5000)
      }
    }

    currentRecordingIdRef.current = null
  }

  /**
   * Start uploading chunks for a recording
   */
  const startUploading = useCallback(
    async (recordingId: string): Promise<void> => {
      // If an upload loop is already running, wait until it's idle
      if (uploadingRef.current) {
        setIsUploading(true)
        setError(null)
        // Wait until no pending or uploading items remain
        // Poll at a short interval to avoid busy looping
        // Also surface failures once finished
        for (;;) {
          const stats = await getUploadStats(recordingId)
          const inFlight = stats.pending + stats.uploading
          if (inFlight === 0) {
            if (stats.failed > 0) {
              setError(`${stats.failed} chunks failed to upload`)
            }
            setIsUploading(false)
            return
          }
          await sleep(200)
        }
      }

      uploadingRef.current = true
      setIsUploading(true)
      setError(null)

      try {
        await updateProgress(recordingId)
        await processQueue(recordingId)

        // Check final stats
        const stats = await getUploadStats(recordingId)

        if (stats.failed > 0) {
          setError(`${stats.failed} chunks failed to upload`)
        }
      } catch (err) {
        console.error('Upload error:', err)
        setError(err instanceof Error ? err.message : 'Upload failed')
      } finally {
        uploadingRef.current = false
        setIsUploading(false)
      }
    },
    [processQueue]
  )

  /**
   * Finalize recording by uploading manifest
   */
  const finalizeRecording = useCallback(
    async (recordingId: string, manifest: RecordingManifest): Promise<void> => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession()

        // Use session token if authenticated, otherwise use anon key
        const authHeader = session
          ? `Bearer ${session.access_token}`
          : `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`

        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/finalize-recording`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: authHeader,
            },
            body: JSON.stringify({
              recordingId,
              manifest,
            }),
          }
        )

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          throw new Error(errorData.error || 'Failed to finalize recording')
        }

        console.log('Recording finalized successfully')
      } catch (err) {
        console.error('Failed to finalize recording:', err)
        setError(
          err instanceof Error ? err.message : 'Failed to finalize recording'
        )
        throw err
      }
    },
    []
  )

  /**
   * Retry failed uploads for a recording
   */
  const retryFailedUploads = useCallback(
    async (recordingId: string): Promise<void> => {
      try {
        const items = await getAllUploadsByRecording(recordingId)
        const failedItems = items.filter((item) => item.status === 'failed')

        if (failedItems.length === 0) {
          console.log('No failed uploads to retry')
          return
        }

        console.log(`Retrying ${failedItems.length} failed uploads`)

        // Reset failed items to pending
        for (const item of failedItems) {
          await updateUploadQueueItem(item.id, {
            status: 'pending',
            retries: 0,
          })
        }

        // Start uploading if not already running
        if (!uploadingRef.current) {
          // Call startUploading directly without dependency
          uploadingRef.current = true
          setIsUploading(true)
          setError(null)

          try {
            await updateProgress(recordingId)
            await processQueue(recordingId)

            const stats = await getUploadStats(recordingId)
            if (stats.failed > 0) {
              setError(`${stats.failed} chunks failed to upload`)
            }
          } catch (err) {
            console.error('Upload error:', err)
            setError(err instanceof Error ? err.message : 'Upload failed')
          } finally {
            uploadingRef.current = false
            setIsUploading(false)
          }
        }
      } catch (err) {
        console.error('Failed to retry uploads:', err)
        setError('Failed to retry uploads')
      }
    },
    []
  )

  /**
   * Resume pending uploads from any previous sessions
   */
  const resumePendingUploads = useCallback(async (): Promise<void> => {
    try {
      // Check localStorage for any incomplete uploads
      const keys = Object.keys(localStorage).filter((key) =>
        key.startsWith(UPLOAD_PROGRESS_KEY)
      )

      for (const key of keys) {
        const recordingId = key.replace(`${UPLOAD_PROGRESS_KEY}-`, '')
        const stats = await getUploadStats(recordingId)

        if (stats.pending > 0 || stats.failed > 0) {
          console.log(
            `Found ${stats.pending} pending and ${stats.failed} failed uploads for ${recordingId}`
          )

          // Load saved progress
          loadProgress(recordingId)

          // Start uploading inline to avoid circular dependency
          if (!uploadingRef.current) {
            uploadingRef.current = true
            setIsUploading(true)
            setError(null)

            try {
              await updateProgress(recordingId)
              await processQueue(recordingId)

              const finalStats = await getUploadStats(recordingId)
              if (finalStats.failed > 0) {
                setError(`${finalStats.failed} chunks failed to upload`)
              }
            } catch (err) {
              console.error('Upload error:', err)
              setError(err instanceof Error ? err.message : 'Upload failed')
            } finally {
              uploadingRef.current = false
              setIsUploading(false)
            }
          }
        } else if (stats.total > 0 && stats.uploaded === stats.total) {
          // Clean up completed upload from localStorage
          localStorage.removeItem(key)
        }
      }
    } catch (err) {
      console.error('Failed to resume pending uploads:', err)
    }
  }, [loadProgress])

  /**
   * Run cleanup periodically
   */
  const runCleanup = useCallback(async () => {
    try {
      // Clean up orphaned uploads (older than 24 hours)
      const orphanedResult = await cleanupOrphanedUploads(24)
      if (orphanedResult.deleted > 0 || orphanedResult.reset > 0) {
        console.log(
          `Cleanup: deleted ${orphanedResult.deleted} failed uploads, reset ${orphanedResult.reset} for retry`
        )
      }

      // Clean up old successful uploads (older than 7 days)
      const oldCount = await cleanupOldUploads(7)
      if (oldCount > 0) {
        console.log(`Cleanup: removed ${oldCount} old completed uploads`)
      }
    } catch (err) {
      console.error('Failed to run cleanup:', err)
    }
  }, [])

  /**
   * Setup network event listeners
   */
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true)
      console.log('Network online')

      // Resume uploads if we have a current recording
      if (currentRecordingIdRef.current && !uploadingRef.current) {
        startUploading(currentRecordingIdRef.current)
      }
    }

    const handleOffline = () => {
      setIsOnline(false)
      console.log('Network offline')
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    // Check for pending uploads on mount
    resumePendingUploads()

    // Run cleanup on mount
    runCleanup()

    // Schedule cleanup to run every hour
    const cleanupInterval = setInterval(runCleanup, 60 * 60 * 1000)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      clearInterval(cleanupInterval)
    }
  }, [startUploading, resumePendingUploads, runCleanup])

  /**
   * Cleanup on unmount
   */
  useEffect(() => {
    return () => {
      // Abort all active uploads
      // eslint-disable-next-line react-hooks/exhaustive-deps
      const controllers = abortControllersRef.current
      controllers.forEach((controller) => {
        controller.abort()
      })
      controllers.clear()
      uploadingRef.current = false
    }
  }, [])

  return {
    progress,
    isUploading,
    error,
    isOnline,
    startUploading,
    finalizeRecording,
    retryFailedUploads,
    resumePendingUploads,
  }
}
