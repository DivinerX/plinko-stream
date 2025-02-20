import { TLine } from "./multipliers";

interface GameSession {
  rows: TLine;
  balls: number;
  risk: 'low' | 'medium' | 'high';
  bet: number;
  option: 'manual' | 'auto';
  positions: Map<number, { x: number; y: number }>;
}

const config = {
  pins: {
    startPins: 1,
    pinSize: 4,
    pinGap: 25
  },
  ball: {
    ballSize: 6
  },
  engine: {
    engineGravity: 1
  },
  world: {
    width: 500,
    height: 500
  }
};

export { config, GameSession };