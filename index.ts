import express from 'express';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import cors from 'cors';
import { startPlinkoGame } from './physics';

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });
app.use(express.json());
app.use(cors())

const gameSessions = new Map();

app.post('/api/plinko', (req, res) => {
  console.log(req.body)
  const { rows, balls, bet, risk, option } = req.body;
  const sessionId = 1;

  console.log(rows, balls)
  // Validate input
  if (!rows || !balls || isNaN(Number(rows)) || isNaN(Number(balls))) {
    return res.status(400).json({ error: 'Invalid rows or balls parameters' });
  }

  // Create new game session
  gameSessions.set(sessionId, {
    rows: Number(rows),
    balls: Number(balls),
    risk: risk,
    bet: bet,
    option: option,
    positions: new Map(),
  });
  console.log(gameSessions)

  res.json({
    type: 'join',
    sessionId
  });
});

wss.on('connection', (ws) => {
  console.log("new ws connection")
  let sessionId: string;

  ws.on('message', (message) => {
    const data = JSON.parse(message.toString());
    console.log(data)
    if (data.type === 'join') {
      sessionId = data.sessionId;
      const session = gameSessions.get(sessionId);
      console.log(session)
      if (session) {
        startPlinkoGame(session, ws);
      }
    }
  });

  ws.on('close', () => {
    if (sessionId) {
      gameSessions.delete(sessionId);
    }
  });
});

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
