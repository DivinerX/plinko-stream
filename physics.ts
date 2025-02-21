import { WebSocket as WS } from 'ws';
import { Engine, Events, Composite, Bodies, World, Body } from 'matter-js';
import Matter from 'matter-js';
import { config, GameSession } from './config';


import { random } from './helper';
import { multiplierValues, TLine } from './multipliers';

const WORLD_WIDTH = config.world.width;

function createPins(engine: Matter.Engine, rows: number): void {
  const pins: Body[] = []
  let index = 0;
  for (let l = 0; l < rows; l++) {
    const linePins = config.pins.startPins + l
    const lineWidth = linePins * config.pins.pinGap
    for (let i = 0; i < linePins; i++) {
      const pinX =
        WORLD_WIDTH / 2 -
        lineWidth / 2 +
        i * config.pins.pinGap +
        config.pins.pinGap / 2

      const pinY =
        WORLD_WIDTH / rows + l * config.pins.pinGap + config.pins.pinGap

      const pin = Bodies.circle(pinX, pinY, config.pins.pinSize, {
        label: `pin-${index}`,
        id: index++,
        isStatic: true,
        collisionFilter: {
          category: 0x0001  // Category for pins
        }
      })
      pins.push(pin)
    }
  }

  // Create walls and floor
  const leftWall = Bodies.rectangle(
    WORLD_WIDTH / 3 - config.pins.pinSize * config.pins.pinGap - config.pins.pinGap,
    WORLD_WIDTH / 2 - config.pins.pinSize + 50,
    WORLD_WIDTH * 2,
    40,
    {
      angle: 90,
      render: {
        visible: false
      },
      isStatic: true,
      collisionFilter: {
        category: 0x0001  // Category for walls
      }
    }
  )

  const rightWall = Bodies.rectangle(
    WORLD_WIDTH -
    config.pins.pinSize * config.pins.pinGap -
    config.pins.pinGap -
    config.pins.pinGap / 2,
    WORLD_WIDTH / 2 - config.pins.pinSize - 50,
    WORLD_WIDTH * 2,
    40,
    {
      angle: -90,
      render: {
        visible: false
      },
      isStatic: true,
      collisionFilter: {
        category: 0x0001  // Category for walls
      }
    }
  )

  const floor = Bodies.rectangle(0, WORLD_WIDTH + 10, WORLD_WIDTH * 10, 40, {
    label: 'block-1',
    render: {
      visible: false
    },
    isStatic: true,
    collisionFilter: {
      category: 0x0001  // Category for walls
    }
  })
  Composite.add(engine.world, [
    ...pins,
    leftWall,
    rightWall,
    floor
  ])
}

function addBalls(engine: Matter.Engine, rows: number): void {
  const minBallX = config.world.width / 2 - config.pins.pinSize * 2;
  const maxBallX = config.world.width / 2 + config.pins.pinSize * 2;
  const ballStartY = config.world.width / rows + config.ball.ballSize * 2 + 10;

  const ball = Bodies.circle(
    random(minBallX, maxBallX),
    ballStartY,
    config.ball.ballSize,
    {
      id: new Date().getTime(),
      label: `ball-${Date.now()}`,
      restitution: random(1, 1.2),
      friction: random(0.6, 0.8),
      frictionAir: 0.06,
      isStatic: false,
      collisionFilter: {
        group: -1,
        category: 0x0002,
        mask: 0x0001
      }
    }
  );
  World.add(engine.world, ball);
}

const handleCollisions = (ws: WS, engine: Matter.Engine) => (event: Matter.IEventCollision<Matter.Engine>) => {
  event.pairs.forEach(pair => {
    const { bodyA, bodyB } = pair;
    const ballBody = bodyA.label.includes('ball-') ? bodyA :
      bodyB.label.includes('ball-') ? bodyB : null;
    const multiplierBody = bodyA.label.includes('sink-') ? bodyA :
      bodyB.label.includes('sink-') ? bodyB : null;

    if (ballBody && multiplierBody) {
      // Extract multiplier value from block label (e.g., "block-5" -> 5)
      const multiplierValue = parseFloat(multiplierBody.label.split('-')[1]);

      // Send win event
      ws.send(JSON.stringify({
        category: 'plinko',
        type: 'win',
        sinkId: multiplierBody.id,
        multiplier: multiplierValue
      }));

      // Remove the ball
      World.remove(engine.world, ballBody);
    }
  });

  // Send regular collision events
  const collisions = event.pairs.map(pair => {
    if (pair.bodyA.label.includes('pin-') || pair.bodyB.label.includes('pin-'))
      return pair.bodyA.id
  });

  ws.send(JSON.stringify({
    category: 'plinko',
    type: 'collision',
    collisions
  }));
};

function createMultipliers(engine: Matter.Engine, risk: 'low' | 'medium' | 'high', rows: TLine): void {
  // Create multipliers
  const multipliers = multiplierValues[risk][rows]
  const multipliersBodies: Body[] = []
  let lastMultiplierX = WORLD_WIDTH / 2 - (config.pins.pinGap / 2) * rows - config.pins.pinGap
  let index = 0;
  multipliers.forEach(multiplier => {
    const blockSize = config.pins.pinGap
    const multiplierBody = Bodies.rectangle(
      lastMultiplierX + config.pins.pinGap,
      WORLD_WIDTH / rows + rows * config.pins.pinGap + config.pins.pinGap,
      blockSize,
      blockSize,
      {
        label: `sink-${multiplier}`,
        id: index++,
        isStatic: true,
        collisionFilter: {
          category: 0x0001  // Category for multipliers
        }
      }
    )
    lastMultiplierX = multiplierBody.position.x
    multipliersBodies.push(multiplierBody)
  })
  Composite.add(engine.world, multipliersBodies)
}

export function startPlinkoGame(
  session: GameSession,
  ws: WS,
  broadcast: (message: any) => void
): void {
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

  createPins(engine, session.rows);
  createMultipliers(engine, session.risk, session.rows);

  const runner = Matter.Runner.create();
  Matter.Runner.run(runner, engine);

  // Replace Events.on('afterUpdate') with setInterval
  let countDown = 0
  const positionInterval = setInterval(() => {
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

    broadcast({
      category: 'plinko',
      type: 'positions',
      positions: Array.from(ballPositions.entries())
    });
    if (ballPositions.size === 0) {
      countDown++
      if (countDown > 20) {
        clearInterval(positionInterval);
        Matter.Runner.stop(runner);
        World.clear(engine.world, false);
        Engine.clear(engine);
        ws.send(JSON.stringify({
          category: 'plinko',
          type: 'running',
          isRunning: false
        }))
      }
    }
  }, 30);

  Events.on(engine, 'collisionStart', (event: Matter.IEventCollision<Matter.Engine>) => {
    event.pairs.forEach(pair => {
      const { bodyA, bodyB } = pair;
      const ballBody = bodyA.label.includes('ball-') ? bodyA :
        bodyB.label.includes('ball-') ? bodyB : null;
      const multiplierBody = bodyA.label.includes('sink-') ? bodyA :
        bodyB.label.includes('sink-') ? bodyB : null;

      if (ballBody && multiplierBody) {
        const multiplierValue = parseFloat(multiplierBody.label.split('-')[1]);
        broadcast({
          category: 'plinko',
          type: 'win',
          sinkId: multiplierBody.id,
          multiplier: multiplierValue
        });
        World.remove(engine.world, ballBody);
      }
    });

    const collisions = event.pairs.map(pair => {
      if (pair.bodyA.label.includes('pin-') || pair.bodyB.label.includes('pin-'))
        return pair.bodyA.id;
    });

    broadcast({
      category: 'plinko',
      type: 'collision',
      collisions
    });
  });

  let ballCount = 0;
  const ballInterval = setInterval(() => {
    if (ballCount >= session.balls) {
      clearInterval(ballInterval);
      return;
    }
    addBalls(engine, session.rows);
    ballCount++;
  }, 300);

  ws.on('close', () => {
    clearInterval(ballInterval);
    clearInterval(positionInterval);
    Matter.Runner.stop(runner);
    World.clear(engine.world, false);
    Engine.clear(engine);
  });
}
