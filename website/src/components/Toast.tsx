'use client';

import { useEffect } from'react';
import { createPortal } from'react-dom';
import { X, CheckCircle, AlertCircle, Info, Loader2 } from'lucide-react';

export type ToastType ='success'|'error'|'info'|'loading';

export interface ToastProps {
  id: string;
  message: string;
  type: ToastType;
  onClose: () => void;
  duration?: number; // milliseconds, 0 = don't auto-close
}

export function Toast({ id, message, type, onClose, duration = 5000 }: ToastProps) {
  useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(() => {
        onClose();
      }, duration);
      
      return () => clearTimeout(timer);
    }
  }, [duration, onClose]);

  const getIcon = () => {
    switch (type) {
      case'success':
        return <CheckCircle className="w-5 h-5 text-green-400"/>;
      case'error':
        return <AlertCircle className="w-5 h-5 text-red-400"/>;
      case'loading':
        return <Loader2 className="w-5 h-5 text-blue-400 animate-spin"/>;
      case'info':
      default:
        return <Info className="w-5 h-5 text-blue-400"/>;
    }
  };

  const getBackgroundColor = () => {
    switch (type) {
      case'success':
        return'bg-green-900/90 border-green-500/50';
      case'error':
        return'bg-red-900/90 border-red-500/50';
      case'loading':
        return'bg-blue-900/90 border-blue-500/50';
      case'info':
      default:
        return'bg-gray-800/90 border-gray-500/50';
    }
  };

  return (
    <div
      className={`        ${getBackgroundColor()}
        border rounded-lg shadow-lg p-4 min-w-[300px] max-w-[400px]
        backdrop-blur-sm
        animate-slide-in-right
`}
    >
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 mt-0.5">
          {getIcon()}
        </div>
        
        <div className="flex-1 text-white text-sm">
          {message}
        </div>
        
        <button
          onClick={onClose}
          className="flex-shrink-0 text-gray-400 hover:text-white transition-colors"          aria-label="Close notification"        >
          <X className="w-4 h-4"/>
        </button>
      </div>
    </div>
  );
}

export function ToastContainer({ children }: { children: React.ReactNode }) {
  // Use portal to render at document body level, bypassing any stacking context issues
  if (typeof window === 'undefined') {
    return null;
  }
  
  return createPortal(
    <div className="fixed top-4 right-4 z-[99999] flex flex-col gap-2 pointer-events-none">
      <div className="pointer-events-auto">
        {children}
      </div>
    </div>,
    document.body
  );
}

