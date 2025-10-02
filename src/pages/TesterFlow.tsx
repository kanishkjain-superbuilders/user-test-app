import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { Database } from '../lib/database.types'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { RecordingControlBar } from '@/components/RecordingControlBar'
import ReactMarkdown from 'react-markdown'
import {
  Video,
  Mic,
  Camera,
  Play,
  AlertCircle,
  CheckCircle,
} from 'lucide-react'
import { useRecordingManager } from '../hooks/useRecordingManager'
import { useUploadManager } from '../hooks/useUploadManager'
import { isBrowserSupported } from '../lib/recording-utils'
import { toast } from 'sonner'

type TestLink = Database['public']['Tables']['test_links']['Row']

interface RecordOpts {
  screen: boolean
  mic: boolean
  cam: boolean
  maxDurationSec: number
}

type FlowState =
  | 'loading'
  | 'instructions'
  | 'recording'
  | 'uploading'
  | 'complete'
  | 'error'

export default function TesterFlow() {
  const { slug } = useParams<{ slug: string }>()
  const [testLink, setTestLink] = useState<TestLink | null>(null)
  const [flowState, setFlowState] = useState<FlowState>('loading')
  const [error, setError] = useState<string | null>(null)
  const [recordingId, setRecordingId] = useState<string | null>(null)

  // Recording hooks
  const recordingManager = useRecordingManager()
  const uploadManager = useUploadManager()

  const loadTestLink = useCallback(async () => {
    if (!slug) return

    setFlowState('loading')
    setError(null)

    // Check browser support
    const browserCheck = isBrowserSupported()
    if (!browserCheck.supported) {
      setError(browserCheck.reason || 'Browser not supported')
      setFlowState('error')
      return
    }

    const { data, error: fetchError } = await supabase
      .from('test_links')
      .select('*')
      .eq('slug', slug)
      .eq('active', true)
      .single()

    if (fetchError || !data) {
      setError('Test link not found or is no longer active')
      setFlowState('error')
      return
    }

    setTestLink(data)
    setFlowState('instructions')
  }, [slug])

  useEffect(() => {
    loadTestLink()
  }, [loadTestLink])

  const startRecordingFlow = async () => {
    if (!testLink) return

    const opts = testLink.record_opts as unknown as RecordOpts

    try {
      // Create recording entry using RPC function (bypasses RLS issues)
      const { data: recordingId, error: createError } = (await supabase.rpc(
        'create_anon_recording',
        {
          p_test_link_id: testLink.id,
          p_object_path: `recordings/temp-${Date.now()}`,
        } as unknown
      )) as { data: string | null; error: unknown }

      if (createError || !recordingId) {
        console.error('Supabase error:', createError)
        throw new Error(
          `Failed to create recording entry: ${createError?.message || 'Unknown error'}`
        )
      }

      setRecordingId(recordingId)

      // Start recording
      await recordingManager.startRecording(recordingId, {
        screen: opts.screen,
        mic: opts.mic,
        cam: opts.cam,
        maxDurationSec: opts.maxDurationSec,
      })

      setFlowState('recording')
      toast.success('Recording started!')

      // Start uploading chunks in background
      uploadManager.startUploading(recordingId)

      // If there's a redirect URL, open it
      if (testLink.redirect_url) {
        window.open(testLink.redirect_url, '_blank')
      }
    } catch (err) {
      console.error('Failed to start recording:', err)
      setError(err instanceof Error ? err.message : 'Failed to start recording')
      setFlowState('error')
      toast.error('Failed to start recording')
    }
  }

  const handleStopRecording = async () => {
    if (!recordingId) return

    try {
      // Stop recording
      await recordingManager.stopRecording()

      setFlowState('uploading')
      toast.info('Recording stopped. Uploading...')

      // Wait for uploads to complete
      await uploadManager.startUploading(recordingId)

      // Get manifest from store
      const manifest = recordingManager.state

      // Finalize recording
      if (manifest) {
        await uploadManager.finalizeRecording(recordingId, {
          recordingId,
          mimeType: 'video/webm',
          codecs: 'vp8,opus',
          totalParts: 0,
          totalBytes: 0,
          duration: recordingManager.state.duration,
          width: 1920,
          height: 1080,
          createdAt: new Date().toISOString(),
        })
      }

      setFlowState('complete')
      toast.success('Recording uploaded successfully!')
    } catch (err) {
      console.error('Failed to finalize recording:', err)
      setError(
        err instanceof Error ? err.message : 'Failed to finalize recording'
      )
      setFlowState('error')
      toast.error('Failed to upload recording')
    }
  }

  if (flowState === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    )
  }

  if (flowState === 'error' || !testLink) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <div className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-5 w-5" />
              <CardTitle>Error</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              {error || 'This test link is not available'}
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  const opts = testLink.record_opts as unknown as RecordOpts
  const muteState = recordingManager.getMuteState()

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-purple-50/30 to-blue-50/30 dark:from-background dark:via-purple-950/10 dark:to-blue-950/10">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold mb-2 bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
            {testLink.title}
          </h1>
          <p className="text-muted-foreground">User Testing Session</p>
        </div>

        {/* Instructions View */}
        {flowState === 'instructions' && (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Instructions</CardTitle>
              </CardHeader>
              <CardContent className="prose prose-sm max-w-none dark:prose-invert">
                <ReactMarkdown>{testLink.instructions_md}</ReactMarkdown>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>What we'll record</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {opts.screen && (
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <Video className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium">Screen Recording</p>
                        <p className="text-sm text-muted-foreground">
                          We'll capture your screen activity
                        </p>
                      </div>
                    </div>
                  )}

                  {opts.mic && (
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <Mic className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium">Microphone</p>
                        <p className="text-sm text-muted-foreground">
                          Please share your thoughts out loud
                        </p>
                      </div>
                    </div>
                  )}

                  {opts.cam && (
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <Camera className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium">Camera</p>
                        <p className="text-sm text-muted-foreground">
                          We'll capture your video feed
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="pt-4 border-t">
                    <p className="text-sm text-muted-foreground">
                      <strong>Max duration:</strong>{' '}
                      {Math.floor(opts.maxDurationSec / 60)} minutes
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-muted">
              <CardContent className="pt-6">
                <div className="flex gap-3">
                  <AlertCircle className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-muted-foreground">
                    <p className="mb-2">
                      <strong>Privacy:</strong> Your recording will be stored
                      securely and only accessible to the test organizers.
                    </p>
                    <p>
                      By clicking "Start Recording", you consent to recording
                      your screen, audio, and video as specified above.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="flex justify-center pt-4">
              <Button
                size="lg"
                onClick={startRecordingFlow}
                className="gap-2 px-8 shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30 transition-all"
              >
                <Play className="h-5 w-5" />
                Start Recording
              </Button>
            </div>
          </div>
        )}

        {/* Recording View */}
        {flowState === 'recording' && (
          <>
            <Card>
              <CardContent className="py-12 text-center">
                <div className="mb-4">
                  <div className="h-16 w-16 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-4">
                    <div className="h-8 w-8 rounded-full bg-red-500 animate-pulse" />
                  </div>
                  <h2 className="text-2xl font-bold mb-2">
                    Recording in Progress
                  </h2>
                  <p className="text-muted-foreground mb-4">
                    Your session is being recorded. Use the control bar to pause
                    or stop.
                  </p>
                  {testLink.redirect_url && (
                    <p className="text-sm text-muted-foreground">
                      A new tab has been opened with the test environment.
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>

            <RecordingControlBar
              state={recordingManager.state}
              onStop={handleStopRecording}
              onPause={recordingManager.pauseRecording}
              onResume={recordingManager.resumeRecording}
              onToggleMic={() => recordingManager.toggleMute('mic')}
              onToggleCam={() => recordingManager.toggleMute('cam')}
              micMuted={muteState.micMuted}
              camMuted={muteState.camMuted}
              maxDuration={opts.maxDurationSec}
              uploadProgress={uploadManager.progress}
            />
          </>
        )}

        {/* Uploading View */}
        {flowState === 'uploading' && (
          <Card>
            <CardContent className="py-12 text-center">
              <div className="mb-4">
                <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4 animate-pulse">
                  <Play className="h-8 w-8 text-primary" />
                </div>
                <h2 className="text-2xl font-bold mb-2">Uploading Recording</h2>
                <p className="text-muted-foreground mb-6">
                  Please wait while we upload your recording...
                </p>
                <div className="max-w-md mx-auto space-y-2">
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span>Progress</span>
                    <span>
                      {uploadManager.progress.uploadedParts}/
                      {uploadManager.progress.totalParts}
                    </span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary transition-all duration-300"
                      style={{
                        width: `${uploadManager.progress.percentComplete}%`,
                      }}
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Complete View */}
        {flowState === 'complete' && (
          <Card>
            <CardContent className="py-12 text-center">
              <div className="mb-4">
                <div className="h-16 w-16 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-4">
                  <CheckCircle className="h-8 w-8 text-green-500" />
                </div>
                <h2 className="text-2xl font-bold mb-2">Recording Complete!</h2>
                <p className="text-muted-foreground mb-4">
                  Thank you for participating. Your recording has been uploaded
                  successfully.
                </p>
                <p className="text-sm text-muted-foreground">
                  You can now close this window.
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
