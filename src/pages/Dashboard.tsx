import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/auth'
import { useProjectStore } from '../store/project'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
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
import { ChevronDown, Plus, Folder, LogOut, Settings } from 'lucide-react'

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

  const [showCreateProject, setShowCreateProject] = useState(false)
  const [projectName, setProjectName] = useState('')
  const [projectDescription, setProjectDescription] = useState('')
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    if (currentOrg) {
      loadProjects(currentOrg.id)
    }
  }, [currentOrg, loadProjects])

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
                    onClick={() =>
                      membership.organization && switchOrg(membership.org_id)
                    }
                    className={
                      currentOrg.id === membership.org_id ? 'bg-accent' : ''
                    }
                  >
                    {membership.organization?.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

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
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-6 py-8">
        {/* Projects Section */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-3xl font-bold tracking-tight">Projects</h2>
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

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <p className="text-muted-foreground">Loading projects...</p>
            </div>
          ) : projects.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Folder className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">No projects yet</h3>
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
        </div>
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
