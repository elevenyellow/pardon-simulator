'use client';

import { useState, useEffect, useRef, useCallback } from'react';
import dynamic from'next/dynamic';
import { useWallet } from'@solana/wallet-adapter-react';
import AgentSelector from'@/components/AgentSelector';
import ChatInterface from'@/components/ChatInterface';
import'@/lib/console-filter';  // Suppress excessive wallet SDK and CSS logging
import bs58 from'bs58';
import { apiClient } from'@/lib/api-client';

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
  const [isChatFullscreen, setIsChatFullscreen] = useState(false);
  
  // Audio refs
  const bgMusicRef = useRef<HTMLAudioElement | null>(null);
  const prisonDoorRef = useRef<HTMLAudioElement | null>(null);
  const phoneDialRef = useRef<HTMLAudioElement | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [musicStarted, setMusicStarted] = useState(false);
  
  // Wallet verification state
  const [walletVerified, setWalletVerified] = useState(false);
  const [verifyingWallet, setVerifyingWallet] = useState(false);
  
  // Check for enable hash in URL
  const [isEnabled, setIsEnabled] = useState(false);
  
  useEffect(() => {
    // Check initial hash
    const checkHash = () => {
      const hash = window.location.hash.toLowerCase();
      setIsEnabled(hash === '#start' || hash === '#enable');
    };
    
    checkHash();
    
    // Listen for hash changes
    window.addEventListener('hashchange', checkHash);
    return () => window.removeEventListener('hashchange', checkHash);
  }, []);

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

          {/* START Button - Always visible */}
          <div className="flex-shrink-0">
            <div>
              <div className={!connected ? 'wallet-start-button' : ''}>
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
          </div>

          {/* Bottom Section - Rules always visible */}
          <div className="flex-shrink-0 w-full max-w-[75vw] flex flex-col items-center gap-4">
            {/* Rules Container - Fixed scroll for desktop */}
            <div 
              className="w-full overflow-y-scroll p-8 bg-black/85 border-4 border-[#66b680] pixel-art"
              style={{
                maxHeight: 'min(400px, 30vh)', // Explicit max height for desktop
                boxShadow:'0 0 20px rgba(102, 182, 128, 0.5), 0 0 40px rgba(102, 182, 128, 0.3), inset 0 0 30px rgba(0, 0, 0, 0.5), 8px 8px 0 rgba(0, 0, 0, 0.3)',
                background:'repeating-linear-gradient(0deg, rgba(0, 0, 0, 0.85) 0px, rgba(0, 0, 0, 0.85) 2px, rgba(0, 0, 0, 0.88) 2px, rgba(0, 0, 0, 0.88) 4px)',
                WebkitOverflowScrolling: 'touch' // Smooth scroll on mobile
              }}
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
              <p className="font-pixel text-xs leading-relaxed text-white/70 uppercase mt-4 pt-4 border-t border-[#66b680]/30">
                $PARDON IS A COIN WITH NO INTRINSIC VALUE OR EXPECTATION OF FINANCIAL RETURN. THE COIN IS FOR ENTERTAINMENT PURPOSES ONLY.
              </p>
            </div>
          </div>

          {/* Token Contract & Social Links - Always Visible */}
          <div className="flex-shrink-0 flex items-center gap-3">
            <div className="font-pixel text-[10px] text-white/90 bg-black/50 px-3 py-1.5 rounded-lg backdrop-blur-sm hover:bg-black/70 transition-all">
              <a 
                href="https://solscan.io/token/A38LewMbt9t9HvNUrsPtHQPHLfEPVT5rfadN4VqBbonk"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-[#66b680] transition-colors"
              >
                A38LewMbt9t9HvNUrsPtHQPHLfEPVT5rfadN4VqBbonk
              </a>
            </div>
            
            {/* DEXScreener Link */}
            <a
              href="https://dexscreener.com/solana/4qvv7cbna1p7j8ng4i6ybnyjxthyntbpwxejujgvfbpu"
              target="_blank"
              rel="noopener noreferrer"
              className="bg-black/50 p-2 rounded-lg backdrop-blur-sm hover:bg-black/70 transition-all hover:scale-110"
              aria-label="View on DEXScreener"
            >
              <svg className="w-[22px] h-[22px] opacity-70 hover:opacity-100 transition-opacity" viewBox="175 40 75 180" fill="white">
                <path d="m 229.20231,212.487 c -9.84955,-15.95679 -17.10951,-27.68853 -17.18536,-27.77072 -0.10823,-0.11728 -1.03067,0.71493 -7.73056,6.97434 -3.15957,2.95184 -5.82479,5.39481 -5.92272,5.42881 -0.0979,0.034 -1.76723,-2.52272 -3.70955,-5.68158 -8.88902,-14.45656 -9.24621,-15.0041 -9.64665,-14.7877 -0.20702,0.11188 -4.26718,3.32057 -9.02256,7.13044 -4.75539,3.80986 -8.68823,6.92702 -8.73966,6.92702 -0.14065,0 0.17194,-0.72857 1.6251,-3.78772 4.86604,-10.24387 8.18971,-21.57982 9.73362,-33.19825 0.93422,-7.03028 1.04615,-9.32332 1.23981,-25.4 0.11179,-9.28102 0.29496,-16.67472 0.43881,-17.71316 0.87602,-6.32401 2.49849,-11.631043 5.46607,-17.879383 0.80966,-1.704763 1.28417,-2.467365 1.48448,-2.385795 0.16193,0.06594 1.11598,1.193503 2.12012,2.505695 1.00414,1.31219 2.88408,3.58807 4.17763,5.05753 1.29356,1.46945 2.35169,2.772873 2.3514,2.896493 -2.9e-4,0.12362 -0.4034,1.15859 -0.89581,2.29994 -1.4591,3.38205 -1.86502,5.12602 -1.8766,8.06254 -0.0122,3.08929 0.27103,4.3513 1.59925,7.12612 0.88259,1.84384 1.28425,2.38305 3.15352,4.23334 1.61454,1.59815 2.58402,2.35167 3.93645,3.05954 2.74242,1.43541 5.58856,2.28558 8.43473,2.51952 1.33696,0.1099 2.5263,0.29528 2.64299,0.41197 0.13434,0.13434 0.12126,1.14305 -0.0357,2.75009 -0.1363,1.39586 -0.24782,3.08973 -0.24782,3.76415 v 1.22622 l -7.40833,4.2862 c -4.07458,2.35742 -7.94204,4.61641 -8.59435,5.01999 l -1.18602,0.73378 0.51759,0.33791 c 0.28468,0.18584 3.32497,1.91856 6.7562,3.85047 7.75227,4.36482 8.14081,4.6235 10.23178,6.8121 4.44819,4.65587 8.75093,13.30647 13.07191,26.28089 1.49454,4.48757 7.18138,23.20019 7.4991,24.67587 0.0594,0.27573 0.17446,0.50132 0.25576,0.50132 0.0813,0 1.33753,-4.03559 2.79162,-8.96798 4.81679,-16.33894 7.70152,-24.59019 10.95933,-31.34728 3.45709,-7.17042 6.42381,-11.25045 9.89418,-13.60713 0.72985,-0.49563 4.01023,-2.41113 7.28973,-4.25665 3.27951,-1.84553 6.29886,-3.5616 6.70967,-3.81349 l 0.74693,-0.45798 -1.19254,-0.7382 c -0.6559,-0.40602 -4.5263,-2.66797 -8.60088,-5.02656 l -7.40834,-4.28836 v -1.22367 c 0,-0.67302 -0.11151,-2.36574 -0.24781,-3.7616 -0.15071,-1.54349 -0.16756,-2.61819 -0.043,-2.74277 0.11266,-0.11265 1.25608,-0.30443 2.54093,-0.42618 5.43156,-0.51464 9.09683,-2.16393 12.57806,-5.65984 5.02045,-5.04163 6.06173,-11.31294 3.07708,-18.53244 -0.55286,-1.3373 -1.05267,-2.63198 -1.1107,-2.87707 -0.0773,-0.32661 0.49509,-1.126193 2.14346,-2.994053 1.23693,-1.40165 3.16502,-3.73276 4.28465,-5.18027 1.11963,-1.447502 2.11094,-2.631823 2.20292,-2.631823 0.092,0 0.71901,1.12796 1.3934,2.506583 3.40786,6.96644 5.10672,13.144343 5.70698,20.753413 0.12466,1.58023 0.22874,7.54588 0.2313,13.25701 0.007,15.62401 0.41985,22.76854 1.7803,30.80774 1.70176,10.05606 4.96262,20.48379 9.18541,29.37351 1.68336,3.54376 1.80936,3.86082 1.45046,3.64994 -0.15281,-0.0898 -0.97968,-0.7263 -1.83749,-1.41446 -10.49805,-8.42189 -13.99381,-11.2011 -14.96162,-11.89481 l -1.14759,-0.82258 -1.45126,2.28876 c -0.7982,1.25882 -3.66934,5.89824 -6.38031,10.30982 -2.71098,4.41158 -5.01822,8.02105 -5.1272,8.02105 -0.10898,0 -2.78735,-2.41643 -5.95193,-5.36984 -6.68457,-6.23853 -7.62965,-7.08946 -7.74284,-6.97149 -0.0459,0.0478 -4.78785,7.70694 -10.5377,17.02028 -12.30685,19.93405 -11.05854,17.93597 -11.20555,17.93597 -0.0654,0 -2.11489,-3.23349 -4.55434,-7.18553 z m 2.47839,-38.12822 c -1.04956,-3.10975 -2.27815,-6.5939 -2.73019,-7.74255 -1.26126,-3.2049 -3.45036,-7.4355 -5.24026,-10.12719 -2.03635,-3.0623 -5.93648,-7.02125 -8.72173,-8.85326 -1.07226,-0.70529 -1.94956,-1.35998 -1.94956,-1.45487 0,-0.16028 1.05554,-0.8141 5.01316,-3.10523 1.79381,-1.03848 2.50532,-1.65242 2.79354,-2.41048 0.11217,-0.29504 0.30382,-2.63255 0.42587,-5.19446 0.12205,-2.5619 0.38389,-5.44409 0.58187,-6.40487 1.0181,-4.94072 3.67762,-9.16626 7.25654,-11.52943 3.00103,-1.98159 6.30466,-1.98085 9.30015,0.002 2.61494,1.73102 4.80677,4.53066 6.17724,7.89021 0.9832,2.41021 1.41017,5.05876 1.6696,10.35694 0.28877,5.89716 -0.0838,5.26441 4.82633,8.19755 1.8688,1.11636 3.39781,2.10635 3.39781,2.19998 0,0.0936 -0.8773,0.74647 -1.94956,1.45076 -2.76114,1.8136 -6.66156,5.77622 -8.71607,8.85507 -1.79107,2.68407 -3.97889,6.90762 -5.24592,10.12719 -0.45204,1.14865 -1.68062,4.6328 -2.73019,7.74255 -1.04956,3.10975 -1.98525,5.65409 -2.07931,5.65409 -0.0941,0 -1.02976,-2.54434 -2.07932,-5.65409 z m -22.54086,-55.02376 c -4.63737,-1.21197 -7.48786,-4.27948 -7.48804,-8.05812 -6e-5,-1.25447 0.72746,-4.20239 1.09283,-4.4282 0.091,-0.0563 0.76509,0.35107 1.4979,0.90518 3.57621,2.70412 9.23339,6.27609 13.47132,8.50587 l 2.55822,1.346 -1.23701,0.54706 c -0.68035,0.30088 -1.78142,0.7109 -2.44681,0.91115 -1.63464,0.49195 -5.99593,0.65066 -7.44841,0.27106 z m 42.5759,-0.0559 c -0.84694,-0.18894 -2.19918,-0.64246 -3.00499,-1.00783 l -1.4651,-0.66431 2.55938,-1.34661 c 4.26779,-2.2455 9.68093,-5.66611 13.47247,-8.51338 0.73281,-0.55032 1.40687,-0.95454 1.4979,-0.89828 0.3496,0.21607 1.09108,3.14957 1.09767,4.3427 0.009,1.6544 -0.34204,2.74909 -1.35305,4.21784 -1.03363,1.50162 -3.05943,2.92525 -5.08369,3.57258 -1.98693,0.63539 -5.58412,0.7739 -7.72059,0.29729 z m -29.57906,-9.95207 c -4.77415,-2.53037 -11.03972,-6.67864 -15.49696,-10.260133 -5.25491,-4.22245 -12.40287,-11.219758 -15.86533,-15.530962 -3.51,-4.370399 -6.73162,-9.697042 -8.16332,-13.497283 l -0.51077,-1.355767 2.82585,2.804012 c 1.56797,1.555857 3.39291,3.136719 4.09976,3.551445 1.789,1.049651 3.88997,1.86672 5.11112,1.987716 1.03813,0.102862 1.04174,0.100794 3.2307,-1.851828 8.38888,-7.483149 16.92069,-11.61752 27.91891,-13.52902 2.37481,-0.412744 3.6404,-0.485217 8.47338,-0.485217 6.24864,0 8.56579,0.274429 13.8744,1.643196 8.18363,2.110059 15.81497,6.309159 22.59521,12.432869 l 2.09767,1.894553 1.0475,-0.103765 c 1.22859,-0.121705 3.32643,-0.936569 5.11932,-1.988504 0.70685,-0.414726 2.53179,-1.995588 4.09976,-3.551445 l 2.82585,-2.804012 -0.53072,1.410002 c -2.06868,5.495971 -6.8317,12.46619 -12.60973,18.453125 -8.70016,9.014705 -17.53218,15.821168 -27.11896,20.899418 l -2.30233,1.21957 -1.23301,-0.74248 c -0.67816,-0.40836 -1.9983,-1.07273 -2.93364,-1.47637 -1.66392,-0.71805 -1.77035,-0.73389 -4.93132,-0.73389 -3.16098,0 -3.26741,0.0158 -4.93133,0.73389 -0.93534,0.40364 -2.25558,1.06807 -2.93386,1.47651 l -1.23324,0.74261 z"></path>
              </svg>
            </a>
            
            {/* Twitter/X Link */}
            <a
              href="http://x.com/pardonsimulator"
              target="_blank"
              rel="noopener noreferrer"
              className="bg-black/50 p-2 rounded-lg backdrop-blur-sm hover:bg-black/70 transition-all hover:scale-110"
              aria-label="Follow on X/Twitter"
            >
              <svg 
                width="20" 
                height="20" 
                viewBox="0 0 24 24" 
                fill="white"
                className="opacity-70 hover:opacity-100 transition-opacity"
              >
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
              </svg>
            </a>
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
      {!isChatFullscreen && <MuteButton />}
      {currentScreen ==='game' && !isChatFullscreen && <LeaderboardButton />}
      
      {/* Background */}
      <div 
        className="fixed inset-0 bg-cover bg-center"        style={{ backgroundImage:"url('/assets/jail_bg.jpg')"}}
      />

      {/* Scanlines */}
      <div className="fixed inset-0 scanlines pointer-events-none"/>

      {/* Game Layout */}
      <div className="relative z-10 min-h-screen flex flex-col items-center p-5 pt-[calc(20px+10vh)]">
        {/* Top Logo */}
        {!isChatFullscreen && (
          <div className="fixed top-5 left-1/2 transform -translate-x-1/2 z-[10000]">
            <img 
              src="/assets/logo.png"              alt="Logo"              className="w-[200px] h-auto pixel-art"              style={{
                filter:'drop-shadow(0 0 10px rgba(102, 182, 128, 0.6)) drop-shadow(0 0 20px rgba(102, 182, 128, 0.4))'              }}
            />
          </div>
        )}

        {/* Logout Button */}
        {!isChatFullscreen && (
          <button
            onClick={handleLogout}
            className="fixed top-5 right-5 px-6 font-pixel text-[10px] text-white bg-[#ff6b6b] border-[3px] border-[#ff4444] uppercase tracking-wide transition-all hover:bg-[#ff8888] active:translate-y-0.5 z-[10000] pixel-art h-[44px]"            style={{
              boxShadow:'0 4px 0 #cc0000, 0 4px 10px rgba(0, 0, 0, 0.5), 0 0 15px rgba(255, 107, 107, 0.4)',
              textShadow:'1px 1px 0 #cc0000, 0 0 8px rgba(255, 107, 107, 0.8)'            }}
          >
            Log Out
          </button>
        )}

        {!connected ? (
          /* Wallet Connect Screen - TEMPORARILY DISABLED */
          <div className="max-w-4xl mx-auto mt-20">
            <div className="bg-black/85 border-4 border-[#66b680] p-12 text-center pixel-art"              style={{
                boxShadow:'0 0 20px rgba(102, 182, 128, 0.5), 0 0 40px rgba(102, 182, 128, 0.3), inset 0 0 30px rgba(0, 0, 0, 0.5)'              }}
            >
              <h2 className="font-pixel text-[#FFD700] text-2xl mb-6">PARDON SIMULATOR</h2>
              <p className="font-pixel text-white text-[10px] mb-8 leading-relaxed uppercase">
                Coming Soon
              </p>
              <button
                disabled
                className="!font-pixel !text-sm px-8 py-4 bg-gray-600 text-gray-400 border-2 border-gray-500 cursor-not-allowed uppercase tracking-wider"
                style={{
                  boxShadow: '0 4px 0 #444, 0 4px 10px rgba(0, 0, 0, 0.5)',
                  textShadow: '1px 1px 0 #333'
                }}
              >
                Coming Soon
              </button>
              {/* Original wallet button - hidden but preserved */}
              <div style={{ display: 'none' }}>
                <WalletMultiButton className="!font-pixel !text-sm"/>
              </div>
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
                  isMuted={isMuted}
                  onToggleMute={toggleMute}
                  onShowLeaderboard={() => setShowLeaderboard(true)}
                  onLogout={handleLogout}
                  onFullscreenChange={setIsChatFullscreen}
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
  const [countdown, setCountdown] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 });
  const { publicKey } = useWallet();

  useEffect(() => {
    fetchLeaderboard();
  }, []);

  // Countdown timer
  useEffect(() => {
    const updateCountdown = () => {
      // Import the function inline to avoid build issues
      const getTimeUntilReset = () => {
        const now = new Date();
        const currentDay = now.getUTCDay();
        const currentHour = now.getUTCHours();
        
        let daysUntilMonday: number;
        
        if (currentDay === 1) {
          if (currentHour < 14) {
            daysUntilMonday = 0;
          } else {
            daysUntilMonday = 7;
          }
        } else if (currentDay === 0) {
          daysUntilMonday = 1;
        } else {
          daysUntilMonday = (8 - currentDay) % 7;
        }
        
        const nextReset = new Date(now);
        nextReset.setUTCDate(now.getUTCDate() + daysUntilMonday);
        nextReset.setUTCHours(14, 0, 0, 0);
        
        const totalMs = nextReset.getTime() - now.getTime();
        
        const days = Math.floor(totalMs / (1000 * 60 * 60 * 24));
        const hours = Math.floor((totalMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((totalMs % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((totalMs % (1000 * 60)) / 1000);
        
        return { days, hours, minutes, seconds };
      };

      setCountdown(getTimeUntilReset());
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
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
          className="font-pixel text-[#FFD700] text-2xl text-center mb-2"          style={{
            textShadow:'0 0 10px #FFD700, 0 0 20px #FFD700, 0 0 30px #FF8C00, 2px 2px 4px rgba(0, 0, 0, 0.8)'          }}
        >
          LEADERBOARD
        </div>

        {/* Countdown Timer */}
        <div className="text-center mb-6">
          <div 
            className="font-pixel text-white text-[10px] mb-2"
            style={{ textShadow: '1px 1px 2px rgba(0, 0, 0, 0.8)' }}
          >
            WEEK RESETS IN
          </div>
          <div className="flex justify-center gap-4">
            <div className="flex flex-col items-center">
              <div 
                className="font-pixel text-[#FFD700] text-xl px-3 py-1 bg-black/60 border-2 border-[#66b680] min-w-[3rem]"
                style={{ textShadow: '0 0 10px #FFD700, 1px 1px 2px rgba(0, 0, 0, 0.8)' }}
              >
                {countdown.days.toString().padStart(2, '0')}
              </div>
              <span className="font-pixel text-[8px] text-white/70 mt-1">DAYS</span>
            </div>
            <div className="flex flex-col items-center">
              <div 
                className="font-pixel text-[#FFD700] text-xl px-3 py-1 bg-black/60 border-2 border-[#66b680] min-w-[3rem]"
                style={{ textShadow: '0 0 10px #FFD700, 1px 1px 2px rgba(0, 0, 0, 0.8)' }}
              >
                {countdown.hours.toString().padStart(2, '0')}
              </div>
              <span className="font-pixel text-[8px] text-white/70 mt-1">HRS</span>
            </div>
            <div className="flex flex-col items-center">
              <div 
                className="font-pixel text-[#FFD700] text-xl px-3 py-1 bg-black/60 border-2 border-[#66b680] min-w-[3rem]"
                style={{ textShadow: '0 0 10px #FFD700, 1px 1px 2px rgba(0, 0, 0, 0.8)' }}
              >
                {countdown.minutes.toString().padStart(2, '0')}
              </div>
              <span className="font-pixel text-[8px] text-white/70 mt-1">MIN</span>
            </div>
            <div className="flex flex-col items-center">
              <div 
                className="font-pixel text-[#FFD700] text-xl px-3 py-1 bg-black/60 border-2 border-[#66b680] min-w-[3rem]"
                style={{ textShadow: '0 0 10px #FFD700, 1px 1px 2px rgba(0, 0, 0, 0.8)' }}
              >
                {countdown.seconds.toString().padStart(2, '0')}
              </div>
              <span className="font-pixel text-[8px] text-white/70 mt-1">SEC</span>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-y-auto overflow-x-auto border-[3px] border-[#66b680] bg-black/60">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <span className="font-pixel text-white text-sm">Loading...</span>
            </div>
          ) : leaderboardData?.entries?.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full p-8">
              <div 
                className="font-pixel text-[#FFD700] text-lg mb-4 text-center"
                style={{ textShadow: '0 0 10px #FFD700, 0 0 20px #FFD700' }}
              >
                NO PARDONS GRANTED YET
              </div>
              <p 
                className="font-pixel text-[#aaa] text-[10px] text-center max-w-md"
                style={{ textShadow: '1px 1px 2px rgba(0, 0, 0, 0.8)' }}
              >
                Presidential pardons have not yet been awarded this week. The competition is open for eligible participants.
              </p>
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
