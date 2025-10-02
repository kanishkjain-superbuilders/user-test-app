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
      const { data: session } = await supabase.auth.getSession()
      if (!session?.session?.access_token) {
        throw new Error('Not authenticated')
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sign-playback-url`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.session.access_token}`,
          },
          body: JSON.stringify({
            recordingId,
            path,
            expiresIn: 3600,
          }),
        }
      )

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to get signed URL')
      }

      const { signedUrl } = await response.json()
      return signedUrl
    },
    [recordingId]
  )

  // Fetch a segment from Supabase Storage
  const fetchSegment = useCallback(
    async (segmentIndex: number): Promise<ArrayBuffer> => {
      const path = `recordings/${recordingId}/part-${segmentIndex
        .toString()
        .padStart(5, '0')}.webm`
      const signedUrl = await getSignedUrl(path)

      const response = await fetch(signedUrl)
      if (!response.ok) {
        throw new Error(`Failed to fetch segment ${segmentIndex}`)
      }

      return await response.arrayBuffer()
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
        onError?.(error as Error)
      }
    }
  }, [onError])

  // Load next segment
  const loadNextSegment = useCallback(async () => {
    const segmentIndex = currentSegmentIndexRef.current

    if (segmentIndex >= manifest.totalParts) {
      // All segments loaded
      setState((prev) => ({ ...prev, isBuffering: false }))
      return
    }

    try {
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
      onError?.(error as Error)
    }
  }, [manifest.totalParts, fetchSegment, appendNextChunk, onError])

  // Initialize MediaSource
  useEffect(() => {
    const video = videoRef.current
    if (!video || !manifest) return

    // Reset state
    currentSegmentIndexRef.current = 0
    segmentQueueRef.current = []
    isAppendingRef.current = false
    sourceBufferRef.current = null

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
          onError?.(error)
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
      onEnded?.()
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
  }, [manifest, loadNextSegment, appendNextChunk, onError, onEnded])

  return {
    videoRef,
    ...state,
  }
}
