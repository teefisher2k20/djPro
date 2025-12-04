import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ChatMessage, DeckState, Track } from '../types';
import { sendMessageToGemini, initChat, resetChat, getChatHistory, getSonicMatchRecommendation } from '../services/geminiService';

interface ChatbotProps {
    deckA?: DeckState;
    deckB?: DeckState;
    libraryTracks?: Track[];
}

const Chatbot: React.FC<ChatbotProps> = ({ deckA, deckB, libraryTracks = [] }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Initialize chat when component mounts
    initChat();
    // Load any existing history
    setMessages(getChatHistory());
  }, []);

  // Scroll to bottom when messages update
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  const handleSendMessage = useCallback(async () => {
    if (input.trim() === '') return;

    const userMessageContent = input;
    setMessages((prev) => [...prev, { role: 'user', content: userMessageContent, timestamp: Date.now() }]);
    setInput('');
    setIsTyping(true);

    let modelResponseAccumulator = '';
    const modelMessagePlaceholder: ChatMessage = {
      role: 'model',
      content: '',
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, modelMessagePlaceholder]); // Add placeholder for streaming

    const onChunk = (chunk: string) => {
      modelResponseAccumulator += chunk;
      setMessages((prev) => {
        const lastMessage = prev[prev.length - 1];
        if (lastMessage?.role === 'model') {
          return [...prev.slice(0, -1), { ...lastMessage, content: modelResponseAccumulator }];
        }
        return prev; // Should not happen if placeholder is correctly added
      });
    };

    const onComplete = (fullResponse: string) => {
      // The message is already updated by onChunk, just ensure isTyping is false
      setIsTyping(false);
    };

    const onError = (error: Error) => {
      console.error('Chatbot error:', error);
      setIsTyping(false);
      setMessages((prev) => {
        // If the last message was the model's empty placeholder, remove it or mark as error
        const lastMessage = prev[prev.length - 1];
        if (lastMessage?.role === 'model' && lastMessage.content === '') {
            return [...prev.slice(0, -1), { role: 'model', content: `Error: ${error.message}`, timestamp: Date.now() }];
        }
        return [...prev, { role: 'model', content: `Sorry, I encountered an error: ${error.message}`, timestamp: Date.now() }];
      });
    };

    await sendMessageToGemini(userMessageContent, onChunk, onComplete, onError);
  }, [input]);

  const handleNewChat = useCallback(() => {
    if (window.confirm('Are you sure you want to start a new chat? This will clear the current conversation.')) {
      resetChat();
      setMessages([]);
      setInput('');
      setIsTyping(false);
    }
  }, []);

  const handleSonicMatch = useCallback(async () => {
    // Determine which deck is the "Master" (Playing, or just A if both stopped)
    const masterDeck = deckA?.isPlaying ? deckA : (deckB?.isPlaying ? deckB : deckA);

    if (!masterDeck?.track) {
        setMessages(prev => [...prev, { role: 'model', content: "Please load a track into a deck first so I can find a sonic match!", timestamp: Date.now() }]);
        return;
    }

    setIsTyping(true);
    // User message is implicit
    const userMsg = `Suggest a Sonic Match for "${masterDeck.track.name}"`;
    setMessages(prev => [...prev, { role: 'user', content: userMsg, timestamp: Date.now() }]);

    // Same streaming logic as standard chat
    let modelResponseAccumulator = '';
    setMessages(prev => [...prev, { role: 'model', content: '', timestamp: Date.now() }]);

    const onChunk = (chunk: string) => {
        modelResponseAccumulator += chunk;
        setMessages(prev => {
            const lastMessage = prev[prev.length - 1];
            if (lastMessage?.role === 'model') {
                return [...prev.slice(0, -1), { ...lastMessage, content: modelResponseAccumulator }];
            }
            return prev;
        });
    };
    
    const onComplete = () => setIsTyping(false);
    const onError = (e: Error) => { setIsTyping(false); console.error(e); };

    await getSonicMatchRecommendation(masterDeck.track, libraryTracks, onChunk, onComplete, onError);

  }, [deckA, deckB, libraryTracks]);

  const handleKeyPress = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault(); // Prevent new line in input
      handleSendMessage();
    }
  }, [handleSendMessage]);

  return (
    <div className="flex flex-col h-full bg-gray-800 rounded-lg shadow-xl p-4">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-2xl font-bold text-blue-400 text-center">DJ AI Assistant</h2>
        <button 
            onClick={handleSonicMatch}
            disabled={isTyping}
            className="px-3 py-1 bg-gradient-to-r from-pink-500 to-purple-600 text-white text-xs font-bold uppercase tracking-wider rounded-full shadow-lg hover:from-pink-600 hover:to-purple-700 transition-all transform hover:scale-105"
        >
            ✨ Sonic Match
        </button>
      </div>

      <div className="flex-1 overflow-y-auto mb-4 p-2 bg-gray-900 rounded-md scrollbar-thumb-gray-600 scrollbar-track-gray-800 scrollbar-thin" aria-live="polite" aria-atomic="false">
        {messages.length === 0 && !isTyping && (
          <div className="text-center mt-10">
              <p className="text-gray-400 italic">"What should I play next?"</p>
              <p className="text-gray-500 text-xs mt-2">Try the <b>Sonic Match</b> button for AI recommendations.</p>
          </div>
        )}
        {messages.map((msg, index) => (
          <div
            key={index}
            className={`flex flex-col mb-2 ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
          >
            <div
              className={`max-w-[85%] p-3 rounded-lg text-sm whitespace-pre-wrap ${msg.role === 'user'
                  ? 'bg-blue-600 text-white rounded-br-none'
                  : 'bg-gray-700 text-gray-100 rounded-bl-none border border-gray-600'
              }`}
            >
              <p>{msg.content}</p>
              <span className="text-xs text-gray-400 mt-1 block text-right">
                {new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
              </span>
            </div>
          </div>
        ))}
        {isTyping && (
          <div className="flex items-center space-x-2 text-gray-400 animate-pulse ml-2">
            <span className="inline-block h-2 w-2 bg-blue-500 rounded-full"></span>
            <span className="inline-block h-2 w-2 bg-blue-500 rounded-full animation-delay-200"></span>
            <span className="inline-block h-2 w-2 bg-blue-500 rounded-full animation-delay-400"></span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="flex space-x-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyPress}
          placeholder="Ask about mixing, keys, or tech..."
          className="flex-1 p-3 rounded-md bg-gray-700 text-gray-100 border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          disabled={isTyping}
          aria-label="Chat input"
        />
        <button
          onClick={handleSendMessage}
          className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-semibold hover:bg-blue-700 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={isTyping || input.trim() === ''}
          aria-label="Send message"
        >
          Send
        </button>
        <button
            onClick={handleNewChat}
            className="px-3 py-2 bg-gray-600 text-gray-300 rounded-md hover:bg-gray-500 transition-colors"
            title="Clear Chat"
        >
            ↻
        </button>
      </div>
    </div>
  );
};

export default Chatbot;