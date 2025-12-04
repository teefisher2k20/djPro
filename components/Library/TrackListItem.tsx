import React, { DragEvent, useState, useCallback, useMemo } from 'react';
import { Track, Playlist } from '../../types';

interface TrackListItemProps {
  track: Track;
  onUpdateTrack: (track: Partial<Track>) => void;
  onDeleteTrack: (trackId: string) => void;
  onDropTrackToDeck: (deckId: string, trackId: string) => void;
  onAddTrackToPlaylist: (playlistId: string, trackId: string) => void;
  onRemoveTrackFromPlaylist: (playlistId: string, trackId: string) => void;
  currentPlaylists: Playlist[]; // All playlists for dropdown
  isInSelectedPlaylist: boolean; // Is this track currently viewed within a specific playlist
  selectedPlaylistId: string | null; // Added to enable 'Remove from Playlist' for the current view
}

const colors = ['#EF4444', '#F97316', '#EAB308', '#22C55E', '#0EA5E9', '#6366F1', '#EC4899', '#8B5CF6', '#d1d5db']; // Last one is for no color

const TrackListItem: React.FC<TrackListItemProps> = ({
  track,
  onUpdateTrack,
  onDeleteTrack,
  onDropTrackToDeck,
  onAddTrackToPlaylist,
  onRemoveTrackFromPlaylist,
  currentPlaylists,
  isInSelectedPlaylist,
  selectedPlaylistId, // Destructure the new prop
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editedTrack, setEditedTrack] = useState<Partial<Track>>(track);
  const [showPlaylistDropdown, setShowPlaylistDropdown] = useState(false);

  const handleDragStart = (e: DragEvent) => {
    e.dataTransfer.setData('text/plain', track.id);
    e.dataTransfer.effectAllowed = 'copyMove';
  };

  const handleEditToggle = useCallback(() => {
    if (isEditing) {
      // Save changes
      onUpdateTrack(editedTrack);
    }
    setIsEditing(!isEditing);
  }, [isEditing, editedTrack, onUpdateTrack]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    if (type === 'number') {
        setEditedTrack(prev => ({ ...prev, [name]: parseFloat(value) || 0 }));
    } else {
        setEditedTrack(prev => ({ ...prev, [name]: value }));
    }
  }, []);

  const handleRatingChange = useCallback((rating: number) => {
    setEditedTrack(prev => ({ ...prev, rating }));
  }, []);

  const handleColorChange = useCallback((color: string) => {
    setEditedTrack(prev => ({ ...prev, color }));
  }, []);

  const handleDelete = useCallback(() => {
    if (window.confirm(`Are you sure you want to delete "${track.name}"?`)) {
      onDeleteTrack(track.id);
    }
  }, [track, onDeleteTrack]);

  const handleAddToPlaylist = useCallback((playlistId: string) => {
      onAddTrackToPlaylist(playlistId, track.id);
      setShowPlaylistDropdown(false);
  }, [onAddTrackToPlaylist, track.id]);

  const handleRemoveFromPlaylist = useCallback(() => {
      if (window.confirm(`Remove "${track.name}" from this playlist?`)) {
          // Use the `selectedPlaylistId` prop directly
          if (selectedPlaylistId) {
            onRemoveTrackFromPlaylist(selectedPlaylistId, track.id);
          } else {
            console.warn("No playlist selected to remove track from.");
          }
      }
  }, [track.id, onRemoveTrackFromPlaylist, selectedPlaylistId]);


  const displayDuration = useMemo(() => {
    if (!track.duration) return '0:00';
    const minutes = Math.floor(track.duration / 60);
    const seconds = Math.floor(track.duration % 60);
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  }, [track.duration]);

  const isMobileImport = useMemo(() => {
      return track.tags?.includes('Mobile Import');
  }, [track.tags]);

  return (
    <div
      className="bg-gray-700 p-3 rounded-md mb-2 flex flex-col border border-gray-600 cursor-grab"
      draggable
      onDragStart={handleDragStart}
      style={{ borderLeft: `8px solid ${track.color || '#d1d5db'}` }}
    >
      <div className="flex items-center justify-between">
        <div className="flex-1 overflow-hidden">
          {isEditing ? (
            <input
              type="text"
              name="name"
              value={editedTrack.name || ''}
              onChange={handleInputChange}
              className="text-lg font-semibold bg-gray-600 px-1 rounded"
            />
          ) : (
            <h4 className="text-lg font-semibold text-blue-300 truncate flex items-center">
                {isMobileImport && <span className="mr-2 text-indigo-400 text-xs" title="Imported from Mobile Device">📱</span>}
                {track.name}
            </h4>
          )}
          {isEditing ? (
            <input
              type="text"
              name="artist"
              value={editedTrack.artist || ''}
              onChange={handleInputChange}
              className="text-sm text-gray-300 bg-gray-600 px-1 rounded w-full"
            />
          ) : (
            <p className="text-sm text-gray-300">{track.artist || 'Unknown Artist'}</p>
          )}
        </div>
        <div className="flex items-center space-x-2 ml-4">
          {isEditing && (
              <div className="flex space-x-1">
                  {colors.map(color => (
                      <button
                          key={color}
                          style={{ backgroundColor: color }}
                          className={`w-5 h-5 rounded-full border-2 ${editedTrack.color === color ? 'border-white' : 'border-transparent'}`}
                          onClick={() => handleColorChange(color)}
                          title={`Set color to ${color}`}
                      />
                  ))}
              </div>
          )}
          <button
            onClick={handleEditToggle}
            className="p-1 text-blue-400 hover:text-blue-500 rounded-full"
            aria-label={isEditing ? 'Save track edits' : 'Edit track metadata'}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
          <button
            onClick={handleDelete}
            className="p-1 text-red-400 hover:text-red-500 rounded-full"
            aria-label={`Delete track ${track.name}`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2 text-sm text-gray-400">
        <div>BPM: {isEditing ? <input type="number" name="bpm" value={editedTrack.bpm || ''} onChange={handleInputChange} className="w-16 bg-gray-600 px-1 rounded" /> : track.bpm || '--'}</div>
        <div>Key: {isEditing ? <input type="text" name="key" value={editedTrack.key || ''} onChange={handleInputChange} className="w-16 bg-gray-600 px-1 rounded" /> : track.key || '--'}</div>
        <div>Duration: {displayDuration}</div>
        <div>Genre: {isEditing ? <input type="text" name="genre" value={editedTrack.genre || ''} onChange={handleInputChange} className="w-full bg-gray-600 px-1 rounded" /> : track.genre || '--'}</div>
        <div>Album: {isEditing ? <input type="text" name="album" value={editedTrack.album || ''} onChange={handleInputChange} className="w-full bg-gray-600 px-1 rounded" /> : track.album || '--'}</div>
        <div className="flex items-center">
            Rating:
            {isEditing ? (
                <div className="flex ml-1">
                    {[1, 2, 3, 4, 5].map(star => (
                        <span
                            key={star}
                            className={`cursor-pointer ${star <= (editedTrack.rating || 0) ? 'text-yellow-400' : 'text-gray-500'}`}
                            onClick={() => handleRatingChange(star)}
                        >
                            ★
                        </span>
                    ))}
                </div>
            ) : (
                <span className="ml-1 text-yellow-400">{'★'.repeat(track.rating || 0)}{'☆'.repeat(5 - (track.rating || 0))}</span>
            )}
        </div>
      </div>

      {isEditing && (
          <div className="mt-2 text-sm text-gray-400">
              Comments: <textarea name="comments" value={editedTrack.comments || ''} onChange={handleInputChange} className="w-full bg-gray-600 px-1 rounded text-gray-100 h-16"></textarea>
          </div>
      )}

      <div className="relative mt-3 self-end">
        <button
          onClick={() => setShowPlaylistDropdown(!showPlaylistDropdown)}
          className="px-3 py-1 bg-blue-500 text-white rounded-md text-xs hover:bg-blue-600 transition-colors"
        >
          {isInSelectedPlaylist ? 'Remove from Playlist' : 'Add to Playlist'}
        </button>
        {showPlaylistDropdown && (
          <div className="absolute right-0 mt-2 w-48 bg-gray-800 rounded-md shadow-lg z-10 max-h-48 overflow-y-auto">
            <button
                onClick={handleRemoveFromPlaylist}
                className="block w-full text-left px-4 py-2 text-sm text-red-300 hover:bg-gray-700"
                disabled={!isInSelectedPlaylist}
            >
                Remove from Current Playlist
            </button>
            {currentPlaylists.map((playlist) => (
              <button
                key={playlist.id}
                onClick={() => handleAddToPlaylist(playlist.id)}
                className="block w-full text-left px-4 py-2 text-sm text-gray-100 hover:bg-gray-700"
              >
                {playlist.name}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default TrackListItem;