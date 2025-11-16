// Filter out excessive console output from wallet SDKs and other dependencies
// This runs in the browser only

if (typeof window !== 'undefined') {
  const originalConsoleLog = console.log;
  const originalConsoleWarn = console.warn;
  const originalConsoleInfo = console.info;

  // Patterns to suppress (matches against stringified args)
  const suppressPatterns = [
    /Coinbase Wallet SDK/i,
    /wallet-standard/i,
    /^\.cds-/,  // Coinbase Design System class names
    /^<style>/,  // Inline style tags
    /rgba?\(\d+,\s*\d+,\s*\d+/,  // CSS colors
    /font-family:/i,
    /font-size:/i,
    /line-height:/i,
    /border-radius:/i,
    /background-color:/i,
  ];

  const shouldSuppress = (args: any[]): boolean => {
    const message = args.join(' ');
    
    // Suppress messages longer than 1000 chars (likely CSS dumps)
    if (message.length > 1000) {
      return true;
    }
    
    // Suppress based on patterns
    return suppressPatterns.some(pattern => pattern.test(message));
  };

  // Override console methods
  console.log = (...args: any[]) => {
    if (!shouldSuppress(args)) {
      originalConsoleLog.apply(console, args);
    }
  };

  console.warn = (...args: any[]) => {
    if (!shouldSuppress(args)) {
      originalConsoleWarn.apply(console, args);
    }
  };

  console.info = (...args: any[]) => {
    if (!shouldSuppress(args)) {
      originalConsoleInfo.apply(console, args);
    }
  };
}

export {};

