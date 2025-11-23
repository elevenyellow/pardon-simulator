"""
Structured logging framework for Python agents

Provides environment-aware logging with proper levels and context.
Replaces scattered print() statements with structured logging.
"""

import logging
import os
import sys
import json
from typing import Any, Dict, Optional
from datetime import datetime


class StructuredLogger:
    """
    Structured logger with JSON output and context support.
    
    Features:
    - Environment-aware log levels
    - Structured JSON output in production
    - Context injection (agent_id, user_wallet, etc.)
    - Performance tracking
    """
    
    def __init__(self, name: str, context: Optional[Dict[str, str]] = None):
        """
        Initialize structured logger.
        
        Args:
            name: Logger name (usually module name or agent ID)
            context: Default context to include in all logs
        """
        self.name = name
        self.context = context or {}
        self.logger = logging.getLogger(name)
        
        # Set log level from environment
        log_level = os.getenv("LOG_LEVEL", "INFO").upper()
        self.logger.setLevel(getattr(logging, log_level, logging.INFO))
        
        # Configure handler
        if not self.logger.handlers:
            handler = logging.StreamHandler(sys.stdout)
            
            # Use JSON formatter in production, simple formatter in development
            env = os.getenv("NODE_ENV", "development")
            if env == "production":
                handler.setFormatter(JSONFormatter())
            else:
                handler.setFormatter(logging.Formatter(
                    '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
                ))
            
            self.logger.addHandler(handler)
    
    def _log(self, level: str, message: str, **kwargs):
        """Internal logging method with context injection."""
        # Merge default context with log-specific context
        log_context = {**self.context, **kwargs}
        
        # Get the logging method (debug, info, warning, error)
        log_method = getattr(self.logger, level.lower())
        
        # Log with extra context
        log_method(message, extra=log_context)
    
    def debug(self, message: str, **kwargs):
        """Log debug message."""
        self._log("DEBUG", message, **kwargs)
    
    def info(self, message: str, **kwargs):
        """Log info message."""
        self._log("INFO", message, **kwargs)
    
    def warning(self, message: str, **kwargs):
        """Log warning message."""
        self._log("WARNING", message, **kwargs)
    
    def error(self, message: str, **kwargs):
        """Log error message."""
        self._log("ERROR", message, **kwargs)
    
    def critical(self, message: str, **kwargs):
        """Log critical message."""
        self._log("CRITICAL", message, **kwargs)


class JSONFormatter(logging.Formatter):
    """JSON formatter for structured logging in production."""
    
    def format(self, record: logging.LogRecord) -> str:
        """Format log record as JSON."""
        log_data = {
            "timestamp": datetime.utcnow().isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        
        # Add any extra context from the record
        if hasattr(record, '__dict__'):
            for key, value in record.__dict__.items():
                if key not in ['name', 'msg', 'args', 'created', 'filename', 'funcName',
                              'levelname', 'levelno', 'lineno', 'module', 'msecs',
                              'message', 'pathname', 'process', 'processName',
                              'relativeCreated', 'thread', 'threadName', 'exc_info',
                              'exc_text', 'stack_info']:
                    log_data[key] = value
        
        return json.dumps(log_data)


# Global logger instance
_default_logger: Optional[StructuredLogger] = None


def get_logger(name: Optional[str] = None, **context) -> StructuredLogger:
    """
    Get or create a structured logger.
    
    Args:
        name: Logger name (defaults to calling module)
        **context: Default context for this logger
    
    Returns:
        StructuredLogger instance
    """
    global _default_logger
    
    if name is None:
        # Use calling module name
        import inspect
        frame = inspect.currentframe()
        if frame and frame.f_back:
            name = frame.f_back.f_globals.get('__name__', 'unknown')
    
    return StructuredLogger(name, context)


def configure_root_logger(level: str = "INFO"):
    """
    Configure root logger for the entire application.
    
    Args:
        level: Log level (DEBUG, INFO, WARNING, ERROR, CRITICAL)
    """
    logging.basicConfig(
        level=getattr(logging, level.upper(), logging.INFO),
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )

