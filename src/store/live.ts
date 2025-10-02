import { create } from 'zustand'
import { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { Database } from '../lib/database.types'

type LiveSession = Database['public']['Tables']['live_sessions']['Row']
type Comment = Database['public']['Tables']['comments']['Row']

interface PresenceState {
  role: 'broadcaster' | 'viewer'
  userId?: string
  displayName: string
}

interface PeerConnection {
  pc: RTCPeerConnection
  stream?: MediaStream
}

interface LiveState {
  liveSession: LiveSession | null
  channel: RealtimeChannel | null
  presence: Record<string, PresenceState>
  peerConnections: Map<string, PeerConnection>
  localStream: MediaStream | null
  comments: Comment[]
  viewerCount: number

  // Actions
  setLiveSession: (session: LiveSession | null) => void
  initChannel: (channelName: string) => void
  cleanup: () => void
  addPeerConnection: (peerId: string, pc: RTCPeerConnection) => void
  removePeerConnection: (peerId: string) => void
  setLocalStream: (stream: MediaStream | null) => void
  addComment: (comment: Comment) => void
  sendSignal: (signal: unknown) => void
}

export const useLiveStore = create<LiveState>((set, get) => ({
  liveSession: null,
  channel: null,
  presence: {},
  peerConnections: new Map(),
  localStream: null,
  comments: [],
  viewerCount: 0,

  setLiveSession: (session) => set({ liveSession: session }),

  initChannel: (channelName: string) => {
    const channel = supabase.channel(channelName, {
      config: {
        presence: { key: '' },
      },
    })

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState()
        const presenceMap: Record<string, PresenceState> = {}
        let viewerCount = 0

        Object.keys(state).forEach((key) => {
          const [user] = state[key]
          if (user && 'role' in user && 'displayName' in user) {
            presenceMap[key] = user as PresenceState
            if ((user as PresenceState).role === 'viewer') viewerCount++
          }
        })

        set({ presence: presenceMap, viewerCount })
      })
      .on('broadcast', { event: 'signal' }, ({ payload }) => {
        // Handle WebRTC signaling
        window.dispatchEvent(new CustomEvent('rtc-signal', { detail: payload }))
      })
      .on('broadcast', { event: 'comment' }, ({ payload }) => {
        set((state) => ({ comments: [...state.comments, payload as Comment] }))
      })
      .subscribe()

    set({ channel })
  },

  cleanup: () => {
    const { channel, peerConnections, localStream } = get()

    // Close all peer connections
    peerConnections.forEach((conn) => {
      conn.pc.close()
    })

    // Stop local stream
    if (localStream) {
      localStream.getTracks().forEach((track) => track.stop())
    }

    // Unsubscribe from channel
    if (channel) {
      supabase.removeChannel(channel)
    }

    set({
      channel: null,
      peerConnections: new Map(),
      localStream: null,
      presence: {},
      comments: [],
      viewerCount: 0,
    })
  },

  addPeerConnection: (peerId, pc) => {
    const { peerConnections } = get()
    const newConnections = new Map(peerConnections)
    newConnections.set(peerId, { pc })
    set({ peerConnections: newConnections })
  },

  removePeerConnection: (peerId) => {
    const { peerConnections } = get()
    const conn = peerConnections.get(peerId)
    if (conn) {
      conn.pc.close()
      const newConnections = new Map(peerConnections)
      newConnections.delete(peerId)
      set({ peerConnections: newConnections })
    }
  },

  setLocalStream: (stream) => set({ localStream: stream }),

  addComment: (comment) => {
    set((state) => ({ comments: [...state.comments, comment] }))
  },

  sendSignal: (signal) => {
    const { channel } = get()
    if (channel) {
      channel.send({
        type: 'broadcast',
        event: 'signal',
        payload: signal,
      })
    }
  },
}))
