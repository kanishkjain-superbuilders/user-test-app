import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { VideoPlayer } from '@/components/VideoPlayer'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { formatDuration, formatBytes } from '@/lib/recording-utils'
import type { RecordingManifest } from '@/lib/recording-utils'
import type { Database } from '@/lib/database.types'

type Recording = Database['public']['Tables']['recordings']['Row']
type Comment = Database['public']['Tables']['comments']['Row']

export default function RecordingPlayer() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [recording, setRecording] = useState<Recording | null>(null)
  const [manifest, setManifest] = useState<RecordingManifest | null>(null)
  const [comments, setComments] = useState<Comment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) {
      setError('Recording ID is missing')
      setLoading(false)
      return
    }

    loadRecording()
    loadComments()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const loadRecording = async () => {
    try {
      setLoading(true)
      setError(null)

      // Fetch recording metadata
      const { data: recordingData, error: recordingError } = await supabase
        .from('recordings')
        .select('*')
        .eq('id', id!)
        .single()

      if (recordingError) throw recordingError
      if (!recordingData) throw new Error('Recording not found')

      setRecording(recordingData)

      // Fetch manifest from storage
      const manifestPath = `${id}/manifest.json`

      const { data: session } = await supabase.auth.getSession()

      // Get signed URL for manifest
      const signedUrlResponse = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sign-playback-url`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: session?.session?.access_token
              ? `Bearer ${session.session.access_token}`
              : `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            recordingId: id,
            path: manifestPath,
            expiresIn: 3600,
          }),
        }
      )

      if (!signedUrlResponse.ok) {
        throw new Error('Failed to get manifest signed URL')
      }

      const { signedUrl } = await signedUrlResponse.json()

      // Fetch manifest
      const manifestResponse = await fetch(signedUrl)
      if (!manifestResponse.ok) {
        throw new Error('Failed to fetch manifest')
      }

      const manifestData: RecordingManifest = await manifestResponse.json()
      setManifest(manifestData)
    } catch (err) {
      console.error('Error loading recording:', err)
      setError(err instanceof Error ? err.message : 'Failed to load recording')
    } finally {
      setLoading(false)
    }
  }

  const loadComments = async () => {
    if (!id) return

    try {
      const { data: commentsData, error: commentsError } = await supabase
        .from('comments')
        .select('*')
        .eq('recording_id', id)
        .order('timestamp_ms', { ascending: true })

      if (commentsError) {
        console.error('Error loading comments:', commentsError)
        return
      }

      setComments(commentsData || [])
    } catch (err) {
      console.error('Error loading comments:', err)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-purple-50/30 to-blue-50/30 dark:from-background dark:via-purple-950/10 dark:to-blue-950/10">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground animate-pulse">
            Loading recording...
          </p>
        </div>
      </div>
    )
  }

  if (error || !recording || !manifest) {
    return (
      <div className="min-h-screen p-8">
        <div className="max-w-4xl mx-auto">
          <Button variant="ghost" onClick={() => navigate(-1)} className="mb-4">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          <Card>
            <CardContent className="pt-6">
              <p className="text-destructive">
                {error || 'Failed to load recording'}
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-purple-50/30 to-blue-50/30 dark:from-background dark:via-purple-950/10 dark:to-blue-950/10 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8 animate-in fade-in-0 slide-in-from-top-2 duration-500">
          <Button
            variant="ghost"
            onClick={() => navigate(-1)}
            className="mb-6 hover:bg-primary/10 hover:text-primary transition-all hover:-translate-x-1 group"
          >
            <ArrowLeft className="w-4 h-4 mr-2 transition-transform group-hover:-translate-x-1" />
            Back
          </Button>
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-4xl font-bold bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent mb-2">
                Recording
              </h1>
              <p className="text-muted-foreground flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                {new Date(recording.created_at).toLocaleString()}
              </p>
            </div>
            <Badge
              variant={recording.status === 'ready' ? 'default' : 'secondary'}
              className="px-4 py-1.5 text-sm font-medium shadow-lg"
            >
              {recording.status}
            </Badge>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Video Player - Main Column */}
          <div className="lg:col-span-2 animate-in fade-in-0 slide-in-from-left-2 duration-500">
            <VideoPlayer
              recordingId={id!}
              manifest={manifest}
              className="w-full"
            />
          </div>

          {/* Metadata Sidebar */}
          <div className="space-y-6 animate-in fade-in-0 slide-in-from-right-2 duration-500">
            <Card className="gradient-border hover:shadow-xl hover:shadow-primary/10 transition-all duration-300">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <span className="w-1 h-6 bg-gradient-to-b from-primary to-accent rounded-full" />
                  Details
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="group hover:bg-muted/50 p-3 rounded-lg transition-colors">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">
                    Duration
                  </p>
                  <p className="text-lg font-semibold text-foreground">
                    {formatDuration(manifest.duration)}
                  </p>
                </div>
                <Separator className="opacity-50" />
                <div className="group hover:bg-muted/50 p-3 rounded-lg transition-colors">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">
                    Resolution
                  </p>
                  <p className="text-lg font-semibold font-mono text-foreground">
                    {manifest.width} × {manifest.height}
                  </p>
                </div>
                <Separator className="opacity-50" />
                <div className="group hover:bg-muted/50 p-3 rounded-lg transition-colors">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">
                    Codec
                  </p>
                  <p className="text-lg font-semibold font-mono text-foreground">
                    {manifest.codecs}
                  </p>
                </div>
                <Separator className="opacity-50" />
                <div className="group hover:bg-muted/50 p-3 rounded-lg transition-colors">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">
                    File Size
                  </p>
                  <p className="text-lg font-semibold text-foreground">
                    {formatBytes(manifest.totalBytes)}
                  </p>
                </div>
                <Separator className="opacity-50" />
                <div className="group hover:bg-muted/50 p-3 rounded-lg transition-colors">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">
                    Segments
                  </p>
                  <p className="text-lg font-semibold text-foreground">
                    {manifest.totalParts} parts
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Comments Section */}
            <Card className="gradient-border hover:shadow-xl hover:shadow-primary/10 transition-all duration-300">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <span className="w-1 h-6 bg-gradient-to-b from-primary to-accent rounded-full" />
                  Comments ({comments.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                {comments.length === 0 ? (
                  <div className="text-center py-8">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
                      <span className="text-2xl">💬</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      No comments for this recording
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4 max-h-96 overflow-y-auto">
                    {comments.map((comment) => (
                      <div
                        key={comment.id}
                        className="border-l-2 border-primary/30 pl-4 py-2 hover:bg-muted/30 transition-colors rounded-r"
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium">
                            {comment.author_name ||
                              `User ${comment.user_id?.slice(0, 8)}`}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {comment.timestamp_ms !== null
                              ? formatDuration(comment.timestamp_ms / 1000)
                              : new Date(
                                  comment.created_at
                                ).toLocaleTimeString()}
                          </span>
                        </div>
                        <p className="text-sm text-foreground/90">
                          {comment.body}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
