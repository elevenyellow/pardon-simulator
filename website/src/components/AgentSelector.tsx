'use client';

import { useState } from 'react';
import { Info, X } from 'lucide-react';

interface Agent {
  id: string;
  name: string;
  image: string;
}

const agents: Agent[] = [
  { id: 'donald-trump', name: 'DONALD TRUMP', image: '/assets/img1.png' },
  { id: 'barron-trump', name: 'BARRON TRUMP', image: '/assets/img2.jpg' },
  { id: 'cz', name: 'CZ (CHANGPENG ZHAO)', image: '/assets/img3.jpg' },
  { id: 'donjr-trump', name: 'DONALD JR', image: '/assets/img4.jpg' },
  { id: 'eric-trump', name: 'ERIC TRUMP', image: '/assets/img5.jpg' },
  { id: 'melania-trump', name: 'MELANIA TRUMP', image: '/assets/img6.jpg' },
];

export default function AgentSelector({ 
  selectedAgent, 
  onSelectAgent 
}: { 
  selectedAgent: string | null;
  onSelectAgent: (agentId: string) => void;
}) {
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [infoAgent, setInfoAgent] = useState<Agent | null>(null);
  const [agentInfo, setAgentInfo] = useState<string>('');
  const [loadingInfo, setLoadingInfo] = useState(false);

  const handleInfoClick = async (agent: Agent, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent character selection
    setInfoAgent(agent);
    setShowInfoModal(true);
    setLoadingInfo(true);
    setAgentInfo('');

    try {
      const response = await fetch(`/api/agents/personality?agent=${agent.id}`);
      if (response.ok) {
        const data = await response.json();
        setAgentInfo(data.personality || 'No information available.');
      } else {
        setAgentInfo('Failed to load character information.');
      }
    } catch (error) {
      console.error('Error fetching agent info:', error);
      setAgentInfo('Error loading character information.');
    } finally {
      setLoadingInfo(false);
    }
  };
  // Split agents into two columns (left and right)
  const leftAgents = agents.slice(0, 3);
  const rightAgents = agents.slice(3, 6);

  const AgentCard = ({ agent }: { agent: Agent }) => {
    const isSelected = selectedAgent === agent.id;
    
    return (
      <div className="flex flex-col gap-2">
        <div
          className={`
            w-full aspect-square bg-white/10 border-2 rounded-lg
            flex items-center justify-center overflow-hidden
            relative transition-all duration-300 cursor-pointer
            ${isSelected 
              ? 'border-[#FFD700] shadow-[0_0_20px_rgba(255,215,0,0.5)]' 
              : 'border-white/30 hover:border-[#FFD700]/50'
            }
          `}
          onClick={() => onSelectAgent(agent.id)}
        >
          <img
            src={agent.image}
            alt={agent.name}
            className={`
              w-full h-full object-cover transition-all duration-300 pixel-art
              ${isSelected ? 'filter-none' : 'grayscale brightness-[0.4] hover:brightness-[0.6]'}
            `}
          />
          {!isSelected && (
            <div className="absolute inset-0 bg-black/50 transition-opacity duration-300 hover:opacity-30" />
          )}
          
          {/* Info Icon */}
          <button
            onClick={(e) => handleInfoClick(agent, e)}
            className="absolute bottom-2 right-2 w-6 h-6 bg-black/70 border border-white/30 rounded-full flex items-center justify-center hover:bg-black/90 hover:border-[#FFD700] transition-all z-10"
            aria-label="Show character info"
          >
            <Info className="w-3 h-3 text-white" />
          </button>
        </div>
        <div 
          className="font-pixel text-[8px] text-[#FFD700] text-center leading-tight"
          style={{
            textShadow: '0 0 10px #FFD700, 0 0 20px #FFD700'
          }}
        >
          {agent.name}
        </div>
      </div>
    );
  };

  return (
    <>
      <div className="flex items-start gap-5">
        {/* Left Column */}
        <div className="flex flex-col gap-4 w-[180px]">
          {leftAgents.map((agent) => (
            <AgentCard key={agent.id} agent={agent} />
          ))}
        </div>

        {/* Center - TV Container */}
        <div className="relative w-[900px] h-[650px] flex items-center justify-center">
          {/* TV Frame Background */}
          <div 
            className="absolute inset-0 bg-contain bg-center bg-no-repeat pointer-events-none pixel-art"
            style={{ backgroundImage: "url('/assets/tv_1.png')" }}
          />
          
          {/* SBF Image Inside TV */}
          <img
            src="/assets/main_img.png"
            alt="SBF"
            className="w-full h-full object-cover relative z-[1] pixel-art"
          />
        </div>

        {/* Right Column */}
        <div className="flex flex-col gap-4 w-[180px]">
          {rightAgents.map((agent) => (
            <AgentCard key={agent.id} agent={agent} />
          ))}
        </div>
      </div>

      {/* Info Modal */}
      {showInfoModal && infoAgent && (
        <div 
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-[10003] p-4"
          onClick={() => setShowInfoModal(false)}
        >
          <div 
            className="bg-black/95 border-4 border-[#66b680] rounded-lg max-w-2xl w-full p-6 pixel-art relative"
            style={{
              boxShadow: '0 0 20px rgba(102, 182, 128, 0.5), 0 0 40px rgba(102, 182, 128, 0.3), inset 0 0 30px rgba(0, 0, 0, 0.5)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close Button */}
            <button
              onClick={() => setShowInfoModal(false)}
              className="absolute top-4 right-4 w-8 h-8 bg-[#ff6b6b] border-2 border-[#ff4444] rounded flex items-center justify-center hover:bg-[#ff8888] transition-colors"
              aria-label="Close"
            >
              <X className="w-4 h-4 text-white" />
            </button>

            {/* Agent Name */}
            <h2 
              className="font-pixel text-[#FFD700] text-[27px] mb-4 pr-8"
              style={{
                textShadow: '0 0 10px #FFD700, 0 0 20px #FFD700, 0 0 30px #FF8C00, 2px 2px 4px rgba(0, 0, 0, 0.8)'
              }}
            >
              {infoAgent.name}
            </h2>

            {/* Agent Info */}
            <div className="max-h-[60vh] overflow-y-auto">
              {loadingInfo ? (
                <div className="flex items-center justify-center py-8">
                  <div className="font-pixel text-white text-[21px]">Loading...</div>
                </div>
              ) : (
                <p className="font-pixel text-white text-[15px] leading-relaxed whitespace-pre-wrap">
                  {agentInfo}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
