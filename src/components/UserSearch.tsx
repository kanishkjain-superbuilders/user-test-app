import { useState, useCallback, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Card } from '@/components/ui/card'
import { Search, UserPlus } from 'lucide-react'
import { toast } from 'sonner'
import debounce from 'lodash/debounce'

interface User {
  id: string
  email: string
  created_at: string
}

interface UserSearchProps {
  orgId: string
  existingMemberIds: string[]
  existingInviteEmails: string[]
  onInviteSent?: () => void
}

export default function UserSearch({
  orgId,
  existingMemberIds,
  existingInviteEmails,
  onInviteSent,
}: UserSearchProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [searchResults, setSearchResults] = useState<User[]>([])
  const [loading, setLoading] = useState(false)
  const [inviting, setInviting] = useState<string | null>(null)

  // Debounced search function
  const searchUsers = useCallback(
    debounce(async (term: string) => {
      if (term.length < 2) {
        setSearchResults([])
        return
      }

      setLoading(true)
      try {
        // Ensure we have a valid session before calling Edge Functions
        const {
          data: { session },
        } = await supabase.auth.getSession()
        if (!session) {
          console.log('No session available for user search')
          setSearchResults([])
          setLoading(false)
          return
        }

        // Call Edge Function to search users
        const { data, error } = await supabase.functions.invoke(
          'search-users',
          {
            body: { searchTerm: term, orgId },
          }
        )

        if (error) throw error

        // Filter out existing members and invited users
        const filteredUsers = (data.users || []).filter(
          (user: User) =>
            !existingMemberIds.includes(user.id) &&
            !existingInviteEmails.includes(user.email)
        )

        setSearchResults(filteredUsers)
      } catch (error) {
        console.error('Error searching users:', error)
        // Fallback: search in invites table for users who have been invited before
        try {
          const { data } = await supabase
            .from('invites')
            .select('email')
            .ilike('email', `%${term}%`)
            .limit(5)

          interface InviteData {
            email: string
          }
          const uniqueEmails = [
            ...new Set(data?.map((d: InviteData) => d.email) || []),
          ].filter(
            (email) =>
              !existingInviteEmails.includes(email) &&
              !searchResults.find((u) => u.email === email)
          )

          // Create mock user objects for emails
          const emailResults: User[] = uniqueEmails.map((email) => ({
            id: `email-${email}`,
            email,
            created_at: new Date().toISOString(),
          }))

          setSearchResults(emailResults)
        } catch (fallbackError) {
          console.error('Fallback search error:', fallbackError)
          setSearchResults([])
        }
      } finally {
        setLoading(false)
      }
    }, 300),
    [orgId, existingMemberIds, existingInviteEmails]
  )

  useEffect(() => {
    searchUsers(searchTerm)
  }, [searchTerm, searchUsers])

  const sendInvite = async (
    user: User,
    role: 'admin' | 'editor' | 'viewer' = 'viewer'
  ) => {
    setInviting(user.id)
    try {
      // Get current session to ensure we have auth
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session) {
        throw new Error('No active session. Please log in again.')
      }

      // Call Edge Function to create internal invite
      const { error } = await supabase.functions.invoke(
        'create-internal-invite',
        {
          body: {
            orgId,
            inviteeEmail: user.email,
            inviteeId: user.id.startsWith('email-') ? null : user.id,
            role,
          },
        }
      )

      if (error) {
        console.error('Edge function error:', error)
        throw error
      }

      toast.success(`Invitation sent to ${user.email}`)

      // Remove from search results
      setSearchResults((prev) => prev.filter((u) => u.id !== user.id))

      // Notify parent
      onInviteSent?.()
    } catch (error) {
      console.error('Error sending invite:', error)
      toast.error('Failed to send invitation')
    } finally {
      setInviting(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          type="text"
          placeholder="Search users by email..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10"
        />
      </div>

      {loading && (
        <p className="text-center text-sm text-muted-foreground py-4">
          Searching users...
        </p>
      )}

      {!loading && searchTerm.length >= 2 && searchResults.length === 0 && (
        <Card className="p-4">
          <p className="text-center text-sm text-muted-foreground">
            No users found matching "{searchTerm}"
          </p>
          {searchTerm.includes('@') && (
            <div className="mt-4 space-y-2">
              <p className="text-center text-sm text-muted-foreground">
                Would you like to invite this email address?
              </p>
              <Button
                onClick={() =>
                  sendInvite({
                    id: `email-${searchTerm}`,
                    email: searchTerm,
                    created_at: new Date().toISOString(),
                  })
                }
                className="w-full gap-2"
                variant="outline"
              >
                <UserPlus className="h-4 w-4" />
                Send Invite to {searchTerm}
              </Button>
            </div>
          )}
        </Card>
      )}

      {searchResults.length > 0 && (
        <div className="space-y-2">
          {searchResults.map((user) => (
            <Card key={user.id} className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Avatar>
                    <AvatarFallback>
                      {user.email[0]?.toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-medium">{user.email}</p>
                    {!user.id.startsWith('email-') && (
                      <p className="text-xs text-muted-foreground">
                        Registered user
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <select
                    id={`role-${user.id}`}
                    className="text-sm border rounded px-2 py-1"
                    defaultValue="viewer"
                  >
                    <option value="viewer">Viewer</option>
                    <option value="editor">Editor</option>
                    <option value="admin">Admin</option>
                  </select>

                  <Button
                    size="sm"
                    onClick={() => {
                      const roleSelect = document.getElementById(
                        `role-${user.id}`
                      ) as HTMLSelectElement
                      const role = roleSelect?.value as
                        | 'admin'
                        | 'editor'
                        | 'viewer'
                      sendInvite(user, role)
                    }}
                    disabled={inviting === user.id}
                    className="gap-2"
                  >
                    {inviting === user.id ? (
                      <>
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                        Inviting...
                      </>
                    ) : (
                      <>
                        <UserPlus className="h-4 w-4" />
                        Invite
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
