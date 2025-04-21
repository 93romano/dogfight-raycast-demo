System Overview: Multiplayer Flight Game (JS + Three.js)

🎯 Project Goal

Create a real-time multiplayer airplane combat game using JavaScript, Three.js (client), Node.js (server), WebSocket communication, and Redis/SQLite for state and persistence.

👷 Roles & Tools

Role /Tool

AI Brain / ChatGPT (GPT-4o)

Engineer / You

Coder and brain / Cursor

📁 Project Structure

client/
├── main.ts                # Main loop
├── components/
│   └── FlightScene.ts     # 3D plane + controls
├── assets/                # Models, textures

server/
├── server.js              # Socket.IO or uWebSockets
├── util/                  # intersectRaySphere etc

redis/                     # Player state (HP, pos)
database/                  # SQLite: users, scores
docs/                      # Design and reference docs

📘 Design Documents

docs/flight-controls.md — Defines pitch/yaw/roll and 3rd-person camera logic

docs/project-milestone.md — Phase-based milestone roadmap

⚙️ Core Tech Stack

Layer

Stack

Frontend

Vite, TypeScript, Three.js

Backend

Node.js, Socket.IO / uWebSockets

Realtime

Redis (state cache), WebSocket

DB

SQLite (local) → MySQL/PostgreSQL later

Deployment

Docker, AWS EC2, Cloudflare

✅ Phase 1 Goals (MVP)



🧠 How Tools Interact

ChatGPT: Designs & plans your architecture

Cursor: Reads from docs/*.md and writes to client/, server/

You: Decide system design, check correctness, test outputs

🧩 Next Steps

Implement pointer lock mouse input

Add GLTF plane model

Connect to server + emit shoot

Redis + SQLite integration

