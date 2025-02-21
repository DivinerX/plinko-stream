import { GameClients, GameSession } from "./config"

// Helper function for random number generation
export function random(min: number, max: number) {
  const random = Math.random()
  min = Math.round(min)
  max = Math.floor(max)

  return random * (max - min) + min
}

export const findSession = (sessionId: string, gameRooms: Map<string, GameClients[]>): GameSession | undefined => {
  for (const [key, clients] of gameRooms) {
    for (const client of clients) {
      const session = client.client.get(sessionId);
      if (session) {
        return session;
      }
    }
  }
  return undefined;
}