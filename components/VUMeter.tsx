
import React from 'react';

interface VUMeterProps {
  level: number; // dB value, e.g., -60 to 0
  maxLevel?: number; // Max dB for scaling, typically 0
  minLevel?: number; // Min dB for scaling, typically -60
  width?: string;
  height?: string;
  barColor?: string;
  clipColor?: string;
  label?: string;
}

const VUMeter: React.FC<VUMeterProps> = ({
  level,
  maxLevel = 0,
  minLevel = -60,
  width = '12px',
  height = '100px',
  barColor = '#4CAF50',
  clipColor = '#F44336',
  label,
}) => {
  // Normalize level to a 0-100 percentage
  const normalizedLevel = Math.max(0, Math.min(100, ((level - minLevel) / (maxLevel - minLevel)) * 100));

  // Determine if clipping
  const isClipping = level >= maxLevel;

  return (
    <div className="flex flex-col items-center">
      {label && <span className="text-xs text-gray-400 mb-1">{label}</span>}
      <div
        className="relative bg-gray-700 rounded-sm overflow-hidden"
        style={{ width, height, transform: 'rotate(180deg)' }} // Rotate to make 0 at top
      >
        <div
          className="absolute bottom-0 left-0 w-full"
          style={{
            height: `${normalizedLevel}%`,
            backgroundColor: isClipping ? clipColor : barColor,
            transition: 'height 0.1s linear',
          }}
        />
        {isClipping && (
            <div className="absolute top-0 left-0 w-full h-2 bg-red-500 rounded-b-sm animate-pulse" />
        )}
      </div>
    </div>
  );
};

export default VUMeter;