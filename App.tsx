import React, { useState, useCallback, useEffect, useRef } from 'react';
import Deck from './components/Deck';
import Crossfader from './components/Crossfader';
import VUMeter from './components/VUMeter';
import Library from './components/Library/Library'; 
import Chatbot from './components/Chatbot'; 
import SampleLibraryModal from './components/SampleLibraryModal'; 
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
  loadTrackAsSample, 
  playSample,
  stopSample,
  setSampleVolume,
  setSamplePitch, 
  disposeSample,
  startRecordingDeck,
  stopRecordingDeck,
  startLoopRoll,
  stopLoopRoll,
  setPlaybackRate, 
  updateFluxFX, 
  seekTo,
  toggleLiveInput,
} from './services/audioService';
import { Track, DeckState, EQSettings, PlayerConnections, Playlist, ChatMessage } from './types';

const INITIAL_EQ_SETTINGS: EQSettings = { high: 0, mid: 0, low: 0 };
const POLLING_INTERVAL_MS = 100; 
const NUM_SAMPLE_SLOTS = 8; 

// Placeholder track for Live Input to ensure connections exist
const LIVE_INPUT_TRACK: Track = {
    id: 'live-input',
    name: 'External Source',
    filePath: '',
    artist: 'Live Input',
    duration: 0,
    tags: ['Live']
};

const App: React.FC = () => {
  const [deckAState, setDeckAState] = useState<DeckState>({
    id: 'A',
    track: null,
    isPlaying: false,
    isLiveInput: false,
    volume: 0.8,
    playbackRate: 1, // Init playback rate
    eq: { ...INITIAL_EQ_SETTINGS },
    effects: { x: 1, y: 0, active: false }, 
    cue: false,
    meterLevel: -60, 
    samples: Array(NUM_SAMPLE_SLOTS).fill(null), 
    isRecording: false,
    loopRollActive: false,
    loopRollInterval: null,
  });
  const [deckBState, setDeckBState] = useState<DeckState>({
    id: 'B',
    track: null,
    isPlaying: false,
    isLiveInput: false,
    volume: 0.8,
    playbackRate: 1, // Init playback rate
    eq: { ...INITIAL_EQ_SETTINGS },
    effects: { x: 1, y: 0, active: false }, 
    cue: false,
    meterLevel: -60,
    samples: Array(NUM_SAMPLE_SLOTS).fill(null),
    isRecording: false,
    loopRollActive: false,
    loopRollInterval: null,
  });
  const [crossfaderPosition, setCrossfaderPosition] = useState(0.5); 
  const [masterVolume, setMasterVolumeState] = useState(0.8);
  const [masterMeterLevel, setMasterMeterLevel] = useState(-60); 
  const [isLoadingDeckA, setIsLoadingDeckA] = useState(false); 
  const [isLoadingDeckB, setIsLoadingDeckB] = useState(false); 
  const [loadingSampleStates, setLoadingSampleStates] = useState<{[key: string]: boolean}>({}); 

  const [libraryTracks, setLibraryTracks] = useState<Track[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [isLibraryLoading, setIsLibraryLoading] = useState(false);

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isChatTyping, setIsChatTyping] = useState(false);

  const [showSampleLibraryModal, setShowSampleLibraryModal] = useState(false);
  const [currentSampleDeckId, setCurrentSampleDeckId] = useState<'A' | 'B' | null>(null);
  const [currentSampleSlotIndex, setCurrentSampleSlotIndex] = useState<number | null>(null);

  const playerAConnectionsRef = useRef<PlayerConnections | null>(null);
  const playerBConnectionsRef = useRef<PlayerConnections | null>(null);

  const isLoadingSample = useCallback((deckId: string, slotIndex: number) => {
    return loadingSampleStates[`${deckId}-${slotIndex}`] || false;
  }, [loadingSampleStates]);

  useEffect(() => {
    const loadLibraryData = async () => {
      setIsLibraryLoading(true);
      try {
        if (window.electronAPI) {
          const tracks = await window.electronAPI.getTracks();
          setLibraryTracks(tracks);
          const playlists = await window.electronAPI.getPlaylists();
          setPlaylists(playlists);
        } else {
          console.warn("Electron API not available.");
        }
      } catch (error) {
        console.error("Failed to load library data:", error);
      } finally {
        setIsLibraryLoading(false);
      }
    };
    loadLibraryData();
  }, []); 

  useEffect(() => {
    initAudioEngine().then(() => {
        setMasterVolume(masterVolume);
    });

    const interval = setInterval(() => {
      if (deckAState.track?.id && playerAConnectionsRef.current) {
        setDeckAState(prevState => ({ ...prevState, meterLevel: getMeterLevel(prevState.track!.id) }));
      }
      if (deckBState.track?.id && playerBConnectionsRef.current) {
        setDeckBState(prevState => ({ ...prevState, meterLevel: getMeterLevel(prevState.track!.id) }));
      }

      const combinedLevel = Math.max(deckAState.meterLevel, deckBState.meterLevel);
      setMasterMeterLevel(combinedLevel > -60 ? combinedLevel : -60);

    }, POLLING_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [deckAState.track?.id, deckBState.track?.id, deckAState.meterLevel, deckBState.meterLevel]); 

  useEffect(() => {
    return () => {
      if (playerAConnectionsRef.current) {
        disposePlayerConnections(deckAState.track?.id || '');
      }
      if (playerBConnectionsRef.current) {
        disposePlayerConnections(deckBState.track?.id || '');
      }
      deckAState.samples.forEach(sample => sample && disposeSample(sample.id));
      deckBState.samples.forEach(sample => sample && disposeSample(sample.id));
    };
  }, []); 

  useEffect(() => {
    const applyCrossfaderVolume = (deckId: 'A' | 'B', connections: PlayerConnections | null, deckVol: number) => {
      if (!connections) return;
      if (deckId === 'A') {
        const gain = Math.cos(crossfaderPosition * 0.5 * Math.PI); 
        connections.outputGain.gain.value = deckVol * gain;
      } else { 
        const gain = Math.cos((1 - crossfaderPosition) * 0.5 * Math.PI); 
        connections.outputGain.gain.value = deckVol * gain;
      }
    };

    applyCrossfaderVolume('A', playerAConnectionsRef.current, deckAState.volume);
    applyCrossfaderVolume('B', playerBConnectionsRef.current, deckBState.volume);

  }, [crossfaderPosition, deckAState.volume, deckBState.volume]); 

  const loadTrackIntoDeck = useCallback(async (trackToLoad: Track, deckId: 'A' | 'B') => {
    const setIsLoading = deckId === 'A' ? setIsLoadingDeckA : setIsLoadingDeckB;
    const setTargetDeckState = deckId === 'A' ? setDeckAState : setDeckBState;
    const targetDeckState = deckId === 'A' ? deckAState : deckBState;
    const playerConnectionsRef = deckId === 'A' ? playerAConnectionsRef : playerBConnectionsRef;
    const otherDeckId = deckId === 'A' ? 'B' : 'A';
    const otherDeckState = deckId === 'A' ? deckBState : deckAState;
    const setOtherDeckState = deckId === 'A' ? setDeckBState : setDeckAState;

    setIsLoading(true);

    try {
      await initAudioEngine(); 

      if (targetDeckState.track?.id && playerConnectionsRef.current) {
        stopTrack(targetDeckState.track.id);
        disposePlayerConnections(targetDeckState.track.id);
        playerConnectionsRef.current = null;
      }

      let loadedTrackWithBuffer: Track;

      if (trackToLoad.buffer?.loaded) {
          loadedTrackWithBuffer = trackToLoad;
      } else {
        if (!window.electronAPI) {
            throw new Error("Electron API not available.");
        }
        const arrayBuffer = await window.electronAPI.readFileAsArrayBuffer(trackToLoad.filePath);
        loadedTrackWithBuffer = await loadAudioFile(arrayBuffer, trackToLoad.filePath, trackToLoad.name);
      }
      
      const finalTrack: Track = {
          ...trackToLoad, 
          ...loadedTrackWithBuffer, 
          id: trackToLoad.id, 
          filePath: trackToLoad.filePath, 
      };

      if (finalTrack.buffer) {
        const newPlayerConnections = createPlayerConnections(finalTrack.id, finalTrack.buffer);
        playerConnectionsRef.current = newPlayerConnections;

        setTargetDeckState(prevState => ({
          ...prevState,
          track: finalTrack,
          isPlaying: false, 
          isLiveInput: false,
          playbackRate: 1, // Reset playback rate
          meterLevel: -60,
          eq: { ...INITIAL_EQ_SETTINGS }, 
          effects: { x: 1, y: 0, active: false } 
        }));

        setPlayerVolume(finalTrack.id, targetDeckState.volume);
        setEQGain(finalTrack.id, 'high', INITIAL_EQ_SETTINGS.high);
        setEQGain(finalTrack.id, 'mid', INITIAL_EQ_SETTINGS.mid);
        setEQGain(finalTrack.id, 'low', INITIAL_EQ_SETTINGS.low);
        updateFluxFX(finalTrack.id, 1, 0); 

        // @ts-ignore 
        newPlayerConnections.player.on('ended', () => {
          setTargetDeckState(prevState => ({ ...prevState, isPlaying: false }));
          if (window.electronAPI) {
            window.electronAPI.updateTrack({ id: finalTrack.id, lastPlayed: Date.now() });
          }
        });

        // --- BPM Synchronization Logic ---
        if (finalTrack.bpm && finalTrack.bpm > 0) {
          if (otherDeckState.track && otherDeckState.isPlaying && otherDeckState.track.bpm && otherDeckState.track.bpm > 0) {
            const newPlaybackRate = finalTrack.bpm / otherDeckState.track.bpm;
            setPlaybackRate(otherDeckState.track.id, newPlaybackRate);
            setOtherDeckState(prev => ({ ...prev, playbackRate: newPlaybackRate })); // Update state for Video Sync
            console.log(`Deck ${otherDeckId} tempo adjusted. New rate: ${newPlaybackRate.toFixed(3)}`);
          }
        }
      }
    } catch (error) {
      console.error('Failed to load audio track into deck:', error);
      alert(`Error loading audio: ${(error as Error).message}`);
    } finally {
      setIsLoading(false);
    }
  }, [deckAState, deckBState]);


  const handleImportTrackFromFile = useCallback(async (deckId: 'A' | 'B', file: File) => {
    const setIsLoading = deckId === 'A' ? setIsLoadingDeckA : setIsLoadingDeckB;
    const setTargetDeckState = deckId === 'A' ? setDeckAState : setDeckBState;
    const targetDeckState = deckId === 'A' ? deckAState : deckBState;
    const playerConnectionsRef = deckId === 'A' ? playerAConnectionsRef : playerBConnectionsRef;
    const otherDeckId = deckId === 'A' ? 'B' : 'A';
    const otherDeckState = deckId === 'A' ? deckBState : deckAState;
    const setOtherDeckState = deckId === 'A' ? setDeckBState : setDeckAState;

    setIsLoading(true);
    try {
      await initAudioEngine(); 

      if (targetDeckState.track?.id && playerConnectionsRef.current) {
        stopTrack(targetDeckState.track.id);
        disposePlayerConnections(targetDeckState.track.id); 
        playerConnectionsRef.current = null;
      }

      const arrayBuffer = await new Promise<ArrayBuffer>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => {
          if (event.target?.result instanceof ArrayBuffer) {
            resolve(event.target.result);
          } else {
            reject(new Error('Failed to read file as ArrayBuffer.'));
          }
        };
        reader.onerror = (error) => reject(error);
        reader.readAsArrayBuffer(file);
      });

      const newTrack = await loadAudioFile(arrayBuffer, file.name, file.name); 

      if (newTrack.buffer) {
        const newPlayerConnections = createPlayerConnections(newTrack.id, newTrack.buffer);
        playerConnectionsRef.current = newPlayerConnections;

        setTargetDeckState(prevState => ({
          ...prevState,
          track: newTrack,
          isPlaying: false, 
          isLiveInput: false,
          playbackRate: 1,
          meterLevel: -60,
          eq: { ...INITIAL_EQ_SETTINGS }, 
          effects: { x: 1, y: 0, active: false } 
        }));

        setPlayerVolume(newTrack.id, targetDeckState.volume);
        setEQGain(newTrack.id, 'high', INITIAL_EQ_SETTINGS.high);
        setEQGain(newTrack.id, 'mid', INITIAL_EQ_SETTINGS.mid);
        setEQGain(newTrack.id, 'low', INITIAL_EQ_SETTINGS.low);
        updateFluxFX(newTrack.id, 1, 0); 

        // @ts-ignore
        newPlayerConnections.player.on('ended', () => {
          setTargetDeckState(prevState => ({ ...prevState, isPlaying: false }));
        });

        if (newTrack.bpm && newTrack.bpm > 0) {
          if (otherDeckState.track && otherDeckState.isPlaying && otherDeckState.track.bpm && otherDeckState.track.bpm > 0) {
            const newPlaybackRate = newTrack.bpm / otherDeckState.track.bpm;
            setPlaybackRate(otherDeckState.track.id, newPlaybackRate);
            setOtherDeckState(prev => ({ ...prev, playbackRate: newPlaybackRate })); // Update state for Video Sync
          }
        }
      }
    } catch (error) {
      console.error(`Failed to import track file to Deck ${deckId}:`, error);
      alert(`Error importing track: ${(error as Error).message}`);
    } finally {
      setIsLoading(false);
    }
  }, [deckAState, deckBState]);

  const handleLoadTrackFromPath = useCallback(async (deckId: 'A' | 'B', filePath: string) => {
      const setIsLoading = deckId === 'A' ? setIsLoadingDeckA : setIsLoadingDeckB;
      const setTargetDeckState = deckId === 'A' ? setDeckAState : setDeckBState;
      const targetDeckState = deckId === 'A' ? deckAState : deckBState;
      const playerConnectionsRef = deckId === 'A' ? playerAConnectionsRef : playerBConnectionsRef;
      const otherDeckId = deckId === 'A' ? 'B' : 'A';
      const otherDeckState = deckId === 'A' ? deckBState : deckAState;
      const setOtherDeckState = deckId === 'A' ? setDeckBState : setDeckAState;

      setIsLoading(true);
      try {
          await initAudioEngine();

          if (targetDeckState.track?.id && playerConnectionsRef.current) {
              stopTrack(targetDeckState.track.id);
              disposePlayerConnections(targetDeckState.track.id);
              playerConnectionsRef.current = null;
          }
          
          if (!window.electronAPI) {
              throw new Error("Electron API not available.");
          }

          const arrayBuffer = await window.electronAPI.readFileAsArrayBuffer(filePath);
          const fileName = filePath.split(/[\\/]/).pop() || "Unknown";
          const newTrack = await loadAudioFile(arrayBuffer, filePath, fileName);
          // Tag as mobile import automatically
          newTrack.tags = ['Mobile Import'];

          if (newTrack.buffer) {
              const newPlayerConnections = createPlayerConnections(newTrack.id, newTrack.buffer);
              playerConnectionsRef.current = newPlayerConnections;

              setTargetDeckState(prevState => ({
                  ...prevState,
                  track: newTrack,
                  isPlaying: false,
                  isLiveInput: false,
                  playbackRate: 1,
                  meterLevel: -60,
                  eq: { ...INITIAL_EQ_SETTINGS },
                  effects: { x: 1, y: 0, active: false }
              }));

              setPlayerVolume(newTrack.id, targetDeckState.volume);
              setEQGain(newTrack.id, 'high', INITIAL_EQ_SETTINGS.high);
              setEQGain(newTrack.id, 'mid', INITIAL_EQ_SETTINGS.mid);
              setEQGain(newTrack.id, 'low', INITIAL_EQ_SETTINGS.low);
              updateFluxFX(newTrack.id, 1, 0);

              // @ts-ignore
              newPlayerConnections.player.on('ended', () => {
                  setTargetDeckState(prevState => ({ ...prevState, isPlaying: false }));
              });

              if (newTrack.bpm && newTrack.bpm > 0) {
                  if (otherDeckState.track && otherDeckState.isPlaying && otherDeckState.track.bpm && otherDeckState.track.bpm > 0) {
                      const newPlaybackRate = newTrack.bpm / otherDeckState.track.bpm;
                      setPlaybackRate(otherDeckState.track.id, newPlaybackRate);
                      setOtherDeckState(prev => ({ ...prev, playbackRate: newPlaybackRate }));
                  }
              }
          }

      } catch (error) {
          console.error(`Failed to load track from path to Deck ${deckId}:`, error);
          alert(`Error loading track: ${(error as Error).message}`);
      } finally {
          setIsLoading(false);
      }
  }, [deckAState, deckBState]);


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

  const handleEffectUpdate = useCallback((deckId: string, x: number, y: number, active: boolean) => {
    const setTargetDeckState = deckId === 'A' ? setDeckAState : setDeckBState;
    const targetDeckState = deckId === 'A' ? deckAState : deckBState;

    if (!targetDeckState.track) return;

    setTargetDeckState(prevState => ({
        ...prevState,
        effects: { x, y, active }
    }));
    
    updateFluxFX(targetDeckState.track.id, x, y);
  }, [deckAState, deckBState]);

  const handleCueToggle = useCallback((deckId: 'A' | 'B') => {
    const setTargetDeckState = deckId === 'A' ? setDeckAState : setDeckBState;
    setTargetDeckState(prevState => ({ ...prevState, cue: !prevState.cue }));
  }, [deckAState, deckBState]);

  const handleCrossfaderChange = useCallback((position: number) => {
    setCrossfaderPosition(position);
  }, []);

  const handleMasterVolumeChange = useCallback((newVolume: number) => {
    setMasterVolumeState(newVolume);
    setMasterVolume(newVolume);
  }, []);

  const handleDropTrackToDeck = useCallback((deckId: 'A' | 'B', trackId: string) => {
    const trackToLoad = libraryTracks.find(track => track.id === trackId);
    if (trackToLoad) {
      loadTrackIntoDeck(trackToLoad, deckId);
    } else {
      console.warn(`Track with ID ${trackId} not found in library.`);
    }
  }, [libraryTracks, loadTrackIntoDeck]);

  const handleLoadSample = useCallback(async (deckId: 'A' | 'B', slotIndex: number, file: File) => {
    setLoadingSampleStates(prev => ({ ...prev, [`${deckId}-${slotIndex}`]: true }));
    try {
      await initAudioEngine();
      const newSample = await loadSampleFile(file); 
      const setTargetDeckState = deckId === 'A' ? setDeckAState : setDeckBState;

      setTargetDeckState(prevState => {
        const newSamples = [...prevState.samples];
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
      let sampleTrack: Track = track;
      if (!track.buffer) {
        if (!window.electronAPI) {
            throw new Error("Electron API not available.");
        }
        const arrayBuffer = await window.electronAPI.readFileAsArrayBuffer(track.filePath);
        sampleTrack = await loadAudioFile(arrayBuffer, track.filePath, track.name);
      }
      
      const newSample = await loadTrackAsSample(sampleTrack); 
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
    if (sample.isPlaying) {
      setSamplePitch(sample.id, pitch);
    }
  }, [deckAState, deckBState]);

  const handleClearSample = useCallback((deckId: 'A' | 'B', slotIndex: number) => {
    const setTargetDeckState = deckId === 'A' ? setDeckAState : setDeckBState;
    const targetDeckState = deckId === 'A' ? deckAState : deckBState;
    const sampleToClear = targetDeckState.samples[slotIndex];

    if (sampleToClear) {
      stopSample(sampleToClear.id); 
      disposeSample(sampleToClear.id); 
      setTargetDeckState(prevState => {
        const newSamples = [...prevState.samples];
        newSamples[slotIndex] = null;
        return { ...prevState, samples: newSamples };
      });
    }
  }, [deckAState, deckBState]);

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
        } else {
          alert(`Deck ${deckId} sampler is full.`);
          disposeSample(recordedSample.id); 
        }
        return { ...prevState, samples: newSamples };
      });
    }
  }, []);

  const handleStartLoopRoll = useCallback((deckId: string, interval: string) => {
    const targetDeckState = deckId === 'A' ? deckAState : deckBState;
    const setTargetDeckState = deckId === 'A' ? setDeckAState : setDeckBState;

    if (!targetDeckState.track?.id || !targetDeckState.isPlaying) {
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

  const handleSeek = useCallback((deckId: string, time: number) => {
    seekTo(deckId, time);
  }, []);

  // -- Live Input Handler --
  const handleToggleLiveInput = useCallback(async (deckId: string, deviceId?: string) => {
      const targetDeckState = deckId === 'A' ? deckAState : deckBState;
      const setTargetDeckState = deckId === 'A' ? setDeckAState : setDeckBState;
      const playerConnectionsRef = deckId === 'A' ? playerAConnectionsRef : playerBConnectionsRef;
      
      try {
          // If enabling live input
          if (!targetDeckState.isLiveInput) {
             await initAudioEngine();
             
             // If no connections exist (empty deck), create them with placeholder
             if (!playerConnectionsRef.current) {
                 const newConnections = createPlayerConnections(LIVE_INPUT_TRACK.id);
                 playerConnectionsRef.current = newConnections;
                 
                 setTargetDeckState(prev => ({
                    ...prev,
                    track: LIVE_INPUT_TRACK,
                    eq: { ...INITIAL_EQ_SETTINGS },
                    effects: { x: 1, y: 0, active: false }
                 }));
                 // Update volume for new connections
                 setPlayerVolume(LIVE_INPUT_TRACK.id, targetDeckState.volume);
             }

             // Toggle input ON
             const trackId = targetDeckState.track?.id || LIVE_INPUT_TRACK.id;
             await toggleLiveInput(trackId, true, deviceId);
             
             setTargetDeckState(prev => ({ ...prev, isLiveInput: true, isPlaying: false }));
          } 
          // If disabling live input
          else {
              const trackId = targetDeckState.track?.id || LIVE_INPUT_TRACK.id;
              await toggleLiveInput(trackId, false);
              setTargetDeckState(prev => ({ ...prev, isLiveInput: false }));
          }
      } catch (err) {
          console.error("Error toggling live input:", err);
      }
  }, [deckAState, deckBState]);

  const refreshLibrary = useCallback(async () => {
    setIsLibraryLoading(true);
    try {
      if (window.electronAPI) {
        const tracks = await window.electronAPI.getTracks();
        setLibraryTracks(tracks);
        const playlists = await window.electronAPI.getPlaylists();
        setPlaylists(playlists);
      }
    } catch (error) {
      console.error("Failed to refresh library:", error);
    } finally {
      setIsLibraryLoading(false);
    }
  }, []);

  const handleAddTrackToLibrary = useCallback(async (track: Track) => {
    if (window.electronAPI) {
        await window.electronAPI.saveTrack(track);
        refreshLibrary();
    }
  }, [refreshLibrary]);
  
  // -- New Handler for importing via Deck File Transfer --
  const handleImportTrackPathToLibrary = useCallback(async (filePath: string) => {
      try {
          if (!window.electronAPI) throw new Error("Electron API missing");
          const arrayBuffer = await window.electronAPI.readFileAsArrayBuffer(filePath);
          const fileName = filePath.split(/[\\/]/).pop() || "Unknown";
          const newTrack = await loadAudioFile(arrayBuffer, filePath, fileName);
          newTrack.tags = ['Mobile Import', 'Phone Upload'];
          await window.electronAPI.saveTrack(newTrack);
          refreshLibrary();
      } catch (error) {
          console.error("Import failed:", error);
          alert(`Failed to upload: ${(error as Error).message}`);
      }
  }, [refreshLibrary]);


  const handleUpdateTrackInLibrary = useCallback(async (track: Partial<Track>) => {
    if (window.electronAPI) {
        await window.electronAPI.updateTrack(track);
        refreshLibrary();
    }
  }, [refreshLibrary]);

  const handleDeleteTrackFromLibrary = useCallback(async (trackId: string) => {
    if (window.electronAPI) {
        await window.electronAPI.deleteTrack(trackId);
        refreshLibrary();
    }
  }, [refreshLibrary]);

  const handleCreatePlaylist = useCallback(async (name: string) => {
    if (window.electronAPI) {
        await window.electronAPI.createPlaylist(name);
        refreshLibrary();
    }
  }, [refreshLibrary]);

  const handleDeletePlaylist = useCallback(async (playlistId: string) => {
    if (window.electronAPI) {
        await window.electronAPI.deletePlaylist(playlistId);
        refreshLibrary();
    }
  }, [refreshLibrary]);

  const handleAddTrackToPlaylist = useCallback(async (playlistId: string, trackId: string) => {
    if (window.electronAPI) {
        await window.electronAPI.addTrackToPlaylist(playlistId, trackId);
        refreshLibrary();
    }
  }, [refreshLibrary]);

  const handleRemoveTrackFromPlaylist = useCallback(async (playlistId: string, trackId: string) => {
    if (window.electronAPI) {
        await window.electronAPI.removeTrackFromPlaylist(playlistId, trackId);
        refreshLibrary();
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
          onDropTrackToDeck={handleDropTrackToDeck} 
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

        <div className="flex flex-col lg:flex-row gap-8 w-full justify-center max-w-7xl mt-8">
          <Deck
            deckState={deckAState}
            onPlayPause={handlePlayPause}
            onVolumeChange={handleVolumeChange}
            onEQChange={handleEQChange}
            onEffectUpdate={handleEffectUpdate} 
            onCueToggle={handleCueToggle}
            onDropTrack={handleDropTrackToDeck} 
            onImportTrackFromFile={handleImportTrackFromFile} 
            onLoadSample={handleLoadSample}
            onOpenSampleLibrary={handleOpenSampleLibrary} 
            onPlayPauseSample={handlePlayPauseSample}
            onToggleSampleMode={handleToggleSampleMode}
            onSampleVolumeChange={handleSampleVolumeChange}
            onSamplePitchChange={handleSamplePitchChange} 
            onClearSample={handleClearSample}
            onStartRecording={handleStartRecording}
            onStopRecording={handleStopRecording}
            isLoadingSample={isLoadingSample}
            onStartLoopRoll={handleStartLoopRoll}
            onStopLoopRoll={handleStopLoopRoll}
            onSeek={handleSeek}
            onLoadTrackFromPath={handleLoadTrackFromPath}
            onToggleLiveInput={handleToggleLiveInput}
            onImportTrackToLibrary={handleImportTrackPathToLibrary}
          />
          <Deck
            deckState={deckBState}
            onPlayPause={handlePlayPause}
            onVolumeChange={handleVolumeChange}
            onEQChange={handleEQChange}
            onEffectUpdate={handleEffectUpdate} 
            onCueToggle={handleCueToggle}
            onDropTrack={handleDropTrackToDeck} 
            onImportTrackFromFile={handleImportTrackFromFile} 
            onLoadSample={handleLoadSample}
            onOpenSampleLibrary={handleOpenSampleLibrary} 
            onPlayPauseSample={handlePlayPauseSample}
            onToggleSampleMode={handleToggleSampleMode}
            onSampleVolumeChange={handleSampleVolumeChange}
            onSamplePitchChange={handleSamplePitchChange} 
            onClearSample={handleClearSample}
            onStartRecording={handleStartRecording}
            onStopRecording={handleStopRecording}
            isLoadingSample={isLoadingSample}
            onStartLoopRoll={handleStartLoopRoll}
            onStopLoopRoll={handleStopLoopRoll}
            onSeek={handleSeek}
            onLoadTrackFromPath={handleLoadTrackFromPath}
            onToggleLiveInput={handleToggleLiveInput}
            onImportTrackToLibrary={handleImportTrackPathToLibrary}
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
                         [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-blue-500"
              aria-label="Master Volume"
            />
            <VUMeter level={masterMeterLevel} height="60px" width="12px" label="M" />
          </div>
          <Crossfader position={crossfaderPosition} onPositionChange={handleCrossfaderChange} />
        </div>
      </div>
       {/* Chatbot Section */}
       <div className="w-full xl:w-1/3 p-4 bg-gray-800 rounded-lg shadow-xl mb-4 xl:mb-0 xl:ml-4 flex flex-col">
        <Chatbot 
            deckA={deckAState}
            deckB={deckBState}
            libraryTracks={libraryTracks}
        />
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