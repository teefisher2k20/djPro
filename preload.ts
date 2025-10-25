import { contextBridge, ipcRenderer } from 'electron';
import { Track, Playlist, LibraryFilters } from './types'; // Shared types
import * as fs from 'fs'; // Node.js fs module is available here in preload for `readFile`

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

contextBridge.exposeInMainWorld('electronAPI', {
  getTracks: () => ipcRenderer.invoke('db:getTracks'),
  saveTrack: (track: Track) => ipcRenderer.invoke('db:saveTrack', track),
  updateTrack: (track: Partial<Track>) => ipcRenderer.invoke('db:updateTrack', track),
  deleteTrack: (trackId: string) => ipcRenderer.invoke('db:deleteTrack', trackId),
  searchTracks: (query: string, filters: LibraryFilters) => ipcRenderer.invoke('db:searchTracks', query, filters),
  getPlaylists: () => ipcRenderer.invoke('db:getPlaylists'),
  createPlaylist: (name: string) => ipcRenderer.invoke('db:createPlaylist', name),
  deletePlaylist: (playlistId: string) => ipcRenderer.invoke('db:deletePlaylist', playlistId),
  addTrackToPlaylist: (playlistId: string, trackId: string) => ipcRenderer.invoke('db:addTrackToPlaylist', playlistId, trackId),
  removeTrackFromPlaylist: (playlistId: string, trackId: string) => ipcRenderer.invoke('db:removeTrackFromPlaylist', playlistId, trackId),
  getTracksInPlaylist: (playlistId: string) => ipcRenderer.invoke('db:getTracksInPlaylist', playlistId),
  openDirectoryDialog: () => ipcRenderer.invoke('fs:openDirectoryDialog'),
  openFileDialog: () => ipcRenderer.invoke('fs:openFileDialog'),
  readFileAsArrayBuffer: (filePath: string): Promise<ArrayBuffer> => {
    return new Promise((resolve, reject) => {
      fs.readFile(filePath, (err, data) => {
        if (err) {
          reject(err);
        } else {
          resolve(data.buffer);
        }
      });
    });
  },
  readAudioFilesFromDirectory: (dirPath: string) => ipcRenderer.invoke('fs:readAudioFilesFromDirectory', dirPath),
});