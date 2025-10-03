import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import type { Database } from '../lib/database.types'

type Recording = Database['public']['Tables']['recordings']['Row']
type TestLink = Database['public']['Tables']['test_links']['Row']
type Project = Database['public']['Tables']['projects']['Row']
type LiveSession = Database['public']['Tables']['live_sessions']['Row']

interface OrganizationStats {
  totalProjects: number
  totalRecordings: number
  activeLiveSessions: number
  totalTestLinks: number
  recentActivity: {
    type: 'recording' | 'session' | 'project'
    title: string
    timestamp: string
  }[]
}

interface OrganizationDataState {
  // Data
  recordings: Recording[]
  liveSessions: LiveSession[]
  stats: OrganizationStats | null
  testLinks: TestLink[]
  projects: Project[]

  // Loading states
  loadingRecordings: boolean
  loadingLiveSessions: boolean
  loadingStats: boolean

  // Cache management
  currentOrgId: string | null
  lastFetch: {
    recordings?: Date
    liveSessions?: Date
    stats?: Date
  }

  // Actions
  loadOrgRecordings: (orgId: string, force?: boolean) => Promise<void>
  loadOrgLiveSessions: (orgId: string, force?: boolean) => Promise<void>
  loadOrgStats: (orgId: string, force?: boolean) => Promise<void>
  loadAllOrgData: (orgId: string, force?: boolean) => Promise<void>
  clearCache: () => void
}

const CACHE_DURATION = 60000 // 1 minute cache

export const useOrganizationDataStore = create<OrganizationDataState>(
  (set, get) => ({
    // Initial state
    recordings: [],
    liveSessions: [],
    stats: null,
    testLinks: [],
    projects: [],
    loadingRecordings: false,
    loadingLiveSessions: false,
    loadingStats: false,
    currentOrgId: null,
    lastFetch: {},

    loadOrgRecordings: async (orgId: string, force = false) => {
      const state = get()

      // Check cache
      if (
        !force &&
        state.currentOrgId === orgId &&
        state.lastFetch.recordings &&
        Date.now() - state.lastFetch.recordings.getTime() < CACHE_DURATION
      ) {
        return
      }

      set({ loadingRecordings: true })

      try {
        // Get all recordings for this organization
        const { data, error } = await supabase
          .from('recordings')
          .select(
            `
          *,
          test_links!inner (
            id,
            title,
            slug,
            project_id,
            projects!inner (
              id,
              name
            )
          )
        `
          )
          .eq('org_id', orgId)
          .order('created_at', { ascending: false })
          .limit(100) // Limit for performance

        if (error) throw error

        set({
          recordings: data || [],
          currentOrgId: orgId,
          lastFetch: { ...state.lastFetch, recordings: new Date() },
          loadingRecordings: false,
        })
      } catch (error) {
        console.error('Error loading org recordings:', error)
        set({ loadingRecordings: false })
      }
    },

    loadOrgLiveSessions: async (orgId: string, force = false) => {
      const state = get()

      // Check cache
      if (
        !force &&
        state.currentOrgId === orgId &&
        state.lastFetch.liveSessions &&
        Date.now() - state.lastFetch.liveSessions.getTime() < CACHE_DURATION
      ) {
        return
      }

      set({ loadingLiveSessions: true })

      try {
        // Get all active live sessions for this organization
        // First get all projects for the org
        const { data: projects, error: projectsError } = await supabase
          .from('projects')
          .select('id')
          .eq('org_id', orgId)

        if (projectsError) throw projectsError

        if (!projects || projects.length === 0) {
          set({
            liveSessions: [],
            currentOrgId: orgId,
            lastFetch: { ...state.lastFetch, liveSessions: new Date() },
            loadingLiveSessions: false,
          })
          return
        }

        const projectIds = projects.map((p: any) => p.id)

        // Get active live sessions for these projects
        const { data, error } = await supabase
          .from('live_sessions')
          .select(
            `
          *,
          test_links!inner (
            id,
            title,
            slug
          )
        `
          )
          .in('project_id', projectIds)
          .eq('status', 'active')
          .order('started_at', { ascending: false })

        if (error) throw error

        set({
          liveSessions: data || [],
          currentOrgId: orgId,
          lastFetch: { ...state.lastFetch, liveSessions: new Date() },
          loadingLiveSessions: false,
        })
      } catch (error) {
        console.error('Error loading org live sessions:', error)
        set({ loadingLiveSessions: false })
      }
    },

    loadOrgStats: async (orgId: string, force = false) => {
      const state = get()

      // Check cache
      if (
        !force &&
        state.currentOrgId === orgId &&
        state.lastFetch.stats &&
        Date.now() - state.lastFetch.stats.getTime() < CACHE_DURATION
      ) {
        return
      }

      set({ loadingStats: true })

      try {
        // Get counts for various entities
        const [projectsCount, recordingsCount, testLinksCount, activeSessions] =
          await Promise.all([
            supabase
              .from('projects')
              .select('id', { count: 'exact', head: true })
              .eq('org_id', orgId),

            supabase
              .from('recordings')
              .select('id', { count: 'exact', head: true })
              .eq('org_id', orgId),

            supabase
              .from('test_links')
              .select('id', { count: 'exact', head: true })
              .eq('org_id', orgId),

            // For active sessions, we need to get projects first
            supabase
              .from('projects')
              .select('id')
              .eq('org_id', orgId)
              .then(async ({ data: projects }) => {
                if (!projects || projects.length === 0) return { count: 0 }

                const projectIds = projects.map((p: any) => p.id)
                return supabase
                  .from('live_sessions')
                  .select('id', { count: 'exact', head: true })
                  .in('project_id', projectIds)
                  .eq('status', 'active')
              }),
          ])

        // Get recent activity (last 10 items)
        const { data: recentRecordings } = await supabase
          .from('recordings')
          .select('id, created_at, test_links!inner(title)')
          .eq('org_id', orgId)
          .order('created_at', { ascending: false })
          .limit(10)

        const recentActivity = (recentRecordings || []).map((r: any) => ({
          type: 'recording' as const,
          title: r.test_links?.title || 'Recording',
          timestamp: r.created_at,
        }))

        const stats: OrganizationStats = {
          totalProjects: projectsCount.count || 0,
          totalRecordings: recordingsCount.count || 0,
          activeLiveSessions: activeSessions.count || 0,
          totalTestLinks: testLinksCount.count || 0,
          recentActivity,
        }

        set({
          stats,
          currentOrgId: orgId,
          lastFetch: { ...state.lastFetch, stats: new Date() },
          loadingStats: false,
        })
      } catch (error) {
        console.error('Error loading org stats:', error)
        set({ loadingStats: false })
      }
    },

    loadAllOrgData: async (orgId: string, force = false) => {
      // Load all organization data in parallel
      await Promise.all([
        get().loadOrgRecordings(orgId, force),
        get().loadOrgLiveSessions(orgId, force),
        get().loadOrgStats(orgId, force),
      ])
    },

    clearCache: () => {
      set({
        recordings: [],
        liveSessions: [],
        stats: null,
        testLinks: [],
        projects: [],
        currentOrgId: null,
        lastFetch: {},
      })
    },
  })
)
