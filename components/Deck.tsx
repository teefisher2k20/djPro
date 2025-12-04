
import React, { DragEvent, useRef, useEffect, useState } from 'react';
import { DeckState } from '../types';
import WaveformDisplay from './WaveformDisplay';
import EQControls from './EQControls';
import VUMeter from './VUMeter';
import SamplerPad from './SamplerPad';
import XYPad from './XYPad';
import { getPlayerCurrentTime, getAvailableAudioInputs } from '../services/audioService';

interface DeckProps {
  deckState: DeckState;
  onPlayPause: (deckId: string) => void;
  onVolumeChange: (deckId: string, volume: number) => void;
  onEQChange: (deckId: string, band: 'high' | 'mid' | 'low', value: number) => void;
  onEffectUpdate: (deckId: string, x: number, y: number, active: boolean) => void; 
  onCueToggle: (deckId: string) => void;
  onDropTrack: (deckId: string, trackId: string) => void;
  onImportTrackFromFile: (deckId: string, file: File) => void; 
  onLoadSample: (deckId: string, slotIndex: number, file: File) => void;
  onOpenSampleLibrary: (deckId: string, slotIndex: number) => void; 
  onPlayPauseSample: (deckId: string, slotIndex: number) => void;
  onToggleSampleMode: (deckId: string, slotIndex: number) => void;
  onSampleVolumeChange: (deckId: string, slotIndex: number, volume: number) => void;
  onSamplePitchChange: (deckId: string, slotIndex: number, pitch: number) => void; 
  onClearSample: (deckId: string, slotIndex: number) => void;
  onStartRecording: (deckId: string) => void;
  onStopRecording: (deckId: string) => void;
  isLoadingSample: (deckId: string, slotIndex: number) => boolean; 
  onStartLoopRoll: (deckId: string, interval: string) => void;
  onStopLoopRoll: (deckId: string) => void;
  onSeek: (deckId: string, time: number) => void;
  onLoadTrackFromPath: (deckId: string, path: string) => void;
  onToggleLiveInput: (deckId: string, deviceId?: string) => void;
  onImportTrackToLibrary: (path: string) => Promise<void>; // New prop for uploading
}

const Deck: React.FC<DeckProps> = ({
  deckState,
  onPlayPause,
  onVolumeChange,
  onEQChange,
  onEffectUpdate,
  onCueToggle,
  onDropTrack, 
  onImportTrackFromFile, 
  onLoadSample,
  onOpenSampleLibrary, 
  onPlayPauseSample,
  onToggleSampleMode,
  onSampleVolumeChange,
  onSamplePitchChange, 
  onClearSample,
  onStartRecording,
  onStopRecording,
  isLoadingSample,
  onStartLoopRoll,
  onStopLoopRoll,
  onSeek,
  onLoadTrackFromPath,
  onToggleLiveInput,
  onImportTrackToLibrary,
}) => {
  const { id, track, isPlaying, isLiveInput, volume, playbackRate, eq, effects, cue, meterLevel, samples, isRecording, loopRollActive } = deckState;

  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoVolume, setVideoVolume] = useState(0); // Default to muted to let main audio take lead
  const [currentTime, setCurrentTime] = useState(0);
  const [isScrubbing, setIsScrubbing] = useState(false);

  // Phone / File Transfer Mode State
  const [isPhoneMode, setIsPhoneMode] = useState(false);
  const [deviceFiles, setDeviceFiles] = useState<{name: string, path: string}[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState<Set<string>>(new Set());
  const [lastScanPath, setLastScanPath] = useState<string | null>(null);
  
  // Audio Input Selection State
  const [audioInputs, setAudioInputs] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('default');

  // Fetch audio inputs when Phone Mode opens
  useEffect(() => {
      if (isPhoneMode) {
          getAvailableAudioInputs().then(devices => {
              setAudioInputs(devices);
          }).catch(err => console.error("Failed to fetch audio inputs:", err));
      }
  }, [isPhoneMode]);


  // Sync playback rate and state for video
  useEffect(() => {
    if (videoRef.current) {
        if (isPlaying && !isLiveInput) {
            videoRef.current.play().catch(e => console.error("Video play error:", e));
        } else {
            videoRef.current.pause();
        }
    }
  }, [isPlaying, isLiveInput]);

  useEffect(() => {
    if (videoRef.current) {
        videoRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate]);

  useEffect(() => {
    // When track changes, load new source
    if (videoRef.current && track?.videoUrl) {
        videoRef.current.src = track.videoUrl;
        videoRef.current.load();
        videoRef.current.currentTime = 0; 
    }
  }, [track?.videoUrl]);

  // Video Volume Control
  useEffect(() => {
    if (videoRef.current) {
        videoRef.current.volume = videoVolume;
        videoRef.current.muted = videoVolume === 0;
    }
  }, [videoVolume]);

  // Current Time polling for Seek Bar
  useEffect(() => {
      let animationFrameId: number;
      const updateTime = () => {
          if (isPlaying && !isScrubbing && !isLiveInput) {
              const time = getPlayerCurrentTime(id);
              setCurrentTime(time);
          }
          animationFrameId = requestAnimationFrame(updateTime);
      }
      if (isPlaying && !isLiveInput) {
          updateTime();
      }
      return () => cancelAnimationFrame(animationFrameId);
  }, [isPlaying, isScrubbing, id, isLiveInput]);

  // Sync seek if paused and track changed or just seeked
  useEffect(() => {
      if (!isPlaying && !isScrubbing && !isLiveInput) {
          const time = getPlayerCurrentTime(id);
          // Only update if legitimate time is returned
          if (time < (track?.duration || 1000)) {
            setCurrentTime(time);
          }
      }
  }, [isPlaying, isScrubbing, id, track, isLiveInput]);


  const handleRecordingToggle = () => {
    if (isRecording) {
      onStopRecording(id);
    } else {
      onStartRecording(id);
    }
  };

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault(); 
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

  const handleDirectFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      onImportTrackFromFile(id, file);
      event.target.value = ''; 
    }
  };

  const scanDirectory = async (dirPath: string) => {
      setIsScanning(true);
      setDeviceFiles([]);
      try {
          if (window.electronAPI) {
               const files = await window.electronAPI.readAudioFilesFromDirectory(dirPath);
               setDeviceFiles(files.map(f => ({
                   name: f.split(/[\\/]/).pop() || 'Unknown',
                   path: f
               })).slice(0, 200)); // Limit to 200 for UI performance
               setLastScanPath(dirPath);
          }
      } catch (e) {
          console.error("Error scanning device:", e);
          alert("Failed to scan directory.");
      } finally {
          setIsScanning(false);
      }
  };

  const handleSelectDevice = async () => {
      try {
          if (window.electronAPI) {
               const dirPaths = await window.electronAPI.openDirectoryDialog();
               if (dirPaths && dirPaths.length > 0) {
                   await scanDirectory(dirPaths[0]);
               }
          } else {
              alert("Feature requires Electron environment.");
          }
      } catch (e) {
          console.error("Error selecting device:", e);
      }
  };

  const handleRescan = async () => {
      if (lastScanPath) {
          await scanDirectory(lastScanPath);
      } else {
          handleSelectDevice();
      }
  };

  const handleLoadFromList = (path: string) => {
      onLoadTrackFromPath(id, path);
      // We keep the overlay open so they can load more or browse
  };

  const handleImport = async (path: string) => {
      setUploadingFiles(prev => new Set(prev).add(path));
      try {
          await onImportTrackToLibrary(path);
      } finally {
          setUploadingFiles(prev => {
              const next = new Set(prev);
              next.delete(path);
              return next;
          });
      }
  };

  const handleImportAll = async () => {
      if (deviceFiles.length === 0) return;
      const confirm = window.confirm(`Import all ${deviceFiles.length} tracks to your library? This will tag them as 'Mobile Import'.`);
      if (!confirm) return;

      for (const file of deviceFiles) {
          if (!uploadingFiles.has(file.path)) {
              await handleImport(file.path);
          }
      }
  };

  const handleLiveInputToggle = () => {
      // Fix: Pass undefined if 'default' is selected so Tone.js uses system default
      // 'default' string is not a valid device ID in most contexts for Tone.js open()
      const deviceIdToUse = selectedDeviceId === 'default' ? undefined : selectedDeviceId;
      onToggleLiveInput(id, deviceIdToUse);
      setIsPhoneMode(false);
  }

  const formatTime = (seconds: number) => {
      const mins = Math.floor(seconds / 60);
      const secs = Math.floor(seconds % 60);
      return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  return (
    <div
      className="flex flex-col items-center p-6 bg-gray-800 rounded-lg shadow-xl w-full max-w-md mx-auto relative border-2 border-transparent transition-all duration-150 ease-in-out hover:border-blue-500"
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <h2 className="text-3xl font-extrabold text-gray-100 mb-4">Deck {id}</h2>
      <h3 className="text-xl font-bold text-blue-400 mb-4 truncate w-full text-center">
        {isLiveInput ? '🔴 LIVE INPUT ACTIVE' : (track ? track.name : 'No Track Loaded (Drag & Drop)')}
      </h3>

      {/* Main Display Container */}
      <div className="w-full h-48 bg-gray-700 rounded-md mb-4 relative overflow-hidden group border border-gray-600">
        
        {/* Phone Transfer / Source Select Overlay */}
        {isPhoneMode ? (
            <div className="absolute inset-0 z-30 bg-gray-900 flex flex-col p-4 animate-fadeIn">
                <div className="flex justify-between items-center mb-3 border-b border-gray-700 pb-2">
                    <h4 className="text-sm font-bold text-green-400 uppercase tracking-wider flex items-center gap-2">
                        <span>📲</span> Phone Mode & Live Input
                    </h4>
                    <button onClick={() => setIsPhoneMode(false)} className="text-gray-400 hover:text-white">&times;</button>
                </div>
                
                {/* Live Input Option with Selector */}
                <div className="mb-3 bg-gray-800 p-2 rounded border border-gray-700">
                    <label className="text-[10px] text-gray-400 font-bold block mb-1 uppercase">Select Audio Input Device</label>
                    <select 
                        className="w-full bg-gray-900 text-gray-200 text-xs p-1 mb-2 rounded border border-gray-600 focus:outline-none focus:border-blue-500"
                        value={selectedDeviceId}
                        onChange={(e) => setSelectedDeviceId(e.target.value)}
                    >
                        <option value="default">System Default / USB Audio Device</option>
                        {audioInputs.filter(d => d.deviceId !== 'default').map(device => (
                            <option key={device.deviceId} value={device.deviceId}>
                                {device.label || `Input ${device.deviceId.slice(0, 5)}...`}
                            </option>
                        ))}
                    </select>
                    <button 
                        onClick={handleLiveInputToggle}
                        className={`w-full py-2 rounded font-bold flex items-center justify-center gap-2 transition-colors text-xs
                                    ${isLiveInput ? 'bg-red-600 hover:bg-red-700 text-white' : 'bg-gray-700 hover:bg-gray-600 text-gray-200 border border-gray-500'}`}
                    >
                        <span className={isLiveInput ? 'animate-pulse' : ''}>🔴</span> 
                        {isLiveInput ? 'Stop Live Stream' : 'Initiate Live Streaming'}
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto min-h-0 bg-gray-800 rounded border border-gray-700 mb-3 relative">
                    {isScanning ? (
                        <div className="flex flex-col items-center justify-center h-full text-green-400 gap-2">
                            <div className="w-6 h-6 border-2 border-green-500 border-t-transparent rounded-full animate-spin"></div>
                            <span>Scanning Storage...</span>
                        </div>
                    ) : deviceFiles.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-gray-500 p-4 text-center">
                            <div className="text-4xl mb-2">📱</div>
                            <p className="text-xs mb-3">Connect Phone via USB (MTP) or Insert Drive</p>
                            <button 
                                onClick={handleSelectDevice}
                                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-xs font-bold transition-colors flex items-center gap-2 shadow-lg"
                            >
                                <span>📂</span> Select Connected Phone / USB
                            </button>
                        </div>
                    ) : (
                        <div className="h-full flex flex-col">
                            <div className="bg-gray-700 p-2 flex justify-between items-center sticky top-0 z-10 shadow-md">
                                <span className="text-xs font-bold text-gray-300">{deviceFiles.length} Tracks Found</span>
                                <div className="flex gap-2">
                                    <button 
                                        onClick={handleRescan}
                                        className="text-gray-400 hover:text-white text-xs underline"
                                    >
                                        Rescan
                                    </button>
                                    <button 
                                        onClick={handleImportAll}
                                        className="px-2 py-1 bg-green-700 hover:bg-green-600 text-white text-[10px] font-bold rounded"
                                    >
                                        Import All
                                    </button>
                                </div>
                            </div>
                            <ul className="divide-y divide-gray-700">
                                {deviceFiles.map((file, idx) => (
                                    <li key={idx} className="flex justify-between items-center p-2 hover:bg-gray-700 group">
                                        <div className="flex items-center gap-2 overflow-hidden w-3/5">
                                            <span className="text-gray-500">🎵</span>
                                            <span className="text-xs text-gray-300 truncate" title={file.name}>{file.name}</span>
                                        </div>
                                        <div className="flex gap-2 shrink-0">
                                            <button 
                                                onClick={() => handleLoadFromList(file.path)}
                                                className="px-2 py-1 bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-bold rounded"
                                            >
                                                LOAD
                                            </button>
                                            <button 
                                                onClick={() => handleImport(file.path)}
                                                disabled={uploadingFiles.has(file.path)}
                                                className={`px-2 py-1 text-white text-[10px] font-bold rounded flex items-center gap-1 min-w-[50px] justify-center
                                                    ${uploadingFiles.has(file.path) ? 'bg-gray-600 cursor-wait' : 'bg-green-600 hover:bg-green-500'}`}
                                            >
                                                {uploadingFiles.has(file.path) ? '...' : 'SAVE'}
                                            </button>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>
            </div>
        ) : (
            <>
                {/* Standard Video/Waveform/Live Display */}
                
                {/* Live Input Visualizer Placeholder */}
                {isLiveInput && (
                    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/80">
                         <div className="flex items-end gap-1 h-16 mb-2">
                             {[...Array(8)].map((_, i) => (
                                 <div key={i} className="w-4 bg-red-500 rounded-t animate-pulse" style={{ height: `${Math.random() * 100}%`, animationDuration: `${0.5 + Math.random()}s` }}></div>
                             ))}
                         </div>
                         <p className="text-red-500 font-bold tracking-widest animate-pulse">LIVE SIGNAL</p>
                         <p className="text-gray-400 text-xs mt-1">Controlled by Vol/EQ/FX</p>
                    </div>
                )}

                {/* Video Layer */}
                {!isLiveInput && track?.isVideo && track.videoUrl && (
                    <video 
                        ref={videoRef}
                        className="absolute inset-0 w-full h-full object-cover opacity-60 z-0"
                        muted={true} // Default handled by effect
                        playsInline
                        loop
                    />
                )}
                
                {/* Waveform Layer */}
                {!isLiveInput && (
                    <div className={`absolute inset-0 z-10 flex items-center justify-center p-2 backdrop-blur-[1px] transition-opacity duration-300 ${track?.isVideo && 'group-hover:opacity-20'}`}>
                        {track?.waveformPeaks ? (
                            <WaveformDisplay peaks={track.waveformPeaks} width={400} height={120} color={track.isVideo ? "rgba(255, 255, 255, 0.9)" : "#3b82f6"} />
                        ) : (
                            <p className="text-gray-400 z-20">Load a track/video to begin</p>
                        )}
                    </div>
                )}

                {/* Video specific controls overlay */}
                {!isLiveInput && track?.isVideo && (
                    <div className="absolute inset-0 z-20 flex flex-col justify-end p-3 bg-gradient-to-t from-black/90 via-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                        <div className="flex items-center gap-3 mb-1">
                            <button 
                                onClick={(e) => { e.stopPropagation(); onPlayPause(id); }} 
                                className="text-white hover:text-blue-400 transition-colors"
                            >
                                {isPlaying ? (
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                ) : (
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                )}
                            </button>

                            <div className="flex-1 flex flex-col">
                                <div className="flex justify-between text-[10px] text-gray-300 w-full px-1">
                                    <span>{formatTime(currentTime)}</span>
                                    <span>{formatTime(track.duration || 0)}</span>
                                </div>
                                <input
                                    type="range"
                                    min="0"
                                    max={track.duration || 100}
                                    step="0.1"
                                    value={currentTime}
                                    onChange={(e) => {
                                        setCurrentTime(parseFloat(e.target.value));
                                    }}
                                    onMouseDown={() => setIsScrubbing(true)}
                                    onMouseUp={(e) => {
                                        setIsScrubbing(false);
                                        onSeek(id, parseFloat(e.currentTarget.value));
                                    }}
                                    className="w-full h-1 bg-gray-500 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-blue-500"
                                />
                            </div>
                        </div>

                        <div className="flex items-center gap-2 justify-end mt-1">
                            <span className="text-[10px] text-gray-400 uppercase font-bold">Video Audio</span>
                            <input 
                                type="range"
                                min="0"
                                max="1"
                                step="0.05"
                                value={videoVolume}
                                onChange={(e) => setVideoVolume(parseFloat(e.target.value))}
                                className="w-20 h-1 bg-gray-500 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white"
                                title="Independent Video Element Volume"
                            />
                        </div>
                    </div>
                )}
            </>
        )}
      </div>

      <div className="flex space-x-2 mb-4">
        <input
            type="file"
            accept="audio/*,video/*"
            ref={fileInputRef}
            onChange={handleDirectFileChange}
            className="hidden"
        />
        <button
            onClick={() => fileInputRef.current?.click()}
            className="px-4 py-2 bg-gray-700 text-gray-300 hover:text-white rounded-md text-sm font-semibold hover:bg-gray-600 transition-colors duration-200"
        >
            📂 Load File
        </button>
        <button
            onClick={() => setIsPhoneMode(!isPhoneMode)}
            className={`px-4 py-2 rounded-md text-sm font-semibold transition-colors duration-200 flex items-center gap-2
                        ${isPhoneMode ? 'bg-green-600 text-white shadow-lg' : 'bg-gray-700 text-gray-300 hover:bg-gray-600 hover:text-white'}`}
        >
            <span>📱</span> Phone / Live Mode
        </button>
      </div>

      <div className="flex items-center justify-center space-x-4 mb-6">
        <button
          onClick={() => onPlayPause(id)}
          className={`px-6 py-3 rounded-full text-lg font-bold shadow-lg transition-transform transform active:scale-95
                     ${isPlaying ? 'bg-green-500 text-white hover:bg-green-400 box-shadow-green' : 'bg-gray-600 text-gray-200 hover:bg-gray-500'}
                     ${isLiveInput ? 'opacity-50 cursor-not-allowed' : ''}`}
          disabled={!track || isLiveInput}
        >
          {isPlaying ? 'PAUSE' : 'PLAY'}
        </button>
        <button
          onClick={() => onCueToggle(id)}
          className={`px-4 py-3 rounded-full text-lg font-semibold transition-colors duration-200 border-2
                      ${cue ? 'bg-orange-500 border-orange-400 text-white' : 'bg-transparent border-gray-600 text-gray-400 hover:border-gray-400'}`}
          disabled={!track && !isLiveInput}
        >
          CUE
        </button>
      </div>

      <div className="flex justify-between items-end w-full mt-4">
        <div className="flex flex-col items-center w-2/3">
          <label className="text-gray-400 text-xs uppercase font-bold mb-1 tracking-wider">Vol</label>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={volume}
            onChange={(e) => onVolumeChange(id, parseFloat(e.target.value))}
            className="w-full h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer"
            disabled={!track && !isLiveInput}
          />
        </div>
        <div className="w-1/4 flex justify-end">
          <VUMeter level={meterLevel} height="60px" width="10px" label="dB" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 w-full mt-6">
        {/* EQ Controls */}
        <div className="bg-gray-700/50 rounded-lg pb-4">
            <EQControls eq={eq} onEQChange={(band, value) => onEQChange(id, band, value)} />
        </div>
        
        {/* Flux FX Pad */}
        <div className="bg-gray-700/50 rounded-lg p-2 flex items-center justify-center">
            <XYPad 
                x={effects.x} 
                y={effects.y} 
                active={effects.active} 
                onUpdate={(x, y, active) => onEffectUpdate(id, x, y, active)}
                label="FLUX FX"
            />
        </div>
      </div>

      {/* Loop Roll Section */}
      <div className="w-full border-t border-gray-700 mt-6 pt-4">
        <h3 className="text-xs font-bold text-gray-400 mb-2 uppercase tracking-wider text-center">Loop Rolls</h3>
        <div className="flex justify-center gap-2">
          {['1/4', '1/2', '1', '2'].map((interval) => (
            <button
              key={interval}
              onMouseDown={() => (track?.id || isLiveInput) && onStartLoopRoll(id, interval)}
              onMouseUp={() => (track?.id || isLiveInput) && onStopLoopRoll(id)}
              onMouseLeave={() => (track?.id || isLiveInput) && onStopLoopRoll(id)} 
              className={`px-3 py-2 rounded text-xs font-bold uppercase transition-all duration-100
                          ${loopRollActive && deckState.loopRollInterval === interval 
                              ? 'bg-yellow-400 text-black shadow-[0_0_10px_rgba(250,204,21,0.6)] scale-105' 
                              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
              disabled={(!track && !isLiveInput) || (!isPlaying && !isLiveInput)}
            >
              {interval}
            </button>
          ))}
        </div>
      </div>

      {/* Sampler Section */}
      <div className="w-full border-t border-gray-700 mt-6 pt-4">
        <h3 className="text-xs font-bold text-gray-400 mb-2 uppercase tracking-wider text-center">Sampler</h3>
        <div className="grid grid-cols-4 gap-2 mb-4">
          {samples.map((sample, index) => (
            <SamplerPad
              key={index}
              slotIndex={index}
              sample={sample}
              onLoadSample={(slotIdx, file) => onLoadSample(id, slotIdx, file)}
              onOpenSampleLibrary={onOpenSampleLibrary} 
              onPlayPause={(slotIdx) => onPlayPauseSample(id, slotIdx)}
              onToggleMode={(slotIdx) => onToggleSampleMode(id, slotIdx)}
              onVolumeChange={(slotIdx, vol) => onSampleVolumeChange(id, slotIdx, vol)}
              onPitchChange={(slotIdx, pitch) => onSamplePitchChange(id, slotIdx, pitch)}
              onClearSample={(slotIdx) => onClearSample(id, slotIdx)}
              isPlaying={sample?.isPlaying || false}
              isLoading={isLoadingSample(id, index)}
            />
          ))}
        </div>
        <button
          onClick={handleRecordingToggle}
          className={`w-full py-2 rounded-md text-sm font-bold uppercase tracking-wider transition-colors duration-200
                      ${isRecording ? 'bg-red-600 hover:bg-red-700 animate-pulse text-white' : 'bg-gray-700 hover:bg-gray-600 text-gray-300'}`}
          disabled={!track && !isLiveInput} 
        >
          {isRecording ? 'Stop Rec' : 'Rec Deck'}
        </button>
      </div>
    </div>
  );
};

export default Deck;
