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
} from 'lucide-react'
import { supabase } from '@/lib/supabase'

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
    clearCache,
  } = useOrganizationDataStore()

  const [showCreateProject, setShowCreateProject] = useState(false)
  const [projectName, setProjectName] = useState('')
  const [projectDescription, setProjectDescription] = useState('')
  const [creating, setCreating] = useState(false)
  const [pendingInvitesCount, setPendingInvitesCount] = useState(0)
  const [activeTab, setActiveTab] = useState('overview')

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
                <Button variant="outline" className="gap-2">
                  {currentOrg.name}
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                <DropdownMenuLabel>Organizations</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {memberships.map((membership) => (
                  <DropdownMenuItem
                    key={membership.id}
                    onClick={() => switchOrg(membership.org_id)}
                    className={
                      currentOrg.id === membership.org_id ? 'bg-accent' : ''
                    }
                  >
                    {membership.organization?.name}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() =>
                    navigate(`/app/organizations/${currentOrg.id}/settings`)
                  }
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
          <div className="grid gap-4 md:grid-cols-4 mb-8">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Total Projects
                </CardTitle>
                <Folder className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.totalProjects}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Total Recordings
                </CardTitle>
                <Video className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {stats.totalRecordings}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Active Sessions
                </CardTitle>
                <Radio className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {stats.activeLiveSessions}
                </div>
                {stats.activeLiveSessions > 0 && (
                  <p className="text-xs text-muted-foreground mt-1">Live now</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Test Links
                </CardTitle>
                <FileText className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.totalTestLinks}</div>
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
                <p className="text-muted-foreground">Loading projects...</p>
              </div>
            ) : projects.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Folder className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-2">
                    No projects yet
                  </h3>
                  <p className="text-muted-foreground text-center mb-4">
                    Get started by creating your first project
                  </p>
                  <Button
                    onClick={() => setShowCreateProject(true)}
                    className="gap-2"
                  >
                    <Plus className="h-4 w-4" />
                    Create Project
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {projects.map((project) => (
                  <Card
                    key={project.id}
                    className="cursor-pointer hover:border-primary hover:shadow-lg hover:shadow-primary/10 transition-all duration-200 hover:-translate-y-1 group bg-gradient-to-br from-card to-purple-50/50 dark:to-purple-950/20"
                    onClick={() => navigate(`/app/projects/${project.id}`)}
                  >
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <CardTitle className="group-hover:text-primary transition-colors">
                          {project.name}
                        </CardTitle>
                        <Folder className="h-5 w-5 text-primary opacity-60 group-hover:opacity-100 transition-opacity" />
                      </div>
                      {project.description && (
                        <CardDescription className="line-clamp-2">
                          {project.description}
                        </CardDescription>
                      )}
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground">
                        Created{' '}
                        {new Date(project.created_at).toLocaleDateString()}
                      </p>
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
                <p className="text-muted-foreground">Loading recordings...</p>
              </div>
            ) : recordings.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Video className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-2">
                    No recordings yet
                  </h3>
                  <p className="text-muted-foreground text-center">
                    Recordings will appear here when users complete tests
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {recordings.map((recording) => (
                  <Card
                    key={recording.id}
                    className="cursor-pointer hover:border-primary hover:shadow-lg transition-all"
                    onClick={() => navigate(`/app/recordings/${recording.id}`)}
                  >
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base truncate">
                          {(recording as any).test_links?.title || 'Recording'}
                        </CardTitle>
                        {recording.status === 'ready' ? (
                          <Play className="h-4 w-4 text-green-600" />
                        ) : (
                          <div className="animate-pulse h-4 w-4 rounded-full bg-orange-500" />
                        )}
                      </div>
                      <CardDescription className="text-xs">
                        {(recording as any).test_links?.projects?.name ||
                          'Unknown Project'}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">
                            Duration:
                          </span>
                          <span>
                            {recording.duration_ms
                              ? `${Math.round(recording.duration_ms / 1000)}s`
                              : 'N/A'}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Status:</span>
                          <span className="capitalize">{recording.status}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Date:</span>
                          <span>
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
                    onClick={() =>
                      navigate(`/app/live/${session.channel_name}`)
                    }
                  >
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base truncate">
                          {(session as any).test_links?.title || 'Live Session'}
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
                            navigate(`/app/live/${session.channel_name}`)
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
