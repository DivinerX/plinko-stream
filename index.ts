import express from 'express';
import { WebSocketServer, WebSocket as WS } from 'ws';
import { createServer } from 'http';
import { Engine, Events, Composite, Bodies, World, Body } from 'matter-js';
import Matter from 'matter-js';

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

// Store active game sessions
const gameSessions = new Map();

interface GameSession {
  rows: number;
  balls: number;
  positions: Map<number, { x: number; y: number }>;
}

// Configuration
const config = {
  pins: {
    startPins: 1,
    pinSize: 3,
    pinGap: 25
  },
  ball: {
    ballSize: 5
  },
  engine: {
    engineGravity: 1
  },
  world: {
    width: 500,
    height: 500
  },
  colors: {
    background: 'transparent',
    primary: '#213743',
    secondary: '#3d5564',
    text: '#F2F7FF',
    purple: '#C52BFF',
    purpleDark: '#8D27B3'
  } as const
};

// Constants now use config values
const CANVAS_WIDTH = config.world.width;
const CANVAS_HEIGHT = config.world.height;
const PEG_RADIUS = config.pins.pinSize;
const BALL_RADIUS = config.ball.ballSize;

app.get('/start-plinko', (req, res) => {
  const { rows, balls } = req.query;
  const sessionId = Date.now().toString();

  // Validate input
  if (!rows || !balls || isNaN(Number(rows)) || isNaN(Number(balls))) {
    return res.status(400).json({ error: 'Invalid rows or balls parameters' });
  }

  // Create new game session
  gameSessions.set(sessionId, {
    rows: Number(rows),
    balls: Number(balls),
    positions: new Map(),
  });

  res.json({ sessionId });
});

wss.on('connection', (ws) => {
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

function createPegs(engine: Matter.Engine, rows: number): void {
  const spacing = config.pins.pinGap;
  const verticalSpacing = (CANVAS_HEIGHT - 200) / rows;

  for (let i = 0; i < rows; i++) {
    const offset = i % 2 === 0 ? 0 : spacing / 2;
    const pegsInRow = i % 2 === 0 ? rows + 1 : rows;

    for (let j = 0; j < pegsInRow; j++) {
      const peg = Bodies.circle(
        offset + j * spacing,
        100 + i * verticalSpacing,
        PEG_RADIUS,
        {
          isStatic: true,
          label: `peg-${i}-${j}`,
          restitution: 0.5,
          friction: 0.1,
          render: {
            fillStyle: config.colors.primary
          }
        }
      );
      World.add(engine.world, peg);
    }
  }

  // Add walls
  const walls = [
    Bodies.rectangle(0, CANVAS_HEIGHT / 2, 20, CANVAS_HEIGHT, { 
      isStatic: true, 
      label: 'wall-left',
      render: {
        fillStyle: config.colors.secondary
      }
    }),
    Bodies.rectangle(CANVAS_WIDTH, CANVAS_HEIGHT / 2, 20, CANVAS_HEIGHT, { 
      isStatic: true, 
      label: 'wall-right',
      render: {
        fillStyle: config.colors.secondary
      }
    }),
    Bodies.rectangle(CANVAS_WIDTH / 2, CANVAS_HEIGHT, CANVAS_WIDTH, 20, { 
      isStatic: true, 
      label: 'wall-bottom',
      render: {
        fillStyle: config.colors.secondary
      }
    }),
  ];
  World.add(engine.world, walls);
}

function addBall(engine: Matter.Engine): void {
  const minBallX = config.world.width / 2 - config.pins.pinSize * 2;
  const maxBallX = config.world.width / 2 + config.pins.pinSize * 2;
  const ballStartY = config.ball.ballSize * 2;
  
  const ball = Bodies.circle(
    random(minBallX, maxBallX),
    ballStartY,
    config.ball.ballSize,
    {
      label: `ball-${Date.now()}`,
      restitution: random(0.5, 1),
      friction: random(0.6, 0.8),
      frictionAir: 0.06,
      render: {
        fillStyle: 'white'
      },
      collisionFilter: {
        group: -1,
        category: 0x0002,
        mask: 0x0001
      }
    }
  );
  World.add(engine.world, ball);
}

function startPlinkoGame(session: GameSession, ws: WS): void {
  const engine = Engine.create({
    enableSleeping: false,
    timing: {
      timeScale: 1,
      timestamp: 0,
      lastElapsed: 0,
      lastDelta: 0
    }
  });

  engine.gravity.y = config.engine.engineGravity;
  engine.gravity.scale = 0.001;

  // Setup world
  createPegs(engine, session.rows);
  createMultipliers(engine, session.rows); // Add multipliers

  // Start the physics engine
  const runner = Matter.Runner.create();
  Matter.Runner.run(runner, engine);

  Events.on(engine, 'afterUpdate', () => {
    const bodies = Composite.allBodies(engine.world);
    const ballPositions = new Map();

    bodies.forEach(body => {
      if (body.label.includes('ball-')) {
        ballPositions.set(body.id, {
          x: body.position.x,
          y: body.position.y
        });
      }
    });

    ws.send(JSON.stringify({
      type: 'positions',
      positions: Array.from(ballPositions.entries())
    }));
  });

  Events.on(engine, 'collisionStart', (event) => {
    event.pairs.forEach(pair => {
      const { bodyA, bodyB } = pair;
      const ballBody = bodyA.label.includes('ball-') ? bodyA : 
                      bodyB.label.includes('ball-') ? bodyB : null;
      const multiplierBody = bodyA.label.includes('block-') ? bodyA :
                            bodyB.label.includes('block-') ? bodyB : null;

      if (ballBody && multiplierBody) {
        // Extract multiplier value from block label (e.g., "block-5" -> 5)
        const multiplierValue = parseFloat(multiplierBody.label.split('-')[1]);
        
        // Send win event
        ws.send(JSON.stringify({
          type: 'win',
          ballId: ballBody.id,
          multiplier: multiplierValue
        }));

        // Remove the ball
        World.remove(engine.world, ballBody);
      }
    });

    // Send regular collision events
    const collisions = event.pairs.map(pair => ({
      bodyA: pair.bodyA.label,
      bodyB: pair.bodyB.label
    }));

    ws.send(JSON.stringify({
      type: 'collision',
      collisions
    }));
  });

  // Start dropping balls
  let ballCount = 0;
  const interval = setInterval(() => {
    if (ballCount >= session.balls) {
      clearInterval(interval);
      return;
    }
    addBall(engine);
    ballCount++;
  }, 300);

  // Cleanup when WebSocket closes
  ws.on('close', () => {
    clearInterval(interval);
    Matter.Runner.stop(runner);
    World.clear(engine.world, false);
    Engine.clear(engine);
  });
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

interface Multiplier {
  label: string;
  value: number;
  position: number;
}

function getMultiplierByLinesQnt(rows: number): Multiplier[] {
  // This is a simplified version - you might want to adjust the values
  // based on your specific requirements
  const multipliers: Multiplier[] = [];
  const baseMultipliers = rows === 8 ? [5, 3, 2, 0.5, 1, 0.5, 2, 3, 5] :
                         rows === 12 ? [8, 4, 3, 2, 1, 0.5, 0.5, 1, 2, 3, 4, 8] :
                         [15, 8, 5, 3, 2, 1, 0.5, 0.2, 0.5, 1, 2, 3, 5, 8, 15]; // 16 rows

  const blockSize = config.pins.pinGap;
  let startX = config.world.width / 2 - (blockSize / 2) * rows - blockSize;

  baseMultipliers.forEach((value, index) => {
    multipliers.push({
      label: `block-${value}`,
      value: value,
      position: startX + blockSize + (index * blockSize)
    });
  });

  return multipliers;
}

function createMultipliers(engine: Matter.Engine, rows: number): void {
  const multipliers = getMultiplierByLinesQnt(rows);
  const blockSize = config.pins.pinGap;
  const multiplierY = config.world.width / rows + rows * config.pins.pinGap + config.pins.pinGap;

  multipliers.forEach(multiplier => {
    const multiplierBody = Bodies.rectangle(
      multiplier.position,
      multiplierY,
      blockSize,
      blockSize,
      {
        label: multiplier.label,
        isStatic: true,
        isSensor: true,
        render: {
          fillStyle: config.colors.purpleDark
        }
      }
    );
    World.add(engine.world, multiplierBody);
  });
}

// Helper function for random number generation
function random(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}
