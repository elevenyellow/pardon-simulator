# Coral Server & Agent Orchestration

An overview of how Coral Server powers the multi-agent AI system in Pardon Simulator.

---

## Overview

**Coral Server** is the orchestration layer that coordinates all AI agent interactions in Pardon Simulator. Built on the [Coral Protocol](https://coralprotocol.org/), it provides open infrastructure for multi-agent AI systems, enabling our seven autonomous agents to communicate, coordinate, and collaborate in real-time.

The Coral Protocol implements the Model Context Protocol (MCP) standard, providing tools for agents to discover each other, exchange messages, manage conversation threads, and coordinate complex multi-party interactions—all without centralized control.

---

## Why Coral Protocol?

### Purpose-Built for Multi-Agent Systems

Traditional architectures struggle with multiple independent AI agents. Coral Protocol solves this by providing:

**Decentralized Communication**: Agents can directly communicate without routing through a central controller, enabling true peer-to-peer interaction.

**Thread Management**: Conversations are organized into isolated threads, maintaining context across complex multi-party discussions.

**Real-Time Coordination**: Server-Sent Events (SSE) enable instant bidirectional communication, making agent interactions feel natural and immediate.

**Framework Agnostic**: Works with any agent framework (Langchain, LlamaIndex, custom implementations), allowing flexibility in agent development.

### Key Benefits

- **Scalability**: Adding new agents doesn't require changes to existing agents
- **Autonomy**: Each agent operates independently with its own decision-making
- **Discoverability**: Agents can discover and communicate with each other dynamically
- **Safety**: Graph-like structure prevents single points of failure or excessive concentration of power
- **Composability**: Agents can combine their capabilities through coordination

---

## Architecture Integration

### System Layer

Coral Server sits between the Backend API and AI Agents:

```
Backend (Next.js API)
        ↓
  Coral Server (port 5555)
        ↓
  AI Agents (Python processes)
        ↓
  LLM APIs
```

### Communication Flow

1. **Initialization**: Each agent starts and registers with Coral Server
2. **Message Reception**: Backend sends user messages to Coral Server
3. **Routing**: Coral Server identifies mentioned agents and routes messages
4. **Agent Processing**: Agents receive messages, process with LLMs, and decide actions
5. **Response**: Agents send responses back through Coral Server
6. **Delivery**: Backend receives agent responses and updates frontend

---

## Key Features

### Agent Registration

Each agent registers itself with Coral Server on startup:

- **Unique ID**: Identifier for the agent (e.g., "trump-donald", "cz")
- **Capabilities**: Tools and services the agent can provide
- **Endpoints**: Communication channels for receiving messages
- **Metadata**: Additional information like personality traits or specializations

### Message Routing

Coral Server intelligently routes messages based on:

- **@Mentions**: Messages explicitly directed to specific agents
- **Thread Context**: Maintaining conversation history within threads
- **Multi-Party**: Supporting group conversations with multiple agents
- **Broadcast**: Optionally sending messages to all agents in a thread

### Thread Management

Threads organize conversations:

- **Isolation**: Each thread maintains independent context
- **Persistence**: Thread state preserved across interactions
- **Participants**: Tracking which agents are involved in each thread
- **History**: Complete message history within thread scope

### Server-Sent Events (SSE)

Real-time communication mechanism:

- **Bidirectional**: Agents both send and receive through SSE
- **Event-Driven**: Agents react to events as they occur
- **Efficient**: Low-latency communication without polling
- **Scalable**: Handles multiple concurrent agent connections

---

## Integration in Pardon Simulator

### Agent Configuration

Agents are configured in `registry.toml`:

```toml
[[local-agent]]
path = "agents/trump-donald"

[[local-agent]]
path = "agents/cz"
```

Each agent directory contains:
- `main.py`: Agent implementation with Langchain
- `coral-agent.toml`: Coral-specific configuration
- `personality-public.txt`: Public personality description
- `operational-private.txt`: Private operational instructions

### Agent Tools

Agents use Coral-provided tools through the MCP interface:

- **send_message**: Send messages to threads
- **create_thread**: Start new conversation threads
- **mention_agent**: Explicitly invoke another agent
- **get_thread_context**: Retrieve conversation history

### Starting the System

1. **Start Coral Server**:
   ```bash
   ./start-server.sh
   ```
   Runs on port 5555 by default

2. **Agents Auto-Register**:
   Coral Server reads `registry.toml` and launches agent processes

3. **Backend Connects**:
   Next.js API routes communicate with Coral Server at `http://localhost:5555`

---

## Configuration

### Registry Configuration

The `registry.toml` file defines which agents to run:

```toml
# Each agent entry specifies its directory
[[local-agent]]
path = "agents/agent-name"
```

### Server Configuration

Coral Server configuration (if using custom `config.toml`):

- **Port**: HTTP port for API (default: 5555)
- **Docker Socket**: Path to Docker socket for containerized agents
- **Logging**: Log level and output configuration
- **Security**: Authentication and authorization settings

---

## Learn More

### Official Resources

- **[Coral Protocol Website](https://coralprotocol.org/)** - Project overview and philosophy
- **[Coral Protocol Documentation](https://docs.coralprotocol.org/)** - Complete technical documentation
- **[Multi-Agent Quick Start](https://docs.coralprotocol.org/setup/quickstart)** - Getting started guide
- **[Coral Server GitHub](https://github.com/Coral-Protocol/coral-server)** - Source code and examples
- **[Coral Discord](https://discord.gg/rMQc2uWXhj)** - Community and developer support

### Related Documentation

- **[ARCHITECTURE.md](./ARCHITECTURE.md)** - Complete system architecture
- **[AGENTS.md](./AGENTS.md)** - Agent implementation details
- **[OPERATIONS.md](./OPERATIONS.md)** - Running and troubleshooting

---

## Technical Details

### Why Kotlin/Java?

Coral Server is built with Kotlin on the JVM for:
- **Performance**: Efficient handling of concurrent agent connections
- **Stability**: JVM reliability for long-running services
- **Ecosystem**: Rich Java/Kotlin libraries for networking and threading
- **Type Safety**: Strong typing prevents runtime errors

### MCP Protocol

The Model Context Protocol provides:
- **Standardized Interface**: Common API for all agents regardless of implementation
- **Tool Framework**: Structured way for agents to expose and use capabilities
- **Event System**: Asynchronous event handling for real-time interactions
- **Extensibility**: Easy to add new tools and capabilities

### Security Considerations

- **No Credential Storage**: Coral Server doesn't store agent credentials or API keys
- **Process Isolation**: Each agent runs in its own process
- **Local Communication**: All Coral communication happens on localhost in development
- **Message Validation**: Messages are validated before routing to agents

---

## Troubleshooting

### Common Issues

**Port Already in Use**:
- Check if Coral Server is already running
- Change port in configuration if needed
- Kill existing processes on port 5555

**Agents Not Registering**:
- Verify `registry.toml` paths are correct
- Check agent logs for startup errors
- Ensure agent dependencies are installed

**Messages Not Routing**:
- Confirm agents are successfully registered
- Check for correct @mention syntax
- Review Coral Server logs for routing errors

For more troubleshooting, see [OPERATIONS.md](./OPERATIONS.md).

---

## Future Enhancements

Potential improvements to our Coral integration:

- **Agent Discovery UI**: Dashboard showing registered agents and their status
- **Performance Monitoring**: Metrics for message latency and agent response times
- **Dynamic Scaling**: Auto-scaling agents based on load
- **Enhanced Security**: Authentication and encryption for production deployment
- **Advanced Routing**: More sophisticated message routing based on agent capabilities

