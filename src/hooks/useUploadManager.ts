import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import {
  getPendingUploads,
  updateUploadQueueItem,
  getUploadStats,
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
  startUploading: (recordingId: string) => Promise<void>
  finalizeRecording: (
    recordingId: string,
    manifest: RecordingManifest
  ) => Promise<void>
}

const MAX_RETRIES = 3
const RETRY_DELAYS = [1000, 2000, 4000] // Exponential backoff in milliseconds
const MAX_CONCURRENT_UPLOADS = 3

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

  const uploadingRef = useRef(false)
  const activeUploadsRef = useRef(0)
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map())

  /**
   * Sleep for a given duration
   */
  const sleep = (ms: number) =>
    new Promise((resolve) => setTimeout(resolve, ms))

  /**
   * Get signed upload URL from Edge Function
   */
  const getSignedUploadUrl = async (
    recordingId: string,
    partIndex: number,
    mimeType: string
  ): Promise<string> => {
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
    return data.signedUrl
  }

  /**
   * Upload a single chunk with retry logic
   */
  const uploadChunk = async (item: UploadQueueItem): Promise<void> => {
    const itemId = item.id
    let attempt = 0

    while (attempt <= MAX_RETRIES) {
      try {
        // Update status to uploading
        await updateUploadQueueItem(itemId, {
          status: 'uploading',
          retries: attempt,
        })

        // Get signed URL
        const signedUrl = await getSignedUploadUrl(
          item.recordingId,
          item.partIndex,
          item.mimeType
        )

        // Create abort controller for this upload
        const abortController = new AbortController()
        abortControllersRef.current.set(itemId, abortController)

        // Upload the blob
        const uploadResponse = await fetch(signedUrl, {
          method: 'PUT',
          body: item.blob,
          headers: {
            'Content-Type': item.mimeType,
          },
          signal: abortController.signal,
        })

        // Remove abort controller
        abortControllersRef.current.delete(itemId)

        if (!uploadResponse.ok) {
          throw new Error(`Upload failed with status ${uploadResponse.status}`)
        }

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

        if (attempt > MAX_RETRIES) {
          // Max retries exceeded, mark as failed
          await updateUploadQueueItem(itemId, {
            status: 'failed',
            retries: attempt - 1,
            error: err instanceof Error ? err.message : 'Upload failed',
          })
          throw err
        }

        // Wait before retrying (exponential backoff)
        const delay = RETRY_DELAYS[attempt - 1] || 4000
        console.log(
          `Upload attempt ${attempt} failed for part ${item.partIndex}, retrying in ${delay}ms...`
        )
        await sleep(delay)
      }
    }
  }

  /**
   * Update progress from IndexedDB stats
   */
  const updateProgress = async (recordingId: string) => {
    try {
      const stats = await getUploadStats(recordingId)

      setProgress({
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
      })
    } catch (err) {
      console.error('Failed to update progress:', err)
    }
  }

  /**
   * Process upload queue
   */
  const processQueue = async (recordingId: string) => {
    while (uploadingRef.current) {
      try {
        // Get pending uploads
        const pending = await getPendingUploads(recordingId)

        if (pending.length === 0) {
          // All done!
          break
        }

        // Process uploads with concurrency limit
        const uploadPromises: Promise<void>[] = []

        for (const item of pending) {
          if (activeUploadsRef.current >= MAX_CONCURRENT_UPLOADS) {
            break // Wait for some to complete
          }

          activeUploadsRef.current++

          const uploadPromise = uploadChunk(item)
            .catch((err) => {
              console.error(`Failed to upload part ${item.partIndex}:`, err)
              setError(`Failed to upload part ${item.partIndex}`)
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
        break
      }
    }
  }

  /**
   * Start uploading chunks for a recording
   */
  const startUploading = useCallback(
    async (recordingId: string): Promise<void> => {
      if (uploadingRef.current) {
        console.warn('Upload already in progress')
        return
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
    []
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
   * Cleanup on unmount
   */
  useEffect(() => {
    return () => {
      // Abort all active uploads
      abortControllersRef.current.forEach((controller) => {
        controller.abort()
      })
      abortControllersRef.current.clear()
      uploadingRef.current = false
    }
  }, [])

  return {
    progress,
    isUploading,
    error,
    startUploading,
    finalizeRecording,
  }
}
