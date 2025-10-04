import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/auth'
import { useProjectStore } from '../store/project'
import { useOrganizationDataStore } from '../store/organizationData'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  ChevronDown,
  Plus,
  Folder,
  LogOut,
  Settings,
  Users,
  Bell,
  Video,
  Radio,
  FileText,
  Play,
  Trash2,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'

export default function Dashboard() {
  const navigate = useNavigate()
  const {
    user,
    currentOrg,
    memberships,
    switchOrg,
    signOut,
    loading: authLoading,
  } = useAuthStore()
  const { projects, loadProjects, createProject, loading } = useProjectStore()
  const {
    recordings,
    liveSessions,
    stats,
    loadingRecordings,
    loadingLiveSessions,
    loadAllOrgData,
    loadOrgLiveSessions,
    deleteRecording,
    clearCache,
  } = useOrganizationDataStore()

  const [showCreateProject, setShowCreateProject] = useState(false)
  const [projectName, setProjectName] = useState('')
  const [projectDescription, setProjectDescription] = useState('')
  const [creating, setCreating] = useState(false)
  const [pendingInvitesCount, setPendingInvitesCount] = useState(0)
  const [activeTab, setActiveTab] = useState('overview')
  const [switchingOrg, setSwitchingOrg] = useState(false)
  const [deletingRecordingId, setDeletingRecordingId] = useState<string | null>(
    null
  )

  useEffect(() => {
    if (currentOrg) {
      loadProjects(currentOrg.id)
      loadAllOrgData(currentOrg.id)
    } else {
      clearCache()
    }
  }, [currentOrg, loadProjects, loadAllOrgData, clearCache])

  useEffect(() => {
    if (user) {
      checkPendingInvites()
    }
  }, [user])

  // Refresh live sessions periodically
  useEffect(() => {
    if (currentOrg && activeTab === 'live') {
      const interval = setInterval(() => {
        loadOrgLiveSessions(currentOrg.id, true)
      }, 10000) // Refresh every 10 seconds

      return () => clearInterval(interval)
    }
  }, [currentOrg, activeTab, loadOrgLiveSessions])

  const checkPendingInvites = async () => {
    if (!user) return

    try {
      // Ensure we have a valid session before calling Edge Functions
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session) {
        console.log('No session available for checking invites')
        return
      }

      console.log(
        'Session token:',
        session.access_token ? 'Present' : 'Missing'
      )
      console.log('User email:', session.user?.email)

      const { data, error } = await supabase.functions.invoke('list-my-invites')

      if (error) {
        console.error('list-my-invites error:', error)
        console.error('Error details:', JSON.stringify(error, null, 2))
      } else if (data?.invites) {
        console.log('Found invites:', data.invites.length)
        setPendingInvitesCount(data.invites.length)
      }
    } catch (error) {
      console.error('Error checking invites:', error)
    }
  }

  const handleCreateProject = async () => {
    if (!currentOrg || !projectName.trim()) return

    setCreating(true)
    const project = await createProject(
      currentOrg.id,
      projectName.trim(),
      projectDescription.trim() || undefined
    )
    setCreating(false)

    if (project) {
      setShowCreateProject(false)
      setProjectName('')
      setProjectDescription('')
    }
  }

  const handleSignOut = async () => {
    await signOut()
    navigate('/login')
  }

  const handleDeleteRecording = async (recordingId: string) => {
    if (
      !confirm(
        'Are you sure you want to delete this recording? This action cannot be undone.'
      )
    ) {
      return
    }

    setDeletingRecordingId(recordingId)
    const success = await deleteRecording(recordingId)

    if (success) {
      toast.success('Recording deleted successfully')
    } else {
      toast.error('Failed to delete recording')
    }

    setDeletingRecordingId(null)
  }

  // Show loading spinner while auth is initializing
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    )
  }

  // If auth is loaded but no user, they should be redirected by PrivateRoute
  // If user exists but no org, show a message (this shouldn't normally happen)
  if (!user || !currentOrg) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground mb-4">
            {!user ? 'No user found' : 'No organization found'}
          </p>
          <Button onClick={handleSignOut} variant="outline">
            Sign Out
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-purple-50/30 to-blue-50/30 dark:from-background dark:via-purple-950/10 dark:to-blue-950/10">
      {/* Header */}
      <header className="border-b bg-background/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-2xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              User Testing
            </h1>

            {/* Organization Switcher */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  className="gap-2"
                  disabled={switchingOrg}
                >
                  {switchingOrg ? (
                    <>
                      <span className="animate-pulse">Switching...</span>
                      <ChevronDown className="h-4 w-4" />
                    </>
                  ) : (
                    <>
                      {currentOrg.name}
                      <ChevronDown className="h-4 w-4" />
                    </>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                <DropdownMenuLabel>Organizations</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {memberships.map((membership) => (
                  <DropdownMenuItem
                    key={membership.id}
                    onClick={async (e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      if (
                        membership.org_id !== currentOrg.id &&
                        !switchingOrg
                      ) {
                        setSwitchingOrg(true)
                        switchOrg(membership.org_id)
                        // Small delay to ensure state updates properly
                        setTimeout(() => {
                          setSwitchingOrg(false)
                        }, 500)
                      }
                    }}
                    className={
                      currentOrg.id === membership.org_id ? 'bg-accent' : ''
                    }
                    disabled={switchingOrg}
                  >
                    {membership.organization?.name ||
                      `Organization ${membership.org_id.slice(0, 8)}`}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    navigate(`/app/organizations/${currentOrg.id}/settings`)
                  }}
                  className="gap-2"
                >
                  <Users className="h-4 w-4" />
                  Organization Settings
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="flex items-center gap-2">
            {/* Pending Invites Notification */}
            {pendingInvitesCount > 0 && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate('/accept-invite')}
                className="relative"
              >
                <Bell className="h-5 w-5" />
                <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-destructive text-destructive-foreground text-xs flex items-center justify-center">
                  {pendingInvitesCount}
                </span>
              </Button>
            )}

            {/* User Menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon">
                  <Settings className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>{user.email}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {pendingInvitesCount > 0 && (
                  <>
                    <DropdownMenuItem
                      onClick={() => navigate('/accept-invite')}
                      className="gap-2"
                    >
                      <Bell className="h-4 w-4" />
                      Pending Invites ({pendingInvitesCount})
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                  </>
                )}
                <DropdownMenuItem
                  onClick={handleSignOut}
                  className="text-destructive"
                >
                  <LogOut className="h-4 w-4 mr-2" />
                  Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-6 py-8">
        {/* Organization Stats */}
        {stats && (
          <div className="grid gap-6 md:grid-cols-4 mb-8">
            <Card className="gradient-border hover:shadow-xl hover:shadow-primary/10 transition-all duration-300 hover:-translate-y-1 group">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground group-hover:text-primary transition-colors">
                  Total Projects
                </CardTitle>
                <div className="p-2 rounded-lg bg-gradient-to-br from-primary/10 to-accent/10 group-hover:from-primary/20 group-hover:to-accent/20 transition-colors">
                  <Folder className="h-5 w-5 text-primary" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                  {stats.totalProjects}
                </div>
              </CardContent>
            </Card>

            <Card className="gradient-border hover:shadow-xl hover:shadow-primary/10 transition-all duration-300 hover:-translate-y-1 group">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground group-hover:text-primary transition-colors">
                  Total Recordings
                </CardTitle>
                <div className="p-2 rounded-lg bg-gradient-to-br from-primary/10 to-accent/10 group-hover:from-primary/20 group-hover:to-accent/20 transition-colors">
                  <Video className="h-5 w-5 text-primary" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                  {stats.totalRecordings}
                </div>
              </CardContent>
            </Card>

            <Card className="gradient-border hover:shadow-xl hover:shadow-primary/10 transition-all duration-300 hover:-translate-y-1 group">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground group-hover:text-primary transition-colors">
                  Active Sessions
                </CardTitle>
                <div className="p-2 rounded-lg bg-gradient-to-br from-primary/10 to-accent/10 group-hover:from-primary/20 group-hover:to-accent/20 transition-colors">
                  <Radio className="h-5 w-5 text-primary" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                  {stats.activeLiveSessions}
                </div>
                {stats.activeLiveSessions > 0 && (
                  <div className="flex items-center gap-1 mt-2">
                    <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                    <p className="text-xs text-muted-foreground">Live now</p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="gradient-border hover:shadow-xl hover:shadow-primary/10 transition-all duration-300 hover:-translate-y-1 group">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground group-hover:text-primary transition-colors">
                  Test Links
                </CardTitle>
                <div className="p-2 rounded-lg bg-gradient-to-br from-primary/10 to-accent/10 group-hover:from-primary/20 group-hover:to-accent/20 transition-colors">
                  <FileText className="h-5 w-5 text-primary" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                  {stats.totalTestLinks}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Tabs for different views */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="projects">Projects</TabsTrigger>
            <TabsTrigger value="recordings">
              Recordings {recordings.length > 0 && `(${recordings.length})`}
            </TabsTrigger>
            <TabsTrigger value="live">
              Live Sessions{' '}
              {liveSessions.length > 0 && `(${liveSessions.length})`}
            </TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="mt-6">
            <div className="space-y-6">
              {/* Recent Activity */}
              {stats?.recentActivity && stats.recentActivity.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>Recent Activity</CardTitle>
                    <CardDescription>
                      Latest recordings and sessions in your organization
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {stats.recentActivity.slice(0, 5).map((activity, i) => (
                        <div
                          key={i}
                          className="flex items-center gap-2 py-2 border-b last:border-0"
                        >
                          {activity.type === 'recording' ? (
                            <Video className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <Radio className="h-4 w-4 text-muted-foreground" />
                          )}
                          <div className="flex-1">
                            <p className="text-sm font-medium">
                              {activity.title}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {new Date(activity.timestamp).toLocaleString()}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Quick Actions */}
              <Card>
                <CardHeader>
                  <CardTitle>Quick Actions</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4 md:grid-cols-3">
                  <Button
                    onClick={() => setShowCreateProject(true)}
                    className="gap-2"
                    variant="outline"
                  >
                    <Plus className="h-4 w-4" />
                    New Project
                  </Button>
                  <Button
                    onClick={() =>
                      navigate(`/app/organizations/${currentOrg.id}/invite`)
                    }
                    className="gap-2"
                    variant="outline"
                  >
                    <Users className="h-4 w-4" />
                    Invite Members
                  </Button>
                  <Button
                    onClick={() =>
                      navigate(`/app/organizations/${currentOrg.id}/settings`)
                    }
                    className="gap-2"
                    variant="outline"
                  >
                    <Settings className="h-4 w-4" />
                    Org Settings
                  </Button>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Projects Tab */}
          <TabsContent value="projects" className="mt-6">
            <div className="mb-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold tracking-tight">
                    Projects
                  </h2>
                  <p className="text-muted-foreground">
                    Manage your user testing projects and test links
                  </p>
                </div>
                <Button
                  onClick={() => setShowCreateProject(true)}
                  className="gap-2"
                >
                  <Plus className="h-4 w-4" />
                  New Project
                </Button>
              </div>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="text-center">
                  <div className="w-16 h-16 mx-auto mb-4">
                    <div className="skeleton w-full h-full rounded-full" />
                  </div>
                  <p className="text-muted-foreground animate-pulse">
                    Loading projects...
                  </p>
                </div>
              </div>
            ) : projects.length === 0 ? (
              <Card className="gradient-border">
                <CardContent className="flex flex-col items-center justify-center py-16">
                  <div className="w-20 h-20 rounded-full bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center mb-6">
                    <Folder className="h-10 w-10 text-primary" />
                  </div>
                  <h3 className="text-xl font-semibold mb-2 bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                    No projects yet
                  </h3>
                  <p className="text-muted-foreground text-center mb-6 max-w-md">
                    Get started by creating your first project to organize your
                    user testing sessions
                  </p>
                  <Button
                    onClick={() => setShowCreateProject(true)}
                    className="gap-2 hover:shadow-lg hover:shadow-primary/20 hover:-translate-y-0.5 transition-all"
                  >
                    <Plus className="h-4 w-4" />
                    Create Project
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {projects.map((project, index) => (
                  <Card
                    key={project.id}
                    className="cursor-pointer gradient-border hover:shadow-xl hover:shadow-primary/10 transition-all duration-300 hover:-translate-y-2 group overflow-hidden animate-in fade-in-0 slide-in-from-bottom-2"
                    style={{ animationDelay: `${index * 50}ms` }}
                    onClick={() => navigate(`/app/projects/${project.id}`)}
                  >
                    <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-primary/10 to-accent/10 rounded-full blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                    <CardHeader className="relative">
                      <div className="flex items-start justify-between">
                        <CardTitle className="group-hover:text-primary transition-colors text-lg">
                          {project.name}
                        </CardTitle>
                        <div className="p-2 rounded-lg bg-gradient-to-br from-primary/10 to-accent/10 group-hover:from-primary/20 group-hover:to-accent/20 transition-colors">
                          <Folder className="h-4 w-4 text-primary" />
                        </div>
                      </div>
                      {project.description && (
                        <CardDescription className="line-clamp-2 mt-2">
                          {project.description}
                        </CardDescription>
                      )}
                    </CardHeader>
                    <CardContent className="relative">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                        Created{' '}
                        {new Date(project.created_at).toLocaleDateString()}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Recordings Tab */}
          <TabsContent value="recordings" className="mt-6">
            <div className="mb-6">
              <div>
                <h2 className="text-2xl font-bold tracking-tight">
                  All Recordings
                </h2>
                <p className="text-muted-foreground">
                  View all recordings across your organization
                </p>
              </div>
            </div>

            {loadingRecordings ? (
              <div className="flex items-center justify-center py-12">
                <div className="text-center">
                  <div className="w-16 h-16 mx-auto mb-4">
                    <div className="skeleton w-full h-full rounded-full" />
                  </div>
                  <p className="text-muted-foreground animate-pulse">
                    Loading recordings...
                  </p>
                </div>
              </div>
            ) : recordings.length === 0 ? (
              <Card className="gradient-border">
                <CardContent className="flex flex-col items-center justify-center py-16">
                  <div className="w-20 h-20 rounded-full bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center mb-6">
                    <Video className="h-10 w-10 text-primary" />
                  </div>
                  <h3 className="text-xl font-semibold mb-2 bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                    No recordings yet
                  </h3>
                  <p className="text-muted-foreground text-center max-w-md">
                    Recordings will appear here when users complete tests
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {recordings.map((recording, index) => (
                  <Card
                    key={recording.id}
                    className="gradient-border hover:shadow-xl hover:shadow-primary/10 transition-all duration-300 hover:-translate-y-2 group overflow-hidden animate-in fade-in-0 slide-in-from-bottom-2"
                    style={{ animationDelay: `${index * 50}ms` }}
                  >
                    <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-primary/10 to-accent/10 rounded-full blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                    <CardHeader className="relative">
                      <div className="flex items-center justify-between">
                        <CardTitle
                          className="text-base truncate group-hover:text-primary transition-colors cursor-pointer"
                          onClick={() =>
                            navigate(`/app/recordings/${recording.id}`)
                          }
                        >
                          {recording.test_links?.title || 'Recording'}
                        </CardTitle>
                        <div className="flex items-center gap-2">
                          {recording.status === 'ready' ? (
                            <div className="p-2 rounded-lg bg-green-500/10">
                              <Play className="h-4 w-4 text-green-600" />
                            </div>
                          ) : (
                            <div className="p-2 rounded-lg bg-orange-500/10">
                              <div className="animate-pulse h-4 w-4 rounded-full bg-orange-500" />
                            </div>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 opacity-60 hover:opacity-100 transition-opacity"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleDeleteRecording(recording.id)
                            }}
                            disabled={deletingRecordingId === recording.id}
                          >
                            {deletingRecordingId === recording.id ? (
                              <div className="animate-spin h-4 w-4 border-2 border-destructive border-t-transparent rounded-full" />
                            ) : (
                              <Trash2 className="h-4 w-4 text-destructive" />
                            )}
                          </Button>
                        </div>
                      </div>
                      <CardDescription className="text-xs mt-1">
                        {recording.test_links?.projects?.name ||
                          'Unknown Project'}
                      </CardDescription>
                    </CardHeader>
                    <CardContent
                      className="relative cursor-pointer"
                      onClick={() =>
                        navigate(`/app/recordings/${recording.id}`)
                      }
                    >
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between items-center">
                          <span className="text-muted-foreground">
                            Duration:
                          </span>
                          <span className="font-mono font-medium">
                            {recording.duration_ms
                              ? `${Math.round(recording.duration_ms / 1000)}s`
                              : 'N/A'}
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-muted-foreground">Status:</span>
                          <span className="capitalize font-medium">
                            {recording.status}
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-muted-foreground">Date:</span>
                          <span className="font-medium">
                            {new Date(
                              recording.created_at
                            ).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Live Sessions Tab */}
          <TabsContent value="live" className="mt-6">
            <div className="mb-6">
              <div>
                <h2 className="text-2xl font-bold tracking-tight">
                  Active Live Sessions
                </h2>
                <p className="text-muted-foreground">
                  Monitor live test sessions across your organization
                </p>
              </div>
            </div>

            {loadingLiveSessions ? (
              <div className="flex items-center justify-center py-12">
                <p className="text-muted-foreground">
                  Loading live sessions...
                </p>
              </div>
            ) : liveSessions.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Radio className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-2">
                    No active sessions
                  </h3>
                  <p className="text-muted-foreground text-center">
                    Live sessions will appear here when users are actively
                    testing
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {liveSessions.map((session) => (
                  <Card
                    key={session.id}
                    className="cursor-pointer hover:border-primary hover:shadow-lg transition-all border-green-500"
                    onClick={() => navigate(`/app/live/${session.id}`)}
                  >
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base truncate">
                          {session.test_links?.title || 'Live Session'}
                        </CardTitle>
                        <div className="flex items-center gap-1">
                          <div className="animate-pulse h-2 w-2 rounded-full bg-red-500" />
                          <span className="text-xs text-red-500 font-semibold">
                            LIVE
                          </span>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">
                            Started:
                          </span>
                          <span>
                            {new Date(session.started_at).toLocaleTimeString()}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">
                            Viewers:
                          </span>
                          <span>{session.max_viewers || 0}</span>
                        </div>
                        <Button
                          onClick={(e) => {
                            e.stopPropagation()
                            navigate(`/app/live/${session.id}`)
                          }}
                          className="w-full mt-2"
                          size="sm"
                        >
                          <Play className="h-3 w-3 mr-1" />
                          Watch Live
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </main>

      {/* Create Project Dialog */}
      <Dialog open={showCreateProject} onOpenChange={setShowCreateProject}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Project</DialogTitle>
            <DialogDescription>
              Projects help you organize your user testing sessions and test
              links.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="project-name">Project Name</Label>
              <Input
                id="project-name"
                placeholder="e.g., Mobile App Redesign"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="project-description">
                Description (optional)
              </Label>
              <Textarea
                id="project-description"
                placeholder="Brief description of what you're testing..."
                value={projectDescription}
                onChange={(e) => setProjectDescription(e.target.value)}
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowCreateProject(false)
                setProjectName('')
                setProjectDescription('')
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateProject}
              disabled={!projectName.trim() || creating}
            >
              {creating ? 'Creating...' : 'Create Project'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
