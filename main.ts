
import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'path';
import * as fs from 'fs';
import { DatabaseService } from './services/databaseService';
import { Track } from './types'; // Assuming Track type is shared

let db: DatabaseService;
let mainWindow: BrowserWindow | null;

async function readDirectoryRecursive(dirPath: string, audioFiles: string[] = []): Promise<string[]> {
  const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      await readDirectoryRecursive(entryPath, audioFiles);
    } else if (entry.isFile() && /\.(mp3|wav|flac|aac|ogg|m4a)$/i.test(entry.name)) {
      audioFiles.push(entryPath);
    }
  }
  return audioFiles;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      // @ts-ignore: __dirname is available in Electron's main process, but type definitions might not be fully linked.
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false, // Security best practice
    },
  });

  mainWindow.loadFile('index.html');
  // mainWindow.webContents.openDevTools(); // For debugging

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  createWindow();

  // Initialize DB
  db = new DatabaseService();
  await db.init();
  console.log('Database initialized in main process.');

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  // @ts-ignore
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC Handlers
ipcMain.handle('db:getTracks', async () => db.getTracks());
ipcMain.handle('db:saveTrack', async (event, track: Track) => db.saveTrack(track));
ipcMain.handle('db:updateTrack', async (event, track: Partial<Track>) => db.updateTrack(track));
ipcMain.handle('db:deleteTrack', async (event, trackId: string) => db.deleteTrack(trackId));
ipcMain.handle('db:searchTracks', async (event, query: string, filters: any) => db.searchTracks(query, filters));
ipcMain.handle('db:getPlaylists', async () => db.getPlaylists());
ipcMain.handle('db:createPlaylist', async (event, name: string) => db.createPlaylist(name));
ipcMain.handle('db:deletePlaylist', async (event, playlistId: string) => db.deletePlaylist(playlistId));
ipcMain.handle('db:addTrackToPlaylist', async (event, playlistId: string, trackId: string) => db.addTrackToPlaylist(playlistId, trackId));
ipcMain.handle('db:removeTrackFromPlaylist', async (event, playlistId: string, trackId: string) => db.removeTrackFromPlaylist(playlistId, trackId));
ipcMain.handle('db:getTracksInPlaylist', async (event, playlistId: string) => db.getTracksInPlaylist(playlistId));

ipcMain.handle('fs:openDirectoryDialog', async () => {
  if (!mainWindow) return [];
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'], // Removed multiSelections as we process one dir at a time
  });
  return canceled ? [] : filePaths;
});
ipcMain.handle('fs:openFileDialog', async () => {
  if (!mainWindow) return [];
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Audio Files', extensions: ['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a'] }],
  });
  return canceled ? [] : filePaths;
});
ipcMain.handle('fs:readAudioFilesFromDirectory', async (event, dirPath: string) => readDirectoryRecursive(dirPath));

// For `readFileAsArrayBuffer` to be available in preload, it needs access to `fs`
// We expose a function in preload that uses `fs.readFile` directly.
// No IPC handle needed here for it, as `preload.ts` handles the `fs.readFile` part itself.