export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      organizations: {
        Row: {
          id: string
          name: string
          owner_user_id: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          owner_user_id: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          owner_user_id?: string
          created_at?: string
          updated_at?: string
        }
      }
      memberships: {
        Row: {
          id: string
          org_id: string
          user_id: string
          role: 'admin' | 'editor' | 'viewer'
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          org_id: string
          user_id: string
          role: 'admin' | 'editor' | 'viewer'
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          user_id?: string
          role?: 'admin' | 'editor' | 'viewer'
          created_at?: string
          updated_at?: string
        }
      }
      projects: {
        Row: {
          id: string
          org_id: string
          name: string
          description: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          org_id: string
          name: string
          description?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          name?: string
          description?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      test_links: {
        Row: {
          id: string
          project_id: string
          org_id: string
          slug: string
          title: string
          instructions_md: string
          redirect_url: string | null
          require_auth: boolean
          allowed_emails: string[] | null
          visibility: 'private' | 'unlisted'
          record_opts: Json
          active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          project_id: string
          org_id: string
          slug: string
          title: string
          instructions_md: string
          redirect_url?: string | null
          require_auth?: boolean
          allowed_emails?: string[] | null
          visibility?: 'private' | 'unlisted'
          record_opts?: Json
          active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          project_id?: string
          org_id?: string
          slug?: string
          title?: string
          instructions_md?: string
          redirect_url?: string | null
          require_auth?: boolean
          allowed_emails?: string[] | null
          visibility?: 'private' | 'unlisted'
          record_opts?: Json
          active?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      live_sessions: {
        Row: {
          id: string
          test_link_id: string
          tester_anon_id: string | null
          status: 'starting' | 'live' | 'ended'
          started_at: string | null
          ended_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          test_link_id: string
          tester_anon_id?: string | null
          status?: 'starting' | 'live' | 'ended'
          started_at?: string | null
          ended_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          test_link_id?: string
          tester_anon_id?: string | null
          status?: 'starting' | 'live' | 'ended'
          started_at?: string | null
          ended_at?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      live_viewers: {
        Row: {
          id: string
          live_session_id: string
          user_id: string | null
          joined_at: string
          left_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          live_session_id: string
          user_id?: string | null
          joined_at?: string
          left_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          live_session_id?: string
          user_id?: string | null
          joined_at?: string
          left_at?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      recordings: {
        Row: {
          id: string
          test_link_id: string
          live_session_id: string | null
          org_id: string
          project_id: string | null
          uploader_user_id: string | null
          status: 'recording' | 'uploading' | 'processing' | 'completed' | 'ready' | 'failed'
          duration_ms: number | null
          width: number | null
          height: number | null
          visibility: 'private' | 'unlisted'
          object_path: string | null
          thumbnail_path: string | null
          total_parts: number | null
          total_bytes: number | null
          duration_sec: number | null
          mime_type: string | null
          codecs: string | null
          manifest_url: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          test_link_id: string
          live_session_id?: string | null
          org_id: string
          project_id?: string | null
          uploader_user_id?: string | null
          status?: 'recording' | 'uploading' | 'processing' | 'completed' | 'ready' | 'failed'
          duration_ms?: number | null
          width?: number | null
          height?: number | null
          visibility?: 'private' | 'unlisted'
          object_path?: string | null
          thumbnail_path?: string | null
          total_parts?: number | null
          total_bytes?: number | null
          duration_sec?: number | null
          mime_type?: string | null
          codecs?: string | null
          manifest_url?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          test_link_id?: string
          live_session_id?: string | null
          org_id?: string
          project_id?: string | null
          uploader_user_id?: string | null
          status?: 'recording' | 'uploading' | 'processing' | 'completed' | 'ready' | 'failed'
          duration_ms?: number | null
          width?: number | null
          height?: number | null
          visibility?: 'private' | 'unlisted'
          object_path?: string | null
          thumbnail_path?: string | null
          total_parts?: number | null
          total_bytes?: number | null
          duration_sec?: number | null
          mime_type?: string | null
          codecs?: string | null
          manifest_url?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      recording_segments: {
        Row: {
          id: string
          recording_id: string
          part_index: number
          storage_path: string
          mime_type: string | null
          size_bytes: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          recording_id: string
          part_index: number
          storage_path: string
          mime_type?: string | null
          size_bytes: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          recording_id?: string
          part_index?: number
          storage_path?: string
          mime_type?: string | null
          size_bytes?: number
          created_at?: string
          updated_at?: string
        }
      }
      comments: {
        Row: {
          id: string
          recording_id: string | null
          live_session_id: string | null
          user_id: string | null
          author_name: string | null
          timestamp_ms: number | null
          body: string
          kind: 'comment' | 'marker'
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          recording_id?: string | null
          live_session_id?: string | null
          user_id?: string | null
          author_name?: string | null
          timestamp_ms?: number | null
          body: string
          kind?: 'comment' | 'marker'
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          recording_id?: string | null
          live_session_id?: string | null
          user_id?: string | null
          author_name?: string | null
          timestamp_ms?: number | null
          body?: string
          kind?: 'comment' | 'marker'
          created_at?: string
          updated_at?: string
        }
      }
      events: {
        Row: {
          id: string
          live_session_id: string | null
          recording_id: string | null
          name: string
          payload: Json
          timestamp_ms: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          live_session_id?: string | null
          recording_id?: string | null
          name: string
          payload?: Json
          timestamp_ms: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          live_session_id?: string | null
          recording_id?: string | null
          name?: string
          payload?: Json
          timestamp_ms?: number
          created_at?: string
          updated_at?: string
        }
      }
      invites: {
        Row: {
          id: string
          org_id: string
          email: string
          role: 'admin' | 'editor' | 'viewer'
          token: string
          accepted_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          org_id: string
          email: string
          role: 'admin' | 'editor' | 'viewer'
          token: string
          accepted_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          email?: string
          role?: 'admin' | 'editor' | 'viewer'
          token?: string
          accepted_at?: string | null
          created_at?: string
          updated_at?: string
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
  }
}
