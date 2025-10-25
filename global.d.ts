import { Track, Playlist, LibraryFilters } from './types';

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
    };
  }
}