
import { contextBridge, ipcRenderer } from 'electron';
import { Track, Playlist, LibraryFilters } from './types'; // Shared types
import * as fs from 'fs'; // Node.js fs module is available here in preload for `readFile`

// Type definitions are in types.ts via global declaration, but we implement them here.

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
          // Fix: Ensure we return the correct view of the buffer using slice
          // Node's buffer.buffer might reference a shared pool.
          const arrayBuffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
          resolve(arrayBuffer);
        }
      });
    });
  },
  readAudioFilesFromDirectory: (dirPath: string) => ipcRenderer.invoke('fs:readAudioFilesFromDirectory', dirPath),
  downloadFile: (url: string) => ipcRenderer.invoke('fs:downloadFile', url),
});
