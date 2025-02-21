"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.findSession = exports.random = void 0;
// Helper function for random number generation
function random(min, max) {
    const random = Math.random();
    min = Math.round(min);
    max = Math.floor(max);
    return random * (max - min) + min;
}
exports.random = random;
const findSession = (sessionId, gameRooms) => {
    for (const [key, clients] of gameRooms) {
        for (const client of clients) {
            const session = client.client.get(sessionId);
            if (session) {
                return session;
            }
        }
    }
    return undefined;
};
exports.findSession = findSession;
//# sourceMappingURL=helper.js.map