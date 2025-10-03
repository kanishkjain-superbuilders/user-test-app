import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useProjectStore } from '../store/project'
import { useAuthStore } from '../store/auth'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  ArrowLeft,
  Plus,
  Link as LinkIcon,
  Copy,
  ExternalLink,
  Trash2,
  Video,
  Play,
  Radio,
  Users,
  Eye,
} from 'lucide-react'
import { toast } from 'sonner'
import { formatDuration } from '@/lib/recording-utils'
import type { Database } from '@/lib/database.types'

type Recording = Database['public']['Tables']['recordings']['Row']

export default function ProjectDetail() {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const {
    projects,
    currentProject,
    testLinks,
    setCurrentProject,
    loadTestLinks,
    deleteTestLink,
    loadSingleProject,
    loading: projectsLoading,
  } = useProjectStore()
  const { loading: authLoading } = useAuthStore()

  const [recordings, setRecordings] = useState<Recording[]>([])
  const [loadingRecordings, setLoadingRecordings] = useState(false)
  const [initialLoading, setInitialLoading] = useState(true)
  const [liveTestSessions, setLiveTestSessions] = useState<
    {
      session_id: string
      recording_id: string
      test_link_id: string
      test_link_title: string
      tester_id: string
      channel_name: string
      started_at: string
      viewer_count: number
    }[]
  >([])
  const [loadingLiveSessions, setLoadingLiveSessions] = useState(false)

  useEffect(() => {
    const loadProjectData = async () => {
      if (!projectId) return

      // First check if project exists in the store
      let project = projects.find((p) => p.id === projectId)

      // If not found in store, load it from the database
      if (!project) {
        const loadedProject = await loadSingleProject(projectId)
        if (loadedProject) {
          project = loadedProject
        }
      }

      if (project) {
        setCurrentProject(project)
        loadTestLinks(projectId)
        loadRecordings()
      }

      setInitialLoading(false)
    }

    loadProjectData()

    return () => {
      setCurrentProject(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  const loadRecordings = async () => {
    if (!projectId) return

    try {
      setLoadingRecordings(true)

      // Get all test links for this project first
      const { data: projectTestLinks, error: testLinksError } = await supabase
        .from('test_links')
        .select<'id', { id: string }>('id')
        .eq('project_id', projectId)

      if (testLinksError) throw testLinksError

      if (!projectTestLinks || projectTestLinks.length === 0) {
        setRecordings([])
        return
      }

      const testLinkIds = projectTestLinks.map((tl) => tl.id)

      // Get recordings for these test links
      const { data: recordingsData, error: recordingsError } = await supabase
        .from('recordings')
        .select('*')
        .in('test_link_id', testLinkIds)
        .order('created_at', { ascending: false })

      if (recordingsError) throw recordingsError

      setRecordings(recordingsData || [])
    } catch (error) {
      console.error('Error loading recordings:', error)
      toast.error('Failed to load recordings')
    } finally {
      setLoadingRecordings(false)
    }
  }

  const handleCopyLink = (slug: string) => {
    const url = `${window.location.origin}/t/${slug}`
    navigator.clipboard.writeText(url)
    toast.success('Link copied to clipboard!')
  }

  const handleDeleteTestLink = async (id: string) => {
    if (confirm('Are you sure you want to delete this test link?')) {
      await deleteTestLink(id)
      toast.success('Test link deleted')
    }
  }

  const loadLiveTestSessions = async () => {
    if (!projectId) return

    try {
      setLoadingLiveSessions(true)

      // Get active test sessions for this project
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)(
        'get_project_test_sessions',
        {
          p_project_id: projectId,
        }
      )

      if (error) throw error

      setLiveTestSessions(data || [])
    } catch (error) {
      console.error('Error loading live sessions:', error)
      // Don't show error toast as live sessions are optional
    } finally {
      setLoadingLiveSessions(false)
    }
  }

  // Load live sessions periodically
  useEffect(() => {
    loadLiveTestSessions()
    const interval = setInterval(loadLiveTestSessions, 10000) // Refresh every 10 seconds
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  // Show loading spinner while auth or initial project load is happening
  if (authLoading || initialLoading || projectsLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    )
  }

  // If no project found after loading
  if (!currentProject) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground mb-4">Project not found</p>
          <Button onClick={() => navigate('/app')} variant="outline">
            Back to Dashboard
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate('/app')}
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex-1">
              <h1 className="text-2xl font-bold">{currentProject.name}</h1>
              {currentProject.description && (
                <p className="text-muted-foreground">
                  {currentProject.description}
                </p>
              )}
            </div>
            <Button
              onClick={() =>
                navigate(`/app/projects/${projectId}/test-links/new`)
              }
              className="gap-2"
            >
              <Plus className="h-4 w-4" />
              New Test Link
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-6 py-8">
        <Tabs defaultValue="test-links" className="w-full">
          <TabsList>
            <TabsTrigger value="test-links">Test Links</TabsTrigger>
            <TabsTrigger value="recordings">
              Recordings ({recordings.length})
            </TabsTrigger>
            <TabsTrigger value="live-sessions" className="relative">
              <div className="flex items-center gap-1.5">
                <Radio className="h-3 w-3" />
                Live Sessions
                {liveTestSessions.length > 0 && (
                  <Badge
                    variant="destructive"
                    className="ml-1.5 h-5 min-w-[20px] px-1"
                  >
                    {liveTestSessions.length}
                  </Badge>
                )}
              </div>
            </TabsTrigger>
          </TabsList>

          {/* Test Links Tab */}
          <TabsContent value="test-links">
            <div className="mb-8">
              {testLinks.length === 0 ? (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center py-12">
                    <LinkIcon className="h-12 w-12 text-muted-foreground mb-4" />
                    <h3 className="text-lg font-semibold mb-2">
                      No test links yet
                    </h3>
                    <p className="text-muted-foreground text-center mb-4">
                      Create a test link to start collecting user feedback
                    </p>
                    <Button
                      onClick={() =>
                        navigate(`/app/projects/${projectId}/test-links/new`)
                      }
                      className="gap-2"
                    >
                      <Plus className="h-4 w-4" />
                      Create Test Link
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-4">
                  {testLinks.map((testLink) => (
                    <Card key={testLink.id}>
                      <CardHeader>
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <CardTitle>{testLink.title}</CardTitle>
                              <Badge
                                variant={
                                  testLink.active ? 'default' : 'secondary'
                                }
                              >
                                {testLink.active ? 'Active' : 'Inactive'}
                              </Badge>
                              {testLink.visibility === 'unlisted' && (
                                <Badge variant="outline">Unlisted</Badge>
                              )}
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="icon"
                              onClick={() =>
                                navigate(
                                  `/app/projects/${projectId}/test-links/${testLink.id}`
                                )
                              }
                            >
                              <ExternalLink className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="outline"
                              size="icon"
                              onClick={() => handleDeleteTestLink(testLink.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-3">
                          <div className="flex items-center gap-2">
                            <code className="flex-1 px-3 py-2 bg-muted rounded-md text-sm">
                              {window.location.origin}/t/{testLink.slug}
                            </code>
                            <Button
                              variant="outline"
                              size="icon"
                              onClick={() => handleCopyLink(testLink.slug)}
                            >
                              <Copy className="h-4 w-4" />
                            </Button>
                          </div>

                          <div className="flex gap-4 text-sm text-muted-foreground">
                            {Boolean(
                              (testLink.record_opts as Record<string, unknown>)
                                ?.screen
                            ) && <span>• Screen Recording</span>}
                            {Boolean(
                              (testLink.record_opts as Record<string, unknown>)
                                ?.mic
                            ) && <span>• Microphone</span>}
                            {Boolean(
                              (testLink.record_opts as Record<string, unknown>)
                                ?.cam
                            ) && <span>• Camera</span>}
                          </div>

                          {testLink.redirect_url && (
                            <div className="text-sm">
                              <span className="text-muted-foreground">
                                Redirects to:{' '}
                              </span>
                              <a
                                href={testLink.redirect_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-primary hover:underline"
                              >
                                {testLink.redirect_url}
                              </a>
                            </div>
                          )}

                          <Separator />

                          <div className="text-sm text-muted-foreground">
                            Created{' '}
                            {new Date(testLink.created_at).toLocaleDateString()}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>

          {/* Recordings Tab */}
          <TabsContent value="recordings">
            <div className="mb-8">
              {loadingRecordings ? (
                <Card>
                  <CardContent className="flex items-center justify-center py-12">
                    <p className="text-muted-foreground">
                      Loading recordings...
                    </p>
                  </CardContent>
                </Card>
              ) : recordings.length === 0 ? (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center py-12">
                    <Video className="h-12 w-12 text-muted-foreground mb-4" />
                    <h3 className="text-lg font-semibold mb-2">
                      No recordings yet
                    </h3>
                    <p className="text-muted-foreground text-center mb-4">
                      Recordings will appear here once testers complete sessions
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {recordings.map((recording) => (
                    <Card
                      key={recording.id}
                      className="cursor-pointer hover:bg-accent transition-colors"
                      onClick={() =>
                        navigate(`/app/recordings/${recording.id}`)
                      }
                    >
                      <CardHeader>
                        <div className="flex items-start justify-between">
                          <CardTitle className="text-base flex items-center gap-2">
                            <Play className="h-4 w-4" />
                            Recording
                          </CardTitle>
                          <Badge
                            variant={
                              recording.status === 'ready'
                                ? 'default'
                                : 'secondary'
                            }
                          >
                            {recording.status}
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        <div className="text-sm">
                          <span className="text-muted-foreground">
                            Duration:{' '}
                          </span>
                          <span>
                            {recording.duration_ms
                              ? formatDuration(recording.duration_ms / 1000)
                              : 'N/A'}
                          </span>
                        </div>
                        {recording.width && recording.height && (
                          <div className="text-sm">
                            <span className="text-muted-foreground">
                              Resolution:{' '}
                            </span>
                            <span>
                              {recording.width} x {recording.height}
                            </span>
                          </div>
                        )}
                        <Separator />
                        <div className="text-xs text-muted-foreground">
                          {new Date(recording.created_at).toLocaleString()}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>

          {/* Live Test Sessions Tab */}
          <TabsContent value="live-sessions">
            <div className="space-y-6">
              {loadingLiveSessions ? (
                <Card>
                  <CardContent className="flex items-center justify-center py-12">
                    <p className="text-muted-foreground">
                      Loading live sessions...
                    </p>
                  </CardContent>
                </Card>
              ) : liveTestSessions.length === 0 ? (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center py-12">
                    <Radio className="h-12 w-12 text-muted-foreground mb-4" />
                    <h3 className="text-lg font-semibold mb-2">
                      No Active Test Sessions
                    </h3>
                    <p className="text-muted-foreground text-center">
                      Live test sessions will appear here when testers are
                      actively recording
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {liveTestSessions.map((session) => (
                    <Card
                      key={session.session_id}
                      className="hover:shadow-lg transition-shadow"
                    >
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <CardTitle className="text-base">
                              {session.test_link_title}
                            </CardTitle>
                            <div className="flex items-center gap-2 mt-2">
                              <Badge
                                variant="destructive"
                                className="animate-pulse"
                              >
                                <Radio className="h-3 w-3 mr-1" />
                                LIVE
                              </Badge>
                              <span className="text-xs text-muted-foreground">
                                {new Date(
                                  session.started_at
                                ).toLocaleTimeString()}
                              </span>
                            </div>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-3">
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">
                              Tester:
                            </span>
                            <span className="font-medium">
                              {session.tester_id?.slice(0, 8) || 'Anonymous'}
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">
                              Viewers:
                            </span>
                            <div className="flex items-center gap-1">
                              <Users className="h-3 w-3" />
                              <span className="font-medium">
                                {session.viewer_count || 0}
                              </span>
                            </div>
                          </div>
                          <Separator />
                          <Button
                            className="w-full gap-2"
                            onClick={() =>
                              navigate(`/app/live/${session.session_id}`)
                            }
                          >
                            <Eye className="h-4 w-4" />
                            Watch Live
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  )
}
