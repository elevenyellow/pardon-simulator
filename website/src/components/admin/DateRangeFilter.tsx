'use client';

import { useState } from 'react';

export interface DateRangeFilterProps {
  onFilterChange: (fromDate: string, toDate: string) => void;
  label?: string;
}

export function DateRangeFilter({ onFilterChange, label = 'Date Range' }: DateRangeFilterProps) {
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const handleFromChange = (value: string) => {
    setFromDate(value);
    onFilterChange(value, toDate);
  };

  const handleToChange = (value: string) => {
    setToDate(value);
    onFilterChange(fromDate, value);
  };

  const handleClear = () => {
    setFromDate('');
    setToDate('');
    onFilterChange('', '');
  };

  return (
    <div className="flex items-center gap-3">
      <span className="text-sm font-medium text-gray-700">{label}:</span>
      <div className="flex items-center gap-2">
        <input
          type="date"
          value={fromDate}
          onChange={(e) => handleFromChange(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          placeholder="From"
        />
        <span className="text-gray-500">to</span>
        <input
          type="date"
          value={toDate}
          onChange={(e) => handleToChange(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          placeholder="To"
        />
        {(fromDate || toDate) && (
          <button
            onClick={handleClear}
            className="px-3 py-2 text-sm text-gray-600 hover:text-gray-900 underline"
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
}

