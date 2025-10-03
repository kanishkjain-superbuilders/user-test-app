import { useEffect, useRef, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { RecordingManifest } from '@/lib/recording-utils'

interface UseMSEPlayerOptions {
  recordingId: string
  manifest: RecordingManifest
  onError?: (error: Error) => void
  onEnded?: () => void
}

interface MSEPlayerState {
  isReady: boolean
  isBuffering: boolean
  error: Error | null
  currentSegment: number
  totalSegments: number
}

export function useMSEPlayer({
  recordingId,
  manifest,
  onError,
  onEnded,
}: UseMSEPlayerOptions) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const mediaSourceRef = useRef<MediaSource | null>(null)
  const sourceBufferRef = useRef<SourceBuffer | null>(null)
  const segmentQueueRef = useRef<ArrayBuffer[]>([])
  const isAppendingRef = useRef(false)
  const currentSegmentIndexRef = useRef(0)
  const signedUrlCacheRef = useRef<Map<string, string>>(new Map())
  const inflightSignedUrlRef = useRef<Map<string, Promise<string>>>(new Map())
  const isFetchingSegmentRef = useRef(false)
  const onErrorRef = useRef<typeof onError>(onError)
  const onEndedRef = useRef<typeof onEnded>(onEnded)

  // Keep handler refs stable to avoid effect churn
  useEffect(() => {
    onErrorRef.current = onError
  }, [onError])

  useEffect(() => {
    onEndedRef.current = onEnded
  }, [onEnded])

  const [state, setState] = useState<MSEPlayerState>({
    isReady: false,
    isBuffering: true,
    error: null,
    currentSegment: 0,
    totalSegments: manifest.totalParts,
  })

  // Fetch signed URL for a specific path
  const getSignedUrl = useCallback(
    async (path: string): Promise<string> => {
      // Serve from cache if we already have it
      const cached = signedUrlCacheRef.current.get(path)
      if (cached) return cached

      // If a request is already in-flight for this path, await it
      const inflight = inflightSignedUrlRef.current.get(path)
      if (inflight) return inflight

      const { data: session } = await supabase.auth.getSession()

      const promise = fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sign-playback-url`,
        {
          method: 'POST',
          cache: 'no-store',
          headers: {
            'Content-Type': 'application/json',
            // Use session token if available, otherwise fall back to anon key.
            Authorization: session?.session?.access_token
              ? `Bearer ${session.session.access_token}`
              : `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            recordingId,
            path,
            expiresIn: 3600,
          }),
        }
      )
        .then(async (response) => {
          if (!response.ok) {
            const error = await response.json().catch(() => ({}))
            throw new Error(error.error || 'Failed to get signed URL')
          }
          const { signedUrl } = await response.json()
          signedUrlCacheRef.current.set(path, signedUrl)
          inflightSignedUrlRef.current.delete(path)
          return signedUrl as string
        })
        .catch((err) => {
          inflightSignedUrlRef.current.delete(path)
          throw err
        })

      inflightSignedUrlRef.current.set(path, promise)
      return promise
    },
    [recordingId]
  )

  // Fetch a segment from Supabase Storage with retries
  const fetchSegment = useCallback(
    async (segmentIndex: number): Promise<ArrayBuffer> => {
      const path = `${recordingId}/part-${segmentIndex
        .toString()
        .padStart(5, '0')}.webm`

      const maxRetries = 5
      const baseDelayMs = 250

      for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
          const signedUrl = await getSignedUrl(path)
          const response = await fetch(signedUrl, { cache: 'no-store' })
          if (!response.ok) {
            throw new Error(
              `Failed to fetch segment ${segmentIndex} (status ${response.status})`
            )
          }
          const buffer = await response.arrayBuffer()
          if (buffer.byteLength === 0) {
            throw new Error(`Segment ${segmentIndex} is empty`)
          }
          return buffer
        } catch (err) {
          if (attempt === maxRetries - 1) {
            throw err
          }
          // Exponential backoff
          await new Promise((r) =>
            setTimeout(r, baseDelayMs * Math.pow(2, attempt))
          )
        }
      }

      throw new Error(`Failed to fetch segment ${segmentIndex}`)
    },
    [recordingId, getSignedUrl]
  )

  // Append next chunk from queue to SourceBuffer
  const appendNextChunk = useCallback(() => {
    if (
      isAppendingRef.current ||
      !sourceBufferRef.current ||
      sourceBufferRef.current.updating ||
      segmentQueueRef.current.length === 0
    ) {
      return
    }

    const chunk = segmentQueueRef.current.shift()
    if (chunk) {
      isAppendingRef.current = true
      try {
        sourceBufferRef.current.appendBuffer(chunk)
      } catch (error) {
        console.error('Error appending buffer:', error)
        setState((prev) => ({
          ...prev,
          error: error as Error,
          isBuffering: false,
        }))
        onErrorRef.current?.(error as Error)
      }
    }
  }, [])

  // Load next segment
  const loadNextSegment = useCallback(async () => {
    const segmentIndex = currentSegmentIndexRef.current

    if (segmentIndex >= manifest.totalParts) {
      // All segments loaded
      setState((prev) => ({ ...prev, isBuffering: false }))
      return
    }

    if (isFetchingSegmentRef.current) {
      return
    }

    try {
      isFetchingSegmentRef.current = true
      setState((prev) => ({
        ...prev,
        isBuffering: true,
        currentSegment: segmentIndex,
      }))

      const segmentData = await fetchSegment(segmentIndex)
      segmentQueueRef.current.push(segmentData)

      currentSegmentIndexRef.current++
      appendNextChunk()
    } catch (error) {
      console.error(`Error loading segment ${segmentIndex}:`, error)
      setState((prev) => ({
        ...prev,
        error: error as Error,
        isBuffering: false,
      }))
      onErrorRef.current?.(error as Error)
    } finally {
      isFetchingSegmentRef.current = false
    }
  }, [manifest.totalParts, fetchSegment, appendNextChunk])

  // Initialize MediaSource
  useEffect(() => {
    const video = videoRef.current
    if (!video || !manifest) return

    // Reset state
    currentSegmentIndexRef.current = 0
    segmentQueueRef.current = []
    isAppendingRef.current = false
    sourceBufferRef.current = null

    // Fallback: if recording has a single part, avoid MSE and use direct URL
    if (manifest.totalParts === 1) {
      const revoked = false
      ;(async () => {
        try {
          const path = `${recordingId}/part-00000.webm`
          const url = await getSignedUrl(path)
          video.src = url
          setState((prev) => ({ ...prev, isReady: true, isBuffering: false }))
        } catch (error) {
          setState((prev) => ({
            ...prev,
            error: error as Error,
            isBuffering: false,
          }))
          onErrorRef.current?.(error as Error)
        }
      })()

      const handleEndedDirect = () => {
        onEndedRef.current?.()
      }
      video.addEventListener('ended', handleEndedDirect)

      return () => {
        if (!revoked) {
          video.removeEventListener('ended', handleEndedDirect)
          video.removeAttribute('src')
          video.load()
        }
      }
    }

    const mediaSource = new MediaSource()
    mediaSourceRef.current = mediaSource

    const videoUrl = URL.createObjectURL(mediaSource)
    video.src = videoUrl

    let isSetupComplete = false
    let isCancelled = false

    const handleSourceOpen = () => {
      // Prevent double execution
      if (isSetupComplete || isCancelled || mediaSource.readyState !== 'open') {
        return
      }

      isSetupComplete = true

      try {
        // Create SourceBuffer with the recording's MIME type
        const mimeType = `${manifest.mimeType.split(';')[0]}; codecs="${manifest.codecs}"`

        if (!MediaSource.isTypeSupported(mimeType)) {
          throw new Error(`MIME type ${mimeType} is not supported`)
        }

        const sourceBuffer = mediaSource.addSourceBuffer(mimeType)
        sourceBufferRef.current = sourceBuffer

        // Handle updateend event
        sourceBuffer.addEventListener('updateend', () => {
          isAppendingRef.current = false

          // Append next chunk if available
          if (segmentQueueRef.current.length > 0) {
            appendNextChunk()
          } else if (currentSegmentIndexRef.current < manifest.totalParts) {
            // Load next segment
            loadNextSegment()
          } else {
            // All segments loaded and appended
            if (mediaSource.readyState === 'open') {
              mediaSource.endOfStream()
            }
            setState((prev) => ({ ...prev, isBuffering: false }))
          }
        })

        sourceBuffer.addEventListener('error', (e) => {
          console.error('SourceBuffer error:', e)
          const error = new Error('SourceBuffer error')
          setState((prev) => ({ ...prev, error, isBuffering: false }))
          onErrorRef.current?.(error)
        })

        // Ready to start loading
        setState((prev) => ({ ...prev, isReady: true }))

        // Load first segment
        loadNextSegment()
      } catch (error) {
        console.error('Error setting up MediaSource:', error)
        setState((prev) => ({
          ...prev,
          error: error as Error,
          isReady: false,
          isBuffering: false,
        }))
        onError?.(error as Error)
      }
    }

    mediaSource.addEventListener('sourceopen', handleSourceOpen)

    // Handle video ended event
    const handleEnded = () => {
      onEndedRef.current?.()
    }
    video.addEventListener('ended', handleEnded)

    return () => {
      isCancelled = true
      mediaSource.removeEventListener('sourceopen', handleSourceOpen)
      video.removeEventListener('ended', handleEnded)

      // Pause video to prevent play() interruption errors
      video.pause()

      // Clean up MediaSource
      if (sourceBufferRef.current && !sourceBufferRef.current.updating) {
        try {
          if (mediaSource.readyState === 'open') {
            mediaSource.endOfStream()
          }
        } catch {
          // Ignore errors when cleaning up
        }
      }

      // Clean up video src and URL
      video.removeAttribute('src')
      video.load()
      URL.revokeObjectURL(videoUrl)

      // Clear refs
      mediaSourceRef.current = null
      sourceBufferRef.current = null
      segmentQueueRef.current = []
    }
  }, [manifest, loadNextSegment, appendNextChunk])

  return {
    videoRef,
    ...state,
  }
}
