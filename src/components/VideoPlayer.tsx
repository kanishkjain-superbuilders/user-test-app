import { useState, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Loader2,
} from 'lucide-react'
import { formatDuration } from '@/lib/recording-utils'
import { useMSEPlayer } from '@/hooks/useMSEPlayer'
import type { RecordingManifest } from '@/lib/recording-utils'

interface VideoPlayerProps {
  recordingId: string
  manifest: RecordingManifest
  className?: string
}

export function VideoPlayer({
  recordingId,
  manifest,
  className = '',
}: VideoPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(1)
  const containerRef = useRef<HTMLDivElement>(null)

  const { videoRef, isReady, isBuffering, error } = useMSEPlayer({
    recordingId,
    manifest,
    onError: (err) => {
      console.error('MSE Player error:', err)
    },
    onEnded: () => {
      setIsPlaying(false)
    },
  })

  // Update current time
  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const handleTimeUpdate = () => {
      setCurrentTime(video.currentTime)
    }

    const handleLoadedMetadata = () => {
      setDuration(video.duration || manifest.duration)
    }

    video.addEventListener('timeupdate', handleTimeUpdate)
    video.addEventListener('loadedmetadata', handleLoadedMetadata)

    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate)
      video.removeEventListener('loadedmetadata', handleLoadedMetadata)
    }
  }, [videoRef, manifest.duration])

  // Play/Pause
  const togglePlay = () => {
    const video = videoRef.current
    if (!video) return

    if (video.paused) {
      video.play()
      setIsPlaying(true)
    } else {
      video.pause()
      setIsPlaying(false)
    }
  }

  // Mute/Unmute
  const toggleMute = () => {
    const video = videoRef.current
    if (!video) return

    video.muted = !video.muted
    setIsMuted(video.muted)
  }

  // Seek
  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const video = videoRef.current
    if (!video) return

    const time = parseFloat(e.target.value)
    video.currentTime = time
    setCurrentTime(time)
  }

  // Volume
  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const video = videoRef.current
    if (!video) return

    const vol = parseFloat(e.target.value)
    video.volume = vol
    setVolume(vol)
    setIsMuted(vol === 0)
  }

  // Fullscreen
  const toggleFullscreen = () => {
    const container = containerRef.current
    if (!container) return

    if (!document.fullscreenElement) {
      container.requestFullscreen()
    } else {
      document.exitFullscreen()
    }
  }

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return

      switch (e.key) {
        case ' ':
        case 'k':
          e.preventDefault()
          togglePlay()
          break
        case 'm':
          e.preventDefault()
          toggleMute()
          break
        case 'f':
          e.preventDefault()
          toggleFullscreen()
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  if (error) {
    return (
      <div className={`bg-black rounded-lg flex items-center justify-center ${className}`}>
        <div className="text-center text-white p-8">
          <p className="text-xl font-semibold mb-2">Failed to load video</p>
          <p className="text-sm text-red-400">{error.message}</p>
        </div>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className={`bg-black rounded-lg overflow-hidden ${className}`}
    >
      {/* Video Element */}
      <div className="relative aspect-video bg-black">
        <video
          ref={videoRef}
          className="w-full h-full"
          onClick={togglePlay}
        />

        {/* Loading Overlay */}
        {(isBuffering || !isReady) && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
            <Loader2 className="w-12 h-12 text-white animate-spin" />
          </div>
        )}

        {/* Play/Pause Overlay */}
        {!isPlaying && isReady && !isBuffering && (
          <div
            className="absolute inset-0 flex items-center justify-center cursor-pointer"
            onClick={togglePlay}
          >
            <div className="w-20 h-20 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center hover:bg-white/30 transition-colors">
              <Play className="w-10 h-10 text-white ml-1" />
            </div>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="bg-gray-900 p-4">
        {/* Timeline */}
        <div className="mb-3">
          <input
            type="range"
            min={0}
            max={duration || manifest.duration}
            value={currentTime}
            onChange={handleSeek}
            className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
            disabled={!isReady}
          />
          <div className="flex justify-between text-xs text-gray-400 mt-1">
            <span>{formatDuration(currentTime)}</span>
            <span>{formatDuration(duration || manifest.duration)}</span>
          </div>
        </div>

        {/* Control Buttons */}
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={togglePlay}
            disabled={!isReady}
            className="text-white hover:bg-gray-800"
          >
            {isPlaying ? (
              <Pause className="w-5 h-5" />
            ) : (
              <Play className="w-5 h-5" />
            )}
          </Button>

          <Separator orientation="vertical" className="h-6 bg-gray-700" />

          <Button
            variant="ghost"
            size="icon"
            onClick={toggleMute}
            className="text-white hover:bg-gray-800"
          >
            {isMuted ? (
              <VolumeX className="w-5 h-5" />
            ) : (
              <Volume2 className="w-5 h-5" />
            )}
          </Button>

          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={volume}
            onChange={handleVolumeChange}
            className="w-20 h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
          />

          <div className="flex-1" />

          <div className="text-sm text-gray-400">
            {manifest.width} x {manifest.height}
          </div>

          <Button
            variant="ghost"
            size="icon"
            onClick={toggleFullscreen}
            className="text-white hover:bg-gray-800"
          >
            <Maximize className="w-5 h-5" />
          </Button>
        </div>
      </div>
    </div>
  )
}
