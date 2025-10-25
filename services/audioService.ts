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
 * Generates waveform peaks and detects BPM.
 * @param arrayBuffer The raw audio data.
 * @param filePath The file system path (used for internal tracking, not for `path.basename` in renderer).
 * @param trackName The name to assign to the track.
 */
export const loadAudioFile = async (arrayBuffer: ArrayBuffer, filePath: string, trackName: string): Promise<Track> => {
  await initAudioEngine(); // Ensure audio context is running

  try {
    const audioContext = Tone.getContext().rawContext as AudioContext;

    // Decode for raw AudioBuffer (for waveform visualization and BPM analysis)
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

    const toneBuffer = new Tone.ToneAudioBuffer(audioBuffer);
    await toneBuffer.load; // Ensure buffer is loaded

    const newTrack: Track = {
      id: crypto.randomUUID(),
      name: trackName, 
      filePath: filePath, // Store full path for loading later
      buffer: toneBuffer,
      audioBuffer: audioBuffer,
      duration: toneBuffer.duration,
      waveformPeaks: getWaveformPeaks(audioBuffer),
      bpm: detectBPM(audioBuffer), // Add BPM detection here
      key: 'Unknown', // Placeholder for key detection (can be manually edited later)
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
    };
    return newTrack;
  } catch (error) {
    console.error('Error decoding audio data:', error);
    throw error;
  }
};

/**
 * Loads an audio file from a File object into a Tone.ToneAudioBuffer for a sample.
 * Note: This version still takes `File` as it's typically for drag-and-drop from browser.
 * For samples loaded from library, `loadAudioFile` and then creating a `Sample` would be better.
 */
export const loadSampleFile = async (file: File): Promise<Sample> => {
  await initAudioEngine(); // Ensure audio context is running

  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = async (event: ProgressEvent<FileReader>) => {
      try {
        if (!event.target?.result) {
          throw new Error('FileReader did not return a result.');
        }

        const arrayBuffer = event.target.result as ArrayBuffer;
        const audioContext = Tone.getContext().rawContext as AudioContext;
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer.slice(0)); // Decode to raw for duration

        const toneBuffer = new Tone.ToneAudioBuffer(audioBuffer);
        await toneBuffer.load;

        const sampleId = crypto.randomUUID();
        audioServiceState.sampleBufferCache.set(sampleId, toneBuffer);

        const newSample: Sample = {
          id: sampleId,
          name: file.name,
          buffer: toneBuffer,
          mode: 'one-shot', // Default mode
          volume: 0.8, // Default volume
          pitch: 0, // Default pitch (0 semitones)
          color: getRandomColor(),
          isPlaying: false, // Initial state
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
 * Assumes the Track's buffer is already loaded.
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
        mode: 'one-shot', // Default mode
        volume: 0.8, // Default volume
        pitch: 0, // Default pitch
        color: getRandomColor(),
        isPlaying: false,
    };
};

/**
 * Creates and returns a Tone.Player with its full signal chain (EQ, Meter, Gain).
 * Manages active players to keep track of them.
 */
export const createPlayerConnections = (trackId: string, buffer: Tone.ToneAudioBuffer): PlayerConnections => {
  if (!audioServiceState.masterGainNode) {
    throw new Error('Audio engine not initialized. Call initAudioEngine first.');
  }

  // Dispose existing connections if any for this track ID
  disposePlayerConnections(trackId);

  const player = new Tone.Player(buffer);
  player.loop = true; // Decks loop by default
  const eq = new Tone.EQ3(0, 0, 0); // Initial flat EQ (low, mid, high gain in dB)
  const meter = new Tone.Meter();
  const outputGain = new Tone.Gain(1); // Initial full linear volume

  // Connect the nodes: Player -> EQ -> Meter -> Output Gain -> Master Gain -> Destination
  player.connect(eq);
  eq.connect(meter);
  meter.connect(outputGain);
  outputGain.connect(audioServiceState.masterGainNode);

  const connections: PlayerConnections = { player, eq, meter, outputGain };
  audioServiceState.activePlayers.set(trackId, connections);
  console.log(`Created player connections for track: ${trackId}`);
  return connections;
};

/**
 * Plays a specified player.
 */
export const playTrack = (trackId: string): void => {
  const connections = audioServiceState.activePlayers.get(trackId);
  if (connections && connections.player.buffer.loaded && connections.player.state !== 'started') {
    connections.player.start();
    console.log(`Playing track: ${trackId}`);
  }
};

/**
 * Pauses a specified player.
 */
export const pauseTrack = (trackId: string): void => {
  const connections = audioServiceState.activePlayers.get(trackId);
  if (connections && connections.player.state === 'started') {
    // Tone.Player does not have a .pause() method directly.
    // .stop() effectively pauses playback for a standalone player, resetting position if not handled.
    // For true pause/resume, the current playback position would need to be stored and used with .start(time, offset).
    connections.player.stop(); 
    console.log(`Paused track: ${trackId}`);
  }
};

/**
 * Stops a specified player and resets its position.
 */
export const stopTrack = (trackId: string): void => {
  const connections = audioServiceState.activePlayers.get(trackId);
  if (connections) {
    connections.player.stop();
    console.log(`Stopped track: ${trackId}`);
  }
};

/**
 * Sets the playback rate for a specified player.
 */
export const setPlaybackRate = (trackId: string, rate: number): void => {
  const connections = audioServiceState.activePlayers.get(trackId);
  if (connections) {
    // @ts-ignore - preservesPitch is a property of Tone.Player but might be missing in some type definitions
    connections.player.playbackRate = rate;
  }
};

/**
 * Toggles key lock (preserves pitch) for a specified player.
 */
export const toggleKeyLock = (trackId: string, enabled: boolean): void => {
  const connections = audioServiceState.activePlayers.get(trackId);
  if (connections) {
    // @ts-ignore - preservesPitch is a property of Tone.Player but might be missing in some type definitions
    connections.player.preservesPitch = enabled;
  }
};

/**
 * Plays a given sample. Creates a new player for each one-shot to allow overlapping.
 */
export const playSample = (sample: Sample): void => {
  if (!sample.buffer.loaded) {
    console.warn(`Sample buffer for ${sample.name} not loaded.`);
    return;
  }

  // Dispose any existing looping player for this sample ID if it exists and is not the current one
  const existingPlayer = audioServiceState.activeSamplePlayers.get(sample.id);
  if (existingPlayer && existingPlayer.state === 'started') {
      if (sample.mode === 'loop') {
          // If already looping, stop and restart to retrigger
          existingPlayer.stop();
          existingPlayer.dispose();
          audioServiceState.activeSamplePlayers.delete(sample.id);
      } else {
          // If one-shot, allow to overlap by creating new player
          // No need to stop existing one-shot
      }
  }


  const player = new Tone.Player(sample.buffer);
  player.volume.value = Tone.gainToDb(sample.volume); // Convert linear volume to dB
  player.playbackRate = Tone.Midi(60 + sample.pitch).toFrequency() / Tone.Midi(60).toFrequency(); // Apply pitch (semitones)

  if (sample.mode === 'loop') {
    player.loop = true;
    player.start();
    audioServiceState.activeSamplePlayers.set(sample.id, player); // Store for stopping later
    console.log(`Looping sample: ${sample.name}`);
  } else {
    player.loop = false;
    player.start();
    // @ts-ignore - 'on' method exists on Tone.Source (which Player extends) but may be missing from types.
    player.on('ended', () => {
      player.dispose();
      audioServiceState.activeSamplePlayers.delete(sample.id);
      console.log(`One-shot sample ${sample.name} finished.`);
    });
    audioServiceState.activeSamplePlayers.set(sample.id, player); // Temporarily store for UI state if needed
    console.log(`Playing one-shot sample: ${sample.name}`);
  }
};

/**
 * Stops a currently playing looping sample.
 */
export const stopSample = (sampleId: string): void => {
  const player = audioServiceState.activeSamplePlayers.get(sampleId);
  if (player && player.state === 'started') {
    player.stop();
    player.dispose();
    audioServiceState.activeSamplePlayers.delete(sampleId);
    console.log(`Stopped sample: ${sampleId}`);
  }
};

/**
 * Sets the linear volume (0-1) for a specified player's output gain.
 */
export const setPlayerVolume = (trackId: string, volume: number): void => {
  const connections = audioServiceState.activePlayers.get(trackId);
  if (connections) {
    // Tone.js Gain node expects linear values for .gain.value (0 to 1)
    connections.outputGain.gain.value = volume;
  }
};

/**
 * Sets the volume for a currently playing sample.
 */
export const setSampleVolume = (sampleId: string, volume: number): void => {
  const player = audioServiceState.activeSamplePlayers.get(sampleId);
  if (player) {
    player.volume.value = Tone.gainToDb(volume);
  }
};

/**
 * Sets the pitch for a currently playing sample.
 * @param sampleId The ID of the sample.
 * @param pitch The pitch in semitones (e.g., -12 to +12).
 */
export const setSamplePitch = (sampleId: string, pitch: number): void => {
  const player = audioServiceState.activeSamplePlayers.get(sampleId);
  if (player) {
    // Convert semitones to playbackRate. 0 semitones = 1x rate.
    // Each semitone changes frequency by 2^(1/12). So N semitones = 2^(N/12).
    player.playbackRate = Tone.Midi(60 + pitch).toFrequency() / Tone.Midi(60).toFrequency();
  }
};


/**
 * Sets the master output volume (0-1 linear).
 */
export const setMasterVolume = (volume: number): void => {
  if (audioServiceState.masterGainNode) {
    audioServiceState.masterGainNode.gain.value = volume;
  }
};


/**
 * Sets the gain for a specific EQ band on a player.
 * @param trackId The ID of the track.
 * @param band Which EQ band ('low', 'mid', 'high').
 * @param gain The gain value in dB (e.g., -12 to 12).
 */
export const setEQGain = (trackId: string, band: 'low' | 'mid' | 'high', gain: number): void => {
  const connections = audioServiceState.activePlayers.get(trackId);
  if (connections) {
    connections.eq[band].value = gain;
  }
};

/**
 * Returns the current VU meter level for a track in dB.
 * @param trackId The ID of the track.
 * @returns The meter level in dB, or -Infinity if player not found.
 */
export const getMeterLevel = (trackId: string): number => {
  const connections = audioServiceState.activePlayers.get(trackId);
  return connections?.meter.getValue() as number || -Infinity;
};

/**
 * Returns the current playback time for a track in seconds.
 */
export const getPlayerCurrentTime = (trackId: string): number => {
    const connections = audioServiceState.activePlayers.get(trackId);
    if (connections && connections.player.state === 'started') {
        // Tone.Player.currentTime provides the current playback position in seconds within the buffer.
        // @ts-ignore - Property 'currentTime' does not exist on type 'Player'.
        return connections.player.currentTime;
    }
    // Return 0 if not playing or buffer not loaded, otherwise total duration for a loaded but stopped track.
    return connections?.player.buffer.loaded ? connections.player.buffer.duration : 0;
};


/**
 * Cleans up all Tone.js nodes associated with a player and removes it from active players.
 */
export const disposePlayerConnections = (trackId: string): void => {
  const connections = audioServiceState.activePlayers.get(trackId);
  if (connections) {
    connections.player.dispose();
    connections.eq.dispose();
    connections.meter.dispose();
    connections.outputGain.dispose();
    audioServiceState.activePlayers.delete(trackId);
    console.log(`Disposed all nodes for track: ${trackId}`);
  }
};

/**
 * Cleans up all Tone.js nodes for a sample.
 * This is primarily for buffer cleanup if needed, but the players are disposed on their own.
 */
export const disposeSample = (sampleId: string): void => {
    // Stop any active player first
    stopSample(sampleId);
    // Remove buffer from cache if no longer used elsewhere (simple approach for now)
    audioServiceState.sampleBufferCache.delete(sampleId);
    console.log(`Disposed sample buffer for: ${sampleId}`);
}

/**
 * Starts recording audio from a specific deck.
 * @param deckId 'A' or 'B'
 */
export const startRecordingDeck = (deckId: string): void => {
  const connections = audioServiceState.activePlayers.get(deckId);
  if (!connections) {
    console.warn(`Cannot start recording: Deck ${deckId} player not found.`);
    return;
  }

  // Dispose any previous recorder for this deck
  if (audioServiceState.deckRecorders.has(deckId)) {
      audioServiceState.deckRecorders.get(deckId)?.dispose();
      audioServiceState.deckRecorders.delete(deckId);
  }

  const recorder = new Tone.Recorder();
  // Connect recorder to the deck's output gain
  connections.outputGain.connect(recorder);
  audioServiceState.deckRecorders.set(deckId, recorder);
  recorder.start();
  console.log(`Started recording on Deck ${deckId}`);
};

/**
 * Stops recording from a specific deck and returns the recorded audio as a Sample object.
 * @param deckId 'A' or 'B'
 * @returns A Promise that resolves with the new Sample object, or null if recording failed/was empty.
 */
export const stopRecordingDeck = async (deckId: string): Promise<Sample | null> => {
  const recorder = audioServiceState.deckRecorders.get(deckId);
  if (!recorder) {
    console.warn(`No active recorder for Deck ${deckId}.`);
    return null;
  }

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

  console.log(`Stopped recording on Deck ${deckId}. Blob size: ${recordingBlob.size}`);

  if (recordingBlob.size === 0) {
    console.warn('Recorded blob is empty, possibly no audio was playing.');
    return null;
  }

  try {
    const arrayBuffer = await recordingBlob.arrayBuffer();
    const audioContext = Tone.getContext().rawContext as AudioContext;
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer.slice(0)); // Raw AudioBuffer

    const newBuffer = new Tone.ToneAudioBuffer(audioBuffer);
    await newBuffer.load;

    const sampleId = crypto.randomUUID();
    audioServiceState.sampleBufferCache.set(sampleId, newBuffer);

    return {
      id: sampleId,
      name: `Rec ${new Date().toLocaleTimeString()}`, // Generic name
      buffer: newBuffer,
      mode: 'one-shot',
      volume: 0.8,
      pitch: 0, // Default pitch for recorded samples
      color: getRandomColor(),
      isPlaying: false,
    };
  } catch (error) {
    console.error('Error processing recorded audio:', error);
    return null;
  }
};

/**
 * Starts a temporary, beat-synchronized loop roll on a specified track.
 * @param trackId The ID of the track.
 * @param interval The loop interval (e.g., '1/4', '1/2', '1', '2' beats).
 */
export const startLoopRoll = (trackId: string, interval: string): void => {
    const connections = audioServiceState.activePlayers.get(trackId);
    if (!connections || connections.player.state !== 'started') {
        console.warn(`Cannot start loop roll: Deck ${trackId} player is not playing.`);
        return;
    }

    // Stop any existing loop roll for this deck
    stopLoopRoll(trackId);

    // Save the current playback position for snapping back
    // @ts-ignore - Property 'currentTime' does not exist on type 'Player'.
    const originalPosition = connections.player.currentTime;
    audioServiceState.loopRollOriginalPositions.set(trackId, originalPosition);

    // Mute the main player while the loop roll is active
    connections.player.volume.value = -Infinity; // Mute

    // Schedule the loop roll
    // Play a segment from the nearest beat quantize
    const startTime = Tone.Transport.nextSubdivision(interval); 
    
    // Create a new temporary player for the loop roll
    const loopPlayer = new Tone.Player(connections.player.buffer);
    loopPlayer.loop = true;
    loopPlayer.loopStart = originalPosition; // Start the loop from here
    // Calculate loopEnd by adding interval (e.g., '1/4n') to originalPosition
    // Fix: Convert interval string to seconds before adding to originalPosition
    const loopEnd = originalPosition + Tone.Time(interval).toSeconds();
    loopPlayer.loopEnd = loopEnd;

    loopPlayer.volume.value = connections.player.volume.value; // Match player volume
    loopPlayer.connect(connections.outputGain); // Connect to the deck's output chain

    // Schedule the loop roll to start and repeat
    const eventId = Tone.Transport.scheduleRepeat((time) => {
        loopPlayer.start(time, originalPosition); // Start from original position, quantized
    }, interval, startTime);
    
    audioServiceState.loopRollTransportEvents.set(trackId, eventId);
    console.log(`Started loop roll on Deck ${trackId} for ${interval} beats.`);
};

/**
 * Stops an active loop roll and resumes main track playback.
 * @param trackId The ID of the track.
 */
export const stopLoopRoll = (trackId: string): void => {
    const eventId = audioServiceState.loopRollTransportEvents.get(trackId);
    const originalPosition = audioServiceState.loopRollOriginalPositions.get(trackId);
    const connections = audioServiceState.activePlayers.get(trackId);

    if (eventId !== undefined) {
        Tone.Transport.clear(eventId);
        audioServiceState.loopRollTransportEvents.delete(trackId);
        console.log(`Stopped loop roll transport event for Deck ${trackId}.`);
    }

    if (connections) {
        // Any temporary loop players created by `startLoopRoll` will stop being triggered
        // by Tone.Transport once their event is cleared. No explicit `loopPlayer.stop()` here
        // as they are typically short-lived and restarted by the scheduled event.

        // Restore main player volume (from original value, not just outputGain current value which might be crossfaded)
        // Note: connections.player.volume.value is the direct player volume, outputGain.gain.value is after crossfader.
        // For loop roll, we mute the player's direct volume, so restore that.
        // Need to store original player volume when starting loop roll for perfect restore.
        // For simplicity, restore to default/expected volume based on deckState.volume
        connections.player.volume.value = Tone.gainToDb(connections.outputGain.gain.value); // Restore player volume

        // Seek the main player back to the correct position as if it continued playing
        if (originalPosition !== undefined) {
            connections.player.stop(); // Stop current playback (if still running or a stutter occurred)
            connections.player.start(0, originalPosition); // Restart from original position
            console.log(`Resumed Deck ${trackId} from original position ${originalPosition}.`);
        }
    }
    audioServiceState.loopRollOriginalPositions.delete(trackId);
};


/**
 * Generates an array of normalized peak values for waveform visualization.
 * @param audioBuffer The AudioBuffer to analyze.
 * @returns An array of numbers (0-1) representing the waveform peaks.
 */
export const getWaveformPeaks = (audioBuffer: AudioBuffer): number[] => {
  const channelData = audioBuffer.getChannelData(0); // Use the first channel
  const samplesPerPixel = Math.floor(channelData.length / 500); // Target 500 points for display
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

/**
 * Basic BPM detection using autocorrelation.
 * This is a rudimentary algorithm and may not be highly accurate.
 * More advanced techniques use FFT and onset detection.
 */
export const detectBPM = (audioBuffer: AudioBuffer): number => {
  const sampleRate = audioBuffer.sampleRate;
  const channelData = audioBuffer.getChannelData(0);
  const bufferSize = channelData.length;

  // Analyze a segment to save computation, e.g., first 30 seconds
  const analysisDuration = Math.min(audioBuffer.duration, 30);
  const analysisSamples = Math.floor(analysisDuration * sampleRate);

  const MIN_BPM = 60;
  const MAX_BPM = 200;
  const MIN_PERIOD_SAMPLES = Math.floor(sampleRate * 60 / MAX_BPM); // Samples per beat at max BPM
  const MAX_PERIOD_SAMPLES = Math.floor(sampleRate * 60 / MIN_BPM); // Samples per beat at min BPM

  const correlations: number[] = new Array(MAX_PERIOD_SAMPLES).fill(0);

  // Compute autocorrelation
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

  if (bestPeriod === 0) return 120; // Default if no clear peak

  const bpm = 60 * sampleRate / bestPeriod;
  return Math.round(bpm);
};


// Helper for random color for samples and tracks
export const getRandomColor = () => {
    const colors = ['#EF4444', '#F97316', '#EAB308', '#22C55E', '#0EA5E9', '#6366F1', '#EC4899', '#8B5CF6'];
    return colors[Math.floor(Math.random() * colors.length)];
};