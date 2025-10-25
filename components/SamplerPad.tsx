import React, { useRef, useState, useCallback } from 'react';
import { Sample, Track } from '../types'; // Import Track type

interface SamplerPadProps {
  sample: Sample | null;
  slotIndex: number;
  onLoadSample: (slotIndex: number, file: File) => void;
  // Removed: onLoadTrackAsSample: (track: Track) => void; // New prop for loading from library
  onOpenSampleLibrary: (deckId: string, slotIndex: number) => void; // New prop to open modal
  onPlayPause: (slotIndex: number) => void;
  onToggleMode: (slotIndex: number) => void;
  onVolumeChange: (slotIndex: number, volume: number) => void;
  onPitchChange: (slotIndex: number, pitch: number) => void; // New prop for pitch
  onClearSample: (slotIndex: number) => void;
  isPlaying: boolean; // Indicates if the sample is currently playing (from App state)
  isLoading: boolean; // Indicates if this specific pad is loading
}

const SamplerPad: React.FC<SamplerPadProps> = ({
  sample,
  slotIndex,
  onLoadSample,
  // Removed: onLoadTrackAsSample, // Destructure new prop
  onOpenSampleLibrary, // Destructure new prop
  onPlayPause,
  onToggleMode,
  onVolumeChange,
  onPitchChange, // Destructure new prop
  onClearSample,
  isPlaying,
  isLoading,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const deckId = (Math.floor(slotIndex / 8) === 0 ? 'A' : 'B'); // Simple heuristic, better to pass deckId from Deck


  const handleFileChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      onLoadSample(slotIndex, file);
      // Reset file input value to allow loading the same file again
      event.target.value = '';
    }
  }, [onLoadSample, slotIndex]);

  const triggerFileInput = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleOpenLibraryClick = useCallback(() => {
    // Pass a placeholder deckId if not directly available, but it's crucial for App.tsx context
    // In this structure, `Deck.tsx` passes its own `id` to `onOpenSampleLibrary`.
    // We need to pass the deckId from DeckProps to SamplerPadProps. For now, using 'A' or 'B' via prop drilling.
    onOpenSampleLibrary(deckId === 'A' ? 'A' : 'B', slotIndex); 
  }, [onOpenSampleLibrary, slotIndex, deckId]);

  const backgroundColor = sample?.color || '#374151'; // Default gray if no color

  return (
    <div
      className={`relative flex flex-col items-center justify-center p-2 rounded-lg transition-all duration-200 ease-in-out
                  ${isPlaying ? 'ring-4 ring-yellow-400' : ''}
                  ${isLoading ? 'opacity-60 cursor-wait' : ''}`}
      style={{ backgroundColor }}
    >
      <input
        type="file"
        accept="audio/*"
        onChange={handleFileChange}
        ref={fileInputRef}
        className="hidden"
        disabled={isLoading}
      />
      
      {!sample && !isLoading ? (
        <div className="flex flex-col gap-1 w-full">
          <button
            onClick={triggerFileInput}
            className="w-full h-8 flex items-center justify-center text-xs font-semibold text-gray-200 bg-gray-700 hover:bg-gray-600 rounded-md transition-colors"
            disabled={isLoading}
          >
            Load File
          </button>
          <button
            onClick={handleOpenLibraryClick}
            className="w-full h-8 flex items-center justify-center text-xs font-semibold text-gray-200 bg-blue-700 hover:bg-blue-600 rounded-md transition-colors"
            disabled={isLoading}
          >
            Load from Library
          </button>
          <span className="text-xs text-gray-400 text-center mt-1">Slot {slotIndex + 1}</span>
        </div>
      ) : (
        <>
          <span className="text-xs text-white font-semibold truncate w-full text-center mb-1">
            {sample?.name || 'Loading...'}
          </span>
          <div className="flex items-center justify-center w-full mb-1">
            <button
              onClick={() => onPlayPause(slotIndex)}
              className={`w-8 h-8 rounded-full text-white text-lg flex items-center justify-center transition-colors mr-1
                          ${isPlaying ? 'bg-red-500 hover:bg-red-600' : 'bg-green-500 hover:bg-green-600'}`}
              aria-label={isPlaying ? `Stop sample in slot ${slotIndex + 1}` : `Play sample in slot ${slotIndex + 1}`}
              disabled={isLoading || !sample}
            >
              {isPlaying ? '■' : '▶'}
            </button>
            <button
              onClick={() => onToggleMode(slotIndex)}
              className={`flex-1 px-2 py-1 text-xs rounded-md transition-colors
                          ${sample?.mode === 'loop' ? 'bg-blue-600 hover:bg-blue-700 text-white' : 'bg-gray-600 hover:bg-gray-500 text-gray-200'}`}
              disabled={isLoading || !sample}
            >
              {sample?.mode === 'loop' ? 'Loop' : 'One-Shot'}
            </button>
          </div>

          <div className="flex flex-col items-center w-full mb-1">
            <label className="text-xs text-gray-300">Vol: {Math.round((sample?.volume || 0.8) * 100)}%</label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={sample?.volume || 0.8}
              onChange={(e) => onVolumeChange(slotIndex, parseFloat(e.target.value))}
              className="w-full h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer
                         [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-orange-400"
              disabled={isLoading || !sample}
              aria-label={`Volume for sample in slot ${slotIndex + 1}`}
            />
          </div>
          <div className="flex flex-col items-center w-full mb-1">
            <label className="text-xs text-gray-300">Pitch: {sample?.pitch || 0} semitones</label>
            <input
              type="range"
              min="-12"
              max="12"
              step="1"
              value={sample?.pitch || 0}
              onChange={(e) => onPitchChange(slotIndex, parseInt(e.target.value, 10))}
              className="w-full h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer
                         [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-purple-400"
              disabled={isLoading || !sample}
              aria-label={`Pitch for sample in slot ${slotIndex + 1}`}
            />
          </div>
          <button
            onClick={() => onClearSample(slotIndex)}
            className="w-full mt-1 px-2 py-1 text-xs bg-red-700 hover:bg-red-800 text-white rounded-md transition-colors"
            disabled={isLoading || !sample}
          >
            Clear
          </button>
        </>
      )}
    </div>
  );
};

export default SamplerPad;