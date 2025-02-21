import express from 'express';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import cors from 'cors';
import { startPlinkoGame } from './physics';
import { GameClients } from './config';
import { TLine } from './multipliers';
import { findSession } from './helper';

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ 
  noServer: true,
  path: "/ws" 
});

server.on('upgrade', (request, socket, head) => {
  if (request.url?.startsWith('/ws')) {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  }
});

app.use(express.json());
app.use(cors())

const gameRooms = new Map<string, GameClients[]>();

// Broadcast to all clients in a room
const broadcastToRoom = (roomKey: string, message: any) => {
  const clients = gameRooms.get(roomKey) || [];
  clients.forEach(({ ws }) => {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify(message));
    }
  });
};

app.post('/api/plinko', (req, res) => {
  const { rows, balls, bet, risk, option, sessionId } = req.body;
  const roomKey = `${risk}-${rows}`;

  // Validate input
  if (!rows || !balls || isNaN(Number(rows)) || isNaN(Number(balls))) {
    return res.status(400).json({ error: 'Invalid rows or balls parameters' });
  }

  const room = gameRooms.get(roomKey);
  if (!room || room.length === 0) {
    return res.status(404).json({ error: 'Room not found' });
  }

  // Create new game session for the user
  room[0].client.set(sessionId, {
    rows: Number(rows) as TLine,
    balls: Number(balls),
    risk: risk as 'low' | 'medium' | 'high',
    bet: bet,
    option: option,
    positions: new Map(),
  });

  // Notify all users in the room about the new game
  broadcastToRoom(roomKey, {
    type: 'game_started',
    player: sessionId,
    gameInfo: {
      rows,
      balls,
      bet,
      risk,
      option
    }
  });

  res.json({
    type: 'play',
    sessionId,
    roomKey
  });
});

wss.on('connection', (ws) => {
  console.log("new ws connection");
  let _sessionId: string = `user-${Date.now()}`;
  let currentRoomKey: string | null = null;

  ws.on('message', (message) => {
    const data = JSON.parse(message.toString());
    console.log("received message: ", data);

    if (data.type === 'join') {
      const roomKey = data.roomKey;
      currentRoomKey = roomKey;

      // Remove user from any existing rooms
      gameRooms.forEach((clients, key) => {
        const clientIndex = clients.findIndex(client => client.client.has(_sessionId));
        if (clientIndex !== -1) {
          clients.splice(clientIndex, 1);
        }
      });

      // Create or join room
      if (!gameRooms.has(roomKey)) {
        gameRooms.set(roomKey, []);
      }

      const clientMap = new Map();
      clientMap.set(_sessionId, {});
      gameRooms.get(roomKey)?.push({ ws, client: clientMap });
      console.log("gameRooms: ", gameRooms);

      // Notify all users in the room about the new user
      broadcastToRoom(roomKey, {
        type: 'user_joined',
        sessionId: _sessionId,
        totalUsers: gameRooms.get(roomKey)?.length || 0
      });

      ws.send(JSON.stringify({
        type: 'join',
        sessionId: _sessionId
      }));
    }

    if (data.type === 'play') {
      const session = findSession(data.sessionId, gameRooms);
      if (!session) {
        return;
      }
      ws.send(JSON.stringify({
        category: "plinko",
        type: "running",
        isRunning: true
      }))
      // Start game and broadcast updates to all users in the room
      startPlinkoGame(session, ws, (gameUpdate) => {
        if (currentRoomKey) {
          broadcastToRoom(currentRoomKey, {
            ...gameUpdate,
            player: _sessionId
          });
        }
      });
    }
  });

  ws.on('close', () => {
    if (_sessionId && currentRoomKey) {
      console.log(_sessionId, "disconnected")
      const room = gameRooms.get(currentRoomKey);
      if (room) {
        // Remove the disconnected client
        const clientIndex = room.findIndex(client => client.client.has(_sessionId));
        if (clientIndex !== -1) {
          room.splice(clientIndex, 1);
        }

        // Notify remaining users about the disconnection
        broadcastToRoom(currentRoomKey, {
          type: 'user_left',
          sessionId: _sessionId,
          totalUsers: room.length
        });

        // Clean up empty rooms
        if (room.length === 0) {
          gameRooms.delete(currentRoomKey);
        }
      }
    }
  });
});

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
