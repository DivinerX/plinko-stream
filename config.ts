import { TLine } from "./multipliers";
import { WebSocket } from "ws";

export interface GameSession {
  rows: TLine;
  balls: number;
  risk: 'low' | 'medium' | 'high';
  bet: number;
  option: 'manual' | 'auto';
  positions: Map<number, { x: number; y: number }>;
}

export type GameClients = {
  ws: WebSocket,
  client: Map<string, GameSession>
}

export const config = {
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