'use client';

import { useState } from 'react';

export interface ExportButtonProps {
  endpoint: string;
  filename?: string;
  label?: string;
}

export function ExportButton({ 
  endpoint, 
  filename = 'export', 
  label = 'Export' 
}: ExportButtonProps) {
  const [loading, setLoading] = useState(false);
  const [format, setFormat] = useState<'csv' | 'json'>('csv');

  const handleExport = async () => {
    setLoading(true);
    try {
      const url = `${endpoint}?format=${format}`;
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error('Export failed');
      }

      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = `${filename}.${format}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(downloadUrl);
    } catch (error) {
      console.error('Export error:', error);
      alert('Export failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <select
        value={format}
        onChange={(e) => setFormat(e.target.value as 'csv' | 'json')}
        className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
        disabled={loading}
      >
        <option value="csv">CSV</option>
        <option value="json">JSON</option>
      </select>
      <button
        onClick={handleExport}
        disabled={loading}
        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? 'Exporting...' : label}
      </button>
    </div>
  );
}

