import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Radio,
  Users,
  Send,
  Loader2,
  AlertCircle,
  WifiOff,
  CheckCircle,
  StopCircle,
} from 'lucide-react'
import { useLiveStore } from '../store/live'
import { supabase } from '../lib/supabase'
import { toast } from 'sonner'
import type { Database } from '../lib/database.types'

type LiveSession = Database['public']['Tables']['live_sessions']['Row']
type TestLink = Database['public']['Tables']['test_links']['Row']

// Type override for Supabase query issues
interface LiveSessionExtended extends Partial<LiveSession> {
  max_viewers?: number
  channel_name?: string
  recording_id?: string
  tester_id?: string
  test_links?: Partial<TestLink>
}

export default function LiveViewer() {
  const { liveSessionId: sessionId } = useParams<{ liveSessionId: string }>()
  const navigate = useNavigate()
  const [isJoining, setIsJoining] = useState(false)
  const [session, setSession] = useState<LiveSessionExtended | null>(null)
  const [userId, setUserId] = useState<string>('')
  const [commentText, setCommentText] = useState('')
  const [sendingComment, setSendingComment] = useState(false)
  const [showEndDialog, setShowEndDialog] = useState(false)
  const [endingRecording, setEndingRecording] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)

  const {
    setLiveSession,
    remoteStreams,
    presence,
    viewerCount,
    comments,
    connectionState,
    initChannel,
    cleanup,
    addComment,
  } = useLiveStore()

  // Callback ref to ensure stream is set immediately when video element mounts
  const setVideoRef = useCallback((element: HTMLVideoElement | null) => {
    videoRef.current = element
    if (element && remoteStreams.size > 0) {
      const broadcasterStream = Array.from(remoteStreams.values())[0]
      if (broadcasterStream) {
        console.log('[VIEWER] Setting srcObject via callback ref:', {
          streamId: broadcasterStream.id,
          trackCount: broadcasterStream.getTracks().length,
        })
        element.srcObject = broadcasterStream
      }
    }
  }, [remoteStreams])

  // Get user ID on mount - require authentication
  useEffect(() => {
    const getUserId = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (user) {
        setUserId(user.id)
      } else {
        // Redirect to login if not authenticated
        toast.error('You must be logged in to view live sessions')
        navigate('/login')
      }
    }
    getUserId()
  }, [navigate])

  // Load session and join
  useEffect(() => {
    if (!sessionId || !userId) return

    const loadAndJoinSession = async () => {
      setIsJoining(true)

      try {
        // Check if user can view this session
        const { data: canView, error: accessError } =
          await // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (supabase.rpc as any)('can_view_live_session', {
            p_session_id: sessionId,
          })

        if (accessError || !canView) {
          throw new Error(
            'You do not have permission to view this live session. Only members of the project organization can view live sessions.'
          )
        }

        // Get session details with test link info
        const { data: sessionData, error } = await supabase
          .from('live_sessions')
          .select('*, test_links!test_link_id(*)')
          .eq('id', sessionId)
          .eq('status', 'active')
          .single()

        if (error || !sessionData) {
          throw new Error('Session not found or has ended')
        }

        const typedSession = sessionData as unknown as LiveSessionExtended
        setSession(typedSession)
        setLiveSession(typedSession as LiveSession)

        // Check viewer limit
        const { data: viewers, error: viewerError } = await supabase
          .from('live_viewers')
          .select('*')
          .eq('live_session_id', sessionId)
          .eq('status', 'active')

        if (viewerError) {
          console.error('Failed to check viewer count:', viewerError)
        }

        if (viewers && viewers.length >= (typedSession.max_viewers ?? 5)) {
          toast.warning('Session is full. You are in the waiting queue.')
        }

        // Record viewer join
        await supabase.from('live_viewers').insert({
          live_session_id: sessionId,
          viewer_id: userId,
          status: 'active',
          joined_at: new Date().toISOString(),
        } as any) // eslint-disable-line @typescript-eslint/no-explicit-any

        // Initialize WebRTC channel as viewer
        console.log('[VIEWER] Attempting to join channel:', {
          sessionId: typedSession.id,
          channelName: typedSession.channel_name,
          viewerId: userId,
        })
        await initChannel(typedSession.channel_name || '', 'viewer', userId)

        toast.success('Joined live session!')
      } catch (error) {
        console.error('Failed to join session:', error)
        toast.error(
          error instanceof Error ? error.message : 'Failed to join session'
        )
        navigate('/app')
      } finally {
        setIsJoining(false)
      }
    }

    loadAndJoinSession()

    // Cleanup on unmount
    return () => {
      if (sessionId && userId) {
        // Mark viewer as left
        supabase
          .from('live_viewers')
          // @ts-expect-error - Type issue with Supabase generated types
          .update({
            status: 'disconnected',
            left_at: new Date().toISOString(),
          } as any) // eslint-disable-line @typescript-eslint/no-explicit-any
          .eq('live_session_id', sessionId)
          .eq('viewer_id', userId)
          .then(() => {
            cleanup()
          })
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, userId, navigate, cleanup])

  // Display remote stream
  useEffect(() => {
    console.log('[VIEWER] Remote streams updated:', {
      streamCount: remoteStreams.size,
      streamIds: Array.from(remoteStreams.keys()),
    })

    if (remoteStreams.size > 0 && videoRef.current) {
      // Get the first (broadcaster's) stream
      const broadcasterStream = Array.from(remoteStreams.values())[0]
      if (broadcasterStream) {
        console.log('[VIEWER] Setting video srcObject:', {
          streamId: broadcasterStream.id,
          trackCount: broadcasterStream.getTracks().length,
          tracks: broadcasterStream.getTracks().map(t => ({
            kind: t.kind,
            enabled: t.enabled,
            readyState: t.readyState,
          })),
        })
        videoRef.current.srcObject = broadcasterStream
      }
    } else {
      console.log('[VIEWER] No remote streams or video ref not ready:', {
        hasStreams: remoteStreams.size > 0,
        hasVideoRef: !!videoRef.current,
      })
    }
  }, [remoteStreams])

  // Send comment
  const sendComment = async () => {
    if (!commentText.trim() || !session) return

    setSendingComment(true)

    try {
      const comment = {
        id: crypto.randomUUID(),
        recording_id: null,
        live_session_id: session.id || '',
        user_id: userId, // Should always be a valid user ID since we require authentication
        author_name: `User ${userId.slice(0, 8)}`,
        timestamp_ms: null,
        body: commentText,
        kind: 'comment' as const,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }

      // Add to local state immediately
      addComment(comment)

      // Broadcast comment
      const { channel } = useLiveStore.getState()
      if (channel) {
        channel.send({
          type: 'broadcast',
          event: 'comment',
          payload: comment,
        })
      }

      // Save to database
      await supabase.from('comments').insert(comment as any) // eslint-disable-line @typescript-eslint/no-explicit-any

      setCommentText('')
    } catch (error) {
      console.error('Failed to send comment:', error)
      toast.error('Failed to send comment')
    } finally {
      setSendingComment(false)
    }
  }

  // End recording
  const handleEndRecording = async () => {
    if (!session || !session.tester_id) return

    setEndingRecording(true)

    try {
      // Call RPC to end the session
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.rpc as any)('end_test_live_session', {
        p_session_id: session.id,
        p_tester_id: session.tester_id,
      })

      if (error) {
        throw error
      }

      // Broadcast session end to all viewers
      const { channel } = useLiveStore.getState()
      if (channel) {
        channel.send({
          type: 'broadcast',
          event: 'session-ended',
          payload: {},
        })
      }

      toast.success('Recording ended successfully. Video upload will begin.')
      setShowEndDialog(false)

      // Navigate back to app after a short delay
      setTimeout(() => {
        navigate('/app')
      }, 2000)
    } catch (error) {
      console.error('Failed to end recording:', error)
      toast.error('Failed to end recording')
    } finally {
      setEndingRecording(false)
    }
  }

  if (isJoining) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center space-y-4">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-lg font-medium">Joining live session...</p>
              <p className="text-sm text-muted-foreground">
                Setting up connection to broadcaster
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center space-y-4">
              <AlertCircle className="h-8 w-8 text-destructive" />
              <p className="text-lg font-medium">Session not available</p>
              <Button onClick={() => navigate('/app')}>Go to App</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto p-4 max-w-7xl">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Main Video Area */}
          <div className="lg:col-span-2 space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <CardTitle>
                      {session.test_links?.title || 'Live Test Session'}
                    </CardTitle>
                    <Badge variant="destructive" className="animate-pulse">
                      <Radio className="h-3 w-3 mr-1" />
                      LIVE
                    </Badge>
                  </div>
                  <Badge
                    variant={
                      connectionState === 'connected'
                        ? 'default'
                        : connectionState === 'connecting'
                          ? 'secondary'
                          : 'destructive'
                    }
                  >
                    {connectionState === 'connected' && (
                      <CheckCircle className="h-3 w-3 mr-1" />
                    )}
                    {connectionState === 'failed' && (
                      <WifiOff className="h-3 w-3 mr-1" />
                    )}
                    {connectionState}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="relative aspect-video bg-black rounded-lg overflow-hidden">
                  {remoteStreams.size > 0 ? (
                    <video
                      ref={setVideoRef}
                      autoPlay
                      playsInline
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <div className="flex items-center justify-center h-full">
                      <div className="text-center space-y-4">
                        {connectionState === 'connecting' ? (
                          <>
                            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mx-auto" />
                            <p className="text-muted-foreground">
                              Connecting to broadcaster...
                            </p>
                          </>
                        ) : connectionState === 'failed' ? (
                          <>
                            <WifiOff className="h-8 w-8 text-destructive mx-auto" />
                            <p className="text-destructive">
                              Connection failed
                            </p>
                            <Button onClick={() => window.location.reload()}>
                              Retry
                            </Button>
                          </>
                        ) : (
                          <p className="text-muted-foreground">
                            Waiting for stream to start...
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Test Session Info */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Test Session Info</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <p className="text-sm text-muted-foreground">Tester</p>
                  <p className="text-sm font-medium">
                    {session.tester_id
                      ? `Tester ${session.tester_id.slice(0, 8)}`
                      : 'Anonymous'}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Started</p>
                  <p className="text-sm font-medium">
                    {session.started_at
                      ? new Date(session.started_at).toLocaleTimeString()
                      : 'Unknown'}
                  </p>
                </div>
                <div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Users className="h-4 w-4" />
                    <span>{viewerCount + 1} watching</span>
                  </div>
                </div>
                <div className="pt-2">
                  <Button
                    variant="destructive"
                    size="sm"
                    className="w-full"
                    onClick={() => setShowEndDialog(true)}
                  >
                    <StopCircle className="h-4 w-4 mr-2" />
                    End Recording
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Viewer List */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Active Viewers</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex -space-x-2">
                  {Object.entries(presence)
                    .slice(0, 10)
                    .map(([key, user]) => (
                      <Avatar key={key} className="border-2 border-background">
                        <AvatarFallback className="text-xs">
                          {user.displayName.slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                    ))}
                  {Object.keys(presence).length > 10 && (
                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-muted border-2 border-background">
                      <span className="text-xs text-muted-foreground">
                        +{Object.keys(presence).length - 10}
                      </span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Chat Sidebar */}
          <div className="space-y-4">
            <Card className="h-[600px] flex flex-col">
              <CardHeader>
                <CardTitle className="text-base">Live Chat</CardTitle>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col p-0">
                <ScrollArea className="flex-1 px-4">
                  <div className="space-y-3 py-4">
                    {comments.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-8">
                        No comments yet. Be the first!
                      </p>
                    ) : (
                      comments.map((comment) => (
                        <div key={comment.id} className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">
                              User {comment.user_id?.slice(0, 8)}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {new Date(
                                comment.created_at
                              ).toLocaleTimeString()}
                            </span>
                          </div>
                          <p className="text-sm">{comment.body}</p>
                        </div>
                      ))
                    )}
                  </div>
                </ScrollArea>

                <div className="p-4 border-t">
                  <form
                    onSubmit={(e) => {
                      e.preventDefault()
                      sendComment()
                    }}
                    className="flex gap-2"
                  >
                    <Input
                      value={commentText}
                      onChange={(e) => setCommentText(e.target.value)}
                      placeholder="Type a message..."
                      disabled={
                        sendingComment || connectionState !== 'connected'
                      }
                    />
                    <Button
                      type="submit"
                      size="icon"
                      disabled={
                        !commentText.trim() ||
                        sendingComment ||
                        connectionState !== 'connected'
                      }
                    >
                      {sendingComment ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4" />
                      )}
                    </Button>
                  </form>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* End Recording Confirmation Dialog */}
      <Dialog open={showEndDialog} onOpenChange={setShowEndDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>End Recording?</DialogTitle>
            <DialogDescription>
              Are you sure you want to end this recording session? This will
              stop the livestream and begin the video upload process. This
              action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowEndDialog(false)}
              disabled={endingRecording}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleEndRecording}
              disabled={endingRecording}
            >
              {endingRecording ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Ending...
                </>
              ) : (
                <>
                  <StopCircle className="h-4 w-4 mr-2" />
                  End Recording
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
