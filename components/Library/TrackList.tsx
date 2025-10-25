import React from 'react';
import { Track, Playlist } from '../../types';
import TrackListItem from './TrackListItem';

interface TrackListProps {
  tracks: Track[];
  onUpdateTrack: (track: Partial<Track>) => void;
  onDeleteTrack: (trackId: string) => void;
  onDropTrackToDeck: (deckId: string, trackId: string) => void;
  onAddTrackToPlaylist: (playlistId: string, trackId: string) => void;
  onRemoveTrackFromPlaylist: (playlistId: string, trackId: string) => void;
  currentPlaylists: Playlist[]; // All playlists to potentially add to
  selectedPlaylistId: string | null; // To show remove button if in this playlist
}

const TrackList: React.FC<TrackListProps> = ({
  tracks,
  onUpdateTrack,
  onDeleteTrack,
  onDropTrackToDeck,
  onAddTrackToPlaylist,
  onRemoveTrackFromPlaylist,
  currentPlaylists,
  selectedPlaylistId,
}) => {
  return (
    <div className="h-full flex flex-col">
      <h3 className="text-xl font-semibold text-gray-200 mb-4">Tracks ({tracks.length})</h3>
      {tracks.length === 0 ? (
        <p className="text-gray-400 text-center mt-8">No tracks found. Import some music!</p>
      ) : (
        <div className="flex-1 overflow-y-auto">
          {tracks.map((track) => (
            <TrackListItem
              key={track.id}
              track={track}
              onUpdateTrack={onUpdateTrack}
              onDeleteTrack={onDeleteTrack}
              onDropTrackToDeck={onDropTrackToDeck}
              onAddTrackToPlaylist={onAddTrackToPlaylist}
              onRemoveTrackFromPlaylist={onRemoveTrackFromPlaylist}
              currentPlaylists={currentPlaylists}
              isInSelectedPlaylist={selectedPlaylistId !== null && tracks.some(t => t.id === track.id)}
              selectedPlaylistId={selectedPlaylistId} // Pass the selectedPlaylistId here
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default TrackList;