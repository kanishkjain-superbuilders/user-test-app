import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/auth'
import { useProjectStore } from '../store/project'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ArrowLeft, Save } from 'lucide-react'
import { toast } from 'sonner'

interface RecordOpts {
  screen: boolean
  mic: boolean
  cam: boolean
  maxDurationSec: number
}

export default function TestLinkForm() {
  const { projectId, id } = useParams<{ projectId: string; id?: string }>()
  const navigate = useNavigate()
  const { currentOrg } = useAuthStore()
  const { testLinks, createTestLink, updateTestLink } = useProjectStore()

  const isEdit = !!id
  const existingLink = testLinks.find((link) => link.id === id)

  const [title, setTitle] = useState('')
  const [slug, setSlug] = useState('')
  const [instructions, setInstructions] = useState('')
  const [redirectUrl, setRedirectUrl] = useState('')
  const [visibility, setVisibility] = useState<'private' | 'unlisted'>(
    'unlisted'
  )
  const [recordOpts, setRecordOpts] = useState<RecordOpts>({
    screen: true,
    mic: true,
    cam: false,
    maxDurationSec: 1800,
  })
  const [active, setActive] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (isEdit && existingLink) {
      setTitle(existingLink.title)
      setSlug(existingLink.slug)
      setInstructions(existingLink.instructions_md)
      setRedirectUrl(existingLink.redirect_url || '')
      setVisibility(existingLink.visibility)
      const opts = (existingLink.record_opts as unknown as RecordOpts) || recordOpts
      // Always enforce screen and mic to be true, cam to be false
      setRecordOpts({
        ...opts,
        screen: true,
        mic: true,
        cam: false,
      })
      setActive(existingLink.active)
    }
  }, [isEdit, existingLink, recordOpts])

  const generateSlug = () => {
    if (!title.trim()) return
    const generated = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .substring(0, 50)
    setSlug(generated)
  }

  const handleSave = async () => {
    if (!currentOrg || !projectId || !title.trim() || !slug.trim()) {
      toast.error('Please fill in all required fields')
      return
    }

    setSaving(true)

    if (isEdit && id) {
      await updateTestLink(id, {
        title: title.trim(),
        slug: slug.trim(),
        instructions_md: instructions.trim(),
        redirect_url: redirectUrl.trim() || null,
        visibility,
        record_opts: recordOpts as unknown as Record<string, boolean | number>,
        active,
      })
      toast.success('Test link updated')
    } else {
      const result = await createTestLink({
        project_id: projectId,
        org_id: currentOrg.id,
        title: title.trim(),
        slug: slug.trim(),
        instructions_md: instructions.trim(),
        redirect_url: redirectUrl.trim() || null,
        visibility,
        record_opts: recordOpts as unknown as Record<string, boolean | number>,
        active,
      })

      if (result) {
        toast.success('Test link created')
      }
    }

    setSaving(false)
    navigate(`/app/projects/${projectId}`)
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
              onClick={() => navigate(`/app/projects/${projectId}`)}
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex-1">
              <h1 className="text-2xl font-bold">
                {isEdit ? 'Edit Test Link' : 'Create Test Link'}
              </h1>
            </div>
            <Button onClick={handleSave} disabled={saving} className="gap-2">
              <Save className="h-4 w-4" />
              {saving ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-6 py-8 max-w-3xl">
        <div className="space-y-8">
          {/* Basic Info */}
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold mb-4">Basic Information</h2>
            </div>

            <div className="space-y-2">
              <Label htmlFor="title">Title *</Label>
              <Input
                id="title"
                placeholder="e.g., Homepage Usability Test"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={!isEdit ? generateSlug : undefined}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="slug">URL Slug *</Label>
              <div className="flex gap-2">
                <Input
                  id="slug"
                  placeholder="homepage-test"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  className="flex-1"
                />
                {!isEdit && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={generateSlug}
                  >
                    Generate
                  </Button>
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                Your test link: {window.location.origin}/t/{slug || 'your-slug'}
              </p>
            </div>
          </div>

          <Separator />

          {/* Instructions */}
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold mb-1">Instructions</h2>
              <p className="text-sm text-muted-foreground">
                Tell testers what to do (supports Markdown)
              </p>
            </div>

            <div className="space-y-2">
              <Textarea
                id="instructions"
                placeholder="1. Navigate to the homepage&#10;2. Try to find the signup button&#10;3. Share your thoughts out loud"
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                rows={10}
              />
            </div>
          </div>

          <Separator />

          {/* Recording Options */}
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold mb-1">Recording Options</h2>
              <p className="text-sm text-muted-foreground">
                All sessions will record screen and audio
              </p>
            </div>

            <div className="grid gap-4">
              <div className="flex items-center gap-2 opacity-60">
                <input
                  type="checkbox"
                  id="screen"
                  checked={true}
                  disabled
                  className="h-4 w-4 rounded border-gray-300"
                />
                <Label htmlFor="screen" className="font-normal">
                  Screen Recording (always enabled)
                </Label>
              </div>

              <div className="flex items-center gap-2 opacity-60">
                <input
                  type="checkbox"
                  id="mic"
                  checked={true}
                  disabled
                  className="h-4 w-4 rounded border-gray-300"
                />
                <Label htmlFor="mic" className="font-normal">
                  Microphone (always enabled)
                </Label>
              </div>

              <div className="space-y-2">
                <Label htmlFor="duration">Max Duration (seconds)</Label>
                <Input
                  id="duration"
                  type="number"
                  min="60"
                  max="7200"
                  value={recordOpts.maxDurationSec}
                  onChange={(e) =>
                    setRecordOpts({
                      ...recordOpts,
                      maxDurationSec: parseInt(e.target.value) || 1800,
                    })
                  }
                />
              </div>
            </div>
          </div>

          <Separator />

          {/* Settings */}
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold mb-1">Settings</h2>
            </div>

            <div className="space-y-2">
              <Label htmlFor="redirect">Redirect URL (optional)</Label>
              <Input
                id="redirect"
                type="url"
                placeholder="https://example.com"
                value={redirectUrl}
                onChange={(e) => setRedirectUrl(e.target.value)}
              />
              <p className="text-sm text-muted-foreground">
                Automatically redirect testers to this URL after reading
                instructions
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="visibility">Visibility</Label>
              <Select
                value={visibility}
                onValueChange={(value: 'private' | 'unlisted') =>
                  setVisibility(value)
                }
              >
                <SelectTrigger id="visibility">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="private">
                    Private (org members only)
                  </SelectItem>
                  <SelectItem value="unlisted">
                    Unlisted (anyone with link)
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="active"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300"
              />
              <Label htmlFor="active" className="font-normal cursor-pointer">
                Active (accept new testers)
              </Label>
            </div>
          </div>

          <Separator />

          {/* Actions */}
          <div className="flex gap-4 justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate(`/app/projects/${projectId}`)}
            >
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving
                ? 'Saving...'
                : isEdit
                  ? 'Update Test Link'
                  : 'Create Test Link'}
            </Button>
          </div>
        </div>
      </main>
    </div>
  )
}
