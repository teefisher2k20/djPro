
import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'path';
import * as fs from 'fs';
import { Buffer } from 'buffer';
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
    } else if (entry.isFile() && /\.(mp3|wav|flac|aac|ogg|m4a|mp4|webm)$/i.test(entry.name)) {
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
    filters: [{ name: 'Media Files', extensions: ['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a', 'mp4', 'webm'] }],
  });
  return canceled ? [] : filePaths;
});
ipcMain.handle('fs:readAudioFilesFromDirectory', async (event, dirPath: string) => readDirectoryRecursive(dirPath));

// For `readFileAsArrayBuffer` to be available in preload, it needs access to `fs`
// We expose a function in preload that uses `fs.readFile` directly.
// No IPC handle needed here for it, as `preload.ts` handles the `fs.readFile` part itself.

ipcMain.handle('fs:downloadFile', async (event, url: string) => {
    if (!mainWindow) return null;
    try {
        // 1. Guess filename
        let filename = 'download.mp3';
        try {
            const urlObj = new URL(url);
            const pathName = urlObj.pathname;
            const possibleName = pathName.split('/').pop();
            if (possibleName && /\.\w+$/.test(possibleName)) {
                filename = possibleName;
            }
        } catch (e) { /* ignore invalid url for parsing */ }

        // 2. Show Save Dialog
        const { filePath } = await dialog.showSaveDialog(mainWindow, {
            defaultPath: filename,
            title: 'Save Downloaded Track',
            filters: [
                { name: 'Audio Files', extensions: ['mp3', 'wav', 'flac', 'ogg', 'm4a'] },
                { name: 'Video Files', extensions: ['mp4', 'webm'] },
                { name: 'All Files', extensions: ['*'] }
            ]
        });

        if (!filePath) return null; // User canceled

        // 3. Download
        console.log(`Downloading ${url} to ${filePath}`);
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Failed to download: ${response.status} ${response.statusText}`);
        }

        const arrayBuffer = await response.arrayBuffer();
        await fs.promises.writeFile(filePath, Buffer.from(arrayBuffer));

        return filePath;

    } catch (error) {
        console.error("Download error:", error);
        throw error;
    }
});