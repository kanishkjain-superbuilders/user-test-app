import { useEffect, useState } from 'react'
import { RecordingControlBar } from '@/components/RecordingControlBar'
import type { RecordingState } from '../hooks/useRecordingManager'

interface PopupMessage {
  type: 'STATE_UPDATE' | 'MUTE_STATE_UPDATE'
  state?: RecordingState
  muteState?: {
    micMuted: boolean
  }
  maxDuration?: number
  uploadProgress?: {
    uploadedParts: number
    totalParts: number
    percentComplete: number
  }
}

export default function ControlBarPopup() {
  const [state, setState] = useState<RecordingState>({
    isRecording: false,
    isPaused: false,
    duration: 0,
    error: null,
  })
  const [muteState, setMuteState] = useState({
    micMuted: false,
  })
  const [maxDuration, setMaxDuration] = useState<number | undefined>(undefined)
  const [uploadProgress, setUploadProgress] = useState<{
    uploadedParts: number
    totalParts: number
    percentComplete: number
  }>({ uploadedParts: 0, totalParts: 0, percentComplete: 0 })

  // Listen for messages from parent window
  useEffect(() => {
    const handleMessage = (event: MessageEvent<PopupMessage>) => {
      // Security: verify origin if needed
      // if (event.origin !== window.location.origin) return

      const {
        type,
        state: newState,
        muteState: newMuteState,
        maxDuration: newMaxDuration,
        uploadProgress: newUploadProgress,
      } = event.data

      if (type === 'STATE_UPDATE' && newState) {
        setState(newState)
        if (newMaxDuration !== undefined) {
          setMaxDuration(newMaxDuration)
        }
        if (newUploadProgress) {
          setUploadProgress(newUploadProgress)
        }
      } else if (type === 'MUTE_STATE_UPDATE' && newMuteState) {
        setMuteState(newMuteState)
      }
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [])

  const sendMessage = (type: string) => {
    if (window.opener) {
      window.opener.postMessage({ type, source: 'controlBar' }, '*')
    }
  }

  const handleStop = () => sendMessage('STOP')
  const handlePause = () => sendMessage('PAUSE')
  const handleResume = () => sendMessage('RESUME')
  const handleToggleMic = () => sendMessage('TOGGLE_MIC')

  return (
    <div className="w-screen h-screen overflow-hidden bg-transparent">
      <RecordingControlBar
        state={state}
        onStop={handleStop}
        onPause={handlePause}
        onResume={handleResume}
        onToggleMic={handleToggleMic}
        micMuted={muteState.micMuted}
        maxDuration={maxDuration}
        uploadProgress={uploadProgress}
      />
    </div>
  )
}
