import { useCallback, useRef, useState } from 'react'
import { getBestMimeType, generateManifest } from '../lib/recording-utils'
import { addToUploadQueue } from '../lib/upload-db'
import { useRecordingStore } from '../store/recording'

export interface RecordingOptions {
  screen: boolean
  mic: boolean
  cam: boolean
  maxDurationSec: number
  timesliceMs?: number // Chunk duration in milliseconds (default: 5000)
}

export interface RecordingState {
  isRecording: boolean
  isPaused: boolean
  duration: number // Elapsed time in seconds
  error: string | null
}

export interface RecordingManager {
  state: RecordingState
  startRecording: (
    recordingId: string,
    options: RecordingOptions
  ) => Promise<void>
  stopRecording: () => Promise<void>
  pauseRecording: () => void
  resumeRecording: () => void
  toggleMute: (type: 'mic' | 'cam') => void
  getMuteState: () => { micMuted: boolean; camMuted: boolean }
}

export function useRecordingManager(): RecordingManager {
  const [state, setState] = useState<RecordingState>({
    isRecording: false,
    isPaused: false,
    duration: 0,
    error: null,
  })

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const streamsRef = useRef<{
    screen: MediaStream | null
    audio: MediaStream | null
    video: MediaStream | null
    combined: MediaStream | null
  }>({
    screen: null,
    audio: null,
    video: null,
    combined: null,
  })
  const recordingIdRef = useRef<string | null>(null)
  const partIndexRef = useRef<number>(0)
  const totalBytesRef = useRef<number>(0)
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const startTimeRef = useRef<number>(0)
  const maxDurationRef = useRef<number>(0)
  const mimeTypeRef = useRef<string>('')
  const dimensionsRef = useRef<{ width: number; height: number }>({
    width: 0,
    height: 0,
  })

  const { setManifest } = useRecordingStore()

  /**
   * Cleanup all media streams and resources
   */
  const cleanup = useCallback(() => {
    // Stop all tracks
    Object.values(streamsRef.current).forEach((stream) => {
      stream?.getTracks().forEach((track) => track.stop())
    })

    // Clear streams
    streamsRef.current = {
      screen: null,
      audio: null,
      video: null,
      combined: null,
    }

    // Clear timer
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }

    // Clear media recorder
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current = null
    }
  }, [])

  /**
   * Stop timer
   */
  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [])

  /**
   * Stop recording
   */
  const stopRecording = useCallback(async (): Promise<void> => {
    if (!mediaRecorderRef.current || !recordingIdRef.current) {
      return
    }

    return new Promise((resolve) => {
      const mediaRecorder = mediaRecorderRef.current!

      // Handle final chunk
      mediaRecorder.onstop = async () => {
        stopTimer()

        // Generate manifest
        const manifest = generateManifest(
          recordingIdRef.current!,
          mimeTypeRef.current,
          partIndexRef.current,
          totalBytesRef.current,
          state.duration,
          dimensionsRef.current.width,
          dimensionsRef.current.height
        )

        setManifest(manifest)

        // Cleanup
        cleanup()

        setState({
          isRecording: false,
          isPaused: false,
          duration: 0,
          error: null,
        })

        resolve()
      }

      // Stop the recorder
      if (mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop()
      } else {
        stopTimer()
        cleanup()
        setState({
          isRecording: false,
          isPaused: false,
          duration: 0,
          error: null,
        })
        resolve()
      }
    })
  }, [cleanup, stopTimer, setManifest, state.duration])

  /**
   * Start timer to track duration
   */
  const startTimer = useCallback(() => {
    startTimeRef.current = Date.now()

    timerRef.current = setInterval(() => {
      const elapsed = (Date.now() - startTimeRef.current) / 1000
      setState((prev) => ({ ...prev, duration: elapsed }))

      // Auto-stop at max duration
      if (maxDurationRef.current > 0 && elapsed >= maxDurationRef.current) {
        stopRecording()
      }
    }, 100)
  }, [stopRecording])

  /**
   * Start recording
   */
  const startRecording = useCallback(
    async (recordingId: string, options: RecordingOptions): Promise<void> => {
      try {
        recordingIdRef.current = recordingId
        partIndexRef.current = 0
        totalBytesRef.current = 0
        maxDurationRef.current = options.maxDurationSec

        // Get screen stream
        let screenStream: MediaStream | null = null
        if (options.screen) {
          screenStream = await navigator.mediaDevices.getDisplayMedia({
            video: {
              width: { ideal: 1920 },
              height: { ideal: 1080 },
              frameRate: { ideal: 30 },
            },
            audio: false,
          })
          streamsRef.current.screen = screenStream

          // Get video dimensions
          const videoTrack = screenStream.getVideoTracks()[0]
          const settings = videoTrack.getSettings()
          dimensionsRef.current = {
            width: settings.width || 1920,
            height: settings.height || 1080,
          }

          // Stop recording if user stops screen share
          videoTrack.onended = () => {
            stopRecording()
          }
        }

        // Get audio/video stream
        const constraints: MediaStreamConstraints = {}
        if (options.mic) {
          constraints.audio = {
            echoCancellation: true,
            noiseSuppression: true,
            sampleRate: 48000,
          }
        }
        if (options.cam) {
          constraints.video = {
            width: { ideal: 640 },
            height: { ideal: 480 },
            frameRate: { ideal: 30 },
          }
        }

        let userMediaStream: MediaStream | null = null
        if (options.mic || options.cam) {
          userMediaStream =
            await navigator.mediaDevices.getUserMedia(constraints)
          if (options.mic) {
            streamsRef.current.audio = new MediaStream(
              userMediaStream.getAudioTracks()
            )
          }
          if (options.cam) {
            streamsRef.current.video = new MediaStream(
              userMediaStream.getVideoTracks()
            )
          }
        }

        // Combine streams
        const combinedStream = new MediaStream()

        // Add screen video if present
        if (screenStream) {
          screenStream.getVideoTracks().forEach((track) => {
            combinedStream.addTrack(track)
          })
        }

        // Add camera video if present and no screen
        if (!screenStream && options.cam && streamsRef.current.video) {
          streamsRef.current.video.getVideoTracks().forEach((track) => {
            combinedStream.addTrack(track)
          })
        }

        // Add microphone audio
        if (options.mic && streamsRef.current.audio) {
          streamsRef.current.audio.getAudioTracks().forEach((track) => {
            combinedStream.addTrack(track)
          })
        }

        streamsRef.current.combined = combinedStream

        // Determine MIME type
        const hasVideo = options.screen || options.cam
        const hasAudio = options.mic
        const mimeType = getBestMimeType(hasVideo, hasAudio)

        if (!mimeType) {
          throw new Error('No supported MIME type found for recording')
        }

        mimeTypeRef.current = mimeType

        // Create MediaRecorder
        const timeslice = options.timesliceMs || 5000 // 5 seconds default
        const mediaRecorder = new MediaRecorder(combinedStream, {
          mimeType,
          videoBitsPerSecond: 2500000, // 2.5 Mbps
          audioBitsPerSecond: 128000, // 128 kbps
        })

        mediaRecorderRef.current = mediaRecorder

        // Handle data available (chunks)
        mediaRecorder.ondataavailable = async (event) => {
          if (event.data && event.data.size > 0) {
            const blob = event.data
            totalBytesRef.current += blob.size

            // Add to IndexedDB upload queue
            try {
              await addToUploadQueue(
                recordingId,
                partIndexRef.current,
                blob,
                mimeType
              )
              partIndexRef.current++
            } catch (error) {
              console.error('Failed to queue chunk for upload:', error)
              setState((prev) => ({
                ...prev,
                error: 'Failed to save recording chunk',
              }))
            }
          }
        }

        // Handle errors
        mediaRecorder.onerror = (event) => {
          console.error('MediaRecorder error:', event)
          setState((prev) => ({
            ...prev,
            error: 'Recording error occurred',
          }))
          stopRecording()
        }

        // Start recording
        mediaRecorder.start(timeslice)
        setState({
          isRecording: true,
          isPaused: false,
          duration: 0,
          error: null,
        })

        startTimer()
      } catch (error) {
        console.error('Failed to start recording:', error)
        cleanup()
        setState((prev) => ({
          ...prev,
          error:
            error instanceof Error
              ? error.message
              : 'Failed to start recording',
        }))
        throw error
      }
    },
    [cleanup, startTimer, stopRecording]
  )

  /**
   * Pause recording
   */
  const pauseRecording = useCallback(() => {
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state === 'recording'
    ) {
      mediaRecorderRef.current.pause()
      stopTimer()
      setState((prev) => ({ ...prev, isPaused: true }))
    }
  }, [stopTimer])

  /**
   * Resume recording
   */
  const resumeRecording = useCallback(() => {
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state === 'paused'
    ) {
      mediaRecorderRef.current.resume()
      startTimer()
      setState((prev) => ({ ...prev, isPaused: false }))
    }
  }, [startTimer])

  /**
   * Toggle mute for mic or camera
   */
  const toggleMute = useCallback((type: 'mic' | 'cam') => {
    const stream =
      type === 'mic' ? streamsRef.current.audio : streamsRef.current.video
    if (!stream) return

    const tracks =
      type === 'mic' ? stream.getAudioTracks() : stream.getVideoTracks()
    tracks.forEach((track) => {
      track.enabled = !track.enabled
    })
  }, [])

  /**
   * Get mute state
   */
  const getMuteState = useCallback((): {
    micMuted: boolean
    camMuted: boolean
  } => {
    const audioTrack = streamsRef.current.audio?.getAudioTracks()[0]
    const videoTrack = streamsRef.current.video?.getVideoTracks()[0]

    return {
      micMuted: audioTrack ? !audioTrack.enabled : false,
      camMuted: videoTrack ? !videoTrack.enabled : false,
    }
  }, [])

  return {
    state,
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
    toggleMute,
    getMuteState,
  }
}
