import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import Deck from './components/Deck';
import Crossfader from './components/Crossfader';
import VUMeter from './components/VUMeter';
import Library from './components/Library/Library'; // Import the new Library component
import Chatbot from './components/Chatbot'; // Import Chatbot component
import SampleLibraryModal from './components/SampleLibraryModal'; // New import
import {
  loadAudioFile,
  createPlayerConnections,
  playTrack,
  pauseTrack,
  stopTrack,
  setPlayerVolume,
  disposePlayerConnections,
  initAudioEngine,
  setEQGain,
  getMeterLevel,
  setMasterVolume,
  loadSampleFile,
  loadTrackAsSample, // New import
  playSample,
  stopSample,
  setSampleVolume,
  setSamplePitch, // New import
  disposeSample,
  startRecordingDeck,
  stopRecordingDeck,
  startLoopRoll,
  stopLoopRoll,
} from './services/audioService';
import { Track, DeckState, EQSettings, PlayerConnections, Sample, Playlist, ChatMessage } from './types';
import * as Tone from 'tone';

const INITIAL_EQ_SETTINGS: EQSettings = { high: 0, mid: 0, low: 0 };
const POLLING_INTERVAL_MS = 100; // How often to update VU meters
const NUM_SAMPLE_SLOTS = 8; // Number of sample pads per deck

const App: React.FC = () => {
  const [deckAState, setDeckAState] = useState<DeckState>({
    id: 'A',
    track: null,
    isPlaying: false,
    volume: 0.8,
    eq: { ...INITIAL_EQ_SETTINGS },
    cue: false,
    meterLevel: -60, // Default to a low dB value
    samples: Array(NUM_SAMPLE_SLOTS).fill(null), // Initialize 8 null sample slots
    isRecording: false,
    loopRollActive: false,
    loopRollInterval: null,
  });
  const [deckBState, setDeckBState] = useState<DeckState>({
    id: 'B',
    track: null,
    isPlaying: false,
    volume: 0.8,
    eq: { ...INITIAL_EQ_SETTINGS },
    cue: false,
    meterLevel: -60,
    samples: Array(NUM_SAMPLE_SLOTS).fill(null),
    isRecording: false,
    loopRollActive: false,
    loopRollInterval: null,
  });
  const [crossfaderPosition, setCrossfaderPosition] = useState(0.5); // 0 (A) to 1 (B), 0.5 is center
  const [masterVolume, setMasterVolumeState] = useState(0.8);
  const [masterMeterLevel, setMasterMeterLevel] = useState(-60); // Master output VU
  const [isLoadingDeckA, setIsLoadingDeckA] = useState(false); // Loading for main track A
  const [isLoadingDeckB, setIsLoadingDeckB] = useState(false); // Loading for main track B
  const [loadingSampleStates, setLoadingSampleStates] = useState<{[key: string]: boolean}>({}); // e.g., {'A-0': true, 'B-3': false}

  const [libraryTracks, setLibraryTracks] = useState<Track[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [isLibraryLoading, setIsLibraryLoading] = useState(false);

  // Chatbot state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isChatTyping, setIsChatTyping] = useState(false);

  // Sample Library Modal state
  const [showSampleLibraryModal, setShowSampleLibraryModal] = useState(false);
  const [currentSampleDeckId, setCurrentSampleDeckId] = useState<'A' | 'B' | null>(null);
  const [currentSampleSlotIndex, setCurrentSampleSlotIndex] = useState<number | null>(null);


  // Use refs to hold the Tone.js PlayerConnections instances
  const playerAConnectionsRef = useRef<PlayerConnections | null>(null);
  const playerBConnectionsRef = useRef<PlayerConnections | null>(null);

  // Memoized function to check if a specific sample slot is loading
  const isLoadingSample = useCallback((deckId: string, slotIndex: number) => {
    return loadingSampleStates[`${deckId}-${slotIndex}`] || false;
  }, [loadingSampleStates]);

  // Load library tracks and playlists on app start
  useEffect(() => {
    const loadLibraryData = async () => {
      setIsLibraryLoading(true);
      try {
        // Check if electronAPI is available before calling
        if (window.electronAPI) {
          const tracks = await window.electronAPI.getTracks();
          setLibraryTracks(tracks);
          const playlists = await window.electronAPI.getPlaylists();
          setPlaylists(playlists);
        } else {
          console.warn("Electron API not available. Running in non-Electron environment or preload failed.");
          // Potentially show a user-facing error message or switch to a fallback UI
        }
      } catch (error) {
        console.error("Failed to load library data:", error);
      } finally {
        setIsLibraryLoading(false);
      }
    };
    loadLibraryData();
  }, []); // Run once on mount

  // Initialize audio engine and master meter on first user interaction (or component mount if safe)
  useEffect(() => {
    initAudioEngine().then(() => {
        // Master volume initialization
        setMasterVolume(masterVolume);
    });

    // Polling for VU meters and sample playing state
    const interval = setInterval(() => {
      // Update deck meters
      if (deckAState.track?.id && playerAConnectionsRef.current) {
        setDeckAState(prevState => ({ ...prevState, meterLevel: getMeterLevel(prevState.track!.id) }));
      }
      if (deckBState.track?.id && playerBConnectionsRef.current) {
        setDeckBState(prevState => ({ ...prevState, meterLevel: getMeterLevel(prevState.track!.id) }));
      }

      // TODO: Implement a proper master meter in audioService to get actual master level
      // For now, let's just show a combined average/max of deck levels for master meter
      const combinedLevel = Math.max(deckAState.meterLevel, deckBState.meterLevel);
      setMasterMeterLevel(combinedLevel > -60 ? combinedLevel : -60);

    }, POLLING_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [deckAState.track?.id, deckBState.track?.id, deckAState.meterLevel, deckBState.meterLevel]); // Dependencies for meter polling

  // Effect to clean up players when component unmounts
  useEffect(() => {
    return () => {
      if (playerAConnectionsRef.current) {
        disposePlayerConnections(deckAState.track?.id || '');
      }
      if (playerBConnectionsRef.current) {
        disposePlayerConnections(deckBState.track?.id || '');
      }
      // Dispose all active samples
      deckAState.samples.forEach(sample => sample && disposeSample(sample.id));
      deckBState.samples.forEach(sample => sample && disposeSample(sample.id));
    };
  }, []); // Run once on unmount

  // Handle crossfader position changes
  useEffect(() => {
    const applyCrossfaderVolume = (deckId: 'A' | 'B', connections: PlayerConnections | null, deckVol: number) => {
      if (!connections) return;

      // Crossfader curve: constant power (sine/cosine) is common for smooth transitions
      if (deckId === 'A') {
        const gain = Math.cos(crossfaderPosition * 0.5 * Math.PI); // 1.0 (left) to 0.0 (right)
        connections.outputGain.gain.value = deckVol * gain;
      } else { // Deck B
        const gain = Math.cos((1 - crossfaderPosition) * 0.5 * Math.PI); // 0.0 (left) to 1.0 (right)
        connections.outputGain.gain.value = deckVol * gain;
      }
    };

    applyCrossfaderVolume('A', playerAConnectionsRef.current, deckAState.volume);
    applyCrossfaderVolume('B', playerBConnectionsRef.current, deckBState.volume);

  }, [crossfaderPosition, deckAState.volume, deckBState.volume]); // Re-calculate when crossfader or individual volumes change


  // Modified handleFileSelect to load from filePath (from library)
  const loadTrackIntoDeck = useCallback(async (trackToLoad: Track, deckId: 'A' | 'B') => {
    if (deckId === 'A') setIsLoadingDeckA(true);
    else setIsLoadingDeckB(true);

    try {
      await initAudioEngine(); // Ensure audio engine is initialized

      const setTargetDeckState = deckId === 'A' ? setDeckAState : setDeckBState;
      const targetDeckState = deckId === 'A' ? deckAState : deckBState;
      const playerConnectionsRef = deckId === 'A' ? playerAConnectionsRef : playerBConnectionsRef;

      // Dispose of the previous player for the selected deck
      if (targetDeckState.track?.id && playerConnectionsRef.current) {
        stopTrack(targetDeckState.track.id);
        disposePlayerConnections(targetDeckState.track.id);
        playerConnectionsRef.current = null;
      }

      // Read file content from disk using Electron API
      // Check if electronAPI is available before calling
      if (!window.electronAPI) {
          throw new Error("Electron API not available to read file. Cannot load track.");
      }
      const arrayBuffer = await window.electronAPI.readFileAsArrayBuffer(trackToLoad.filePath);
      // Pass trackToLoad.name explicitly, as path.basename is not available in renderer
      const loadedTrackWithBuffer = await loadAudioFile(arrayBuffer, trackToLoad.filePath, trackToLoad.name);

      // Merge original track metadata with runtime buffer/waveform
      const finalTrack: Track = {
          ...trackToLoad,
          buffer: loadedTrackWithBuffer.buffer,
          audioBuffer: loadedTrackWithBuffer.audioBuffer,
          waveformPeaks: loadedTrackWithBuffer.waveformPeaks,
          duration: loadedTrackWithBuffer.duration,
          bpm: loadedTrackWithBuffer.bpm, // Use detected BPM
          // Keep other metadata from DB
      };


      if (finalTrack.buffer) {
        const newPlayerConnections = createPlayerConnections(finalTrack.id, finalTrack.buffer);
        playerConnectionsRef.current = newPlayerConnections;

        setTargetDeckState(prevState => ({
          ...prevState,
          track: finalTrack,
          isPlaying: false, // Reset play state for new track
          meterLevel: -60,
          eq: { ...INITIAL_EQ_SETTINGS }, // Reset EQ for new track
        }));

        // Apply initial volume and EQ
        setPlayerVolume(finalTrack.id, targetDeckState.volume);
        setEQGain(finalTrack.id, 'high', INITIAL_EQ_SETTINGS.high);
        setEQGain(finalTrack.id, 'mid', INITIAL_EQ_SETTINGS.mid);
        setEQGain(finalTrack.id, 'low', INITIAL_EQ_SETTINGS.low);

        // Add 'ended' listener
        // @ts-ignore - 'on' method exists on Tone.Source (which Player extends) but may be missing from types.
        newPlayerConnections.player.on('ended', () => {
          setTargetDeckState(prevState => ({ ...prevState, isPlaying: false }));
          console.log(`Track ${finalTrack.name} ended on Deck ${deckId}.`);
          // Update lastPlayed in DB
          // Check if electronAPI is available before calling
          if (window.electronAPI) {
            window.electronAPI.updateTrack({ id: finalTrack.id, lastPlayed: Date.now() });
          }
        });
      }
    } catch (error) {
      console.error('Failed to load audio track into deck:', error);
      alert(`Error loading audio: ${(error as Error).message}`);
    } finally {
      if (deckId === 'A') setIsLoadingDeckA(false);
      else setIsLoadingDeckB(false);
    }
  }, [deckAState.track?.id, deckAState.volume, deckBState.track?.id, deckBState.volume]);


  const handlePlayPause = useCallback((deckId: 'A' | 'B') => {
    const targetDeckState = deckId === 'A' ? deckAState : deckBState;
    const setTargetDeckState = deckId === 'A' ? setDeckAState : setDeckBState;

    if (!targetDeckState.track) return;

    if (targetDeckState.isPlaying) {
      pauseTrack(targetDeckState.track.id);
    } else {
      playTrack(targetDeckState.track.id);
    }
    setTargetDeckState(prevState => ({ ...prevState, isPlaying: !prevState.isPlaying }));
  }, [deckAState, deckBState]);

  const handleVolumeChange = useCallback((deckId: 'A' | 'B', newVolume: number) => {
    const setTargetDeckState = deckId === 'A' ? setDeckAState : setDeckBState;
    setTargetDeckState(prevState => ({ ...prevState, volume: newVolume }));
    // The actual Tone.js volume is updated via the useEffect for crossfader,
    // which triggers on `deckAState.volume` and `deckBState.volume` changes.
  }, []);

  const handleEQChange = useCallback((deckId: 'A' | 'B', band: 'high' | 'mid' | 'low', value: number) => {
    const targetDeckState = deckId === 'A' ? deckAState : deckBState;
    const setTargetDeckState = deckId === 'A' ? setDeckAState : setDeckBState;
    if (!targetDeckState.track) return;

    setTargetDeckState(prevState => ({
      ...prevState,
      eq: { ...prevState.eq, [band]: value },
    }));
    setEQGain(targetDeckState.track.id, band, value);
  }, [deckAState, deckBState]);

  const handleCueToggle = useCallback((deckId: 'A' | 'B') => {
    const setTargetDeckState = deckId === 'A' ? setDeckAState : setDeckBState;
    setTargetDeckState(prevState => ({ ...prevState, cue: !prevState.cue }));
    console.log(`Deck ${deckId} Cue Toggled: ${!((deckId === 'A' ? deckAState : deckBState).cue)}`);
    // Future: implement actual audio routing for cue
  }, [deckAState, deckBState]);

  const handleCrossfaderChange = useCallback((position: number) => {
    setCrossfaderPosition(position);
  }, []);

  const handleMasterVolumeChange = useCallback((newVolume: number) => {
    setMasterVolumeState(newVolume);
    setMasterVolume(newVolume);
  }, []);

  // Handler for dropping a track from the library onto a deck
  const handleDropTrackToDeck = useCallback((deckId: 'A' | 'B', trackId: string) => {
    const trackToLoad = libraryTracks.find(track => track.id === trackId);
    if (trackToLoad) {
      loadTrackIntoDeck(trackToLoad, deckId);
    } else {
      console.warn(`Track with ID ${trackId} not found in library.`);
    }
  }, [libraryTracks, loadTrackIntoDeck]);

  // --- Sample Handlers ---
  const handleLoadSample = useCallback(async (deckId: 'A' | 'B', slotIndex: number, file: File) => {
    setLoadingSampleStates(prev => ({ ...prev, [`${deckId}-${slotIndex}`]: true }));
    try {
      await initAudioEngine();
      const newSample = await loadSampleFile(file); // This still uses FileReader
      const setTargetDeckState = deckId === 'A' ? setDeckAState : setDeckBState;

      setTargetDeckState(prevState => {
        const newSamples = [...prevState.samples];
        // Dispose any existing sample in this slot before replacing
        if (newSamples[slotIndex]) {
            disposeSample(newSamples[slotIndex]!.id);
        }
        newSamples[slotIndex] = newSample;
        return { ...prevState, samples: newSamples };
      });
    } catch (error) {
      console.error(`Failed to load sample for Deck ${deckId} slot ${slotIndex}:`, error);
      alert(`Error loading sample: ${(error as Error).message}`);
    } finally {
      setLoadingSampleStates(prev => ({ ...prev, [`${deckId}-${slotIndex}`]: false }));
    }
  }, []);

  const handleOpenSampleLibrary = useCallback((deckId: 'A' | 'B', slotIndex: number) => {
    setCurrentSampleDeckId(deckId);
    setCurrentSampleSlotIndex(slotIndex);
    setShowSampleLibraryModal(true);
  }, []);

  const handleCloseSampleLibrary = useCallback(() => {
    setShowSampleLibraryModal(false);
    setCurrentSampleDeckId(null);
    setCurrentSampleSlotIndex(null);
  }, []);

  const handleSelectTrackAsSample = useCallback(async (track: Track) => {
    if (currentSampleDeckId === null || currentSampleSlotIndex === null) return;

    setLoadingSampleStates(prev => ({ ...prev, [`${currentSampleDeckId}-${currentSampleSlotIndex}`]: true }));
    try {
      await initAudioEngine();
      // Ensure the track's buffer is actually loaded into Tone.js for sampling
      // (it might only be in AudioBuffer form from loadAudioFile or just metadata from DB)
      // For simplicity, we assume if `track.buffer` exists, it's ready. If not, re-load.
      let sampleTrack: Track = track;
      if (!track.buffer) {
        if (!window.electronAPI) {
            throw new Error("Electron API not available to read file. Cannot load track as sample.");
        }
        const arrayBuffer = await window.electronAPI.readFileAsArrayBuffer(track.filePath);
        sampleTrack = await loadAudioFile(arrayBuffer, track.filePath, track.name);
      }
      
      const newSample = await loadTrackAsSample(sampleTrack); // Use new function
      const setTargetDeckState = currentSampleDeckId === 'A' ? setDeckAState : setDeckBState;

      setTargetDeckState(prevState => {
        const newSamples = [...prevState.samples];
        if (newSamples[currentSampleSlotIndex]) {
            disposeSample(newSamples[currentSampleSlotIndex]!.id);
        }
        newSamples[currentSampleSlotIndex] = newSample;
        return { ...prevState, samples: newSamples };
      });
      handleCloseSampleLibrary();
    } catch (error) {
      console.error(`Failed to load track ${track.name} as sample:`, error);
      alert(`Error loading track as sample: ${(error as Error).message}`);
    } finally {
      setLoadingSampleStates(prev => ({ ...prev, [`${currentSampleDeckId}-${currentSampleSlotIndex}`]: false }));
    }
  }, [currentSampleDeckId, currentSampleSlotIndex, handleCloseSampleLibrary]);


  const handlePlayPauseSample = useCallback((deckId: 'A' | 'B', slotIndex: number) => {
    const targetDeckState = deckId === 'A' ? deckAState : deckBState;
    const setTargetDeckState = deckId === 'A' ? setDeckAState : setDeckBState;
    const sample = targetDeckState.samples[slotIndex];

    if (!sample) return;

    if (sample.isPlaying) {
      stopSample(sample.id);
      setTargetDeckState(prevState => {
        const newSamples = [...prevState.samples];
        if (newSamples[slotIndex]) {
          newSamples[slotIndex] = { ...newSamples[slotIndex]!, isPlaying: false };
        }
        return { ...prevState, samples: newSamples };
      });
    } else {
      playSample(sample);
      setTargetDeckState(prevState => {
        const newSamples = [...prevState.samples];
        if (newSamples[slotIndex]) {
          newSamples[slotIndex] = { ...newSamples[slotIndex]!, isPlaying: true };
        }
        return { ...prevState, samples: newSamples };
      });
    }
  }, [deckAState, deckBState]);


  const handleToggleSampleMode = useCallback((deckId: 'A' | 'B', slotIndex: number) => {
    const setTargetDeckState = deckId === 'A' ? setDeckAState : setDeckBState;
    setTargetDeckState(prevState => {
      const newSamples = [...prevState.samples];
      const currentSample = newSamples[slotIndex];
      if (currentSample) {
        const newMode = currentSample.mode === 'one-shot' ? 'loop' : 'one-shot';
        newSamples[slotIndex] = { ...currentSample, mode: newMode };
        // If it was looping and mode changed, stop it to prevent continuous loop
        if (currentSample.isPlaying && currentSample.mode === 'loop') {
            stopSample(currentSample.id);
            newSamples[slotIndex] = { ...newSamples[slotIndex]!, isPlaying: false };
        }
      }
      return { ...prevState, samples: newSamples };
    });
  }, []);

  const handleSampleVolumeChange = useCallback((deckId: 'A' | 'B', slotIndex: number, volume: number) => {
    const setTargetDeckState = deckId === 'A' ? setDeckAState : setDeckBState;
    const targetDeckState = deckId === 'A' ? deckAState : deckBState;
    const sample = targetDeckState.samples[slotIndex];

    if (!sample) return;

    setTargetDeckState(prevState => {
      const newSamples = [...prevState.samples];
      if (newSamples[slotIndex]) {
        newSamples[slotIndex] = { ...newSamples[slotIndex]!, volume: volume };
      }
      return { ...prevState, samples: newSamples };
    });
    // If playing, update Tone.js player volume immediately
    if (sample.isPlaying) {
      setSampleVolume(sample.id, volume);
    }
  }, [deckAState, deckBState]);

  const handleSamplePitchChange = useCallback((deckId: 'A' | 'B', slotIndex: number, pitch: number) => {
    const setTargetDeckState = deckId === 'A' ? setDeckAState : setDeckBState;
    const targetDeckState = deckId === 'A' ? deckAState : deckBState;
    const sample = targetDeckState.samples[slotIndex];

    if (!sample) return;

    setTargetDeckState(prevState => {
      const newSamples = [...prevState.samples];
      if (newSamples[slotIndex]) {
        newSamples[slotIndex] = { ...newSamples[slotIndex]!, pitch: pitch };
      }
      return { ...prevState, samples: newSamples };
    });
    // If playing, update Tone.js player pitch immediately
    if (sample.isPlaying) {
      setSamplePitch(sample.id, pitch);
    }
  }, [deckAState, deckBState]);

  const handleClearSample = useCallback((deckId: 'A' | 'B', slotIndex: number) => {
    const setTargetDeckState = deckId === 'A' ? setDeckAState : setDeckBState;
    const targetDeckState = deckId === 'A' ? deckAState : deckBState;
    const sampleToClear = targetDeckState.samples[slotIndex];

    if (sampleToClear) {
      stopSample(sampleToClear.id); // Stop if playing
      disposeSample(sampleToClear.id); // Clear buffer cache
      setTargetDeckState(prevState => {
        const newSamples = [...prevState.samples];
        newSamples[slotIndex] = null;
        return { ...prevState, samples: newSamples };
      });
    }
  }, [deckAState, deckBState]);

  // --- Recording Handlers ---
  const handleStartRecording = useCallback((deckId: string) => {
    const setTargetDeckState = deckId === 'A' ? setDeckAState : setDeckBState;
    startRecordingDeck(deckId);
    setTargetDeckState(prevState => ({ ...prevState, isRecording: true }));
  }, []);

  const handleStopRecording = useCallback(async (deckId: string) => {
    const setTargetDeckState = deckId === 'A' ? setDeckAState : setDeckBState;
    setTargetDeckState(prevState => ({ ...prevState, isRecording: false }));
    const recordedSample = await stopRecordingDeck(deckId);

    if (recordedSample) {
      setTargetDeckState(prevState => {
        const newSamples = [...prevState.samples];
        const firstEmptySlot = newSamples.findIndex(s => s === null);
        if (firstEmptySlot !== -1) {
          if (newSamples[firstEmptySlot]) {
                disposeSample(newSamples[firstEmptySlot]!.id);
            }
          newSamples[firstEmptySlot] = recordedSample;
          console.log(`Recorded sample placed in Deck ${deckId} slot ${firstEmptySlot + 1}.`);
        } else {
          alert(`Deck ${deckId} sampler is full. Could not place recorded sample.`);
          disposeSample(recordedSample.id); // Dispose if no slot
        }
        return { ...prevState, samples: newSamples };
      });
    }
  }, []);

  // --- Loop Roll Handlers ---
  const handleStartLoopRoll = useCallback((deckId: string, interval: string) => {
    const targetDeckState = deckId === 'A' ? deckAState : deckBState;
    const setTargetDeckState = deckId === 'A' ? setDeckAState : setDeckBState;

    if (!targetDeckState.track?.id || !targetDeckState.isPlaying) {
      console.warn(`Cannot start loop roll on Deck ${deckId}: no track or not playing.`);
      return;
    }
    startLoopRoll(targetDeckState.track.id, interval);
    setTargetDeckState(prevState => ({ ...prevState, loopRollActive: true, loopRollInterval: interval }));
  }, [deckAState, deckBState]);

  const handleStopLoopRoll = useCallback((deckId: string) => {
    const targetDeckState = deckId === 'A' ? deckAState : deckBState;
    const setTargetDeckState = deckId === 'A' ? setDeckAState : setDeckBState;

    if (!targetDeckState.track?.id || !targetDeckState.loopRollActive) {
      return;
    }
    stopLoopRoll(targetDeckState.track.id);
    setTargetDeckState(prevState => ({ ...prevState, loopRollActive: false, loopRollInterval: null }));
  }, [deckAState, deckBState]);


  // --- Library Callbacks ---
  const refreshLibrary = useCallback(async () => {
    setIsLibraryLoading(true);
    try {
      // Check if electronAPI is available before calling
      if (window.electronAPI) {
        const tracks = await window.electronAPI.getTracks();
        setLibraryTracks(tracks);
        const playlists = await window.electronAPI.getPlaylists();
        setPlaylists(playlists);
      } else {
        console.warn("Electron API not available. Cannot refresh library data.");
      }
    } catch (error) {
      console.error("Failed to refresh library:", error);
    } finally {
      setIsLibraryLoading(false);
    }
  }, []);

  const handleAddTrackToLibrary = useCallback(async (track: Track) => {
    // Check if electronAPI is available before calling
    if (window.electronAPI) {
        await window.electronAPI.saveTrack(track);
        refreshLibrary();
    } else {
        console.warn("Electron API not available. Cannot add track to library.");
    }
  }, [refreshLibrary]);

  const handleUpdateTrackInLibrary = useCallback(async (track: Partial<Track>) => {
    // Check if electronAPI is available before calling
    if (window.electronAPI) {
        await window.electronAPI.updateTrack(track);
        refreshLibrary();
    } else {
        console.warn("Electron API not available. Cannot update track in library.");
    }
  }, [refreshLibrary]);

  const handleDeleteTrackFromLibrary = useCallback(async (trackId: string) => {
    // Check if electronAPI is available before calling
    if (window.electronAPI) {
        await window.electronAPI.deleteTrack(trackId);
        refreshLibrary();
    } else {
        console.warn("Electron API not available. Cannot delete track from library.");
    }
  }, [refreshLibrary]);

  const handleCreatePlaylist = useCallback(async (name: string) => {
    // Check if electronAPI is available before calling
    if (window.electronAPI) {
        await window.electronAPI.createPlaylist(name);
        refreshLibrary();
    } else {
        console.warn("Electron API not available. Cannot create playlist.");
    }
  }, [refreshLibrary]);

  const handleDeletePlaylist = useCallback(async (playlistId: string) => {
    // Check if electronAPI is available before calling
    if (window.electronAPI) {
        await window.electronAPI.deletePlaylist(playlistId);
        refreshLibrary();
    } else {
        console.warn("Electron API not available. Cannot delete playlist.");
    }
  }, [refreshLibrary]);

  const handleAddTrackToPlaylist = useCallback(async (playlistId: string, trackId: string) => {
    // Check if electronAPI is available before calling
    if (window.electronAPI) {
        await window.electronAPI.addTrackToPlaylist(playlistId, trackId);
        refreshLibrary();
    } else {
        console.warn("Electron API not available. Cannot add track to playlist.");
    }
  }, [refreshLibrary]);

  const handleRemoveTrackFromPlaylist = useCallback(async (playlistId: string, trackId: string) => {
    // Check if electronAPI is available before calling
    if (window.electronAPI) {
        await window.electronAPI.removeTrackFromPlaylist(playlistId, trackId);
        refreshLibrary();
    } else {
        console.warn("Electron API not available. Cannot remove track from playlist.");
    }
  }, [refreshLibrary]);


  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 flex flex-col xl:flex-row p-4">
      {/* Library Section */}
      <div className="w-full xl:w-1/3 p-4 bg-gray-800 rounded-lg shadow-xl mb-4 xl:mb-0 xl:mr-4">
        <Library
          tracks={libraryTracks}
          playlists={playlists}
          isLibraryLoading={isLibraryLoading}
          onAddTrackToLibrary={handleAddTrackToLibrary}
          onUpdateTrackInLibrary={handleUpdateTrackInLibrary}
          onDeleteTrackFromLibrary={handleDeleteTrackFromLibrary}
          onDropTrackToDeck={handleDropTrackToDeck} // Pass for TrackListItem
          onCreatePlaylist={handleCreatePlaylist}
          onDeletePlaylist={handleDeletePlaylist}
          onAddTrackToPlaylist={handleAddTrackToPlaylist}
          onRemoveTrackFromPlaylist={handleRemoveTrackFromPlaylist}
          refreshLibrary={refreshLibrary}
        />
      </div>

      {/* Main DJ Decks and Mixer Section */}
      <div className="flex-1 flex flex-col items-center p-4">
        <h1 className="text-6xl font-extrabold mb-10 text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-600">
          Pro DJ Software
        </h1>

        <div className="flex flex-col md:flex-row gap-8 w-full justify-center max-w-7xl">
          {/* File Browsers removed - replaced by Library */}
        </div>

        <div className="flex flex-col lg:flex-row gap-8 w-full justify-center max-w-7xl mt-8">
          <Deck
            deckState={deckAState}
            onPlayPause={handlePlayPause}
            onVolumeChange={handleVolumeChange}
            onEQChange={handleEQChange}
            onCueToggle={handleCueToggle}
            onDropTrack={handleDropTrackToDeck} // Pass to Deck
            onLoadSample={handleLoadSample}
            onOpenSampleLibrary={handleOpenSampleLibrary} // Pass new handler
            onPlayPauseSample={handlePlayPauseSample}
            onToggleSampleMode={handleToggleSampleMode}
            onSampleVolumeChange={handleSampleVolumeChange}
            onSamplePitchChange={handleSamplePitchChange} // Pass new handler
            onClearSample={handleClearSample}
            onStartRecording={handleStartRecording}
            onStopRecording={handleStopRecording}
            isLoadingSample={isLoadingSample}
            onStartLoopRoll={handleStartLoopRoll}
            onStopLoopRoll={handleStopLoopRoll}
          />
          <Deck
            deckState={deckBState}
            onPlayPause={handlePlayPause}
            onVolumeChange={handleVolumeChange}
            onEQChange={handleEQChange}
            onCueToggle={handleCueToggle}
            onDropTrack={handleDropTrackToDeck} // Pass to Deck
            onLoadSample={handleLoadSample}
            onOpenSampleLibrary={handleOpenSampleLibrary} // Pass new handler
            onPlayPauseSample={handlePlayPauseSample}
            onToggleSampleMode={handleToggleSampleMode}
            onSampleVolumeChange={handleSampleVolumeChange}
            onSamplePitchChange={handleSamplePitchChange} // Pass new handler
            onClearSample={handleClearSample}
            onStartRecording={handleStartRecording}
            onStopRecording={handleStopRecording}
            isLoadingSample={isLoadingSample}
            onStartLoopRoll={handleStartLoopRoll}
            onStopLoopRoll={handleStopLoopRoll}
          />
        </div>

        <div className="flex flex-col items-center w-full max-w-2xl mt-8 p-4 bg-gray-800 rounded-lg shadow-xl">
          <div className="flex justify-center items-center w-full mb-6">
            <label htmlFor="master-volume-slider" className="text-gray-300 text-lg font-semibold mr-4">Master Volume: {Math.round(masterVolume * 100)}%</label>
            <input
              id="master-volume-slider"
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={masterVolume}
              onChange={(e) => handleMasterVolumeChange(parseFloat(e.target.value))}
              className="flex-1 h-3 bg-gray-600 rounded-lg appearance-none cursor-pointer
                         [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-blue-500
                         [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-blue-500"
              aria-label="Master Volume"
            />
            <VUMeter level={masterMeterLevel} height="60px" width="12px" label="M" />
          </div>
          <Crossfader position={crossfaderPosition} onPositionChange={handleCrossfaderChange} />
        </div>
      </div>
       {/* Chatbot Section */}
       <div className="w-full xl:w-1/3 p-4 bg-gray-800 rounded-lg shadow-xl mb-4 xl:mb-0 xl:ml-4 flex flex-col">
        <Chatbot />
      </div>

      {/* Sample Library Modal */}
      {showSampleLibraryModal && (
        <SampleLibraryModal
          isOpen={showSampleLibraryModal}
          onClose={handleCloseSampleLibrary}
          libraryTracks={libraryTracks}
          onSelectTrack={handleSelectTrackAsSample}
          isLibraryLoading={isLibraryLoading}
        />
      )}
    </div>
  );
};

export default App;