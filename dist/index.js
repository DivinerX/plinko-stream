"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const ws_1 = require("ws");
const http_1 = require("http");
const cors_1 = __importDefault(require("cors"));
const physics_1 = require("./physics");
const helper_1 = require("./helper");
const app = (0, express_1.default)();
const server = (0, http_1.createServer)(app);
const wss = new ws_1.WebSocketServer({ server });
app.use(express_1.default.json());
app.use((0, cors_1.default)());
const gameRooms = new Map();
// Broadcast to all clients in a room
const broadcastToRoom = (roomKey, message) => {
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
        rows: Number(rows),
        balls: Number(balls),
        risk: risk,
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
    let _sessionId = `user-${Date.now()}`;
    let currentRoomKey = null;
    ws.on('message', (message) => {
        var _a, _b;
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
            (_a = gameRooms.get(roomKey)) === null || _a === void 0 ? void 0 : _a.push({ ws, client: clientMap });
            console.log("gameRooms: ", gameRooms);
            // Notify all users in the room about the new user
            broadcastToRoom(roomKey, {
                type: 'user_joined',
                sessionId: _sessionId,
                totalUsers: ((_b = gameRooms.get(roomKey)) === null || _b === void 0 ? void 0 : _b.length) || 0
            });
            ws.send(JSON.stringify({
                type: 'join',
                sessionId: _sessionId
            }));
        }
        if (data.type === 'play') {
            const session = (0, helper_1.findSession)(data.sessionId, gameRooms);
            if (!session) {
                return;
            }
            ws.send(JSON.stringify({
                category: "plinko",
                type: "running",
                isRunning: true
            }));
            // Start game and broadcast updates to all users in the room
            (0, physics_1.startPlinkoGame)(session, ws, (gameUpdate) => {
                if (currentRoomKey) {
                    broadcastToRoom(currentRoomKey, Object.assign(Object.assign({}, gameUpdate), { player: _sessionId }));
                }
            });
        }
    });
    ws.on('close', () => {
        if (_sessionId && currentRoomKey) {
            console.log(_sessionId, "disconnected");
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
//# sourceMappingURL=index.js.map