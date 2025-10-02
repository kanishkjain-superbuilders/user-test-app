import { create } from 'zustand'
import type { User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

interface Organization {
  id: string
  name: string
  owner_user_id: string
  created_at: string
  updated_at: string
}

interface Membership {
  id: string
  org_id: string
  user_id: string
  role: 'admin' | 'editor' | 'viewer'
  organization?: Organization
}

interface AuthState {
  user: User | null
  currentOrg: Organization | null
  memberships: Membership[]
  loading: boolean

  // Actions
  setUser: (user: User | null) => void
  setCurrentOrg: (org: Organization | null) => void
  setMemberships: (memberships: Membership[]) => void
  loadMemberships: () => Promise<void>
  switchOrg: (orgId: string) => void
  signOut: () => Promise<void>
  initialize: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  currentOrg: null,
  memberships: [],
  loading: true,

  setUser: (user) => set({ user }),

  setCurrentOrg: (org) => {
    set({ currentOrg: org })
    if (org) {
      localStorage.setItem('currentOrgId', org.id)
    } else {
      localStorage.removeItem('currentOrgId')
    }
  },

  setMemberships: (memberships) => set({ memberships }),

  loadMemberships: async () => {
    const { user } = get()
    if (!user) return

    const { data, error } = await supabase
      .from('memberships')
      .select('*, organization:organizations(*)')
      .eq('user_id', user.id)

    if (error) {
      console.error('Error loading memberships:', error)
      return
    }

    // Cast data to expected type with organization relation
    const membershipsWithOrg = (data || []) as unknown as Membership[]
    set({ memberships: membershipsWithOrg })

    // Auto-select org
    const savedOrgId = localStorage.getItem('currentOrgId')
    const currentOrg = membershipsWithOrg?.find(
      (m) => m.org_id === savedOrgId
    )?.organization

    if (currentOrg) {
      set({ currentOrg })
    } else if (membershipsWithOrg && membershipsWithOrg.length > 0) {
      const firstOrg = membershipsWithOrg[0].organization
      set({ currentOrg: firstOrg || null })
      if (firstOrg) {
        localStorage.setItem('currentOrgId', firstOrg.id)
      }
    }
  },

  switchOrg: (orgId) => {
    const { memberships } = get()
    const membership = memberships.find((m) => m.org_id === orgId)
    if (membership?.organization) {
      get().setCurrentOrg(membership.organization)
    }
  },

  signOut: async () => {
    await supabase.auth.signOut()
    set({ user: null, currentOrg: null, memberships: [] })
    localStorage.removeItem('currentOrgId')
  },

  initialize: async () => {
    set({ loading: true })

    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (session?.user) {
      set({ user: session.user })
      await get().loadMemberships()
    }

    set({ loading: false })

    // Listen to auth changes
    supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        set({ user: session.user })
        // Load memberships asynchronously without blocking the event handler
        get().loadMemberships()
      } else {
        set({ user: null, currentOrg: null, memberships: [] })
      }
    })
  },
}))
