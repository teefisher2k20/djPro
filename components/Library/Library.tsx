import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { Track, Playlist, LibraryFilters } from '../../types';
import { loadAudioFile } from '../../services/audioService';
import TrackList from './TrackList';
import PlaylistManager from './PlaylistManager';
import SearchAndFilter from './SearchAndFilter';

interface LibraryProps {
  tracks: Track[]; // `tracks` prop now represents ALL tracks from the DB, not filtered ones
  playlists: Playlist[];
  isLibraryLoading: boolean;
  onAddTrackToLibrary: (track: Track) => void;
  onUpdateTrackInLibrary: (track: Partial<Track>) => void;
  onDeleteTrackFromLibrary: (trackId: string) => void;
  onDropTrackToDeck: (deckId: string, trackId: string) => void; // For TrackListItem interaction
  onCreatePlaylist: (name: string) => void;
  onDeletePlaylist: (playlistId: string) => void;
  onAddTrackToPlaylist: (playlistId: string, trackId: string) => void;
  onRemoveTrackFromPlaylist: (playlistId: string, trackId: string) => void;
  refreshLibrary: () => void;
}

const Library: React.FC<LibraryProps> = ({
  tracks, // `tracks` prop is now the full unfiltered library list
  playlists,
  isLibraryLoading,
  onAddTrackToLibrary,
  onUpdateTrackInLibrary,
  onDeleteTrackFromLibrary,
  onDropTrackToDeck,
  onCreatePlaylist,
  onDeletePlaylist,
  onAddTrackToPlaylist,
  onRemoveTrackFromPlaylist,
  refreshLibrary,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filters, setFilters] = useState<LibraryFilters>({}); // Initialize with empty filters
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(null);
  const [currentPlaylistTracks, setCurrentPlaylistTracks] = useState<Track[]>([]); // Tracks specifically for the selected playlist
  const [isImporting, setIsImporting] = useState(false);
  const [displayedTracks, setDisplayedTracks] = useState<Track[]>([]); // Tracks currently shown in the list after search/filter

  // Effect to fetch tracks based on search term and filters (for "All Tracks" view)
  useEffect(() => {
    const fetchFilteredTracks = async () => {
      // Only run this if "All Tracks" is selected (no playlist active)
      if (!selectedPlaylistId) {
        if (!window.electronAPI) {
            console.warn("Electron API not available. Cannot fetch filtered tracks.");
            setDisplayedTracks([]); // Clear displayed tracks if API not available
            return;
        }
        try {
          const fetchedTracks = await window.electronAPI.searchTracks(searchTerm, filters);
          setDisplayedTracks(fetchedTracks);
        } catch (error) {
          console.error("Failed to fetch filtered tracks:", error);
          setDisplayedTracks([]);
        }
      }
    };
    fetchFilteredTracks();
  }, [searchTerm, filters, selectedPlaylistId, tracks]); // `tracks` dependency helps re-trigger if underlying data changes

  // Effect to load tracks for a selected playlist
  useEffect(() => {
    const loadPlaylistTracks = async () => {
      if (selectedPlaylistId) {
        if (!window.electronAPI) {
            console.warn("Electron API not available. Cannot load playlist tracks.");
            setCurrentPlaylistTracks([]);
            setDisplayedTracks([]);
            return;
        }
        try {
          const tracksInPlaylist = await window.electronAPI.getTracksInPlaylist(selectedPlaylistId);
          setCurrentPlaylistTracks(tracksInPlaylist); // Store playlist-specific tracks
          setDisplayedTracks(tracksInPlaylist); // Show playlist tracks in the list
        } catch (error) {
          console.error(`Failed to load tracks for playlist ${selectedPlaylistId}:`, error);
          setCurrentPlaylistTracks([]);
          setDisplayedTracks([]);
        }
      } else {
        setCurrentPlaylistTracks([]); // Clear playlist tracks when no playlist is selected
        // When switching back to "All Tracks", the `fetchFilteredTracks` useEffect will re-run
        // and populate `displayedTracks` based on current search/filters.
      }
    };
    loadPlaylistTracks();
  }, [selectedPlaylistId]); // Only rerun if selected playlist changes


  const handleScanDirectories = useCallback(async () => {
    setIsImporting(true);
    try {
      if (!window.electronAPI) {
          throw new Error("Electron API not available to open directory dialog.");
      }
      const directoryPaths = await window.electronAPI.openDirectoryDialog();
      if (!directoryPaths || directoryPaths.length === 0) {
        console.log('No directory selected.');
        return;
      }

      for (const dirPath of directoryPaths) {
        const audioFilePaths = await window.electronAPI.readAudioFilesFromDirectory(dirPath);
        for (const filePath of audioFilePaths) {
          try {
            const fileName = filePath.split(/[\\/]/).pop() || filePath;
            const arrayBuffer = await window.electronAPI.readFileAsArrayBuffer(filePath);
            const newTrack = await loadAudioFile(arrayBuffer, filePath, fileName);
            await onAddTrackToLibrary(newTrack);
          } catch (error) {
            console.error(`Failed to process file ${filePath}:`, error);
          }
        }
      }
      refreshLibrary();
    } catch (error) {
      console.error('Error scanning directories:', error);
      alert(`Error scanning directories: ${(error as Error).message}`);
    } finally {
      setIsImporting(false);
    }
  }, [onAddTrackToLibrary, refreshLibrary]);

  const handleImportFiles = useCallback(async () => {
    setIsImporting(true);
    try {
      if (!window.electronAPI) {
          throw new Error("Electron API not available to open file dialog.");
      }
      const filePaths = await window.electronAPI.openFileDialog();
      if (!filePaths || filePaths.length === 0) {
        console.log('No files selected.');
        return;
      }

      for (const filePath of filePaths) {
        try {
          const fileName = filePath.split(/[\\/]/).pop() || filePath;
          const arrayBuffer = await window.electronAPI.readFileAsArrayBuffer(filePath);
          const newTrack = await loadAudioFile(arrayBuffer, filePath, fileName);
          await onAddTrackToLibrary(newTrack);
        } catch (error) {
          console.error(`Failed to process file ${filePath}:`, error);
        }
      }
      refreshLibrary();
    } catch (error) {
      console.error('Error importing files:', error);
      alert(`Error importing files: ${(error as Error).message}`);
    } finally {
      setIsImporting(false);
    }
  }, [onAddTrackToLibrary, refreshLibrary]);


  return (
    <div className="flex flex-col h-full">
      <h2 className="text-3xl font-extrabold text-gray-100 mb-6 text-center">Music Library</h2>

      <div className="flex justify-around mb-6 space-x-4">
        <button
          onClick={handleScanDirectories}
          className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-semibold hover:bg-blue-700 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={isImporting || isLibraryLoading}
        >
          {isImporting ? 'Scanning...' : 'Scan Directories'}
        </button>
        <button
          onClick={handleImportFiles}
          className="flex-1 px-4 py-2 bg-green-600 text-white rounded-md text-sm font-semibold hover:bg-green-700 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={isImporting || isLibraryLoading}
        >
          {isImporting ? 'Importing...' : 'Import Files'}
        </button>
      </div>

      <p className="text-sm text-gray-400 text-center mb-4">
        Streaming service integration (Spotify, Apple Music, Tidal, etc.) planned for future phases.
      </p>

      <SearchAndFilter searchTerm={searchTerm} onSearchChange={setSearchTerm} filters={filters} onFilterChange={setFilters} />

      <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-4 my-6 overflow-hidden">
        <div className="md:col-span-1 border border-gray-700 rounded-lg p-3 overflow-y-auto">
            <PlaylistManager
                playlists={playlists}
                onCreatePlaylist={onCreatePlaylist}
                onDeletePlaylist={onDeletePlaylist}
                onSelectPlaylist={(id) => {
                  setSelectedPlaylistId(id);
                  setSearchTerm(''); // Clear search when switching playlist view
                  setFilters({}); // Clear filters when switching playlist view
                }}
                selectedPlaylistId={selectedPlaylistId}
            />
        </div>
        <div className="md:col-span-2 border border-gray-700 rounded-lg p-3 overflow-y-auto">
            {isLibraryLoading || isImporting ? (
                <div className="flex items-center justify-center h-full text-blue-400">
                    <p>{isImporting ? 'Importing tracks...' : 'Loading library...'}</p>
                </div>
            ) : (
                <TrackList
                    tracks={displayedTracks} // Now showing `displayedTracks` from DB search/playlist
                    onUpdateTrack={onUpdateTrackInLibrary}
                    onDeleteTrack={onDeleteTrackFromLibrary}
                    onDropTrackToDeck={onDropTrackToDeck}
                    onAddTrackToPlaylist={onAddTrackToPlaylist}
                    onRemoveTrackFromPlaylist={onRemoveTrackFromPlaylist}
                    currentPlaylists={playlists} // Pass all playlists for 'add to playlist' context
                    selectedPlaylistId={selectedPlaylistId} // If selected, show remove button
                />
            )}
        </div>
      </div>
    </div>
  );
};

export default Library;