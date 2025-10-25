import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ChatMessage } from '../types';
import { sendMessageToGemini, initChat, resetChat, getChatHistory } from '../services/geminiService';

interface ChatbotProps {}

const Chatbot: React.FC<ChatbotProps> = () => {
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

  const handleKeyPress = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault(); // Prevent new line in input
      handleSendMessage();
    }
  }, [handleSendMessage]);

  return (
    <div className="flex flex-col h-full bg-gray-800 rounded-lg shadow-xl p-4">
      <h2 className="text-2xl font-bold text-blue-400 mb-4 text-center">DJ AI Assistant</h2>

      <div className="flex-1 overflow-y-auto mb-4 p-2 bg-gray-900 rounded-md scrollbar-thumb-gray-600 scrollbar-track-gray-800 scrollbar-thin" aria-live="polite" aria-atomic="false">
        {messages.length === 0 && !isTyping && (
          <p className="text-gray-400 text-center italic mt-4">Ask me anything about DJing, music, or tech!</p>
        )}
        {messages.map((msg, index) => (
          <div
            key={index}
            className={`flex flex-col mb-2 ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
          >
            <div
              className={`max-w-[80%] p-3 rounded-lg text-sm ${msg.role === 'user'
                  ? 'bg-blue-600 text-white rounded-br-none'
                  : 'bg-gray-700 text-gray-100 rounded-bl-none'
              }`}
            >
              <p>{msg.content}</p>
              <span className="text-xs text-gray-400 mt-1 block">
                {new Date(msg.timestamp).toLocaleTimeString()}
              </span>
            </div>
          </div>
        ))}
        {isTyping && (
          <div className="flex items-center space-x-2 text-gray-400 animate-pulse">
            <span className="inline-block h-3 w-3 bg-blue-500 rounded-full"></span>
            <span className="inline-block h-3 w-3 bg-blue-500 rounded-full animation-delay-200"></span>
            <span className="inline-block h-3 w-3 bg-blue-500 rounded-full animation-delay-400"></span>
            <span>AI is typing...</span>
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
          placeholder="Type your message..."
          className="flex-1 p-3 rounded-md bg-gray-700 text-gray-100 border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
          disabled={isTyping}
          aria-label="Chat input"
        />
        <button
          onClick={handleSendMessage}
          className="px-5 py-3 bg-blue-600 text-white rounded-md text-sm font-semibold hover:bg-blue-700 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={isTyping || input.trim() === ''}
          aria-label="Send message"
        >
          Send
        </button>
        <button
          onClick={handleNewChat}
          className="px-5 py-3 bg-purple-600 text-white rounded-md text-sm font-semibold hover:bg-purple-700 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={isTyping}
          aria-label="Start new chat"
        >
          New Chat
        </button>
      </div>
    </div>
  );
};

export default Chatbot;