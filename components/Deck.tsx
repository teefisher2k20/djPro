import React, { DragEvent } from 'react';
import { DeckState, Track, Sample } from '../types';
import WaveformDisplay from './WaveformDisplay';
import EQControls from './EQControls';
import VUMeter from './VUMeter';
import SamplerPad from './SamplerPad';

interface DeckProps {
  deckState: DeckState;
  onPlayPause: (deckId: string) => void;
  onVolumeChange: (deckId: string, volume: number) => void;
  onEQChange: (deckId: string, band: 'high' | 'mid' | 'low', value: number) => void;
  onCueToggle: (deckId: string) => void;
  // New: onDropTrack callback for drag-and-drop
  onDropTrack: (deckId: string, trackId: string) => void;
  // Sample related props
  onLoadSample: (deckId: string, slotIndex: number, file: File) => void;
  // Removed: onLoadTrackAsSample: (deckId: string, slotIndex: number, track: Track) => void; // New prop for loading from library
  onOpenSampleLibrary: (deckId: string, slotIndex: number) => void; // New prop to open modal
  onPlayPauseSample: (deckId: string, slotIndex: number) => void;
  onToggleSampleMode: (deckId: string, slotIndex: number) => void;
  onSampleVolumeChange: (deckId: string, slotIndex: number, volume: number) => void;
  onSamplePitchChange: (deckId: string, slotIndex: number, pitch: number) => void; // New prop for pitch
  onClearSample: (deckId: string, slotIndex: number) => void;
  // Recording related props
  onStartRecording: (deckId: string) => void;
  onStopRecording: (deckId: string) => void;
  isLoadingSample: (deckId: string, slotIndex: number) => boolean; // Function to check if specific sample is loading
  // Loop Roll related props
  onStartLoopRoll: (deckId: string, interval: string) => void;
  onStopLoopRoll: (deckId: string) => void;
}

const Deck: React.FC<DeckProps> = ({
  deckState,
  onPlayPause,
  onVolumeChange,
  onEQChange,
  onCueToggle,
  onDropTrack, // Destructure new prop
  onLoadSample,
  // Removed: onLoadTrackAsSample,
  onOpenSampleLibrary, // Destructure new prop
  onPlayPauseSample,
  onToggleSampleMode,
  onSampleVolumeChange,
  onSamplePitchChange, // Destructure new prop
  onClearSample,
  onStartRecording,
  onStopRecording,
  isLoadingSample,
  onStartLoopRoll,
  onStopLoopRoll,
}) => {
  const { id, track, isPlaying, volume, eq, cue, meterLevel, samples, isRecording, loopRollActive } = deckState;

  const handleRecordingToggle = () => {
    if (isRecording) {
      onStopRecording(id);
    } else {
      onStartRecording(id);
    }
  };

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault(); // Allow drop
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const trackId = e.dataTransfer.getData('text/plain');
    if (trackId) {
      console.log(`Dropped track ${trackId} onto Deck ${id}`);
      onDropTrack(id, trackId);
    }
  };

  return (
    <div
      className="flex flex-col items-center p-6 bg-gray-800 rounded-lg shadow-xl w-full max-w-md mx-auto relative border-2 border-transparent transition-all duration-150 ease-in-out hover:border-blue-500"
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <h2 className="text-3xl font-extrabold text-gray-100 mb-4">Deck {id}</h2>
      <h3 className="text-xl font-bold text-blue-400 mb-4 truncate w-full text-center">
        {track ? track.name : 'No Track Loaded (Drag & Drop)'}
      </h3>

      <div className="w-full h-32 bg-gray-700 rounded-md mb-4 flex items-center justify-center">
        {track?.waveformPeaks ? (
          <WaveformDisplay peaks={track.waveformPeaks} width={400} height={120} color="#3b82f6" />
        ) : (
          <p className="text-gray-400">Load a track to see its waveform</p>
        )}
      </div>

      <div className="flex items-center justify-center space-x-4 mb-6">
        <button
          onClick={() => onPlayPause(id)}
          className="px-6 py-3 bg-green-600 text-white rounded-full text-lg font-semibold hover:bg-green-700 transition-colors duration-200"
          disabled={!track}
          aria-label={isPlaying ? `Pause Deck ${id}` : `Play Deck ${id}`}
        >
          {isPlaying ? '⏸︎ Pause' : '▶︎ Play'}
        </button>
        <button
          onClick={() => onCueToggle(id)}
          className={`px-4 py-3 rounded-full text-lg font-semibold transition-colors duration-200
                      ${cue ? 'bg-orange-500 hover:bg-orange-600 text-white' : 'bg-gray-600 hover:bg-gray-500 text-gray-200'}`}
          disabled={!track}
          aria-pressed={cue}
          aria-label={`Toggle Cue for Deck ${id}`}
        >
          🎧 Cue
        </button>
      </div>

      <div className="flex justify-between items-end w-full mt-4">
        <div className="flex flex-col items-center w-2/3">
          <label htmlFor={`volume-slider-${id}`} className="text-gray-300 mb-2">Volume: {Math.round(volume * 100)}%</label>
          <input
            id={`volume-slider-${id}`}
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={volume}
            onChange={(e) => onVolumeChange(id, parseFloat(e.target.value))}
            className="w-full h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer range-lg [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-blue-600 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-blue-600"
            disabled={!track}
            aria-label={`Volume for Deck ${id}`}
          />
        </div>
        <div className="w-1/4 flex justify-end">
          <VUMeter level={meterLevel} height="60px" width="10px" label="dB" />
        </div>
      </div>

      <EQControls eq={eq} onEQChange={(band, value) => onEQChange(id, band, value)} />

      {/* Loop Roll Section */}
      <div className="w-full border-t border-gray-700 mt-6 pt-6">
        <h3 className="text-md font-semibold text-gray-300 mb-4 text-center">Loop Rolls</h3>
        <div className="flex justify-center gap-2">
          {['1/4', '1/2', '1', '2'].map((interval) => (
            <button
              key={interval}
              onMouseDown={() => track?.id && onStartLoopRoll(id, interval)}
              onMouseUp={() => track?.id && onStopLoopRoll(id)}
              onMouseLeave={() => track?.id && onStopLoopRoll(id)} // Stop if mouse leaves while pressed
              className={`px-4 py-2 rounded-md text-sm font-semibold transition-colors duration-150
                          ${loopRollActive && deckState.loopRollInterval === interval ? 'bg-yellow-500 text-gray-900 animate-pulse' : 'bg-gray-600 hover:bg-gray-500 text-white'}
                          disabled:opacity-50 disabled:cursor-not-allowed`}
              disabled={!track || !isPlaying}
              aria-label={`Loop Roll ${interval} beats on Deck ${id}`}
            >
              {interval}
            </button>
          ))}
        </div>
      </div>

      {/* Sampler Section */}
      <div className="w-full border-t border-gray-700 mt-6 pt-6">
        <h3 className="text-md font-semibold text-gray-300 mb-4 text-center">Sampler</h3>
        <div className="grid grid-cols-4 gap-2 mb-4">
          {samples.map((sample, index) => (
            <SamplerPad
              key={index}
              slotIndex={index}
              sample={sample}
              onLoadSample={(slotIdx, file) => onLoadSample(id, slotIdx, file)}
              // Removed: onLoadTrackAsSample={onLoadTrackAsSample} // Pass to SamplerPad
              onOpenSampleLibrary={onOpenSampleLibrary} // Pass to SamplerPad
              onPlayPause={(slotIdx) => onPlayPauseSample(id, slotIdx)}
              onToggleMode={(slotIdx) => onToggleSampleMode(id, slotIdx)}
              onVolumeChange={(slotIdx, vol) => onSampleVolumeChange(id, slotIdx, vol)}
              onPitchChange={(slotIdx, pitch) => onSamplePitchChange(id, slotIdx, pitch)} // Pass pitch handler
              onClearSample={(slotIdx) => onClearSample(id, slotIdx)}
              isPlaying={sample?.isPlaying || false}
              isLoading={isLoadingSample(id, index)}
            />
          ))}
        </div>
        <button
          onClick={handleRecordingToggle}
          className={`w-full py-3 rounded-md text-lg font-semibold transition-colors duration-200
                      ${isRecording ? 'bg-red-600 hover:bg-red-700 animate-pulse' : 'bg-purple-600 hover:bg-purple-700'}
                      text-white`}
          disabled={!track} // Can only record if a track is loaded
          aria-label={isRecording ? `Stop recording from Deck ${id}` : `Start recording from Deck ${id}`}
        >
          {isRecording ? '🔴 Stop Recording' : '🎤 Record from Deck'}
        </button>
      </div>
    </div>
  );
};

export default Deck;