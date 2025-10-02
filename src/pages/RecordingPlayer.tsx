import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { VideoPlayer } from '@/components/VideoPlayer'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { ArrowLeft, Download, Loader2 } from 'lucide-react'
import { formatDuration, formatBytes } from '@/lib/recording-utils'
import type { RecordingManifest } from '@/lib/recording-utils'
import type { Database } from '@/lib/database.types'

type Recording = Database['public']['Tables']['recordings']['Row']

export default function RecordingPlayer() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [recording, setRecording] = useState<Recording | null>(null)
  const [manifest, setManifest] = useState<RecordingManifest | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) {
      setError('Recording ID is missing')
      setLoading(false)
      return
    }

    loadRecording()
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
      const manifestPath = `recordings/${id}/manifest.json`

      const { data: session } = await supabase.auth.getSession()
      if (!session?.session?.access_token) {
        throw new Error('Not authenticated')
      }

      // Get signed URL for manifest
      const signedUrlResponse = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sign-playback-url`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.session.access_token}`,
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

  const handleDownload = async () => {
    if (!manifest || !id) return

    try {
      const { data: session } = await supabase.auth.getSession()
      if (!session?.session?.access_token) {
        throw new Error('Not authenticated')
      }

      // Download all segments and combine (simplified version)
      // In production, you might want to use a backend service to concatenate
      alert('Download functionality will be implemented in a future update')
    } catch (err) {
      console.error('Error downloading recording:', err)
      alert('Failed to download recording')
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin" />
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
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <Button variant="ghost" onClick={() => navigate(-1)} className="mb-4">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-3xl font-bold">Recording</h1>
              <p className="text-muted-foreground mt-1">
                {new Date(recording.created_at).toLocaleString()}
              </p>
            </div>
            <div className="flex gap-2">
              <Badge
                variant={recording.status === 'ready' ? 'default' : 'secondary'}
              >
                {recording.status}
              </Badge>
              <Button onClick={handleDownload} variant="outline">
                <Download className="w-4 h-4 mr-2" />
                Download
              </Button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Video Player - Main Column */}
          <div className="lg:col-span-2">
            <VideoPlayer
              recordingId={id!}
              manifest={manifest}
              className="w-full"
            />
          </div>

          {/* Metadata Sidebar */}
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <p className="text-sm text-muted-foreground">Duration</p>
                  <p className="font-medium">
                    {formatDuration(manifest.duration)}
                  </p>
                </div>
                <Separator />
                <div>
                  <p className="text-sm text-muted-foreground">Resolution</p>
                  <p className="font-medium">
                    {manifest.width} x {manifest.height}
                  </p>
                </div>
                <Separator />
                <div>
                  <p className="text-sm text-muted-foreground">Codec</p>
                  <p className="font-medium">{manifest.codecs}</p>
                </div>
                <Separator />
                <div>
                  <p className="text-sm text-muted-foreground">File Size</p>
                  <p className="font-medium">
                    {formatBytes(manifest.totalBytes)}
                  </p>
                </div>
                <Separator />
                <div>
                  <p className="text-sm text-muted-foreground">Segments</p>
                  <p className="font-medium">{manifest.totalParts} parts</p>
                </div>
              </CardContent>
            </Card>

            {/* Comments Placeholder */}
            <Card>
              <CardHeader>
                <CardTitle>Comments</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Comments feature coming soon
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
