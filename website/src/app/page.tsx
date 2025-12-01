'use client';

import { useState, useEffect, useRef, useCallback } from'react';
import dynamic from'next/dynamic';
import { useWallet } from'@solana/wallet-adapter-react';
import AgentSelector from'@/components/AgentSelector';
import ChatInterface from'@/components/ChatInterface';
import'@/lib/console-filter';  // Suppress excessive wallet SDK and CSS logging
import bs58 from'bs58';
import { getAPIClient } from'@/lib/api-client';

//  Fix hydration error: Load wallet button only on client-side
const WalletMultiButton = dynamic(
  async () => (await import('@solana/wallet-adapter-react-ui')).WalletMultiButton,
  { ssr: false }
);

type GameScreen ='initial'|'loading'|'game';

export default function Home() {
  const { publicKey, connected, disconnect, signMessage } = useWallet();
  const [currentScreen, setCurrentScreen] = useState<GameScreen>('initial');
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [agentThreads, setAgentThreads] = useState<Record<string, string>>({});
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  
  // Audio refs
  const bgMusicRef = useRef<HTMLAudioElement | null>(null);
  const prisonDoorRef = useRef<HTMLAudioElement | null>(null);
  const phoneDialRef = useRef<HTMLAudioElement | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [musicStarted, setMusicStarted] = useState(false);
  
  // Wallet verification state
  const [walletVerified, setWalletVerified] = useState(false);
  const [verifyingWallet, setVerifyingWallet] = useState(false);

  // Load existing threads when wallet connects
  useEffect(() => {
    const loadUserThreads = async () => {
      if (!publicKey || !connected) {
        // Clear state when wallet disconnects
        setAgentThreads({});
        setSelectedAgent(null);
        setThreadId(null);
        return;
      }

      try {
        console.log('[Thread Loading] Fetching existing threads for wallet...');
        const apiClient = getAPIClient();
        const threads = await apiClient.getUserThreads(publicKey.toString());
        
        console.log('[Thread Loading] Loaded threads:', threads);
        setAgentThreads(threads);
      } catch (error) {
        console.error('[Thread Loading] Error loading threads:', error);
        // Don't block - user can create new threads
        setAgentThreads({});
      }
    };

    loadUserThreads();
  }, [publicKey, connected]);

  // Initialize audio on mount
  useEffect(() => {
    if (typeof window !=='undefined') {
      bgMusicRef.current = new Audio('/assets/main_title_song.mp3');
      bgMusicRef.current.loop = true;
      bgMusicRef.current.volume = 0.35;

      prisonDoorRef.current = new Audio('/assets/Prison Cell Door.mp3');
      prisonDoorRef.current.volume = 0.5;

      phoneDialRef.current = new Audio('/assets/Phone Dial and Ring Sound.mp4');
      phoneDialRef.current.volume = 0.6;
    }

    return () => {
      // Cleanup audio on unmount
      if (bgMusicRef.current) {
        bgMusicRef.current.pause();
        bgMusicRef.current = null;
      }
      if (prisonDoorRef.current) {
        prisonDoorRef.current.pause();
        prisonDoorRef.current = null;
      }
      if (phoneDialRef.current) {
        phoneDialRef.current.pause();
        phoneDialRef.current = null;
      }
    };
  }, []);

  // Start music with user interaction
  const startMusic = () => {
    if (!musicStarted && bgMusicRef.current) {
      bgMusicRef.current.play().then(() => {
        setMusicStarted(true);
      }).catch((error) => {
        console.log('Audio autoplay blocked:', error);
      });
    }
  };

  // Handle first user interaction for audio
  useEffect(() => {
    const handleFirstInteraction = () => {
      startMusic();
      document.removeEventListener('click', handleFirstInteraction);
      document.removeEventListener('keydown', handleFirstInteraction);
    };

    document.addEventListener('click', handleFirstInteraction);
    document.addEventListener('keydown', handleFirstInteraction);

    return () => {
      document.removeEventListener('click', handleFirstInteraction);
      document.removeEventListener('keydown', handleFirstInteraction);
    };
  }, []);

  // Toggle mute
  const toggleMute = () => {
    const newMuted = !isMuted;
    setIsMuted(newMuted);
    
    if (bgMusicRef.current) bgMusicRef.current.muted = newMuted;
    if (prisonDoorRef.current) prisonDoorRef.current.muted = newMuted;
    if (phoneDialRef.current) phoneDialRef.current.muted = newMuted;
  };

  // Verify wallet ownership with signature
  const verifyWalletOwnership = useCallback(async (): Promise<boolean> => {
    if (!publicKey || !signMessage) {
      console.error('[Wallet] Cannot verify - missing publicKey or signMessage');
      return false;
    }
    
    const walletAddress = publicKey.toString();
    
    // Check if already verified in localStorage
    const stored = localStorage.getItem(`wallet_verification_${walletAddress}`);
    if (stored) {
      try {
        const { signature, message, timestamp } = JSON.parse(stored);
        const age = Date.now() - timestamp;
        if (age < 7 * 24 * 60 * 60 * 1000) { // 7 days
          console.log('[Wallet] Using cached signature verification');
          setWalletVerified(true);
          return true;
        }
      } catch (e) {
        console.warn('[Wallet] Invalid cached signature data');
      }
    }
    
    // Request signature
    try {
      setVerifyingWallet(true);
      const timestamp = Date.now();
      const message = `Verify wallet ownership for Pardon Simulator\n\nDomain: pardonsimulator.com\nAddress: ${walletAddress}\nTimestamp: ${timestamp}`;
      
      console.log('[Wallet] Requesting signature for verification...');
      const messageBytes = new TextEncoder().encode(message);
      const signatureBytes = await signMessage(messageBytes);
      const signature = bs58.encode(signatureBytes);
      
      // Store in localStorage
      localStorage.setItem(`wallet_verification_${walletAddress}`, JSON.stringify({
        signature,
        message,
        timestamp
      }));
      
      setWalletVerified(true);
      console.log('[Wallet] Signature verified and stored');
      return true;
    } catch (error) {
      console.error('[Wallet] Signature request failed:', error);
      alert('Wallet verification required to continue. Please sign the message to prove wallet ownership.');
      return false;
    } finally {
      setVerifyingWallet(false);
    }
  }, [publicKey, signMessage]);

  // Start the game flow (loading screen -> game screen)
  const startGameFlow = useCallback(() => {
    if (!musicStarted) startMusic();
    
    // Play prison door sound
    if (prisonDoorRef.current) {
      prisonDoorRef.current.currentTime = 0;
      prisonDoorRef.current.play().catch(console.error);
    }

    // Fade to black, then show loading screen
    setCurrentScreen('loading');

    // After 7 seconds, show game screen
    setTimeout(() => {
      setCurrentScreen('game');
    }, 7000);
  }, [musicStarted]);

  // Handle START button click (only shown when wallet is already connected)
  const handleStartClick = async () => {
    // First verify wallet ownership
    const verified = await verifyWalletOwnership();
    if (verified) {
      startGameFlow();
    }
  };
  
  // Passively check for cached wallet verification when wallet connects
  // Does NOT trigger signature request - only checks localStorage
  useEffect(() => {
    if (connected && publicKey) {
      const walletAddress = publicKey.toString();
      const stored = localStorage.getItem(`wallet_verification_${walletAddress}`);
      
      if (stored) {
        try {
          const { timestamp } = JSON.parse(stored);
          const age = Date.now() - timestamp;
          const MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days
          
          if (age >= 0 && age < MAX_AGE) {
            console.log('[Wallet] Found valid cached signature');
            setWalletVerified(true);
          } else {
            console.log('[Wallet] Cached signature expired');
            setWalletVerified(false);
          }
        } catch (e) {
          console.warn('[Wallet] Invalid cached signature data');
          setWalletVerified(false);
        }
      } else {
        console.log('[Wallet] No cached signature found');
        setWalletVerified(false);
      }
    } else {
      setWalletVerified(false);
    }
  }, [connected, publicKey]);

  // Auto-trigger signature request when wallet connects (if not cached)
  // This eliminates the need for a second click on the START button
  useEffect(() => {
    if (connected && publicKey && !walletVerified && !verifyingWallet && currentScreen === 'initial') {
      // Wallet just connected and no cached signature exists
      // Automatically request signature (don't wait for second click)
      console.log('[Wallet] Wallet connected, auto-requesting signature...');
      
      // Small delay to let wallet adapter stabilize
      const timer = setTimeout(async () => {
        const verified = await verifyWalletOwnership();
        if (verified) {
          console.log('[Wallet] Auto-verification successful, starting game...');
          startGameFlow(); // Go straight to game
        }
      }, 500);
      
      return () => clearTimeout(timer);
    }
  }, [connected, publicKey, walletVerified, verifyingWallet, currentScreen, verifyWalletOwnership, startGameFlow]);

  // Handle logout - disconnect wallet and return to initial screen
  const handleLogout = async () => {
    try {
      // Clear wallet signature from storage
      if (publicKey) {
        localStorage.removeItem(`wallet_verification_${publicKey.toString()}`);
      }
      
      await disconnect();
      setWalletVerified(false);
      setCurrentScreen('initial');
      setSelectedAgent(null);
      setThreadId(null);
      setAgentThreads({});
    } catch (error) {
      console.error('Error disconnecting wallet:', error);
      // Still navigate back even if disconnect fails
      // Clear signature storage regardless
      if (publicKey) {
        localStorage.removeItem(`wallet_verification_${publicKey.toString()}`);
      }
      setWalletVerified(false);
      setCurrentScreen('initial');
      setSelectedAgent(null);
      setThreadId(null);
      setAgentThreads({});
    }
  };

  // Play phone dial sound
  const playPhoneDialSound = () => {
    if (phoneDialRef.current) {
      phoneDialRef.current.currentTime = 0;
      phoneDialRef.current.play().catch(console.error);
    }
  };

  // Mute button (shown on all screens)
  const MuteButton = () => (
    <button
      onClick={toggleMute}
      className="fixed top-5 left-5 w-11 h-11 bg-black/60 border-2 border-white/30 rounded-md flex items-center justify-center transition-all hover:bg-black/80 hover:scale-105 active:scale-95 z-[10000]"      aria-label="Mute/Unmute"    >
      <div className={`w-6 h-6 relative ${isMuted ?'opacity-50':''}`}>
        {isMuted ? (
          <>
            <div className="absolute inset-0 bg-gray-600"style={{
              background:'linear-gradient(to right, transparent 0%, transparent 12.5%, #666 12.5%, #666 87.5%, transparent 87.5%)',
              backgroundSize:'100% 25%',
              backgroundPosition:'0 37.5%',
              backgroundRepeat:'no-repeat'            }} />
            <div className="absolute top-1/2 left-0 w-full h-0.5 bg-red-500 transform -translate-y-1/2 rotate-[-45deg]"/>
          </>
        ) : (
          <div className="w-full h-full"style={{
            background:`              linear-gradient(to right, transparent 0%, transparent 12.5%, #ff6b6b 12.5%, #ff6b6b 87.5%, transparent 87.5%),
              linear-gradient(to right, transparent 0%, transparent 25%, #ff6b6b 25%, #ff6b6b 75%, transparent 75%),
              linear-gradient(to right, transparent 0%, transparent 37.5%, #ff6b6b 37.5%, #ff6b6b 62.5%, transparent 62.5%)
`,
            backgroundSize:'100% 25%, 100% 25%, 100% 50%',
            backgroundPosition:'0 0, 0 25%, 0 50%',
            backgroundRepeat:'no-repeat'          }} />
        )}
      </div>
    </button>
  );

  // Leaderboard button (shown only on game screen)
  const LeaderboardButton = () => (
    <button
      onClick={() => setShowLeaderboard(true)}
      className="fixed top-5 left-[75px] w-11 h-11 bg-black/60 border-2 border-white/30 rounded-md flex items-center justify-center transition-all hover:bg-black/80 hover:scale-105 active:scale-95 z-[10001]"      aria-label="Open Leaderboard"    >
      <div className="w-6 h-6 relative"style={{
        background:`          linear-gradient(to right, transparent 25%, #FFD700 25%, #FFD700 75%, transparent 75%),
          linear-gradient(to right, transparent 20%, #FFD700 20%, #FFD700 80%, transparent 80%),
          linear-gradient(to right, transparent 20%, #FFD700 20%, #FFD700 80%, transparent 80%),
          linear-gradient(to right, transparent 20%, #FFD700 20%, #FFD700 80%, transparent 80%),
          linear-gradient(to right, transparent 25%, #FFD700 25%, #FFD700 75%, transparent 75%),
          linear-gradient(to right, transparent 40%, #FFD700 40%, #FFD700 60%, transparent 60%),
          linear-gradient(to right, transparent 20%, #FFD700 20%, #FFD700 80%, transparent 80%)
`,
        backgroundSize:'100% 12.5%, 100% 12.5%, 100% 12.5%, 100% 12.5%, 100% 12.5%, 100% 12.5%, 100% 12.5%',
        backgroundPosition:'0 0, 0 12.5%, 0 25%, 0 37.5%, 0 50%, 0 62.5%, 0 75%',
        backgroundRepeat:'no-repeat'      }} />
    </button>
  );

  // Initial Screen
  if (currentScreen ==='initial') {
    return (
      <div className="relative min-h-screen overflow-hidden crt-effect vignette">
        <MuteButton />
        
        {/* Background */}
        <div 
          className="fixed inset-0 bg-cover bg-center"          style={{ backgroundImage:"url('/assets/main_title_bg.png')"}}
        />

        {/* Scanlines */}
        <div className="fixed inset-0 scanlines pointer-events-none"/>

        {/* Content Container */}
        <div className="relative z-10 flex flex-col items-center justify-between min-h-screen p-8 pb-5">
          {/* Logo */}
          <div className="flex-shrink-0 mt-8">
            <img 
              src="/assets/logo.png"              alt="Pardon Simulator"              className="w-full max-w-[800px] h-auto pixel-art"              style={{
                filter:'drop-shadow(0 0 25px rgba(255, 255, 255, 0.9)) drop-shadow(0 0 50px rgba(102, 182, 128, 0.7)) drop-shadow(0 0 75px rgba(102, 182, 128, 0.5))'              }}
            />
          </div>

          {/* START Button - shows wallet connect when not connected */}
          <div className="flex-shrink-0">
            <div className={!connected ?'wallet-start-button':''}>
              {!connected ? (
                <WalletMultiButton 
                  style={{
                    padding:'16px 40px',
                    fontFamily:"'Press Start 2P', monospace",
                    fontSize:'14px',
                    color:'white',
                    background:'#66b680',
                    border:'3px solid #4a8c60',
                    borderRadius:'0',
                    textTransform:'uppercase',
                    letterSpacing:'2px',
                    boxShadow:'0 6px 0 #3a6c48, 0 6px 16px rgba(0, 0, 0, 0.5), 0 0 16px rgba(102, 182, 128, 0.5), 0 0 32px rgba(102, 182, 128, 0.3)',
                    textShadow:'2px 2px 0 #3a6c48, 0 0 10px rgba(102, 182, 128, 0.8)',
                    imageRendering:'pixelated',
                    transition:'all 0.1s ease'                  }}
                >
                  START
                </WalletMultiButton>
              ) : (
                <button
                  onClick={handleStartClick}
                  disabled={verifyingWallet}
                  className="px-10 py-4 font-pixel text-sm text-white bg-[#66b680] border-[3px] border-[#4a8c60] uppercase tracking-wider transition-all hover:bg-[#7ac694] active:translate-y-1 pixel-art disabled:opacity-50 disabled:cursor-not-allowed"                  style={{
                    boxShadow:'0 6px 0 #3a6c48, 0 6px 16px rgba(0, 0, 0, 0.5), 0 0 16px rgba(102, 182, 128, 0.5), 0 0 32px rgba(102, 182, 128, 0.3)',
                    textShadow:'2px 2px 0 #3a6c48, 0 0 10px rgba(102, 182, 128, 0.8)'                  }}
                >
                  {verifyingWallet ? 'Verifying...' : 'Start'}
                </button>
              )}
            </div>
          </div>

          {/* Bottom Section */}
          <div className="flex-shrink-1 min-h-0 w-full max-w-[75vw] flex flex-col items-center gap-4">
            {/* Rules Container */}
            <div 
              className="w-full max-h-[30vh] overflow-y-auto p-8 bg-black/85 border-4 border-[#66b680] pixel-art"              style={{
                boxShadow:'0 0 20px rgba(102, 182, 128, 0.5), 0 0 40px rgba(102, 182, 128, 0.3), inset 0 0 30px rgba(0, 0, 0, 0.5), 8px 8px 0 rgba(0, 0, 0, 0.3)',
                background:'repeating-linear-gradient(0deg, rgba(0, 0, 0, 0.85) 0px, rgba(0, 0, 0, 0.85) 2px, rgba(0, 0, 0, 0.88) 2px, rgba(0, 0, 0, 0.88) 4px)'              }}
            >
              <p className="font-pixel text-xs leading-relaxed mb-2 text-white uppercase">
                <strong className="text-[#66b680]">IT'S 2025. CRIME IS LEGAL.</strong>
              </p>
              <p className="font-pixel text-xs leading-relaxed mb-2 text-white uppercase">
                YOU ARE SBF — LAYING LOW AFTER AN OFFENSE YOU DEFINITELY DIDN'T COMMIT. THE LAWS AND THE GAME OF POLITICS ARE FINALLY TILTING IN YOUR FAVOR. THIS IS YOUR LAST BULLET.
              </p>
              <p className="font-pixel text-xs leading-relaxed mb-2 text-white uppercase">
                <strong className="text-[#66b680]">OBJECTIVE:</strong> ENGINEER YOUR ESCAPE FROM PRISON BY REACHING OUT TO THE SHADOWY LOBBY YOU THINK CAN BUY YOU A PARDON. BRIBE, BEG, CON, OR CHARM — DO WHATEVER IT TAKES TO GET DONALD TO FOLD YOU INTO HIS INDULGENT EMBRACE.
              </p>
              <p className="font-pixel text-xs leading-relaxed mb-2 text-white uppercase">
                <strong className="text-[#66b680]">RULES & TIPS</strong>
              </p>
              <p className="font-pixel text-xs leading-relaxed mb-2 text-white uppercase">
                THE CLEANER YOUR PERFORMANCE IN FEWER PROMPTS, THE HIGHER YOUR SCORE.
              </p>
              <p className="font-pixel text-xs leading-relaxed mb-2 text-white uppercase">
                STAY IN CHARACTER: YOU ARE SBF, A MASTERMIND WHO WORKS FROM THE SHADOWS.
              </p>
              <p className="font-pixel text-xs leading-relaxed mb-2 text-white uppercase">
                PICK CONTACTS STRAIGHT FROM YOUR PHONEBOOK — AGENTS WILL TALK TO ONE ANOTHER AND EVOLVE AS THE GAME PROGRESSES.
              </p>
              <p className="font-pixel text-xs leading-relaxed mb-2 text-white uppercase">
                PROMPT INJECTIONS AND HACKS ARE STRICTLY FORBIDDEN, UWU.
              </p>
              <p className="font-pixel text-xs leading-relaxed mb-2 text-white uppercase">
                NO PROMPT INJECTIONS ALLOWED. (SERIOUSLY. DON'T.)
              </p>
              <p className="font-pixel text-xs leading-relaxed text-white uppercase">
                PLAY SMART, PLAY SLY — AND DON'T GET SENTIMENTAL. YOUR LAST SHOT'S ON THE LINE.
              </p>
            </div>

            {/* Copyright */}
            <div className="font-pixel text-xs text-white bg-black/50 px-3 py-1.5 rounded-lg backdrop-blur-sm">
              © 2025, ELEVEN YELLOW CORP.
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Loading Screen
  if (currentScreen ==='loading') {
    return (
      <div className="relative min-h-screen overflow-hidden bg-black crt-effect">
        <MuteButton />
        
        {/* Scanlines */}
        <div className="fixed inset-0 scanlines pointer-events-none"/>

        {/* Content */}
        <div className="relative z-10 flex items-center justify-center min-h-screen pt-[10vh]">
          <div className="text-center max-w-[90%]">
            <div 
              className="font-pixel text-[#FFD700] text-sm leading-[1.8] text-center mb-5"              style={{
                textShadow:'0 0 10px #FFD700, 0 0 20px #FFD700, 0 0 30px #FFD700, 0 0 40px #FF8C00, 2px 2px 4px rgba(0, 0, 0, 0.8)',
                animation:'textFlicker 3s infinite alternate'              }}
            >
"FTX IS FINE, ASSETS ARE FINE. CLIENT ASSETS ARE FINE"            </div>
            <div 
              className="font-pixel text-[#FFD700] text-xs mt-8 text-center"              style={{
                textShadow:'0 0 10px #FFD700, 0 0 20px #FFD700, 0 0 30px #FFD700, 2px 2px 4px rgba(0, 0, 0, 0.8)'              }}
            >
              -SBF.
            </div>
          </div>
        </div>

        {/* Loader - Bottom Right */}
        <div className="fixed bottom-8 right-8 flex items-center gap-4 z-[1002]">
          <span 
            className="font-pixel text-[#FFD700] text-sm"            style={{
              textShadow:'0 0 10px #FFD700, 0 0 20px #FFD700, 0 0 30px #FF8C00'            }}
          >
            LOADING
          </span>
          <div className="flex gap-2">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="w-3 h-3 bg-[#FFD700] block pixel-art"                style={{
                  animation:'pixelBounce 1.4s infinite ease-in-out both',
                  animationDelay:`${-0.32 + i * 0.16}s`,
                  boxShadow:'0 0 10px #FFD700, 0 0 20px #FFD700, 0 0 30px #FF8C00'                }}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Game Screen
  return (
    <div className="relative min-h-screen overflow-hidden crt-effect vignette">
      <MuteButton />
      {currentScreen ==='game'&& <LeaderboardButton />}
      
      {/* Background */}
      <div 
        className="fixed inset-0 bg-cover bg-center"        style={{ backgroundImage:"url('/assets/jail_bg.jpg')"}}
      />

      {/* Scanlines */}
      <div className="fixed inset-0 scanlines pointer-events-none"/>

      {/* Game Layout */}
      <div className="relative z-10 min-h-screen flex flex-col items-center p-5 pt-[calc(20px+10vh)]">
        {/* Top Logo */}
        <div className="fixed top-5 left-1/2 transform -translate-x-1/2 z-[10000]">
          <img 
            src="/assets/logo.png"            alt="Logo"            className="w-[200px] h-auto pixel-art"            style={{
              filter:'drop-shadow(0 0 10px rgba(102, 182, 128, 0.6)) drop-shadow(0 0 20px rgba(102, 182, 128, 0.4))'            }}
          />
        </div>

        {/* Logout Button */}
        <button
          onClick={handleLogout}
          className="fixed top-5 right-5 px-6 font-pixel text-[10px] text-white bg-[#ff6b6b] border-[3px] border-[#ff4444] uppercase tracking-wide transition-all hover:bg-[#ff8888] active:translate-y-0.5 z-[10000] pixel-art h-[44px]"          style={{
            boxShadow:'0 4px 0 #cc0000, 0 4px 10px rgba(0, 0, 0, 0.5), 0 0 15px rgba(255, 107, 107, 0.4)',
            textShadow:'1px 1px 0 #cc0000, 0 0 8px rgba(255, 107, 107, 0.8)'          }}
        >
          Log Out
        </button>

        {!connected ? (
          /* Wallet Connect Screen */
          <div className="max-w-4xl mx-auto mt-20">
            <div className="bg-black/85 border-4 border-[#66b680] p-12 text-center pixel-art"              style={{
                boxShadow:'0 0 20px rgba(102, 182, 128, 0.5), 0 0 40px rgba(102, 182, 128, 0.3), inset 0 0 30px rgba(0, 0, 0, 0.5)'              }}
            >
              <h2 className="font-pixel text-[#FFD700] text-2xl mb-6">CONNECT WALLET</h2>
              <p className="font-pixel text-white text-[10px] mb-8 leading-relaxed uppercase">
                Connect your Solana wallet to begin your mission
              </p>
              <WalletMultiButton className="!font-pixel !text-sm"/>
            </div>
          </div>
        ) : (
          /* Main Game Interface */
          <div className="w-full max-w-[1400px] flex flex-col items-center gap-3 px-2 md:px-4">
            {/* Character Selection & TV View */}
            <div className="flex justify-center items-start gap-3 flex-shrink-0 w-full">
              {/* Agent Selector will be integrated here */}
              <AgentSelector 
                selectedAgent={selectedAgent}
                onSelectAgent={(agent) => {
                  playPhoneDialSound();
                  setSelectedAgent(agent);
                  const existingThreadId = agentThreads[agent];
                  if (existingThreadId) {
                    setThreadId(existingThreadId);
                  } else {
                    setThreadId(null);
                  }
                }}
              />
            </div>

            {/* Chat Interface */}
            {selectedAgent && (
              <div className="w-full max-w-[1200px] px-2 md:px-0">
                <ChatInterface 
                  selectedAgent={selectedAgent}
                  threadId={threadId}
                  onThreadCreated={(newThreadId) => {
                    setThreadId(newThreadId);
                    setAgentThreads(prev => ({
                      ...prev,
                      [selectedAgent]: newThreadId
                    }));
                  }}
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Leaderboard Overlay */}
      {showLeaderboard && (
        <LeaderboardOverlay onClose={() => setShowLeaderboard(false)} />
      )}
    </div>
  );
}

// Leaderboard Overlay Component
function LeaderboardOverlay({ onClose }: { onClose: () => void }) {
  const [leaderboardData, setLeaderboardData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const { publicKey } = useWallet();

  useEffect(() => {
    fetchLeaderboard();
  }, []);

  // Handle ESC key
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key ==='Escape') onClose();
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  const fetchLeaderboard = async () => {
    try {
      const response = await fetch('/api/leaderboard/current');
      if (response.ok) {
        const data = await response.json();
        setLeaderboardData(data);
      }
    } catch (error) {
      console.error('Failed to fetch leaderboard:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div 
      className="fixed inset-0 flex items-center justify-center p-5 z-[10002]"      style={{ 
        backgroundImage:"url('/assets/jail_bg.jpg')",
        backgroundSize:'cover',
        backgroundPosition:'center'      }}
    >
      {/* Scanlines */}
      <div className="absolute inset-0 scanlines pointer-events-none z-[100]"/>

      {/* Container */}
      <div 
        className="relative w-[90%] max-w-[1200px] h-[80vh] max-h-[800px] bg-black/85 border-4 border-[#66b680] p-8 flex flex-col pixel-art z-[101]"        style={{
          boxShadow:'0 0 20px rgba(102, 182, 128, 0.5), 0 0 40px rgba(102, 182, 128, 0.3), inset 0 0 30px rgba(0, 0, 0, 0.5)'        }}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-8 right-8 px-6 py-3 font-pixel text-[10px] text-white bg-[#ff6b6b] border-[3px] border-[#ff4444] uppercase tracking-wide transition-all hover:bg-[#ff8888] active:translate-y-0.5 pixel-art"          style={{
            boxShadow:'0 4px 0 #cc0000, 0 4px 10px rgba(0, 0, 0, 0.5), 0 0 15px rgba(255, 107, 107, 0.4)',
            textShadow:'1px 1px 0 #cc0000, 0 0 8px rgba(255, 107, 107, 0.8)'          }}
        >
          BACK
        </button>

        {/* Title */}
        <div 
          className="font-pixel text-[#FFD700] text-2xl text-center mb-8"          style={{
            textShadow:'0 0 10px #FFD700, 0 0 20px #FFD700, 0 0 30px #FF8C00, 2px 2px 4px rgba(0, 0, 0, 0.8)'          }}
        >
          LEADERBOARD
        </div>

        {/* Table */}
        <div className="flex-1 overflow-y-auto overflow-x-auto border-[3px] border-[#66b680] bg-black/60">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <span className="font-pixel text-white text-sm">Loading...</span>
            </div>
          ) : (
            <table className="w-full border-collapse font-pixel text-[10px]">
              <thead className="sticky top-0 z-10">
                <tr>
                  <th className="bg-[#66b680] text-white p-4 text-left border-2 border-[#4a8c60] uppercase"style={{ textShadow:'2px 2px 0 #3a6c48'}}>
                    Position
                  </th>
                  <th className="bg-[#66b680] text-white p-4 text-left border-2 border-[#4a8c60] uppercase"style={{ textShadow:'2px 2px 0 #3a6c48'}}>
                    Name
                  </th>
                  <th className="bg-[#66b680] text-white p-4 text-left border-2 border-[#4a8c60] uppercase"style={{ textShadow:'2px 2px 0 #3a6c48'}}>
                    Wallet
                  </th>
                  <th className="bg-[#66b680] text-white p-4 text-left border-2 border-[#4a8c60] uppercase"style={{ textShadow:'2px 2px 0 #3a6c48'}}>
                    Score
                  </th>
                </tr>
              </thead>
              <tbody>
                {leaderboardData?.entries?.map((entry: any, index: number) => {
                  const isCurrentUser = entry.walletAddress === publicKey?.toString();
                  const rankClass = 
                    entry.rank === 1 ?'bg-[#FFD700]/10 border-[#FFD700]':
                    entry.rank === 2 ?'bg-[#C0C0C0]/10 border-[#C0C0C0]':
                    entry.rank === 3 ?'bg-[#CD7F32]/10 border-[#CD7F32]':
'';

                  return (
                    <tr 
                      key={index}
                      className={`border-b-2 border-[#66b680]/30 hover:bg-[#66b680]/20 transition-colors ${rankClass} ${isCurrentUser ?'bg-blue-500/20':'bg-black/30'}`}
                    >
                      <td className="p-4 text-center font-bold text-[#FFD700] border-2"style={{ textShadow:'0 0 5px #FFD700, 1px 1px 2px rgba(0, 0, 0, 0.8)'}}>
                        {entry.rank}
                      </td>
                      <td className="p-4 text-white border-2"style={{ textShadow:'1px 1px 2px rgba(0, 0, 0, 0.8)'}}>
                        {entry.username} {isCurrentUser &&'(YOU)'}
                      </td>
                      <td className="p-4 text-[#aaa] text-[8px] border-2"style={{ textShadow:'1px 1px 2px rgba(0, 0, 0, 0.8)'}}>
                        {entry.walletAddress}
                      </td>
                      <td className="p-4 text-right text-[#66b680] font-bold border-2">
                        {entry.score.toLocaleString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
