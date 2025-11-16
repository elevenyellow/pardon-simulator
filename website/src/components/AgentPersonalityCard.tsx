'use client';

import React, { useState } from'react';
import { ChevronDown, ChevronUp, User } from'lucide-react';

interface AgentPersonality {
  agent: string;
  name: string;
  title: string;
  personality: string;
  avatar: string;
}

interface AgentPersonalityCardProps {
  agentId: string;
  defaultExpanded?: boolean;
  onClose?: () => void;
}

export function AgentPersonalityCard({ agentId, defaultExpanded = false, onClose }: AgentPersonalityCardProps) {
  const [personality, setPersonality] = useState<AgentPersonality | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(defaultExpanded);

  React.useEffect(() => {
    async function fetchPersonality() {
      try {
        setLoading(true);
        const response = await fetch(`/api/agents/personality?agent=${agentId}`);
        
        if (!response.ok) {
          throw new Error(`Failed to load personality: ${response.statusText}`);
        }
        
        const data = await response.json();
        setPersonality(data);
      } catch (err) {
        setError(err instanceof Error ? err.message :'Unknown error');
      } finally {
        setLoading(false);
      }
    }
    
    fetchPersonality();
  }, [agentId]);

  if (loading) {
    return (
      <div className="bg-gray-800 rounded-lg p-6 animate-pulse">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-16 h-16 bg-gray-700 rounded-full"></div>
          <div className="flex-1">
            <div className="h-6 bg-gray-700 rounded w-48 mb-2"></div>
            <div className="h-4 bg-gray-700 rounded w-32"></div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !personality) {
    return (
      <div className="bg-red-900/20 border border-red-500/50 rounded-lg p-6">
        <p className="text-red-400">Failed to load agent personality: {error}</p>
      </div>
    );
  }

  // Parse personality content into sections for better display
  const lines = personality.personality.split('\n');
  const sections = [];
  let currentSection: { title: string; content: string[] } | null = null;

  for (const line of lines) {
    // Check if line is a section header (all caps or ends with colon)
    if (line.trim().match(/^[A-Z][A-Z\s]+:?$/) || line.trim().endsWith(':')) {
      if (currentSection) {
        sections.push(currentSection);
      }
      currentSection = { title: line.trim(), content: [] };
    } else if (currentSection && line.trim()) {
      currentSection.content.push(line);
    } else if (!currentSection && line.trim()) {
      // Content before first section (like"You are...")
      if (sections.length === 0) {
        sections.push({ title:'', content: [line] });
      }
    }
  }

  if (currentSection) {
    sections.push(currentSection);
  }

  return (
    <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-lg border border-gray-700 shadow-xl overflow-hidden">
      {/* Header */}
      <div className="p-6 border-b border-gray-700">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4 flex-1">
            {/* Avatar */}
            <div className="relative w-16 h-16 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold text-2xl overflow-hidden">
              <User className="w-10 h-10"/>
            </div>
            
            {/* Name and Title */}
            <div className="flex-1 min-w-0">
              <h2 className="text-2xl font-bold text-white mb-1">{personality.name}</h2>
              <p className="text-gray-400 text-sm">{personality.title}</p>
            </div>
          </div>

          {/* Expand/Collapse Button */}
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"          >
            {expanded ? (
              <>
                <ChevronUp className="w-4 h-4"/>
                <span className="hidden sm:inline">Show Less</span>
              </>
            ) : (
              <>
                <ChevronDown className="w-4 h-4"/>
                <span className="hidden sm:inline">Show More</span>
              </>
            )}
          </button>

          {/* Close Button (optional) */}
          {onClose && (
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white transition-colors"              aria-label="Close"            >
              ×
            </button>
          )}
        </div>
      </div>

      {/* Expandable Content */}
      {expanded && (
        <div className="p-6 space-y-6 max-h-[600px] overflow-y-auto">
          {sections.map((section, idx) => (
            <div key={idx} className="space-y-2">
              {section.title && (
                <h3 className="text-lg font-semibold text-blue-400 border-b border-gray-700 pb-2">
                  {section.title}
                </h3>
              )}
              <div className="text-gray-300 space-y-2 whitespace-pre-wrap">
                {section.content.map((line, lineIdx) => (
                  <p key={lineIdx} className="leading-relaxed">
                    {line}
                  </p>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Footer hint */}
      {!expanded && (
        <div className="p-4 bg-gray-900/50 text-center">
          <p className="text-sm text-gray-400">
            Click"Show More"to view full personality details
          </p>
        </div>
      )}
    </div>
  );
}

export default AgentPersonalityCard;

