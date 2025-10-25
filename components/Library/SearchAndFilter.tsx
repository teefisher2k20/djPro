import React, { useCallback } from 'react';
import { LibraryFilters } from '../../types';

interface SearchAndFilterProps {
  searchTerm: string;
  onSearchChange: (term: string) => void;
  filters: LibraryFilters;
  onFilterChange: (filters: LibraryFilters) => void;
}

const SearchAndFilter: React.FC<SearchAndFilterProps> = ({
  searchTerm,
  onSearchChange,
  filters,
  onFilterChange,
}) => {
  const handleSearchInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onSearchChange(e.target.value);
  };

  const handleFilterInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    let newValue: string | number | undefined = value;

    if (type === 'number') {
      newValue = parseFloat(value);
      if (isNaN(newValue)) newValue = undefined; // Treat empty/invalid as undefined
    }

    onFilterChange({
      ...filters,
      [name]: newValue,
    });
  }, [filters, onFilterChange]);

  const musicalKeys = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const majorMinor = ['maj', 'min']; // Simplified Camelot/Open Key idea. Full system would be more complex.
  const allKeys = musicalKeys.flatMap(root => majorMinor.map(suffix => `${root}${suffix}`));
  // Add numerical Camelot keys for completeness, if desired.
  // Example: 1A, 2A, ..., 12A, 1B, ..., 12B

  return (
    <div className="mb-4 p-3 bg-gray-700 rounded-md">
      <input
        type="text"
        placeholder="Search tracks by name, artist, album..."
        value={searchTerm}
        onChange={handleSearchInputChange}
        className="w-full p-2 rounded-md bg-gray-800 text-gray-100 border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 text-sm">
        {/* BPM Range Filter */}
        <div>
          <label htmlFor="bpmMin" className="block text-gray-300 mb-1">BPM Min</label>
          <input
            type="number"
            id="bpmMin"
            name="bpmMin"
            value={filters.bpmMin || ''}
            onChange={handleFilterInputChange}
            placeholder="e.g., 120"
            className="w-full p-2 rounded-md bg-gray-800 text-gray-100 border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label htmlFor="bpmMax" className="block text-gray-300 mb-1">BPM Max</label>
          <input
            type="number"
            id="bpmMax"
            name="bpmMax"
            value={filters.bpmMax || ''}
            onChange={handleFilterInputChange}
            placeholder="e.g., 130"
            className="w-full p-2 rounded-md bg-gray-800 text-gray-100 border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Key Filter */}
        <div>
          <label htmlFor="key" className="block text-gray-300 mb-1">Key</label>
          <select
            id="key"
            name="key"
            value={filters.key || ''}
            onChange={handleFilterInputChange}
            className="w-full p-2 rounded-md bg-gray-800 text-gray-100 border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Any</option>
            {allKeys.map(keyOption => (
              <option key={keyOption} value={keyOption}>{keyOption}</option>
            ))}
          </select>
        </div>

        {/* Genre Filter */}
        <div>
          <label htmlFor="genre" className="block text-gray-300 mb-1">Genre</label>
          <input
            type="text"
            id="genre"
            name="genre"
            value={filters.genre || ''}
            onChange={handleFilterInputChange}
            placeholder="e.g., House"
            className="w-full p-2 rounded-md bg-gray-800 text-gray-100 border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Rating Filter */}
        <div className="col-span-2 sm:col-span-4">
          <label htmlFor="ratingMin" className="block text-gray-300 mb-1">Minimum Rating</label>
          <input
            type="range"
            id="ratingMin"
            name="ratingMin"
            min="0"
            max="5"
            step="1"
            value={filters.ratingMin || 0}
            onChange={handleFilterInputChange}
            className="w-full h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer range-sm
                       [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-yellow-500
                       [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-yellow-500"
          />
          <div className="flex justify-between text-xs text-gray-400 mt-1">
            <span>0 Stars</span>
            <span>{filters.ratingMin || 0} Stars</span>
            <span>5 Stars</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SearchAndFilter;