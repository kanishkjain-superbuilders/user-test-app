import { useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useProjectStore } from '../store/project'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  ArrowLeft,
  Plus,
  Link as LinkIcon,
  Copy,
  ExternalLink,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'

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
  } = useProjectStore()

  useEffect(() => {
    if (projectId) {
      const project = projects.find((p) => p.id === projectId)
      if (project) {
        setCurrentProject(project)
        loadTestLinks(projectId)
      }
    }

    return () => {
      setCurrentProject(null)
    }
  }, [projectId, projects, setCurrentProject, loadTestLinks])

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

  if (!currentProject) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
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
        <div className="mb-8">
          <h2 className="text-2xl font-bold mb-6">Test Links</h2>

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
                            variant={testLink.active ? 'default' : 'secondary'}
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
                          (testLink.record_opts as Record<string, unknown>)?.mic
                        ) && <span>• Microphone</span>}
                        {Boolean(
                          (testLink.record_opts as Record<string, unknown>)?.cam
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
      </main>
    </div>
  )
}
