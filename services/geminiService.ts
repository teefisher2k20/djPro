import { GoogleGenAI, Chat, GenerateContentResponse } from "@google/genai";
import { ChatMessage, Track } from "../types";

// Assume process.env.API_KEY is available in the Electron environment
// This will be injected by the Electron main process or by a build tool
const API_KEY = process.env.API_KEY; 

let ai: GoogleGenAI | null = null;
let chat: Chat | null = null;
let currentChatHistory: ChatMessage[] = []; // Internal history for the session

/**
 * Initializes the GoogleGenAI client and creates a chat session.
 * This should be called once, typically when the Chatbot component mounts.
 */
export const initChat = (): void => {
  if (!API_KEY) {
    console.error("Gemini API Key is not configured. Chatbot will not function.");
    return;
  }
  if (!ai) {
    ai = new GoogleGenAI({ apiKey: API_KEY });
  }
  if (!chat) {
    // Using gemini-2.5-flash for real-time conversational responses as requested.
    chat = ai.chats.create({
      model: 'gemini-2.5-flash',
      config: {
        // You can add system instructions here if needed for specific chatbot personality
        systemInstruction: 'You are a professional DJ mentor and AI mixing assistant. You are concise, cool, and technically accurate.',
      },
    });
    console.log("Gemini chat session initialized.");
  }
};

/**
 * Sends a message to the Gemini model and handles the streaming response.
 * @param userMessage The message from the user.
 * @param onChunk Callback for each streamed text chunk.
 * @param onComplete Callback when the streaming is complete, providing the full response.
 * @param onError Callback for any errors during the process.
 */
export const sendMessageToGemini = async (
  userMessage: string,
  onChunk: (chunk: string) => void,
  onComplete: (fullResponse: string) => void,
  onError: (error: Error) => void,
): Promise<void> => {
  if (!chat) {
    console.error("Chat session not initialized. Call initChat first.");
    onError(new Error("Chat session not initialized."));
    return;
  }

  // Add user message to history
  currentChatHistory.push({ role: 'user', content: userMessage, timestamp: Date.now() });

  try {
    const responseStream = await chat.sendMessageStream({ message: userMessage });
    let fullResponseContent = '';

    for await (const chunk of responseStream) {
      if (chunk.text) {
        onChunk(chunk.text);
        fullResponseContent += chunk.text;
      }
    }
    // Add model response to history
    currentChatHistory.push({ role: 'model', content: fullResponseContent, timestamp: Date.now() });
    onComplete(fullResponseContent);
    
  } catch (error) {
    console.error("Error sending message to Gemini:", error);
    onError(error as Error);
    // Remove last user message from history if model failed to respond
    if (currentChatHistory[currentChatHistory.length - 1]?.role === 'user') {
        currentChatHistory.pop();
    }
  }
};

/**
 * Exclusive Feature: "Gemini Sonic Match"
 * Analyzes the current track and the library to suggest the next track.
 */
export const getSonicMatchRecommendation = async (
    currentTrack: Track,
    library: Track[],
    onChunk: (chunk: string) => void,
    onComplete: (fullResponse: string) => void,
    onError: (error: Error) => void
): Promise<void> => {
    if (!ai) initChat();
    
    // Create a simplified representation of the library to save tokens
    const simplifiedLibrary = library.map(t => ({
        id: t.id,
        name: t.name,
        artist: t.artist,
        bpm: t.bpm,
        key: t.key,
        genre: t.genre,
        rating: t.rating
    })).filter(t => t.id !== currentTrack.id); // Exclude current track

    // Construct a specific prompt
    const prompt = `
      I am currently playing:
      Track: "${currentTrack.name}" by ${currentTrack.artist || 'Unknown'}
      BPM: ${currentTrack.bpm || 'Unknown'}
      Key: ${currentTrack.key || 'Unknown'}
      Genre: ${currentTrack.genre || 'Unknown'}

      Here is my library:
      ${JSON.stringify(simplifiedLibrary.slice(0, 50))} 
      (List truncated to top 50 for speed if necessary)

      Please act as "Gemini Sonic Match". Analyze the vibe, energy, key compatibility (Camelot wheel), and BPM of the playing track.
      Recommend the top 2 best tracks from the library to mix next. 
      For each recommendation, give a "Sonic Match Score" (0-100%) and a one-sentence technical explanation of why it works (e.g., "Harmonic mix + energy boost").
      Format the output clearly with bold track names.
    `;

    // We use the existing chat session to maintain context, or we could use generateContent for a one-off.
    // Using chat allows the user to follow up ("Why that one?").
    await sendMessageToGemini(prompt, onChunk, onComplete, onError);
};

/**
 * Resets the current chat session, clearing history and creating a new chat instance.
 */
export const resetChat = (): void => {
  chat = null;
  currentChatHistory = [];
  initChat(); // Re-initialize a new chat session
  console.log("Gemini chat session reset.");
};

/**
 * Retrieves the current chat history.
 */
export const getChatHistory = (): ChatMessage[] => {
    return [...currentChatHistory]; // Return a copy to prevent direct modification
}