"""
Agent Worker Pool - Concurrent Message Processing
Transforms single-threaded blocking agents into concurrent workers
"""

import asyncio
from asyncio import Queue, create_task
from typing import Callable, Any, Optional, Dict
import time
import json


class AgentWorkerPool:
    """Concurrent worker pool for processing agent mentions"""
    
    def __init__(self, agent_id: str, num_workers: int = 3, coral_tools: list = None):
        self.agent_id = agent_id
        self.num_workers = num_workers
        self.request_queue = Queue()
        self.workers = []
        self.active_requests: Dict[str, float] = {}
        self.coral_tools = coral_tools or []
        self.send_message_tool = None
        
        # Find send_message tool for acknowledgements
        for tool in self.coral_tools:
            if hasattr(tool, 'name') and 'send_message' in tool.name.lower():
                self.send_message_tool = tool
                break
                
    async def start(self, executor_factory: Callable):
        """Spawn N worker tasks"""
        print(f"[WorkerPool] Starting {self.num_workers} workers for {self.agent_id}")
        for i in range(self.num_workers):
            worker = create_task(self._worker_loop(i, executor_factory))
            self.workers.append(worker)
            
    async def _worker_loop(self, worker_id: int, executor_factory: Callable):
        """Each worker independently processes mentions"""
        try:
            agent_executor, wallet_address = await executor_factory()
            print(f"[Worker {worker_id}] Initialized for {self.agent_id}")
        except Exception as e:
            print(f"[Worker {worker_id}] Failed to initialize: {e}")
            return
        
        while True:
            try:
                mention_data = await self.request_queue.get()
                request_id = mention_data.get("request_id", f"unknown_{time.time()}")
                
                print(f"[Worker {worker_id}] Processing request {request_id}")
                self.active_requests[request_id] = time.time()
                
                try:
                    # Send immediate acknowledgement
                    await self._send_thinking_message(mention_data, worker_id)
                    
                    # Process with agent executor
                    print(f"[Worker {worker_id}] Invoking agent executor...")
                    start_time = time.time()
                    
                    response = await agent_executor.ainvoke({
                        "input": mention_data.get("input", ""),
                        "my_wallet_address": wallet_address
                    })
                    
                    duration = (time.time() - start_time) * 1000
                    print(f"[Worker {worker_id}] Completed in {duration:.0f}ms")
                    
                    # Success - clean up
                    if request_id in self.active_requests:
                        del self.active_requests[request_id]
                    
                except asyncio.TimeoutError:
                    print(f"[Worker {worker_id}] Timeout processing {request_id}")
                    await self._send_fallback(mention_data, "Request timed out", worker_id)
                    if request_id in self.active_requests:
                        del self.active_requests[request_id]
                        
                except Exception as e:
                    print(f"[Worker {worker_id}] Error: {e}")
                    import traceback
                    traceback.print_exc()
                    await self._send_fallback(mention_data, str(e), worker_id)
                    if request_id in self.active_requests:
                        del self.active_requests[request_id]
                    
                finally:
                    self.request_queue.task_done()
                    
            except Exception as e:
                print(f"[Worker {worker_id}] Fatal error in worker loop: {e}")
                import traceback
                traceback.print_exc()
                await asyncio.sleep(5)  # Back off on fatal errors
                
    async def _send_thinking_message(self, mention_data: dict, worker_id: int):
        """Send immediate thinking indicator"""
        if not self.send_message_tool:
            print(f"[Worker {worker_id}] No send_message tool available for acknowledgement")
            return
            
        try:
            thread_id = mention_data.get("threadId")
            if not thread_id:
                print(f"[Worker {worker_id}] No threadId in mention_data for acknowledgement")
                return
            
            thinking_content = "🤔 Processing your message..."
            
            print(f"[Worker {worker_id}] Sending thinking message to thread {thread_id}")
            
            # Use coral send_message tool
            await self.send_message_tool.ainvoke({
                "threadId": thread_id,
                "content": thinking_content
            })
            
            print(f"[Worker {worker_id}] Thinking message sent successfully")
            
        except Exception as e:
            # Don't fail the request if acknowledgement fails
            print(f"[Worker {worker_id}] Failed to send thinking message: {e}")
            
    async def _send_fallback(self, mention_data: dict, error: str, worker_id: int):
        """Send fallback message on error"""
        if not self.send_message_tool:
            print(f"[Worker {worker_id}] No send_message tool available for fallback")
            return
            
        try:
            thread_id = mention_data.get("threadId")
            if not thread_id:
                return
            
            fallback_content = f"I apologize, but I encountered an issue processing your message. Our team has been notified and will look into this. Please try again in a moment."
            
            print(f"[Worker {worker_id}] Sending fallback message to thread {thread_id}")
            
            await self.send_message_tool.ainvoke({
                "threadId": thread_id,
                "content": fallback_content
            })
            
            print(f"[Worker {worker_id}] Fallback message sent")
            
        except Exception as e:
            print(f"[Worker {worker_id}] Failed to send fallback message: {e}")
            
    async def submit(self, mention_data: dict) -> None:
        """Submit mention for processing"""
        await self.request_queue.put(mention_data)
        queue_depth = self.request_queue.qsize()
        print(f"[WorkerPool] Queued request, depth now: {queue_depth}")
        
    def get_queue_depth(self) -> int:
        """Get current queue depth for monitoring"""
        return self.request_queue.qsize()
    
    def get_active_count(self) -> int:
        """Get number of actively processing requests"""
        return len(self.active_requests)
    
    def get_stats(self) -> dict:
        """Get worker pool statistics"""
        return {
            "agent_id": self.agent_id,
            "num_workers": self.num_workers,
            "queue_depth": self.get_queue_depth(),
            "active_requests": self.get_active_count(),
            "total_workers": len(self.workers)
        }

