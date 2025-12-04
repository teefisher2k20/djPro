
import React, { useState } from 'react';
import { Track } from '../types';
import { loadAudioFile } from '../services/audioService';

interface MusicDownloaderProps {
  isOpen: boolean;
  onClose: () => void;
  onTrackImported: (track: Track) => void;
}

const MusicDownloader: React.FC<MusicDownloaderProps> = ({ isOpen, onClose, onTrackImported }) => {
  const [url, setUrl] = useState('');
  const [isDownloading, setIsDownloading] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleDownload = async () => {
    if (!url.trim()) return;

    setIsDownloading(true);
    setStatus('Initializing download...');
    setError(null);

    try {
      if (!window.electronAPI) {
        throw new Error("Electron environment required for downloads.");
      }

      // 1. Trigger Download in Main Process
      setStatus('Downloading file... check save dialog');
      const savedFilePath = await window.electronAPI.downloadFile(url);

      if (!savedFilePath) {
        setStatus('Download cancelled.');
        setIsDownloading(false);
        return;
      }

      // 2. Import into Library
      setStatus('Processing audio...');
      const fileName = savedFilePath.split(/[\\/]/).pop() || 'downloaded_track';
      const arrayBuffer = await window.electronAPI.readFileAsArrayBuffer(savedFilePath);
      
      const newTrack = await loadAudioFile(arrayBuffer, savedFilePath, fileName);
      
      // Add tags
      newTrack.tags = ['Web Download'];
      newTrack.comments = `Downloaded from: ${url}`;

      onTrackImported(newTrack);

      setStatus('Success!');
      setTimeout(() => {
        onClose();
        setUrl('');
        setStatus('');
      }, 1000);

    } catch (err) {
      console.error("Download failed:", err);
      setError((err as Error).message || "Failed to download.");
      setStatus('');
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-gray-900 bg-opacity-90 flex items-center justify-center z-50">
      <div className="bg-gray-800 border border-gray-600 rounded-lg shadow-2xl p-6 w-full max-w-md">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <span>☁️</span> Web Downloader
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white font-bold text-xl">&times;</button>
        </div>

        <div className="mb-4">
          <label className="block text-gray-300 text-sm font-bold mb-2">Direct Audio/Video URL</label>
          <input 
            type="text" 
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com/music/track.mp3"
            className="w-full p-3 rounded bg-gray-700 text-white border border-gray-600 focus:border-blue-500 focus:outline-none"
            disabled={isDownloading}
          />
          <p className="text-xs text-gray-500 mt-2">Supports direct links to MP3, WAV, FLAC, MP4, etc.</p>
        </div>

        {error && (
          <div className="bg-red-900/50 border border-red-500 text-red-200 p-3 rounded mb-4 text-sm">
            Error: {error}
          </div>
        )}

        {status && (
           <div className="mb-4 text-center">
             <p className="text-blue-400 text-sm animate-pulse font-semibold">{status}</p>
           </div>
        )}

        <div className="flex justify-end gap-3">
          <button 
            onClick={onClose}
            className="px-4 py-2 text-gray-300 hover:text-white transition-colors"
            disabled={isDownloading}
          >
            Cancel
          </button>
          <button 
            onClick={handleDownload}
            disabled={isDownloading || !url}
            className={`px-6 py-2 rounded font-bold transition-all
              ${isDownloading || !url 
                ? 'bg-gray-600 text-gray-400 cursor-not-allowed' 
                : 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg hover:shadow-blue-500/30'}`}
          >
            {isDownloading ? 'Downloading...' : 'Download'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default MusicDownloader;
