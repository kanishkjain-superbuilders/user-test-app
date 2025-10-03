import { useState, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Play, Pause, Volume2, VolumeX, Maximize, Loader2 } from 'lucide-react'
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (error) {
    return (
      <div
        className={`bg-black rounded-lg flex items-center justify-center ${className}`}
      >
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
      className={`bg-black rounded-xl overflow-hidden shadow-2xl ${className} group`}
    >
      {/* Video Element */}
      <div className="relative aspect-video bg-gradient-to-br from-gray-900 via-black to-gray-900">
        <video ref={videoRef} className="w-full h-full" onClick={togglePlay} />

        {/* Loading Overlay */}
        {(isBuffering || !isReady) && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-in fade-in-0 duration-300">
            <div className="text-center">
              <Loader2 className="w-16 h-16 text-white animate-spin mx-auto mb-3" />
              <p className="text-white/70 text-sm font-medium">
                Loading video...
              </p>
            </div>
          </div>
        )}

        {/* Play/Pause Overlay */}
        {!isPlaying && isReady && !isBuffering && (
          <div
            className="absolute inset-0 flex items-center justify-center cursor-pointer animate-in fade-in-0 duration-200"
            onClick={togglePlay}
          >
            <div className="relative w-24 h-24 rounded-full flex items-center justify-center transition-all duration-300 hover:scale-110 glass">
              <div className="absolute inset-0 rounded-full bg-gradient-to-br from-primary to-accent opacity-80 blur-xl animate-pulse" />
              <Play className="w-12 h-12 text-white ml-1 relative z-10 drop-shadow-lg" />
            </div>
          </div>
        )}

        {/* Gradient overlay for better control visibility */}
        <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-black/80 via-black/40 to-transparent pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      </div>

      {/* Controls */}
      <div className="glass-strong p-5 transition-all duration-300">
        {/* Timeline */}
        <div className="mb-4">
          <div className="relative group/timeline">
            <input
              type="range"
              min={0}
              max={duration || manifest.duration}
              value={currentTime}
              onChange={handleSeek}
              className="w-full h-2 bg-gray-700/50 rounded-full appearance-none cursor-pointer transition-all hover:h-3 disabled:cursor-not-allowed disabled:opacity-50"
              style={{
                background: `linear-gradient(to right,
                  hsl(var(--primary)) 0%,
                  hsl(var(--accent)) ${(currentTime / (duration || manifest.duration)) * 100}%,
                  rgb(55, 65, 81) ${(currentTime / (duration || manifest.duration)) * 100}%,
                  rgb(55, 65, 81) 100%)`,
              }}
              disabled={!isReady}
            />
          </div>
          <div className="flex justify-between items-center text-xs text-gray-400 mt-2">
            <span className="font-mono bg-black/30 px-2 py-1 rounded">
              {formatDuration(currentTime)}
            </span>
            <span className="font-mono bg-black/30 px-2 py-1 rounded">
              {formatDuration(duration || manifest.duration)}
            </span>
          </div>
        </div>

        {/* Control Buttons */}
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={togglePlay}
            disabled={!isReady}
            className="text-white hover:bg-white/20 hover:scale-110 transition-all disabled:opacity-50 disabled:hover:scale-100 w-10 h-10"
          >
            {isPlaying ? (
              <Pause className="w-5 h-5" />
            ) : (
              <Play className="w-5 h-5" />
            )}
          </Button>

          <Separator orientation="vertical" className="h-6 bg-gray-600/50" />

          <Button
            variant="ghost"
            size="icon"
            onClick={toggleMute}
            className="text-white hover:bg-white/20 hover:scale-110 transition-all w-10 h-10"
          >
            {isMuted ? (
              <VolumeX className="w-5 h-5" />
            ) : (
              <Volume2 className="w-5 h-5" />
            )}
          </Button>

          <div className="relative group/volume">
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={volume}
              onChange={handleVolumeChange}
              className="w-24 h-2 bg-gray-700/50 rounded-full appearance-none cursor-pointer transition-all hover:h-3"
              style={{
                background: `linear-gradient(to right,
                  hsl(var(--primary)) 0%,
                  hsl(var(--primary)) ${volume * 100}%,
                  rgb(55, 65, 81) ${volume * 100}%,
                  rgb(55, 65, 81) 100%)`,
              }}
            />
          </div>

          <div className="flex-1" />

          <div className="text-xs text-gray-400 font-mono bg-black/30 px-3 py-1.5 rounded-full">
            {manifest.width} × {manifest.height}
          </div>

          <Button
            variant="ghost"
            size="icon"
            onClick={toggleFullscreen}
            className="text-white hover:bg-white/20 hover:scale-110 transition-all w-10 h-10"
          >
            <Maximize className="w-5 h-5" />
          </Button>
        </div>

        {/* Keyboard shortcuts hint */}
        <div className="mt-3 pt-3 border-t border-white/10">
          <div className="flex gap-4 text-xs text-gray-500">
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-black/30 rounded text-gray-400 font-mono">
                Space
              </kbd>
              <span>Play/Pause</span>
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-black/30 rounded text-gray-400 font-mono">
                M
              </kbd>
              <span>Mute</span>
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-black/30 rounded text-gray-400 font-mono">
                F
              </kbd>
              <span>Fullscreen</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
