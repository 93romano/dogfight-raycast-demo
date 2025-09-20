# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an ultra-low-latency multiplayer FPS flight game built with Three.js (client) and Node.js WebSocket server. The game features real-time dogfight combat with hit detection, multiplayer synchronization, and PostgreSQL/Redis for data persistence.

## Architecture

### Client-Server Structure
- **Client** (`client/`): TypeScript + Three.js + Vite for the game frontend
- **Server** (`server/`): Node.js WebSocket server with PostgreSQL + Redis for game state and data persistence
- **Monorepo**: Root package.json orchestrates both client and server development

### Key Components

#### Client Architecture (`client/`)
- `components/MultiplayerScene.ts` - Main game scene orchestration
- `components/input/InputManager.ts` - Player input handling system
- `components/network/NetworkManager.ts` - WebSocket client communication
- `components/network/StateSync.ts` - Game state synchronization
- `components/weapons/WeaponSystem.ts` - Weapon mechanics and firing
- `components/weapons/VisualBullet.ts` - Bullet rendering and physics
- `components/environment/` - Environmental elements (lighting, background, terrain)

#### Server Architecture (`server/`)
- `index.js` - Main WebSocket server and game loop
- `worker.js` - Background worker for Redis stream processing
- `network/BinaryProtocol.js` - Optimized binary message protocol
- `network/WebSocketManager.js` - WebSocket connection management
- `services/ConnectionManager.js` - Player connection lifecycle
- `services/MatchManager.js` - Game match orchestration
- `services/RedisManager.js` - Redis stream handling for events
- `game/` - Core game logic (physics, collision detection)
- `handlers/` - Message type handlers

### Database Schema
- **PostgreSQL**: User data, match records, kill logs, rankings
- **Redis**: Real-time event streams, game state caching
- Schema defined in `server/schema.sql`

## Development Commands

### Development Setup
```bash
# Install all dependencies (client + server)
npm run install:all

# Start both client and server in development mode
npm run dev

# Start only client (Vite dev server)
npm run dev:client

# Start only server (with file watching)
npm run dev:server
```

### Production Commands
```bash
# Build client for production
npm run build

# Start production server
npm run start:server

# Preview built client
npm run start:client
```

### Database Operations
```bash
# Initialize PostgreSQL database schema
cd server && npm run db:init

# Run background worker
cd server && npm run worker

# Run background worker with watching (development)
cd server && npm run worker:dev
```

## Environment Configuration

The server requires environment variables defined in `server/.env`:
- **Database**: PostgreSQL connection settings
- **Redis**: Redis connection settings  
- **Game**: Tick rate (60Hz), max players (20), match duration
- **Worker**: Batch processing configuration for Redis streams

## Code Standards (from .cursor/rules/)

### General Development
- Use senior developer perspective with comprehensive error handling
- Include JSDoc/TSDoc comments for all functions and classes
- Write self-documenting code with clear naming conventions
- Follow SOLID principles and maintain modular architecture

### Client-Side (Three.js/WebGL)
- Implement proper resource cleanup and disposal for Three.js objects
- Use delta time for smooth animations and proper game loop architecture
- Optimize render calls, geometry, and material management
- Separate game logic from rendering logic with component architecture

### Server-Side (Node.js/WebSocket)
- Implement proper connection management and graceful disconnection handling
- Use efficient data structures for game state synchronization
- Implement rate limiting, input validation, and security measures
- Handle race conditions and implement proper conflict resolution

## Key Development Notes

- The game uses a custom binary protocol for optimized network communication
- Hit detection and physics calculations happen server-side for authoritative gameplay
- Redis streams are used for event sourcing and replay capabilities
- The codebase follows TypeScript on client-side and ES modules on server-side
- Asset attribution is documented in README.md for 3D models and textures