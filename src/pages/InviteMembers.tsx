import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/auth'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { ArrowLeft } from 'lucide-react'
import { toast } from 'sonner'
import UserSearch from '@/components/UserSearch'

export default function InviteMembers() {
  const { orgId } = useParams<{ orgId: string }>()
  const navigate = useNavigate()
  const { currentOrg, memberships } = useAuthStore()

  const [existingMemberIds, setExistingMemberIds] = useState<string[]>([])
  const [existingInviteEmails, setExistingInviteEmails] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  // Check if current user is admin
  const currentMembership = memberships.find((m) => m.org_id === orgId)
  const isAdmin = currentMembership?.role === 'admin'

  useEffect(() => {
    if (!orgId || !currentOrg || currentOrg.id !== orgId) {
      navigate('/app')
      toast.error('Organization not found')
      return
    }

    if (!isAdmin) {
      navigate(`/app/organizations/${orgId}/settings`)
      toast.error('Only administrators can invite members')
      return
    }

    loadExistingData()
  }, [orgId, currentOrg, isAdmin])

  const loadExistingData = async () => {
    if (!orgId) return

    setLoading(true)
    try {
      // Load existing members
      const { data: members } = await supabase
        .from('memberships')
        .select('user_id')
        .eq('org_id', orgId)

      interface MemberData {
        user_id: string
      }
      setExistingMemberIds(members?.map((m: MemberData) => m.user_id) || [])

      // Load pending invites
      const { data: invites } = await supabase
        .from('invites')
        .select('email')
        .eq('org_id', orgId)
        .is('accepted_at', null)

      interface InviteData {
        email: string
      }
      setExistingInviteEmails(invites?.map((i: InviteData) => i.email) || [])
    } catch (error) {
      console.error('Error loading existing data:', error)
      toast.error('Failed to load organization data')
    } finally {
      setLoading(false)
    }
  }

  const handleInviteSent = () => {
    // Reload existing data to update the lists
    loadExistingData()
  }

  if (!currentOrg || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-purple-50/30 to-blue-50/30 dark:from-background dark:via-purple-950/10 dark:to-blue-950/10">
      {/* Header */}
      <header className="border-b bg-background/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate(`/app/organizations/${orgId}/settings`)}
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold">Invite Members</h1>
              <p className="text-sm text-muted-foreground">{currentOrg.name}</p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-6 py-8 max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle>Invite Users to Your Organization</CardTitle>
            <CardDescription>
              Search for existing users or enter an email address to send
              invitations. Users will see pending invitations when they log in.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <UserSearch
              orgId={orgId!}
              existingMemberIds={existingMemberIds}
              existingInviteEmails={existingInviteEmails}
              onInviteSent={handleInviteSent}
            />
          </CardContent>
        </Card>

        <div className="mt-6 text-center">
          <Button
            variant="outline"
            onClick={() => navigate(`/app/organizations/${orgId}/settings`)}
          >
            Back to Organization Settings
          </Button>
        </div>
      </main>
    </div>
  )
}
