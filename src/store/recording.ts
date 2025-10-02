import { create } from 'zustand';
import type { Database } from '../lib/database.types';

type Recording = Database['public']['Tables']['recordings']['Row'];
type RecordingSegment = Database['public']['Tables']['recording_segments']['Row'];

interface UploadQueueItem {
  partIndex: number;
  blob: Blob;
  status: 'pending' | 'uploading' | 'uploaded' | 'failed';
  retries: number;
}

interface RecordingManifest {
  recordingId: string;
  mimeType: string;
  codecs: string;
  totalParts: number;
  totalBytes: number;
  duration: number;
  width: number;
  height: number;
}

interface RecordingState {
  recording: Recording | null;
  segments: RecordingSegment[];
  uploadQueue: UploadQueueItem[];
  isRecording: boolean;
  mediaRecorder: MediaRecorder | null;
  manifest: RecordingManifest | null;

  // Actions
  setRecording: (recording: Recording | null) => void;
  setSegments: (segments: RecordingSegment[]) => void;
  addToUploadQueue: (item: UploadQueueItem) => void;
  updateQueueItem: (partIndex: number, updates: Partial<UploadQueueItem>) => void;
  setIsRecording: (recording: boolean) => void;
  setMediaRecorder: (recorder: MediaRecorder | null) => void;
  setManifest: (manifest: RecordingManifest | null) => void;
  resetRecordingState: () => void;
}

export const useRecordingStore = create<RecordingState>((set) => ({
  recording: null,
  segments: [],
  uploadQueue: [],
  isRecording: false,
  mediaRecorder: null,
  manifest: null,

  setRecording: (recording) => set({ recording }),

  setSegments: (segments) => set({ segments }),

  addToUploadQueue: (item) =>
    set((state) => ({
      uploadQueue: [...state.uploadQueue, item],
    })),

  updateQueueItem: (partIndex, updates) =>
    set((state) => ({
      uploadQueue: state.uploadQueue.map((item) =>
        item.partIndex === partIndex ? { ...item, ...updates } : item
      ),
    })),

  setIsRecording: (recording) => set({ isRecording: recording }),

  setMediaRecorder: (recorder) => set({ mediaRecorder: recorder }),

  setManifest: (manifest) => set({ manifest }),

  resetRecordingState: () =>
    set({
      recording: null,
      segments: [],
      uploadQueue: [],
      isRecording: false,
      mediaRecorder: null,
      manifest: null,
    }),
}));
