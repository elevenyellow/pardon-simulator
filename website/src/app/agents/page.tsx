'use client';

import React, { useState, useEffect } from 'react';
import { AgentPersonalityCard } from '@/components/AgentPersonalityCard';
import { Users, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

interface Agent {
  id: string;
  name: string;
  title: string;
}

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([
    { id: 'donald-trump', name: 'Donald Trump', title: 'President of the United States' },
    { id: 'melania-trump', name: 'Melania Trump', title: 'First Lady' },
    { id: 'eric-trump', name: 'Eric Trump', title: 'Executive VP, Trump Organization' },
    { id: 'donjr-trump', name: 'Donald Trump Jr', title: 'Political Activist' },
    { id: 'barron-trump', name: 'Barron Trump', title: 'Crypto Prodigy' },
    { id: 'cz', name: 'Changpeng Zhao (CZ)', title: 'Binance Founder' },
    { id: 'sbf', name: 'Sam Bankman-Fried (SBF)', title: 'Former FTX CEO (Player)' }
  ]);
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-black text-white">
      {/* Header */}
      <div className="bg-gray-800/50 border-b border-gray-700 sticky top-0 z-10 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link
                href="/"
                className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back to Game</span>
              </Link>
              <h1 className="text-2xl font-bold flex items-center gap-3">
                <Users className="w-8 h-8 text-blue-400" />
                Agent Directory
              </h1>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-8">
        {/* Introduction */}
        <div className="bg-gradient-to-r from-blue-900/30 to-purple-900/30 border border-blue-500/30 rounded-lg p-6 mb-8">
          <h2 className="text-xl font-bold mb-3 text-blue-300">Meet the Players</h2>
          <p className="text-gray-300 leading-relaxed">
            The Pardon Simulator features a cast of AI-powered characters, each with unique personalities, 
            motivations, and strategic positions. Learn about each agent's background, personality traits, 
            and how they fit into the game's political and crypto dynamics.
          </p>
        </div>

        {/* Selected Agent Detail View */}
        {selectedAgent && (
          <div className="mb-8">
            <AgentPersonalityCard 
              agentId={selectedAgent} 
              defaultExpanded={true}
              onClose={() => setSelectedAgent(null)}
            />
          </div>
        )}

        {/* Agent Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {agents.map((agent) => (
            <button
              key={agent.id}
              onClick={() => setSelectedAgent(selectedAgent === agent.id ? null : agent.id)}
              className={`
                bg-gradient-to-br from-gray-800 to-gray-900 
                border rounded-lg p-6 
                hover:scale-105 hover:shadow-xl
                transition-all duration-200
                text-left
                ${selectedAgent === agent.id 
                  ? 'border-blue-500 ring-2 ring-blue-500/50' 
                  : 'border-gray-700 hover:border-gray-600'
                }
              `}
            >
              {/* Avatar Placeholder */}
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold text-3xl mb-4 mx-auto">
                {agent.name.charAt(0)}
              </div>

              {/* Name and Title */}
              <div className="text-center">
                <h3 className="text-lg font-bold text-white mb-1">{agent.name}</h3>
                <p className="text-sm text-gray-400 mb-3">{agent.title}</p>
                
                {/* View Button */}
                <div className={`
                  inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors
                  ${selectedAgent === agent.id
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }
                `}>
                  {selectedAgent === agent.id ? 'Viewing' : 'View Details'}
                </div>
              </div>
            </button>
          ))}
        </div>

        {/* Footer Info */}
        <div className="mt-12 bg-gray-800/30 border border-gray-700 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-blue-400 mb-3">About Agent Personalities</h3>
          <div className="text-gray-300 space-y-2">
            <p>
              Each agent's personality is carefully crafted to create dynamic, interesting interactions. 
              These personality profiles are public and safe to share - they contain no operational details 
              or game mechanics that would compromise gameplay.
            </p>
            <p className="text-sm text-gray-400 italic">
              Note: Operational rules, scoring criteria, and payment verification procedures are kept 
              private and not displayed here. What you see are the character backgrounds and communication 
              styles that make each agent unique.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

