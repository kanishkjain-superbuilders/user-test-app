import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
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
import { Badge } from '@/components/ui/badge'
import { Check, X, Building, Calendar } from 'lucide-react'
import { toast } from 'sonner'

interface Invite {
  id: string
  org_id: string
  email: string
  role: 'admin' | 'editor' | 'viewer'
  created_at: string
  organization: {
    id: string
    name: string
    created_at: string
  }
}

export default function AcceptInvite() {
  const navigate = useNavigate()
  const { user, loadMemberships } = useAuthStore()
  const [invites, setInvites] = useState<Invite[]>([])
  const [loading, setLoading] = useState(true)
  const [accepting, setAccepting] = useState<string | null>(null)
  const [declining, setDeclining] = useState<string | null>(null)

  useEffect(() => {
    if (!user) {
      navigate('/login')
      return
    }

    loadPendingInvites()
  }, [user])

  const loadPendingInvites = async () => {
    setLoading(true)
    try {
      // Ensure we have a valid session
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session) {
        console.log('No session available for loading invites')
        setLoading(false)
        return
      }

      const { data, error } = await supabase.functions.invoke('list-my-invites')

      if (error) {
        console.error('Edge function error:', error)
        throw error
      }

      setInvites(data?.invites || [])
    } catch (error) {
      console.error('Error loading invites:', error)
      toast.error('Failed to load pending invitations')
    } finally {
      setLoading(false)
    }
  }

  const acceptInvite = async (inviteId: string) => {
    setAccepting(inviteId)
    try {
      const { error } = await supabase.functions.invoke('accept-invite', {
        body: { inviteId },
      })

      if (error) throw error

      toast.success('Successfully joined the organization!')

      // Reload memberships in the auth store
      await loadMemberships()

      // Remove the accepted invite from the list
      setInvites((prev) => prev.filter((i) => i.id !== inviteId))

      // If no more invites, redirect to dashboard
      if (invites.length === 1) {
        navigate('/app')
      }
    } catch (error) {
      console.error('Error accepting invite:', error)
      toast.error('Failed to accept invitation')
    } finally {
      setAccepting(null)
    }
  }

  const declineInvite = async (inviteId: string) => {
    setDeclining(inviteId)
    try {
      // Delete the invite (mark as declined)
      if (!user?.email) {
        toast.error('User email not found')
        return
      }

      const { error } = await supabase
        .from('invites')
        .delete()
        .eq('id', inviteId)
        .eq('email', user.email)

      if (error) throw error

      toast.success('Invitation declined')

      // Remove from list
      setInvites((prev) => prev.filter((i) => i.id !== inviteId))

      // If no more invites, redirect to dashboard
      if (invites.length === 1) {
        navigate('/app')
      }
    } catch (error) {
      console.error('Error declining invite:', error)
      toast.error('Failed to decline invitation')
    } finally {
      setDeclining(null)
    }
  }

  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case 'admin':
        return 'destructive'
      case 'editor':
        return 'default'
      case 'viewer':
        return 'secondary'
      default:
        return 'outline'
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-purple-50/30 to-blue-50/30 dark:from-background dark:via-purple-950/10 dark:to-blue-950/10">
      <div className="container mx-auto px-6 py-12 max-w-2xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Pending Invitations</h1>
          <p className="text-muted-foreground">
            You have been invited to join the following organizations
          </p>
        </div>

        {invites.length === 0 ? (
          <Card>
            <CardContent className="text-center py-12">
              <p className="text-muted-foreground mb-4">
                You don't have any pending invitations
              </p>
              <Button onClick={() => navigate('/app')}>Go to Dashboard</Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {invites.map((invite) => (
              <Card key={invite.id}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <Building className="h-5 w-5" />
                        {invite.organization.name}
                      </CardTitle>
                      <CardDescription className="mt-2">
                        You've been invited to join as a{' '}
                        <Badge
                          variant={getRoleBadgeVariant(invite.role)}
                          className="ml-1"
                        >
                          {invite.role}
                        </Badge>
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
                    <Calendar className="h-4 w-4" />
                    Invited {new Date(invite.created_at).toLocaleDateString()}
                  </div>

                  <div className="flex gap-2">
                    <Button
                      onClick={() => acceptInvite(invite.id)}
                      disabled={
                        accepting === invite.id || declining === invite.id
                      }
                      className="gap-2"
                    >
                      {accepting === invite.id ? (
                        <>
                          <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                          Accepting...
                        </>
                      ) : (
                        <>
                          <Check className="h-4 w-4" />
                          Accept
                        </>
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => declineInvite(invite.id)}
                      disabled={
                        accepting === invite.id || declining === invite.id
                      }
                      className="gap-2"
                    >
                      {declining === invite.id ? (
                        <>
                          <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                          Declining...
                        </>
                      ) : (
                        <>
                          <X className="h-4 w-4" />
                          Decline
                        </>
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <div className="mt-8 text-center">
          <Button variant="outline" onClick={() => navigate('/app')}>
            Back to Dashboard
          </Button>
        </div>
      </div>
    </div>
  )
}
