
import React, { useState, useCallback } from 'react';
import { Playlist } from '../../types';

interface PlaylistManagerProps {
  playlists: Playlist[];
  onCreatePlaylist: (name: string) => void;
  onDeletePlaylist: (playlistId: string) => void;
  onSelectPlaylist: (playlistId: string | null) => void;
  selectedPlaylistId: string | null;
}

const PlaylistManager: React.FC<PlaylistManagerProps> = ({
  playlists,
  onCreatePlaylist,
  onDeletePlaylist,
  onSelectPlaylist,
  selectedPlaylistId,
}) => {
  const [newPlaylistName, setNewPlaylistName] = useState('');

  const handleCreate = useCallback(() => {
    if (newPlaylistName.trim()) {
      onCreatePlaylist(newPlaylistName.trim());
      setNewPlaylistName('');
    }
  }, [newPlaylistName, onCreatePlaylist]);

  const handleDelete = useCallback((id: string) => {
    if (window.confirm('Are you sure you want to delete this playlist?')) {
      onDeletePlaylist(id);
      if (selectedPlaylistId === id) {
          onSelectPlaylist(null); // Deselect if the current playlist is deleted
      }
    }
  }, [onDeletePlaylist, onSelectPlaylist, selectedPlaylistId]);

  return (
    <div className="h-full flex flex-col">
      <h3 className="text-xl font-semibold text-gray-200 mb-4">Playlists</h3>
      <div className="flex mb-4 space-x-2">
        <input
          type="text"
          value={newPlaylistName}
          onChange={(e) => setNewPlaylistName(e.target.value)}
          placeholder="New playlist name"
          className="flex-1 p-2 rounded-md bg-gray-800 text-gray-100 border border-gray-600 focus:outline-none focus:ring-2 focus:ring-purple-500"
        />
        <button
          onClick={handleCreate}
          className="px-4 py-2 bg-purple-600 text-white rounded-md text-sm font-semibold hover:bg-purple-700 transition-colors"
          disabled={!newPlaylistName.trim()}
        >
          Add
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        <button
            onClick={() => onSelectPlaylist(null)}
            className={`w-full text-left p-2 rounded-md transition-colors ${!selectedPlaylistId ? 'bg-blue-600' : 'hover:bg-gray-700'}`}
        >
            All Tracks
        </button>
        {playlists.map((playlist) => (
          <div
            key={playlist.id}
            className={`flex justify-between items-center p-2 rounded-md my-1 cursor-pointer transition-colors ${selectedPlaylistId === playlist.id ? 'bg-blue-600' : 'hover:bg-gray-700'}`}
            onClick={() => onSelectPlaylist(playlist.id)}
          >
            <span className="truncate">{playlist.name}</span>
            <button
              onClick={(e) => { e.stopPropagation(); handleDelete(playlist.id); }}
              className="ml-2 p-1 text-red-400 hover:text-red-600 rounded-full"
              aria-label={`Delete playlist ${playlist.name}`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default PlaylistManager;