
import * as Tone from 'tone';
import { Track, PlayerConnections, Sample } from '../types';

interface AudioServiceState {
  isInitialized: boolean;
  activePlayers: Map<string, PlayerConnections>;
  masterGainNode: Tone.Gain | null;
  sampleBufferCache: Map<string, Tone.ToneAudioBuffer>; // Stores loaded sample buffers
  activeSamplePlayers: Map<string, Tone.Player>; // Stores currently playing Tone.Players for samples (by Sample.id)
  deckRecorders: Map<string, Tone.Recorder>; // Stores active recorders for each deck ('A', 'B')
  loopRollTransportEvents: Map<string, number>; // Stores Tone.Transport event IDs for loop rolls
  loopRollOriginalPositions: Map<string, number>; // Stores original player positions before loop roll
}

const audioServiceState: AudioServiceState = {
  isInitialized: false,
  activePlayers: new Map(),
  masterGainNode: null,
  sampleBufferCache: new Map(),
  activeSamplePlayers: new Map(),
  deckRecorders: new Map(),
  loopRollTransportEvents: new Map(),
  loopRollOriginalPositions: new Map(),
};

/**
 * Initializes the Tone.js audio engine and master gain node.
 * Must be called on user interaction to start the AudioContext.
 */
export const initAudioEngine = async (): Promise<void> => {
  if (!audioServiceState.isInitialized) {
    try {
      await Tone.start();
      audioServiceState.masterGainNode = new Tone.Gain(1).toDestination(); // Master gain to destination
      Tone.Transport.start(); // Start the transport for beat-synchronized effects and loops
      console.log('Tone.js audio engine initialized. Master gain node and transport started.');
      audioServiceState.isInitialized = true;
    } catch (error) {
      console.error('Failed to initialize Tone.js audio engine:', error);
      throw error;
    }
  }
};

/**
 * Loads an audio file from an ArrayBuffer into a Tone.ToneAudioBuffer and AudioBuffer.
 * Generates waveform peaks and detects BPM. Also handles video blobs if extension matches.
 * @param arrayBuffer The raw audio data.
 * @param filePath The file system path.
 * @param trackName The name to assign to the track.
 */
export const loadAudioFile = async (arrayBuffer: ArrayBuffer, filePath: string, trackName: string): Promise<Track> => {
  await initAudioEngine(); // Ensure audio context is running

  try {
    const audioContext = Tone.getContext().rawContext as AudioContext;

    // Decode for raw AudioBuffer (for waveform visualization and BPM analysis)
    // Note: decodeAudioData works for the audio track of video files too.
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer.slice(0)); 

    const toneBuffer = new Tone.ToneAudioBuffer(audioBuffer);
    await toneBuffer.load; // Ensure buffer is loaded

    // Check for video extension
    const isVideo = /\.(mp4|webm|mkv|mov)$/i.test(filePath);
    let videoUrl: string | undefined;

    if (isVideo) {
        // Create a Blob for the video element to play
        // We need to map extension to mime type roughly
        let mimeType = 'video/mp4';
        if (filePath.endsWith('.webm')) mimeType = 'video/webm';
        if (filePath.endsWith('.mkv')) mimeType = 'video/x-matroska';
        if (filePath.endsWith('.mov')) mimeType = 'video/quicktime';
        
        // We use the original array buffer (not the sliced one if slice was destructive, but here we sliced copy)
        // Actually decodeAudioData detaches the buffer in some implementations, so we sliced it.
        // We need the original data for the blob.
        const blob = new Blob([arrayBuffer], { type: mimeType });
        videoUrl = URL.createObjectURL(blob);
    }

    const newTrack: Track = {
      id: crypto.randomUUID(),
      name: trackName, 
      filePath: filePath, 
      buffer: toneBuffer,
      audioBuffer: audioBuffer,
      duration: toneBuffer.duration,
      waveformPeaks: getWaveformPeaks(audioBuffer),
      bpm: detectBPM(audioBuffer), 
      key: 'Unknown', 
      artist: 'Unknown Artist',
      album: 'Unknown Album',
      genre: 'Unknown',
      year: new Date().getFullYear(),
      rating: 0,
      color: getRandomColor(),
      lastPlayed: 0,
      dateAdded: Date.now(),
      tags: [],
      comments: '',
      isVideo,
      videoUrl
    };
    return newTrack;
  } catch (error) {
    console.error('Error decoding audio data:', error);
    throw error;
  }
};

/**
 * Loads an audio file from a File object into a Tone.ToneAudioBuffer for a sample.
 */
export const loadSampleFile = async (file: File): Promise<Sample> => {
  await initAudioEngine(); 

  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = async (event: ProgressEvent<FileReader>) => {
      try {
        if (!event.target?.result) {
          throw new Error('FileReader did not return a result.');
        }

        const arrayBuffer = event.target.result as ArrayBuffer;
        const audioContext = Tone.getContext().rawContext as AudioContext;
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer.slice(0)); 

        const toneBuffer = new Tone.ToneAudioBuffer(audioBuffer);
        await toneBuffer.load;

        const sampleId = crypto.randomUUID();
        audioServiceState.sampleBufferCache.set(sampleId, toneBuffer);

        const newSample: Sample = {
          id: sampleId,
          name: file.name,
          buffer: toneBuffer,
          mode: 'one-shot', 
          volume: 0.8, 
          pitch: 0, 
          color: getRandomColor(),
          isPlaying: false, 
        };
        resolve(newSample);
      } catch (error) {
        console.error('Error loading sample file:', error);
        reject(error);
      }
    };

    reader.onerror = (error) => {
      console.error('FileReader error for sample:', error);
      reject(error);
    };

    reader.readAsArrayBuffer(file);
  });
};

/**
 * Creates a Sample object from an existing Track.
 */
export const loadTrackAsSample = async (track: Track): Promise<Sample> => {
    if (!track.buffer?.loaded) {
        throw new Error(`Track buffer for ${track.name} not loaded. Cannot create sample.`);
    }
    await initAudioEngine();

    const sampleId = crypto.randomUUID();
    audioServiceState.sampleBufferCache.set(sampleId, track.buffer);

    return {
        id: sampleId,
        name: track.name,
        buffer: track.buffer,
        mode: 'one-shot', 
        volume: 0.8, 
        pitch: 0, 
        color: getRandomColor(),
        isPlaying: false,
    };
};

/**
 * Creates and returns a Tone.Player with its full signal chain (EQ, Effects, Meter, Gain).
 */
export const createPlayerConnections = (trackId: string, buffer?: Tone.ToneAudioBuffer): PlayerConnections => {
  if (!audioServiceState.masterGainNode) {
    throw new Error('Audio engine not initialized. Call initAudioEngine first.');
  }

  // Dispose existing connections if any for this track ID
  disposePlayerConnections(trackId);

  // Initialize Player (buffer is optional now to support Live Input on empty deck)
  const player = new Tone.Player(buffer);
  player.loop = true; // Decks loop by default
  
  // Initialize Live Input Node
  const userMedia = new Tone.UserMedia();

  const eq = new Tone.EQ3(0, 0, 0); 
  
  // -- Flux FX Chain --
  // Filter: Lowpass, frequency controlled by X. Init at 20kHz (open).
  const filter = new Tone.Filter(20000, "lowpass");
  filter.Q.value = 1;

  // Reverb: Decay 2s, wet controlled by Y. Init at 0 (dry).
  const reverb = new Tone.Reverb({ decay: 2, preDelay: 0.01 });
  reverb.wet.value = 0; 

  const meter = new Tone.Meter();
  const outputGain = new Tone.Gain(1); 

  // Connect the nodes: Player -> EQ -> Filter -> Reverb -> Meter -> Output Gain -> Master Gain
  // Note: userMedia is NOT connected by default. It gets connected in toggleLiveInput.
  player.chain(eq, filter, reverb, meter, outputGain, audioServiceState.masterGainNode);

  const connections: PlayerConnections = { player, userMedia, eq, filter, reverb, meter, outputGain };
  audioServiceState.activePlayers.set(trackId, connections);
  console.log(`Created player connections for track: ${trackId} with Flux FX`);
  return connections;
};

/**
 * Gets a list of available audio input devices (microphones, line-ins).
 */
export const getAvailableAudioInputs = async (): Promise<MediaDeviceInfo[]> => {
    await initAudioEngine();
    // Enumerate devices. Filtering for 'audioinput' is handled by the browser/Tone.js usually,
    // but enumerateDevices returns all. We filter in component or here.
    const devices = await Tone.UserMedia.enumerateDevices();
    return devices.filter(d => d.kind === 'audioinput');
};

/**
 * Toggles the input source between the File Player and Live Input (Microphone/Line-in).
 */
export const toggleLiveInput = async (trackId: string, enable: boolean, deviceId?: string): Promise<void> => {
    const connections = audioServiceState.activePlayers.get(trackId);
    if (!connections) return;

    if (enable) {
        // Switch to Live Input
        try {
            console.log(`Enabling Live Input for deck ${trackId} using device: ${deviceId || 'Default'}`);
            // Disconnect player from the EQ (start of shared chain)
            connections.player.disconnect(connections.eq);
            
            // Fix: Check if already open and close to avoid conflicts
            if (connections.userMedia.state === 'started') {
                 connections.userMedia.close();
            }

            // Open Microphone / Line In with specific device ID if provided
            // Note: If deviceId is undefined, Tone uses the system default.
            await connections.userMedia.open(deviceId);
            
            // Connect UserMedia to the EQ
            connections.userMedia.connect(connections.eq);
        } catch (e) {
            console.error("Failed to open live input:", e);
            alert("Could not access audio input. Please check permissions and device connection.");
            throw e;
        }
    } else {
        // Switch back to Player
        console.log(`Disabling Live Input for deck ${trackId}`);
        connections.userMedia.close();
        // Reconnect player to EQ
        connections.player.connect(connections.eq);
    }
};

/**
 * Updates the Flux FX (Filter & Reverb) based on XY pad coordinates.
 * @param trackId The deck/track ID
 * @param x 0.0 to 1.0 (Controls Filter Frequency)
 * @param y 0.0 to 1.0 (Controls Reverb Mix and Filter Resonance)
 */
export const updateFluxFX = (trackId: string, x: number, y: number): void => {
  const connections = audioServiceState.activePlayers.get(trackId);
  if (connections) {
    // X-Axis: Filter Frequency
    // Map 0-1 exponentially to 100Hz - 20000Hz
    const minFreq = 100;
    const maxFreq = 20000;
    const frequency = minFreq * Math.pow(maxFreq / minFreq, x);
    connections.filter.frequency.rampTo(frequency, 0.1);

    // Y-Axis: Reverb Wet/Dry AND Filter Resonance
    // Reverb Mix: 0 to 0.5
    connections.reverb.wet.rampTo(y * 0.5, 0.1);
    
    // Filter Resonance (Q): 0 to 20
    // Higher Q creates the "Flux" squelch
    connections.filter.Q.value = 1 + (y * 19);
  }
};


export const playTrack = (trackId: string): void => {
  const connections = audioServiceState.activePlayers.get(trackId);
  if (connections && connections.player.buffer.loaded && connections.player.state !== 'started') {
    connections.player.start();
    console.log(`Playing track: ${trackId}`);
  }
};

export const pauseTrack = (trackId: string): void => {
  const connections = audioServiceState.activePlayers.get(trackId);
  if (connections && connections.player.state === 'started') {
    connections.player.stop(); 
    console.log(`Paused track: ${trackId}`);
  }
};

export const stopTrack = (trackId: string): void => {
  const connections = audioServiceState.activePlayers.get(trackId);
  if (connections) {
    connections.player.stop();
    console.log(`Stopped track: ${trackId}`);
  }
};

export const seekTo = (trackId: string, time: number): void => {
  const connections = audioServiceState.activePlayers.get(trackId);
  if (connections && connections.player.buffer.loaded) {
      connections.player.seek(time);
  }
};

export const setPlaybackRate = (trackId: string, rate: number): void => {
  const connections = audioServiceState.activePlayers.get(trackId);
  if (connections) {
    // @ts-ignore
    connections.player.playbackRate = rate;
  }
};

export const toggleKeyLock = (trackId: string, enabled: boolean): void => {
  const connections = audioServiceState.activePlayers.get(trackId);
  if (connections) {
    // @ts-ignore
    connections.player.preservesPitch = enabled;
  }
};

export const playSample = (sample: Sample): void => {
  if (!sample.buffer.loaded) {
    console.warn(`Sample buffer for ${sample.name} not loaded.`);
    return;
  }

  const existingPlayer = audioServiceState.activeSamplePlayers.get(sample.id);
  if (existingPlayer && existingPlayer.state === 'started') {
      if (sample.mode === 'loop') {
          existingPlayer.stop();
          existingPlayer.dispose();
          audioServiceState.activeSamplePlayers.delete(sample.id);
      } 
  }

  const player = new Tone.Player(sample.buffer);
  player.volume.value = Tone.gainToDb(sample.volume); 
  player.playbackRate = Tone.Midi(60 + sample.pitch).toFrequency() / Tone.Midi(60).toFrequency(); 

  if (sample.mode === 'loop') {
    player.loop = true;
    player.start();
    audioServiceState.activeSamplePlayers.set(sample.id, player); 
  } else {
    player.loop = false;
    player.start();
    // @ts-ignore
    player.on('ended', () => {
      player.dispose();
      audioServiceState.activeSamplePlayers.delete(sample.id);
    });
    audioServiceState.activeSamplePlayers.set(sample.id, player); 
  }
};

export const stopSample = (sampleId: string): void => {
  const player = audioServiceState.activeSamplePlayers.get(sampleId);
  if (player && player.state === 'started') {
    player.stop();
    player.dispose();
    audioServiceState.activeSamplePlayers.delete(sampleId);
  }
};

export const setPlayerVolume = (trackId: string, volume: number): void => {
  const connections = audioServiceState.activePlayers.get(trackId);
  if (connections) {
    connections.outputGain.gain.value = volume;
  }
};

export const setSampleVolume = (sampleId: string, volume: number): void => {
  const player = audioServiceState.activeSamplePlayers.get(sampleId);
  if (player) {
    player.volume.value = Tone.gainToDb(volume);
  }
};

export const setSamplePitch = (sampleId: string, pitch: number): void => {
  const player = audioServiceState.activeSamplePlayers.get(sampleId);
  if (player) {
    player.playbackRate = Tone.Midi(60 + pitch).toFrequency() / Tone.Midi(60).toFrequency();
  }
};

export const setMasterVolume = (volume: number): void => {
  if (audioServiceState.masterGainNode) {
    audioServiceState.masterGainNode.gain.value = volume;
  }
};

export const setEQGain = (trackId: string, band: 'low' | 'mid' | 'high', gain: number): void => {
  const connections = audioServiceState.activePlayers.get(trackId);
  if (connections) {
    connections.eq[band].value = gain;
  }
};

export const getMeterLevel = (trackId: string): number => {
  const connections = audioServiceState.activePlayers.get(trackId);
  return connections?.meter.getValue() as number || -Infinity;
};

export const getPlayerCurrentTime = (trackId: string): number => {
    const connections = audioServiceState.activePlayers.get(trackId);
    if (connections && connections.player.state === 'started') {
        // @ts-ignore
        return connections.player.currentTime;
    }
    return connections?.player.buffer.loaded ? connections.player.buffer.duration : 0;
};

export const disposePlayerConnections = (trackId: string): void => {
  const connections = audioServiceState.activePlayers.get(trackId);
  if (connections) {
    connections.player.dispose();
    connections.userMedia.dispose(); // Dispose live input node
    connections.eq.dispose();
    connections.filter.dispose(); 
    connections.reverb.dispose(); 
    connections.meter.dispose();
    connections.outputGain.dispose();
    audioServiceState.activePlayers.delete(trackId);
    console.log(`Disposed all nodes for track: ${trackId}`);
  }
};

export const disposeSample = (sampleId: string): void => {
    stopSample(sampleId);
    audioServiceState.sampleBufferCache.delete(sampleId);
}

export const startRecordingDeck = (deckId: string): void => {
  const connections = audioServiceState.activePlayers.get(deckId);
  if (!connections) return;

  if (audioServiceState.deckRecorders.has(deckId)) {
      audioServiceState.deckRecorders.get(deckId)?.dispose();
      audioServiceState.deckRecorders.delete(deckId);
  }

  const recorder = new Tone.Recorder();
  connections.outputGain.connect(recorder);
  audioServiceState.deckRecorders.set(deckId, recorder);
  recorder.start();
};

export const stopRecordingDeck = async (deckId: string): Promise<Sample | null> => {
  const recorder = audioServiceState.deckRecorders.get(deckId);
  if (!recorder) return null;

  let recordingBlob: Blob;
  try {
    recordingBlob = await recorder.stop();
  } catch (error) {
    console.error('Error stopping recorder:', error);
    return null;
  } finally {
    recorder.dispose();
    audioServiceState.deckRecorders.delete(deckId);
  }

  if (recordingBlob.size === 0) return null;

  try {
    const arrayBuffer = await recordingBlob.arrayBuffer();
    const audioContext = Tone.getContext().rawContext as AudioContext;
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer.slice(0)); 

    const newBuffer = new Tone.ToneAudioBuffer(audioBuffer);
    await newBuffer.load;

    const sampleId = crypto.randomUUID();
    audioServiceState.sampleBufferCache.set(sampleId, newBuffer);

    return {
      id: sampleId,
      name: `Rec ${new Date().toLocaleTimeString()}`, 
      buffer: newBuffer,
      mode: 'one-shot',
      volume: 0.8,
      pitch: 0, 
      color: getRandomColor(),
      isPlaying: false,
    };
  } catch (error) {
    console.error('Error processing recorded audio:', error);
    return null;
  }
};

export const startLoopRoll = (trackId: string, interval: string): void => {
    const connections = audioServiceState.activePlayers.get(trackId);
    if (!connections || connections.player.state !== 'started') return;

    stopLoopRoll(trackId);

    // @ts-ignore
    const originalPosition = connections.player.currentTime;
    audioServiceState.loopRollOriginalPositions.set(trackId, originalPosition);

    connections.player.volume.value = -Infinity; // Mute main

    const startTime = Tone.Transport.nextSubdivision(interval); 
    
    const loopPlayer = new Tone.Player(connections.player.buffer);
    loopPlayer.loop = true;
    loopPlayer.loopStart = originalPosition; 
    const loopEnd = originalPosition + Tone.Time(interval).toSeconds();
    loopPlayer.loopEnd = loopEnd;

    loopPlayer.volume.value = connections.player.volume.value; 
    // Important: Connect loop player to Flux FX chain
    loopPlayer.chain(connections.eq, connections.filter, connections.reverb, connections.meter, connections.outputGain, audioServiceState.masterGainNode);

    const eventId = Tone.Transport.scheduleRepeat((time) => {
        loopPlayer.start(time, originalPosition); 
    }, interval, startTime);
    
    audioServiceState.loopRollTransportEvents.set(trackId, eventId);
};

export const stopLoopRoll = (trackId: string): void => {
    const eventId = audioServiceState.loopRollTransportEvents.get(trackId);
    const originalPosition = audioServiceState.loopRollOriginalPositions.get(trackId);
    const connections = audioServiceState.activePlayers.get(trackId);

    if (eventId !== undefined) {
        Tone.Transport.clear(eventId);
        audioServiceState.loopRollTransportEvents.delete(trackId);
    }

    if (connections) {
        connections.player.volume.value = Tone.gainToDb(connections.outputGain.gain.value); 

        if (originalPosition !== undefined) {
            connections.player.stop(); 
            connections.player.start(0, originalPosition); 
        }
    }
    audioServiceState.loopRollOriginalPositions.delete(trackId);
};

export const getWaveformPeaks = (audioBuffer: AudioBuffer): number[] => {
  const channelData = audioBuffer.getChannelData(0); 
  const samplesPerPixel = Math.floor(channelData.length / 500); 
  const peaks: number[] = [];

  for (let i = 0; i < 500; i++) {
    const start = i * samplesPerPixel;
    const end = Math.min(start + samplesPerPixel, channelData.length);
    let max = 0;
    for (let j = start; j < end; j++) {
      const sample = Math.abs(channelData[j]);
      if (sample > max) {
        max = sample;
      }
    }
    peaks.push(max);
  }
  return peaks;
};

export const detectBPM = (audioBuffer: AudioBuffer): number => {
  // Simplified BPM detection
  const sampleRate = audioBuffer.sampleRate;
  const channelData = audioBuffer.getChannelData(0);
  const analysisDuration = Math.min(audioBuffer.duration, 30);
  const analysisSamples = Math.floor(analysisDuration * sampleRate);

  const MIN_BPM = 60;
  const MAX_BPM = 200;
  const MIN_PERIOD_SAMPLES = Math.floor(sampleRate * 60 / MAX_BPM); 
  const MAX_PERIOD_SAMPLES = Math.floor(sampleRate * 60 / MIN_BPM); 

  const correlations: number[] = new Array(MAX_PERIOD_SAMPLES).fill(0);

  for (let lag = MIN_PERIOD_SAMPLES; lag < MAX_PERIOD_SAMPLES; lag++) {
    for (let i = 0; i < analysisSamples - lag; i++) {
      correlations[lag] += channelData[i] * channelData[i + lag];
    }
  }

  let maxCorrelation = -Infinity;
  let bestPeriod = 0;
  for (let i = MIN_BPM; i < MAX_PERIOD_SAMPLES; i++) {
    if (correlations[i] > maxCorrelation) {
      maxCorrelation = correlations[i];
      bestPeriod = i;
    }
  }

  if (bestPeriod === 0) return 120; 

  const bpm = 60 * sampleRate / bestPeriod;
  return Math.round(bpm);
};

export const getRandomColor = () => {
    const colors = ['#EF4444', '#F97316', '#EAB308', '#22C55E', '#0EA5E9', '#6366F1', '#EC4899', '#8B5CF6'];
    return colors[Math.floor(Math.random() * colors.length)];
};
