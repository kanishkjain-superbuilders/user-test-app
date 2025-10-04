import { create } from 'zustand'
import { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { Database } from '../lib/database.types'

type LiveSession = Database['public']['Tables']['live_sessions']['Row']
type Comment = Database['public']['Tables']['comments']['Row']

interface PresenceState {
  role: 'broadcaster' | 'viewer'
  userId: string
  displayName: string
  joinedAt: string
}

interface PeerConnection {
  pc: RTCPeerConnection
  stream?: MediaStream
  role: 'broadcaster' | 'viewer'
  userId: string
  makingOffer: boolean
  ignoreOffer: boolean
  isSettingRemoteAnswerPending: boolean
}

interface SignalData {
  type: 'offer' | 'answer' | 'ice-candidate'
  from: string
  to: string
  data: RTCSessionDescriptionInit | RTCIceCandidateInit
  fromPresenceKey?: string // Track the presence key for proper connection lookup
}

interface LiveState {
  liveSession: LiveSession | null
  channel: RealtimeChannel | null
  presence: Record<string, PresenceState>
  peerConnections: Map<string, PeerConnection>
  userIdToPresenceKey: Map<string, string> // Map userId to presence key for signal routing
  localStream: MediaStream | null
  remoteStreams: Map<string, MediaStream>
  comments: Comment[]
  viewerCount: number
  isBroadcaster: boolean
  connectionState: 'disconnected' | 'connecting' | 'connected' | 'failed'

  // Actions
  setLiveSession: (session: LiveSession | null) => void
  initChannel: (
    channelName: string,
    role: 'broadcaster' | 'viewer',
    userId: string
  ) => Promise<void>
  cleanup: () => void
  createPeerConnection: (
    peerId: string,
    role: 'broadcaster' | 'viewer',
    userId: string
  ) => RTCPeerConnection
  removePeerConnection: (peerId: string) => void
  setLocalStream: (stream: MediaStream | null) => void
  addRemoteStream: (peerId: string, stream: MediaStream) => void
  removeRemoteStream: (peerId: string) => void
  addComment: (comment: Comment) => void
  sendSignal: (signal: SignalData) => void
  handleSignal: (signal: SignalData) => Promise<void>
  setConnectionState: (
    state: 'disconnected' | 'connecting' | 'connected' | 'failed'
  ) => void
}

// ICE servers configuration
const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
}

export const useLiveStore = create<LiveState>((set, get) => ({
  liveSession: null,
  channel: null,
  presence: {},
  peerConnections: new Map(),
  userIdToPresenceKey: new Map(),
  localStream: null,
  remoteStreams: new Map(),
  comments: [],
  viewerCount: 0,
  isBroadcaster: false,
  connectionState: 'disconnected',

  setLiveSession: (session) => set({ liveSession: session }),

  initChannel: async (
    channelName: string,
    role: 'broadcaster' | 'viewer',
    userId: string
  ) => {
    const channel = supabase.channel(channelName, {
      config: {
        presence: { key: userId },
      },
    })

    set({
      isBroadcaster: role === 'broadcaster',
      connectionState: 'connecting',
    })

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState()
        const presenceMap: Record<string, PresenceState> = {}
        let viewerCount = 0

        Object.keys(state).forEach((key) => {
          const [user] = state[key]
          if (
            user &&
            typeof user === 'object' &&
            'role' in user &&
            'displayName' in user
          ) {
            presenceMap[key] = user as unknown as PresenceState
            if ((user as unknown as PresenceState).role === 'viewer')
              viewerCount++
          }
        })

        const { isBroadcaster } = get()
        if (isBroadcaster) {
          console.log('[BROADCASTER] Presence sync:', {
            totalPresence: Object.keys(presenceMap).length,
            viewerCount,
            presenceKeys: Object.keys(presenceMap),
            presenceDetails: presenceMap,
          })
        }

        set({ presence: presenceMap, viewerCount })
      })
      .on('presence', { event: 'join' }, ({ key, newPresences }) => {
        const newUser = newPresences[0] as unknown as PresenceState
        if (!newUser) return

        const { isBroadcaster, peerConnections, userIdToPresenceKey } = get()

        // Map userId to presence key for signal routing
        const newMap = new Map(userIdToPresenceKey)
        newMap.set(newUser.userId, key)
        set({ userIdToPresenceKey: newMap })

        // If we're the broadcaster and a viewer joined, create peer connection
        // onnegotiationneeded will fire automatically and handle the offer
        if (isBroadcaster && newUser.role === 'viewer') {
          const existingConnection = peerConnections.get(key)
          if (!existingConnection) {
            console.log('[BROADCASTER] Creating peer connection for viewer:', {
              presenceKey: key,
              viewerUserId: newUser.userId,
              existingConnections: Array.from(peerConnections.keys()),
            })
            get().createPeerConnection(key, 'viewer', newUser.userId)
          }
        }
      })
      .on('presence', { event: 'leave' }, ({ key }) => {
        // Clean up peer connection when user leaves
        get().removePeerConnection(key)
        get().removeRemoteStream(key)

        // Clean up userId mapping
        const { userIdToPresenceKey } = get()
        const newMap = new Map(userIdToPresenceKey)
        // Find and remove the userId that maps to this presence key
        for (const [userId, presenceKey] of newMap.entries()) {
          if (presenceKey === key) {
            newMap.delete(userId)
            break
          }
        }
        set({ userIdToPresenceKey: newMap })
      })
      .on('broadcast', { event: 'signal' }, ({ payload }) => {
        // Handle WebRTC signaling
        const signal = payload as SignalData
        get().handleSignal(signal)
      })
      .on('broadcast', { event: 'comment' }, ({ payload }) => {
        set((state) => ({ comments: [...state.comments, payload as Comment] }))
      })
      .on('broadcast', { event: 'session-ended' }, () => {
        // Handle session end
        get().cleanup()
        set({ connectionState: 'disconnected' })
      })

    await channel.subscribe()

    // Track our presence
    await channel.track({
      role,
      userId,
      displayName:
        role === 'broadcaster' ? 'Broadcaster' : `Viewer ${userId.slice(0, 8)}`,
      joinedAt: new Date().toISOString(),
    } as PresenceState)

    set({ channel, connectionState: 'connected' })
  },

  cleanup: () => {
    const { channel, peerConnections, localStream, remoteStreams } = get()

    // Close all peer connections
    peerConnections.forEach((conn) => {
      conn.pc.close()
    })

    // Stop local stream
    if (localStream) {
      localStream.getTracks().forEach((track) => track.stop())
    }

    // Stop remote streams
    remoteStreams.forEach((stream) => {
      stream.getTracks().forEach((track) => track.stop())
    })

    // Unsubscribe from channel
    if (channel) {
      channel.untrack()
      supabase.removeChannel(channel)
    }

    set({
      channel: null,
      peerConnections: new Map(),
      userIdToPresenceKey: new Map(),
      localStream: null,
      remoteStreams: new Map(),
      presence: {},
      comments: [],
      viewerCount: 0,
      connectionState: 'disconnected',
    })
  },

  createPeerConnection: (peerId, role, userId) => {
    const { peerConnections, localStream, isBroadcaster } = get()

    // Check if connection already exists
    const existing = peerConnections.get(peerId)
    if (existing) {
      return existing.pc
    }

    // Create new peer connection
    const pc = new RTCPeerConnection(ICE_SERVERS)

    // Add local stream tracks
    if (localStream) {
      localStream.getTracks().forEach((track) => {
        pc.addTrack(track, localStream)
      })
    }

    // Initialize connection state flags for Perfect Negotiation
    const connectionState: PeerConnection = {
      pc,
      role,
      userId,
      makingOffer: false,
      ignoreOffer: false,
      isSettingRemoteAnswerPending: false,
    }

    // Store the connection early so we can update flags
    const newConnections = new Map(peerConnections)
    newConnections.set(peerId, connectionState)
    set({ peerConnections: newConnections })

    // Perfect Negotiation: Handle negotiation needed
    pc.onnegotiationneeded = async () => {
      try {
        const conn = get().peerConnections.get(peerId)
        if (!conn) return

        conn.makingOffer = true
        await pc.setLocalDescription()
        get().sendSignal({
          type: 'offer',
          from: isBroadcaster ? 'broadcaster' : userId,
          to: isBroadcaster ? peerId : 'broadcaster',
          data: pc.localDescription!,
        })
      } catch (error) {
        console.error('Error in negotiationneeded:', error)
      } finally {
        const conn = get().peerConnections.get(peerId)
        if (conn) conn.makingOffer = false
      }
    }

    // Handle ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        get().sendSignal({
          type: 'ice-candidate',
          from: isBroadcaster ? 'broadcaster' : userId,
          to: isBroadcaster ? peerId : 'broadcaster',
          data: event.candidate.toJSON(),
        })
      }
    }

    // Handle remote stream
    pc.ontrack = (event) => {
      const [remoteStream] = event.streams
      if (remoteStream) {
        get().addRemoteStream(peerId, remoteStream)
      }
    }

    // Handle connection state changes
    pc.onconnectionstatechange = () => {
      console.log(`Peer connection state (${peerId}):`, pc.connectionState)
      if (
        pc.connectionState === 'failed' ||
        pc.connectionState === 'disconnected'
      ) {
        get().removePeerConnection(peerId)
        get().removeRemoteStream(peerId)
      }
    }

    return pc
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

  addRemoteStream: (peerId, stream) => {
    const { remoteStreams } = get()
    const newStreams = new Map(remoteStreams)
    newStreams.set(peerId, stream)
    set({ remoteStreams: newStreams })
  },

  removeRemoteStream: (peerId) => {
    const { remoteStreams } = get()
    const stream = remoteStreams.get(peerId)
    if (stream) {
      stream.getTracks().forEach((track) => track.stop())
      const newStreams = new Map(remoteStreams)
      newStreams.delete(peerId)
      set({ remoteStreams: newStreams })
    }
  },

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

  handleSignal: async (signal) => {
    const { peerConnections, isBroadcaster, userIdToPresenceKey } = get()

    // Determine our ID
    const myId = isBroadcaster ? 'broadcaster' : signal.to

    // Ignore signals not meant for us
    if (signal.to !== myId) return

    // Find peer connection - first try signal.from directly, then map userId to presence key
    let conn = peerConnections.get(signal.from)

    // If not found and we're broadcaster, try mapping userId to presence key
    if (!conn && isBroadcaster) {
      const presenceKey = userIdToPresenceKey.get(signal.from)
      console.log('[BROADCASTER] Received signal - looking up peer connection:', {
        signalType: signal.type,
        signalFrom: signal.from,
        signalTo: signal.to,
        presenceKeyFromMap: presenceKey,
        availableConnections: Array.from(peerConnections.keys()),
        userIdToPresenceKeyMap: Array.from(userIdToPresenceKey.entries()),
      })
      if (presenceKey) {
        conn = peerConnections.get(presenceKey)
      }
    }

    // Create peer connection if it doesn't exist (viewer receiving offer from broadcaster)
    if (!conn && signal.type === 'offer') {
      get().createPeerConnection('broadcaster', 'broadcaster', myId)
      conn = get().peerConnections.get('broadcaster')
      if (!conn) return
    }

    if (!conn) {
      console.warn('No peer connection for signal from', signal.from)
      return
    }

    const pc = conn.pc

    // Perfect Negotiation Pattern: Determine politeness
    // Broadcaster is always "impolite" (wins conflicts), viewers are "polite" (yield)
    const polite = !isBroadcaster

    try {
      if (signal.type === 'offer') {
        // This is the Perfect Negotiation pattern for handling offer collisions
        const offerCollision =
          signal.type === 'offer' &&
          (conn.makingOffer || pc.signalingState !== 'stable')

        conn.ignoreOffer = !polite && offerCollision
        if (conn.ignoreOffer) {
          return // Impolite peer ignores offers during collision
        }

        conn.isSettingRemoteAnswerPending = true
        await pc.setRemoteDescription(
          new RTCSessionDescription(signal.data as RTCSessionDescriptionInit)
        )
        conn.isSettingRemoteAnswerPending = false

        // If we're polite and there was a collision, rollback
        if (polite && offerCollision) {
          await pc.setLocalDescription({ type: 'rollback' })
        }

        // Create and send answer
        const answer = await pc.createAnswer()
        await pc.setLocalDescription(answer)
        get().sendSignal({
          type: 'answer',
          from: myId,
          to: signal.from,
          data: answer,
        })
      } else if (signal.type === 'answer') {
        conn.isSettingRemoteAnswerPending = true
        await pc.setRemoteDescription(
          new RTCSessionDescription(signal.data as RTCSessionDescriptionInit)
        )
        conn.isSettingRemoteAnswerPending = false
      } else if (signal.type === 'ice-candidate') {
        try {
          await pc.addIceCandidate(
            new RTCIceCandidate(signal.data as RTCIceCandidateInit)
          )
        } catch (error) {
          // Ignore ICE candidate errors if we're not ready for them yet
          if (!conn.ignoreOffer && conn.isSettingRemoteAnswerPending) {
            throw error
          }
        }
      }
    } catch (error) {
      console.error('Error in Perfect Negotiation:', error, {
        type: signal.type,
        from: signal.from,
        signalingState: pc.signalingState,
        polite,
        makingOffer: conn.makingOffer,
        ignoreOffer: conn.ignoreOffer,
      })
    }
  },

  setConnectionState: (state) => set({ connectionState: state }),
}))
