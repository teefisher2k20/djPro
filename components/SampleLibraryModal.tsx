import React from 'react';
import { Track } from '../types';

interface SampleLibraryModalProps {
  isOpen: boolean;
  onClose: () => void;
  libraryTracks: Track[];
  onSelectTrack: (track: Track) => void;
  isLibraryLoading: boolean;
}

const SampleLibraryModal: React.FC<SampleLibraryModalProps> = ({
  isOpen,
  onClose,
  libraryTracks,
  onSelectTrack,
  isLibraryLoading,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-gray-900 bg-opacity-75 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg shadow-2xl p-6 w-full max-w-2xl h-[80vh] flex flex-col">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold text-blue-400">Select Track for Sample</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-100 text-2xl" aria-label="Close modal">
            &times;
          </button>
        </div>

        {isLibraryLoading ? (
          <div className="flex-1 flex items-center justify-center text-blue-400">
            Loading library tracks...
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto pr-2">
            {libraryTracks.length === 0 ? (
              <p className="text-gray-400 text-center mt-4">No tracks in library. Please import some first.</p>
            ) : (
              <ul className="space-y-2">
                {libraryTracks.map((track) => (
                  <li
                    key={track.id}
                    className="bg-gray-700 hover:bg-gray-600 rounded-md p-3 cursor-pointer flex justify-between items-center"
                    onClick={() => onSelectTrack(track)}
                  >
                    <div>
                      <h3 className="text-lg font-semibold text-white">{track.name}</h3>
                      <p className="text-sm text-gray-300">{track.artist || 'Unknown Artist'}</p>
                    </div>
                    <button className="px-3 py-1 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700 transition-colors">
                      Select
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="mt-6 flex justify-end">
          <button onClick={onClose} className="px-5 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

export default SampleLibraryModal;