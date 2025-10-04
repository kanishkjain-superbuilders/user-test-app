import { useState, useEffect } from 'react'
import { Button } from './ui/button'
import { Card } from './ui/card'
import {
  Circle,
  Square,
  Pause,
  Play,
  Mic,
  MicOff,
  Minimize2,
  Maximize2,
} from 'lucide-react'
import { formatDuration } from '../lib/recording-utils'
import type { RecordingState } from '../hooks/useRecordingManager'

interface RecordingControlBarProps {
  state: RecordingState
  onStop: () => void
  onPause: () => void
  onResume: () => void
  onToggleMic: () => void
  micMuted: boolean
  maxDuration?: number // in seconds
  uploadProgress?: {
    uploadedParts: number
    totalParts: number
    percentComplete: number
  }
}

export function RecordingControlBar({
  state,
  onStop,
  onPause,
  onResume,
  onToggleMic,
  micMuted,
  maxDuration,
  uploadProgress,
}: RecordingControlBarProps) {
  // Simple minimized state for embedded context
  const [isMinimized, setIsMinimized] = useState(false)

  // Draggable state - center horizontally accounting for approximate card width
  const [position, setPosition] = useState({
    x: (window.innerWidth - 320) / 2, // Center accounting for card width
    y: 20
  })
  const [isDragging, setIsDragging] = useState(false)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })

  // Handle dragging
  useEffect(() => {
    if (!isDragging) return

    const handleMouseMove = (e: MouseEvent) => {
      const newX = e.clientX - dragOffset.x
      const newY = e.clientY - dragOffset.y

      // Keep the control bar within viewport bounds
      const cardWidth = isMinimized ? 200 : 320 // Approximate widths
      const cardHeight = isMinimized ? 60 : 300 // Approximate heights

      const boundedX = Math.max(
        0,
        Math.min(window.innerWidth - cardWidth, newX)
      )
      const boundedY = Math.max(
        0,
        Math.min(window.innerHeight - cardHeight, newY)
      )

      setPosition({ x: boundedX, y: boundedY })
    }

    const handleMouseUp = () => {
      setIsDragging(false)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging, dragOffset, isMinimized])

  const handleMouseDown = (e: React.MouseEvent) => {
    // Get the card element's bounding rect
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setDragOffset({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    })
    setIsDragging(true)
  }

  const remainingTime = maxDuration ? maxDuration - state.duration : 0
  const isNearingEnd = maxDuration && remainingTime <= 60 // Last minute

  return (
    <div
      className="fixed z-50"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        transform: 'none', // Remove the transform since we're using absolute positioning
      }}
    >
      <Card
        className="bg-background/95 backdrop-blur-sm border-2 border-primary/20 shadow-2xl"
        onMouseDown={handleMouseDown}
        style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
      >
        {isMinimized ? (
          // Minimized view
          <div className="p-3 flex items-center gap-3">
            <div className="flex items-center gap-2">
              {state.isRecording && !state.isPaused && (
                <div className="relative">
                  <Circle className="h-4 w-4 text-red-500 fill-red-500 animate-pulse" />
                  <Circle className="h-4 w-4 text-red-500 absolute inset-0 animate-ping" />
                </div>
              )}
              {state.isPaused && <Pause className="h-4 w-4 text-yellow-500" />}
              <span className="text-sm font-mono font-semibold">
                {formatDuration(state.duration)}
              </span>
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={(e) => {
                e.stopPropagation()
                setIsMinimized(false)
              }}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <Maximize2 className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          // Expanded view
          <div className="p-4 space-y-3 min-w-[320px]">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {state.isRecording && !state.isPaused && (
                  <div className="relative">
                    <Circle className="h-3 w-3 text-red-500 fill-red-500 animate-pulse" />
                    <Circle className="h-3 w-3 text-red-500 absolute inset-0 animate-ping" />
                  </div>
                )}
                <span className="text-sm font-semibold">
                  {state.isRecording
                    ? state.isPaused
                      ? 'Recording Paused'
                      : 'Recording'
                    : 'Recording Stopped'}
                </span>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={(e) => {
                  e.stopPropagation()
                  setIsMinimized(true)
                }}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <Minimize2 className="h-4 w-4" />
              </Button>
            </div>

            {/* Timer */}
            <div className="text-center">
              <div className="text-3xl font-mono font-bold">
                {formatDuration(state.duration)}
              </div>
              {maxDuration && (
                <div
                  className={`text-sm ${
                    isNearingEnd
                      ? 'text-red-500 font-semibold'
                      : 'text-muted-foreground'
                  }`}
                >
                  {remainingTime > 0
                    ? `${formatDuration(remainingTime)} remaining`
                    : 'Time expired'}
                </div>
              )}
            </div>

            {/* Upload progress */}
            {uploadProgress && uploadProgress.totalParts > 0 && (
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Uploading chunks</span>
                  <span>
                    {uploadProgress.uploadedParts}/{uploadProgress.totalParts}
                  </span>
                </div>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all duration-300"
                    style={{ width: `${uploadProgress.percentComplete}%` }}
                  />
                </div>
              </div>
            )}

            {/* Controls */}
            <div className="flex items-center justify-center gap-2">
              {/* Mic toggle */}
              <Button
                size="sm"
                variant={micMuted ? 'destructive' : 'outline'}
                onClick={(e) => {
                  e.stopPropagation()
                  onToggleMic()
                }}
                onMouseDown={(e) => e.stopPropagation()}
                disabled={!state.isRecording}
              >
                {micMuted ? (
                  <MicOff className="h-4 w-4" />
                ) : (
                  <Mic className="h-4 w-4" />
                )}
              </Button>

              {/* Pause/Resume */}
              {state.isRecording && !state.isPaused && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={(e) => {
                    e.stopPropagation()
                    onPause()
                  }}
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  <Pause className="h-4 w-4" />
                  <span className="ml-1.5">Pause</span>
                </Button>
              )}

              {state.isPaused && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={(e) => {
                    e.stopPropagation()
                    onResume()
                  }}
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  <Play className="h-4 w-4" />
                  <span className="ml-1.5">Resume</span>
                </Button>
              )}

              {/* Stop */}
              <Button
                size="sm"
                variant="destructive"
                onClick={(e) => {
                  e.stopPropagation()
                  onStop()
                }}
                onMouseDown={(e) => e.stopPropagation()}
                disabled={!state.isRecording && !state.isPaused}
              >
                <Square className="h-4 w-4" />
                <span className="ml-1.5">Stop</span>
              </Button>
            </div>

            {/* Error message */}
            {state.error && (
              <div className="text-xs text-red-500 text-center p-2 bg-red-50 dark:bg-red-950/20 rounded">
                {state.error}
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  )
}
