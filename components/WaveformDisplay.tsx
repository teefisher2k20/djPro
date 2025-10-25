
import React from 'react';

interface WaveformDisplayProps {
  peaks: number[];
  width: number;
  height: number;
  color?: string;
}

const WaveformDisplay: React.FC<WaveformDisplayProps> = ({ peaks, width, height, color = 'currentColor' }) => {
  if (!peaks || peaks.length === 0) {
    return (
      <div className="flex items-center justify-center w-full h-full text-gray-500">
        No waveform data
      </div>
    );
  }

  const pathData = peaks.map((peak, index) => {
    const x = (index / peaks.length) * width;
    const y = height - (peak * height); // Invert Y-axis for SVG
    return `${index === 0 ? 'M' : 'L'} ${x} ${y}`;
  }).join(' ');

  return (
    <svg className="w-full h-full" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
      <path d={pathData} fill="none" stroke={color} strokeWidth="2" />
    </svg>
  );
};

export default WaveformDisplay;