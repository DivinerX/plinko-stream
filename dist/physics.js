"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startPlinkoGame = void 0;
const matter_js_1 = require("matter-js");
const matter_js_2 = __importDefault(require("matter-js"));
const config_1 = require("./config");
const helper_1 = require("./helper");
const multipliers_1 = require("./multipliers");
const WORLD_WIDTH = config_1.config.world.width;
function createPins(engine, rows) {
    const pins = [];
    let index = 0;
    for (let l = 0; l < rows; l++) {
        const linePins = config_1.config.pins.startPins + l;
        const lineWidth = linePins * config_1.config.pins.pinGap;
        for (let i = 0; i < linePins; i++) {
            const pinX = WORLD_WIDTH / 2 -
                lineWidth / 2 +
                i * config_1.config.pins.pinGap +
                config_1.config.pins.pinGap / 2;
            const pinY = WORLD_WIDTH / rows + l * config_1.config.pins.pinGap + config_1.config.pins.pinGap;
            const pin = matter_js_1.Bodies.circle(pinX, pinY, config_1.config.pins.pinSize, {
                label: `pin-${index}`,
                id: index++,
                isStatic: true,
                collisionFilter: {
                    category: 0x0001 // Category for pins
                }
            });
            pins.push(pin);
        }
    }
    // Create walls and floor
    const leftWall = matter_js_1.Bodies.rectangle(WORLD_WIDTH / 3 - config_1.config.pins.pinSize * config_1.config.pins.pinGap - config_1.config.pins.pinGap, WORLD_WIDTH / 2 - config_1.config.pins.pinSize + 50, WORLD_WIDTH * 2, 40, {
        angle: 90,
        render: {
            visible: false
        },
        isStatic: true,
        collisionFilter: {
            category: 0x0001 // Category for walls
        }
    });
    const rightWall = matter_js_1.Bodies.rectangle(WORLD_WIDTH -
        config_1.config.pins.pinSize * config_1.config.pins.pinGap -
        config_1.config.pins.pinGap -
        config_1.config.pins.pinGap / 2, WORLD_WIDTH / 2 - config_1.config.pins.pinSize - 50, WORLD_WIDTH * 2, 40, {
        angle: -90,
        render: {
            visible: false
        },
        isStatic: true,
        collisionFilter: {
            category: 0x0001 // Category for walls
        }
    });
    const floor = matter_js_1.Bodies.rectangle(0, WORLD_WIDTH + 10, WORLD_WIDTH * 10, 40, {
        label: 'block-1',
        render: {
            visible: false
        },
        isStatic: true,
        collisionFilter: {
            category: 0x0001 // Category for walls
        }
    });
    matter_js_1.Composite.add(engine.world, [
        ...pins,
        leftWall,
        rightWall,
        floor
    ]);
}
function addBalls(engine, rows) {
    const minBallX = config_1.config.world.width / 2 - config_1.config.pins.pinSize * 2;
    const maxBallX = config_1.config.world.width / 2 + config_1.config.pins.pinSize * 2;
    const ballStartY = config_1.config.world.width / rows + config_1.config.ball.ballSize * 2 + 10;
    const ball = matter_js_1.Bodies.circle((0, helper_1.random)(minBallX, maxBallX), ballStartY, config_1.config.ball.ballSize, {
        id: new Date().getTime(),
        label: `ball-${Date.now()}`,
        restitution: (0, helper_1.random)(1, 1.2),
        friction: (0, helper_1.random)(0.6, 0.8),
        frictionAir: 0.06,
        isStatic: false,
        collisionFilter: {
            group: -1,
            category: 0x0002,
            mask: 0x0001
        }
    });
    matter_js_1.World.add(engine.world, ball);
}
const handleCollisions = (ws, engine) => (event) => {
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
            matter_js_1.World.remove(engine.world, ballBody);
        }
    });
    // Send regular collision events
    const collisions = event.pairs.map(pair => {
        if (pair.bodyA.label.includes('pin-') || pair.bodyB.label.includes('pin-'))
            return pair.bodyA.id;
    });
    ws.send(JSON.stringify({
        category: 'plinko',
        type: 'collision',
        collisions
    }));
};
function createMultipliers(engine, risk, rows) {
    // Create multipliers
    const multipliers = multipliers_1.multiplierValues[risk][rows];
    const multipliersBodies = [];
    let lastMultiplierX = WORLD_WIDTH / 2 - (config_1.config.pins.pinGap / 2) * rows - config_1.config.pins.pinGap;
    let index = 0;
    multipliers.forEach(multiplier => {
        const blockSize = config_1.config.pins.pinGap;
        const multiplierBody = matter_js_1.Bodies.rectangle(lastMultiplierX + config_1.config.pins.pinGap, WORLD_WIDTH / rows + rows * config_1.config.pins.pinGap + config_1.config.pins.pinGap, blockSize, blockSize, {
            label: `sink-${multiplier}`,
            id: index++,
            isStatic: true,
            collisionFilter: {
                category: 0x0001 // Category for multipliers
            }
        });
        lastMultiplierX = multiplierBody.position.x;
        multipliersBodies.push(multiplierBody);
    });
    matter_js_1.Composite.add(engine.world, multipliersBodies);
}
function startPlinkoGame(session, ws, broadcast) {
    const engine = matter_js_1.Engine.create({
        enableSleeping: false,
        timing: {
            timeScale: 1,
            timestamp: 0,
            lastElapsed: 0,
            lastDelta: 0
        }
    });
    engine.gravity.y = config_1.config.engine.engineGravity;
    engine.gravity.scale = 0.001;
    createPins(engine, session.rows);
    createMultipliers(engine, session.risk, session.rows);
    const runner = matter_js_2.default.Runner.create();
    matter_js_2.default.Runner.run(runner, engine);
    // Replace Events.on('afterUpdate') with setInterval
    let countDown = 0;
    const positionInterval = setInterval(() => {
        const bodies = matter_js_1.Composite.allBodies(engine.world);
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
            countDown++;
            if (countDown > 20) {
                clearInterval(positionInterval);
                matter_js_2.default.Runner.stop(runner);
                matter_js_1.World.clear(engine.world, false);
                matter_js_1.Engine.clear(engine);
                ws.send(JSON.stringify({
                    category: 'plinko',
                    type: 'running',
                    isRunning: false
                }));
            }
        }
    }, 30);
    matter_js_1.Events.on(engine, 'collisionStart', (event) => {
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
                matter_js_1.World.remove(engine.world, ballBody);
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
        matter_js_2.default.Runner.stop(runner);
        matter_js_1.World.clear(engine.world, false);
        matter_js_1.Engine.clear(engine);
    });
}
exports.startPlinkoGame = startPlinkoGame;
//# sourceMappingURL=physics.js.map