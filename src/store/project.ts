import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import type { Database } from '../lib/database.types'

type Project = Database['public']['Tables']['projects']['Row']
type TestLink = Database['public']['Tables']['test_links']['Row']

interface ProjectState {
  projects: Project[]
  currentProject: Project | null
  testLinks: TestLink[]
  loading: boolean

  // Actions
  loadProjects: (orgId: string) => Promise<void>
  setCurrentProject: (project: Project | null) => void
  loadTestLinks: (projectId: string) => Promise<void>
  createProject: (
    orgId: string,
    name: string,
    description?: string
  ) => Promise<Project | null>
  createTestLink: (
    data: Database['public']['Tables']['test_links']['Insert']
  ) => Promise<TestLink | null>
  updateTestLink: (
    id: string,
    data: Database['public']['Tables']['test_links']['Update']
  ) => Promise<void>
  deleteTestLink: (id: string) => Promise<void>
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: [],
  currentProject: null,
  testLinks: [],
  loading: false,

  loadProjects: async (orgId: string) => {
    set({ loading: true })
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error loading projects:', error)
      set({ loading: false })
      return
    }

    set({ projects: data || [], loading: false })
  },

  setCurrentProject: (project) => set({ currentProject: project }),

  loadTestLinks: async (projectId: string) => {
    const { data, error } = await supabase
      .from('test_links')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error loading test links:', error)
      return
    }

    set({ testLinks: data || [] })
  },

  createProject: async (orgId: string, name: string, description?: string) => {
    const projectData: Database['public']['Tables']['projects']['Insert'] = {
      org_id: orgId,
      name,
      description,
    }

    const { data, error } = await supabase
      .from('projects')
      .insert(projectData as never)
      .select()
      .single()

    if (error) {
      console.error('Error creating project:', error)
      return null
    }

    const { projects } = get()
    set({ projects: [data, ...projects] })
    return data
  },

  createTestLink: async (linkData) => {
    const { data, error } = await supabase
      .from('test_links')
      .insert(linkData as never)
      .select()
      .single()

    if (error) {
      console.error('Error creating test link:', error)
      return null
    }

    const { testLinks } = get()
    set({ testLinks: [data, ...testLinks] })
    return data
  },

  updateTestLink: async (id: string, linkData) => {
    const { error } = await supabase
      .from('test_links')
      .update(linkData as never)
      .eq('id', id)

    if (error) {
      console.error('Error updating test link:', error)
      return
    }

    const { testLinks } = get()
    set({
      testLinks: testLinks.map((link) =>
        link.id === id ? { ...link, ...linkData } : link
      ),
    })
  },

  deleteTestLink: async (id: string) => {
    const { error } = await supabase.from('test_links').delete().eq('id', id)

    if (error) {
      console.error('Error deleting test link:', error)
      return
    }

    const { testLinks } = get()
    set({ testLinks: testLinks.filter((link) => link.id !== id) })
  },
}))
