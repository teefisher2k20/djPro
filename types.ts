import * as Tone from 'tone';

/**
 * Represents an audio track in the DJ application.
 */
export interface Track {
  id: string;
  name: string;
  filePath: string; // Original file path or URL
  buffer?: Tone.ToneAudioBuffer; // Tone.js buffer for playback (runtime only, not stored in DB)
  audioBuffer?: AudioBuffer; // Raw AudioBuffer for waveform analysis (runtime only, not stored in DB)
  duration?: number; // Duration in seconds
  bpm?: number; // Beats per minute (Phase 3)
  key?: string; // Musical key (Camelot/Open Key notation - Phase 3/4)
  waveformPeaks?: number[]; // Normalized peak data for waveform visualization (runtime only, not stored in DB)
  
  // Video Feature
  isVideo?: boolean; // Is this a video track?
  videoUrl?: string; // Blob URL for video playback (runtime only)

  // New metadata fields for Phase 4
  artist?: string;
  album?: string;
  genre?: string;
  year?: number;
  rating?: number; // 0-5 stars
  color?: string; // Hex color for visual tags
  lastPlayed?: number; // Timestamp
  dateAdded?: number; // Timestamp
  tags?: string[]; // Custom tags
  comments?: string;
}

/**
 * Represents a playlist.
 */
export interface Playlist {
  id: string;
  name: string;
  dateCreated: number;
}

/**
 * EQ settings for a deck.
 */
export interface EQSettings {
  high: number; // Gain in dB, e.g., -12 to 12
  mid: number; // Gain in dB
  low: number; // Gain in dB
}

/**
 * State for the XY Effect Pad
 */
export interface EffectState {
  x: number; // 0 to 1 (Filter Frequency)
  y: number; // 0 to 1 (Reverb Mix)
  active: boolean; // Is the pad being touched?
}

/**
 * Represents a single sample loaded into a pad.
 */
export interface Sample {
  id: string; // Unique ID for the sample's audio buffer
  name: string;
  buffer: Tone.ToneAudioBuffer;
  mode: 'one-shot' | 'loop';
  volume: number; // 0-1 linear
  pitch: number; // In semitones, e.g., -12 to +12
  color?: string; // For visual identification
  isPlaying?: boolean; // Transient state for UI feedback
}

/**
 * Full state for a single deck.
 */
export interface DeckState {
  id: string; // 'A' or 'B'
  track: Track | null;
  isPlaying: boolean;
  isLiveInput: boolean; // New: Is the deck streaming external live input?
  volume: number; // 0-1 linear for UI (individual fader), converted to gain for Tone.js
  playbackRate: number; // Speed of playback (1 = normal)
  currentTime?: number; // Current playback position in seconds
  totalDuration?: number; // Total duration of loaded track
  eq: EQSettings;
  effects: EffectState; // New XY Pad effects
  cue: boolean; // Headphone cue state (visual only for now)
  meterLevel: number; // Current VU meter level (dB)
  samples: (Sample | null)[]; // 8 sample slots
  isRecording: boolean; // Is this deck currently being recorded
  loopRollActive: boolean; // Is a loop roll currently active
  loopRollInterval: string | null; // The interval of the active loop roll (e.g., '1/4', '1/2')
}

/**
 * Represents the connected Tone.js nodes for a player.
 */
export interface PlayerConnections {
  player: Tone.Player;
  userMedia: Tone.UserMedia; // New: Node for handling live input (Microphone/Line-in)
  eq: Tone.EQ3;
  filter: Tone.Filter; // New: XY Pad Filter
  reverb: Tone.Reverb; // New: XY Pad Reverb
  meter: Tone.Meter;
  outputGain: Tone.Gain; // This gain node is controlled by individual volume fader and crossfader
}

/**
 * Represents a message in the chatbot conversation.
 */
export interface ChatMessage {
  role: 'user' | 'model';
  content: string;
  timestamp: number;
}

/**
 * Interface for filtering tracks in the library.
 */
export interface LibraryFilters {
  bpmMin?: number;
  bpmMax?: number;
  key?: string;
  genre?: string;
  ratingMin?: number; // Minimum star rating
  tag?: string; // Filter by tag (e.g., 'Mobile Import')
}

declare global {
  interface Window {
    electronAPI: {
      getTracks: () => Promise<Track[]>;
      saveTrack: (track: Track) => Promise<void>;
      updateTrack: (track: Partial<Track>) => Promise<void>;
      deleteTrack: (trackId: string) => Promise<void>;
      searchTracks: (query: string, filters: LibraryFilters) => Promise<Track[]>;
      getPlaylists: () => Promise<Playlist[]>;
      createPlaylist: (name: string) => Promise<void>;
      deletePlaylist: (playlistId: string) => Promise<void>;
      addTrackToPlaylist: (playlistId: string, trackId: string) => Promise<void>;
      removeTrackFromPlaylist: (playlistId: string, trackId: string) => Promise<void>;
      getTracksInPlaylist: (playlistId: string) => Promise<Track[]>;
      openDirectoryDialog: () => Promise<string[]>;
      openFileDialog: () => Promise<string[]>;
      readFileAsArrayBuffer: (filePath: string) => Promise<ArrayBuffer>;
      readAudioFilesFromDirectory: (dirPath: string) => Promise<string[]>;
      downloadFile: (url: string) => Promise<string | null>;
    };
  }
}