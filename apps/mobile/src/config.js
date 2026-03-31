/**
 * API base URLs for the Cosmix mobile app.
 *
 * Android emulator  → the host machine's localhost is reachable at 10.0.2.2
 * Real Android device → replace with your machine's LAN IP, e.g. 192.168.1.x
 *
 * The Next.js web server (port 3000) serves all /api/* routes used here.
 * The chat-service (port 3002) handles socket.io connections.
 */
export const API_BASE_URL = 'http://192.168.1.5:3000';
export const CHAT_SERVICE_URL = 'http://192.168.1.5:3002';
