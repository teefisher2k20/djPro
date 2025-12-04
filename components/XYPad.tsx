import React, { useRef, useState, useEffect } from 'react';

interface XYPadProps {
  x: number;
  y: number;
  active: boolean;
  onUpdate: (x: number, y: number, active: boolean) => void;
  label?: string;
}

const XYPad: React.FC<XYPadProps> = ({ x, y, active, onUpdate, label = 'Flux FX' }) => {
  const padRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Handle updates when dragging
  const updateCoordinates = (clientX: number, clientY: number) => {
    if (!padRef.current) return;
    const rect = padRef.current.getBoundingClientRect();
    
    // Calculate normalized coordinates (0-1)
    let newX = (clientX - rect.left) / rect.width;
    let newY = 1 - (clientY - rect.top) / rect.height; // Invert Y so bottom is 0

    // Clamp values
    newX = Math.max(0, Math.min(1, newX));
    newY = Math.max(0, Math.min(1, newY));

    onUpdate(newX, newY, true);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    updateCoordinates(e.clientX, e.clientY);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) {
      updateCoordinates(e.clientX, e.clientY);
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    // When released, we keep the filter open (X=1) but dry the reverb (Y=0)
    // or we can leave it where it is. 
    // Standard FX pad behavior usually resets when released for momentary FX.
    // Let's reset to "Off" state: Filter Open (1), Reverb Dry (0).
    onUpdate(1, 0, false); 
  };

  const handleMouseLeave = () => {
    if (isDragging) {
      setIsDragging(false);
      onUpdate(1, 0, false);
    }
  };

  // Touch support
  const handleTouchStart = (e: React.TouchEvent) => {
    e.preventDefault(); // Prevent scrolling
    setIsDragging(true);
    updateCoordinates(e.touches[0].clientX, e.touches[0].clientY);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    e.preventDefault();
    if (isDragging) {
      updateCoordinates(e.touches[0].clientX, e.touches[0].clientY);
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    e.preventDefault();
    setIsDragging(false);
    onUpdate(1, 0, false);
  };

  return (
    <div className="flex flex-col items-center w-full mt-4">
        <label className="text-xs font-bold text-blue-300 tracking-wider mb-2 uppercase">{label}</label>
        <div 
            ref={padRef}
            className={`relative w-full aspect-square bg-gray-900 rounded-lg border-2 cursor-crosshair overflow-hidden touch-none transition-colors duration-200
                        ${active ? 'border-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.5)]' : 'border-gray-700'}`}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseLeave}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
        >
            {/* Grid Lines */}
            <div className="absolute inset-0 opacity-20 pointer-events-none" 
                 style={{ 
                     backgroundImage: 'linear-gradient(gray 1px, transparent 1px), linear-gradient(90deg, gray 1px, transparent 1px)',
                     backgroundSize: '20% 20%'
                 }}>
            </div>

            {/* Axis Labels */}
            <div className="absolute bottom-1 right-2 text-[10px] text-gray-500 pointer-events-none">FILTER (X)</div>
            <div className="absolute top-2 left-1 text-[10px] text-gray-500 pointer-events-none transform -rotate-90 origin-left">REVERB (Y)</div>

            {/* The Puck */}
            <div 
                className={`absolute w-6 h-6 rounded-full border-2 transform -translate-x-1/2 -translate-y-1/2 pointer-events-none transition-transform duration-75
                            ${active ? 'bg-blue-500 border-white scale-125' : 'bg-gray-700 border-gray-500'}`}
                style={{ 
                    left: `${x * 100}%`, 
                    top: `${(1 - y) * 100}%` // Re-invert for display
                }}
            />
            
            {/* Visual Feedback of "Activity" */}
            {active && (
                <div className="absolute inset-0 bg-blue-500 opacity-10 pointer-events-none animate-pulse"></div>
            )}
        </div>
    </div>
  );
};

export default XYPad;