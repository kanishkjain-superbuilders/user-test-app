import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/auth'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/lib/database.types'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  ArrowLeft,
  MoreVertical,
  UserPlus,
  Trash2,
  Shield,
  Users,
  Settings,
} from 'lucide-react'
import { toast } from 'sonner'

type MembershipRow = Database['public']['Tables']['memberships']['Row']

type Membership = MembershipRow & {
  user: {
    id: string
    email: string
    created_at: string
  }
}

type Invite = Database['public']['Tables']['invites']['Row'] & {
  inviter: {
    email: string
  } | null
}

export default function OrganizationSettings() {
  const { orgId } = useParams<{ orgId: string }>()
  const navigate = useNavigate()
  const { currentOrg, user, memberships } = useAuthStore()

  const [members, setMembers] = useState<Membership[]>([])
  const [pendingInvites, setPendingInvites] = useState<Invite[]>([])
  const [loadingMembers, setLoadingMembers] = useState(false)
  const [loadingInvites, setLoadingInvites] = useState(false)

  // Check if current user is admin
  const currentMembership = memberships.find((m) => m.org_id === orgId)
  const isAdmin = currentMembership?.role === 'admin'

  useEffect(() => {
    if (orgId && currentOrg?.id === orgId) {
      loadMembers()
      loadPendingInvites()
    } else if (orgId && currentOrg?.id !== orgId) {
      // User doesn't have access to this org
      navigate('/app')
      toast.error('You do not have access to this organization')
    }
  }, [orgId, currentOrg])

  const loadMembers = async () => {
    if (!orgId) return

    setLoadingMembers(true)
    try {
      // Try to use the database function if it exists
      const { data: functionData, error: functionError } = (await (
        supabase.rpc as unknown as (
          name: string,
          params: Record<string, unknown>
        ) => Promise<{ data: unknown; error: unknown }>
      )('get_org_members', { org_uuid: orgId })) as {
        data: unknown
        error: unknown
      }

      if (functionError) {
        console.error('RPC Error details:', functionError)
      }

      if (!functionError && functionData) {
        // Use data from the function
        const membersWithUsers = (
          functionData as Array<{
            id: string
            org_id: string
            user_id: string
            role: string
            created_at: string
            updated_at: string
            user_email: string
          }>
        ).map((row) => ({
          id: row.id,
          org_id: row.org_id,
          user_id: row.user_id,
          role: row.role,
          created_at: row.created_at,
          updated_at: row.updated_at,
          user: {
            id: row.user_id,
            email: row.user_email,
            created_at: row.created_at,
          },
        }))
        setMembers(membersWithUsers as Membership[])
      } else {
        // Fallback to regular query
        const { data: membershipData, error } = await supabase
          .from('memberships')
          .select('*')
          .eq('org_id', orgId)
          .order('created_at', { ascending: true })

        if (error) throw error

        // For fallback, show current user's email and truncated IDs for others
        type MembershipRow = Database['public']['Tables']['memberships']['Row']
        const membersWithUsers = (
          (membershipData || []) as MembershipRow[]
        ).map((membership) => {
          const isCurrentUser = membership.user_id === user?.id
          return {
            id: membership.id,
            org_id: membership.org_id,
            user_id: membership.user_id,
            role: membership.role,
            created_at: membership.created_at,
            updated_at: membership.updated_at,
            user: {
              id: membership.user_id,
              email:
                isCurrentUser && user?.email
                  ? user.email
                  : `User ${membership.user_id.slice(0, 8)}...`,
              created_at: membership.created_at,
            },
          }
        })

        setMembers(membersWithUsers as Membership[])
      }
    } catch (error) {
      console.error('Error loading members:', error)
      toast.error('Failed to load members')
    } finally {
      setLoadingMembers(false)
    }
  }

  const loadPendingInvites = async () => {
    if (!orgId || !isAdmin) return

    setLoadingInvites(true)
    try {
      const { data, error } = await supabase
        .from('invites')
        .select('*')
        .eq('org_id', orgId)
        .is('accepted_at', null)
        .order('created_at', { ascending: false })

      if (error) throw error

      // For now, we won't show the inviter email
      type InviteRow = Database['public']['Tables']['invites']['Row']
      const invitesWithInviter = ((data || []) as InviteRow[]).map(
        (invite) => ({
          id: invite.id,
          org_id: invite.org_id,
          email: invite.email,
          role: invite.role,
          token: invite.token,
          accepted_at: invite.accepted_at,
          created_at: invite.created_at,
          updated_at: invite.updated_at,
          inviter: null,
        })
      )

      setPendingInvites(invitesWithInviter as Invite[])
    } catch (error) {
      console.error('Error loading invites:', error)
      toast.error('Failed to load pending invites')
    } finally {
      setLoadingInvites(false)
    }
  }

  const removeMember = async (membershipId: string, userEmail: string) => {
    if (!isAdmin) {
      toast.error('Only admins can remove members')
      return
    }

    const confirmed = confirm(
      `Are you sure you want to remove ${userEmail} from this organization?`
    )
    if (!confirmed) return

    try {
      const { error } = await supabase
        .from('memberships')
        .delete()
        .eq('id', membershipId)

      if (error) throw error

      toast.success(`Removed ${userEmail} from organization`)
      loadMembers()
    } catch (error) {
      console.error('Error removing member:', error)
      toast.error('Failed to remove member')
    }
  }

  const updateMemberRole = async (
    membershipId: string,
    newRole: 'admin' | 'editor' | 'viewer'
  ) => {
    if (!isAdmin) {
      toast.error('Only admins can change member roles')
      return
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from('memberships') as any)
        .update({ role: newRole })
        .eq('id', membershipId)

      if (error) throw error

      toast.success('Role updated successfully')
      loadMembers()
    } catch (error) {
      console.error('Error updating role:', error)
      toast.error('Failed to update role')
    }
  }

  const cancelInvite = async (inviteId: string) => {
    if (!isAdmin) {
      toast.error('Only admins can cancel invites')
      return
    }

    try {
      const { error } = await supabase
        .from('invites')
        .delete()
        .eq('id', inviteId)

      if (error) throw error

      toast.success('Invite cancelled')
      loadPendingInvites()
    } catch (error) {
      console.error('Error cancelling invite:', error)
      toast.error('Failed to cancel invite')
    }
  }

  const getRoleBadgeVariant = (
    role: 'admin' | 'editor' | 'viewer' | string
  ) => {
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

  if (!currentOrg) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Organization not found</p>
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
              onClick={() => navigate('/app')}
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold">Organization Settings</h1>
              <p className="text-sm text-muted-foreground">{currentOrg.name}</p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-6 py-8">
        <Tabs defaultValue="members" className="w-full">
          <TabsList>
            <TabsTrigger value="members" className="gap-2">
              <Users className="h-4 w-4" />
              Members
            </TabsTrigger>
            <TabsTrigger value="invites" className="gap-2" disabled={!isAdmin}>
              <UserPlus className="h-4 w-4" />
              Invitations
            </TabsTrigger>
            <TabsTrigger value="settings" className="gap-2" disabled={!isAdmin}>
              <Settings className="h-4 w-4" />
              Settings
            </TabsTrigger>
          </TabsList>

          {/* Members Tab */}
          <TabsContent value="members" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Organization Members</CardTitle>
                <CardDescription>
                  Manage who has access to this organization and their roles
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loadingMembers ? (
                  <p className="text-center py-8 text-muted-foreground">
                    Loading members...
                  </p>
                ) : (
                  <div className="space-y-4">
                    {members.map((member) => (
                      <div
                        key={member.id}
                        className="flex items-center justify-between p-4 border rounded-lg"
                      >
                        <div className="flex items-center gap-4">
                          <Avatar>
                            <AvatarFallback>
                              {member.user?.email?.[0]?.toUpperCase() || '?'}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-medium">{member.user?.email}</p>
                            <p className="text-sm text-muted-foreground">
                              Joined{' '}
                              {new Date(member.created_at).toLocaleDateString()}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <Badge variant={getRoleBadgeVariant(member.role)}>
                            {member.role}
                          </Badge>

                          {isAdmin && member.user_id !== user?.id && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon">
                                  <MoreVertical className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={() =>
                                    updateMemberRole(member.id, 'admin')
                                  }
                                  disabled={member.role === 'admin'}
                                >
                                  <Shield className="h-4 w-4 mr-2" />
                                  Make Admin
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() =>
                                    updateMemberRole(member.id, 'editor')
                                  }
                                  disabled={member.role === 'editor'}
                                >
                                  Change to Editor
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() =>
                                    updateMemberRole(member.id, 'viewer')
                                  }
                                  disabled={member.role === 'viewer'}
                                >
                                  Change to Viewer
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={() =>
                                    removeMember(
                                      member.id,
                                      member.user?.email || ''
                                    )
                                  }
                                  className="text-destructive"
                                >
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  Remove from Organization
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Invitations Tab */}
          <TabsContent value="invites" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Pending Invitations</CardTitle>
                <CardDescription>
                  Manage pending invitations to join this organization
                </CardDescription>
              </CardHeader>
              <CardContent>
                {!isAdmin ? (
                  <p className="text-center py-8 text-muted-foreground">
                    Only administrators can manage invitations
                  </p>
                ) : loadingInvites ? (
                  <p className="text-center py-8 text-muted-foreground">
                    Loading invitations...
                  </p>
                ) : pendingInvites.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-muted-foreground mb-4">
                      No pending invitations
                    </p>
                    <Button
                      onClick={() =>
                        navigate(`/app/organizations/${orgId}/invite`)
                      }
                      className="gap-2"
                    >
                      <UserPlus className="h-4 w-4" />
                      Invite Members
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex justify-end mb-4">
                      <Button
                        onClick={() =>
                          navigate(`/app/organizations/${orgId}/invite`)
                        }
                        className="gap-2"
                      >
                        <UserPlus className="h-4 w-4" />
                        Invite More Members
                      </Button>
                    </div>
                    {pendingInvites.map((invite) => (
                      <div
                        key={invite.id}
                        className="flex items-center justify-between p-4 border rounded-lg"
                      >
                        <div>
                          <p className="font-medium">{invite.email}</p>
                          <p className="text-sm text-muted-foreground">
                            Invited{' '}
                            {new Date(invite.created_at).toLocaleDateString()}
                            {invite.inviter && ` by ${invite.inviter.email}`}
                          </p>
                        </div>

                        <div className="flex items-center gap-2">
                          <Badge variant={getRoleBadgeVariant(invite.role)}>
                            {invite.role}
                          </Badge>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => cancelInvite(invite.id)}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Settings Tab */}
          <TabsContent value="settings" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Organization Settings</CardTitle>
                <CardDescription>
                  Manage organization-wide settings
                </CardDescription>
              </CardHeader>
              <CardContent>
                {!isAdmin ? (
                  <p className="text-center py-8 text-muted-foreground">
                    Only administrators can manage organization settings
                  </p>
                ) : (
                  <div className="space-y-6">
                    <div>
                      <h3 className="text-lg font-semibold mb-2">
                        Organization Name
                      </h3>
                      <p className="text-muted-foreground">{currentOrg.name}</p>
                    </div>

                    <div>
                      <h3 className="text-lg font-semibold mb-2">
                        Organization ID
                      </h3>
                      <p className="text-muted-foreground font-mono text-sm">
                        {currentOrg.id}
                      </p>
                    </div>

                    <div>
                      <h3 className="text-lg font-semibold mb-2">Created</h3>
                      <p className="text-muted-foreground">
                        {new Date(currentOrg.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  )
}
