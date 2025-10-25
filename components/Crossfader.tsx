
import React from 'react';

interface CrossfaderProps {
  position: number; // 0 (Deck A) to 1 (Deck B), 0.5 is center
  onPositionChange: (position: number) => void;
  label?: string;
}

const Crossfader: React.FC<CrossfaderProps> = ({ position, onPositionChange, label = 'Crossfader' }) => {
  return (
    <div className="flex flex-col items-center p-4 bg-gray-800 rounded-lg shadow-inner w-full max-w-2xl mx-auto mt-8">
      <label htmlFor="crossfader-slider" className="text-gray-300 text-lg font-semibold mb-3">{label}</label>
      <div className="flex items-center w-full">
        <span className="text-gray-400 text-sm mr-2">A</span>
        <input
          id="crossfader-slider"
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={position}
          onChange={(e) => onPositionChange(parseFloat(e.target.value))}
          className="w-full h-3 bg-gradient-to-r from-blue-600 via-gray-600 to-red-600 rounded-lg appearance-none cursor-pointer
                     [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-6 [&::-webkit-slider-thumb]:w-6 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-yellow-500 [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-yellow-300
                     [&::-moz-range-thumb]:h-6 [&::-moz-range-thumb]:w-6 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-yellow-500 [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-yellow-300"
        />
        <span className="text-gray-400 text-sm ml-2">B</span>
      </div>
      <div className="flex justify-between w-full px-2 text-xs text-gray-500 mt-2">
        <span>100% A</span>
        <span>Center</span>
        <span>100% B</span>
      </div>
    </div>
  );
};

export default Crossfader;