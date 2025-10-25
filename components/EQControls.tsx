
import React from 'react';
import { EQSettings } from '../types';

interface EQControlsProps {
  eq: EQSettings;
  onEQChange: (band: 'high' | 'mid' | 'low', value: number) => void;
  minGain?: number;
  maxGain?: number;
}

const EQControls: React.FC<EQControlsProps> = ({
  eq,
  onEQChange,
  minGain = -12, // Standard DJ mixer EQ range
  maxGain = 12, // Standard DJ mixer EQ range
}) => {
  const handleChange = (band: 'high' | 'mid' | 'low', e: React.ChangeEvent<HTMLInputElement>) => {
    onEQChange(band, parseFloat(e.target.value));
  };

  const handleKill = (band: 'high' | 'mid' | 'low') => {
    // Toggle between 0dB and kill level (-Infinity effectively)
    // For UI purposes, we'll set it to minGain or 0
    const currentValue = eq[band];
    const newValue = currentValue === minGain ? 0 : minGain; // Toggle between kill and flat
    onEQChange(band, newValue);
  };

  const EqSlider: React.FC<{ band: 'high' | 'mid' | 'low', value: number }> = ({ band, value }) => (
    <div className="flex flex-col items-center w-full px-1">
      <input
        type="range"
        min={minGain}
        max={maxGain}
        step="0.1"
        value={value}
        onChange={(e) => handleChange(band, e)}
        className="w-full h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer range-sm [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-purple-600 [&::-moz-range-thumb]:h-3 [&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-purple-600 transform -rotate-90 origin-center"
        style={{ width: '80px', height: '12px' }} // Adjust size for vertical layout
      />
      <span className="text-xs text-gray-400 mt-2">
        {band.charAt(0).toUpperCase() + band.slice(1)}: {value.toFixed(1)} dB
      </span>
      <button
        onClick={() => handleKill(band)}
        className={`mt-2 w-6 h-6 rounded-full text-xs font-bold transition-colors duration-150
                    ${eq[band] === minGain ? 'bg-red-600 hover:bg-red-700' : 'bg-gray-700 hover:bg-red-500'}
                    text-white`}
        aria-label={`Toggle ${band} EQ kill`}
      >
        K
      </button>
    </div>
  );

  return (
    <div className="flex flex-col items-center p-2 border-t border-gray-700 mt-4 pt-4">
      <h3 className="text-md font-semibold text-gray-300 mb-3">EQ</h3>
      <div className="flex justify-around w-full h-32 items-center">
        <EqSlider band="high" value={eq.high} />
        <EqSlider band="mid" value={eq.mid} />
        <EqSlider band="low" value={eq.low} />
      </div>
    </div>
  );
};

export default EQControls;