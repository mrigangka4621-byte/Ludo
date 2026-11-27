import express from 'express';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocket, WebSocketServer } from 'ws';
import type { ClientToServerMessage, ServerToClientMessage } from './src/multiplayer/protocol.ts';
import { RoomManager, snapshotRoom, type ManagedRoom } from './src/server/roomManager.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const DIST_DIR = path.resolve(__dirname, 'dist');
const IS_DEV_RUNNER =
  process.env.npm_lifecycle_event === 'dev' ||
  process.execArgv.some((arg) => arg.includes('tsx'));
const IS_PROD =
  process.env.NODE_ENV === 'production' ||
  (!IS_DEV_RUNNER && fs.existsSync(path.join(DIST_DIR, 'index.html')));

async function startServer() {
  const app = express();
  const server = http.createServer(app);
  const roomManager = new RoomManager();

  const clientSockets = new Map<string, WebSocket>();
  const socketToClientId = new WeakMap<WebSocket, string>();
  const botTimers = new Map<string, ReturnType<typeof setTimeout>>();

  function sendToClient(ws: WebSocket | undefined, msg: ServerToClientMessage) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify(msg));
  }

  function broadcastToRoom(room: ManagedRoom, msg: ServerToClientMessage) {
    const serialized = JSON.stringify(msg);
    for (const seat of room.seats) {
      const ws = clientSockets.get(seat.clientId);
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(serialized);
      }
    }
  }

  function clearBotTimer(roomCode: string) {
    const existing = botTimers.get(roomCode);
    if (existing) {
      clearTimeout(existing);
      botTimers.delete(roomCode);
    }
  }

  function scheduleBotIfNeeded(room: ManagedRoom, delayMs = 880) {
    clearBotTimer(room.roomCode);
    if (room.status !== 'playing' || !room.gameState) return;
    if (room.gameState.phase === 'finished') return;

    const controllingIdx = roomManager.getControllingSeatIndex(room.gameState);
    const controller = room.gameState.players[controllingIdx];
    if (!controller || !controller.isBot) return;

    const timer = setTimeout(() => {
      botTimers.delete(room.roomCode);
      const outcome = roomManager.runBotStep(room.roomCode);
      if (!outcome || !outcome.event) return;

      broadcastToRoom(outcome.room, {
        type: 'game:event',
        event: outcome.event,
      });

      const nextDelay =
        outcome.event.kind === 'dice_rolled'
          ? 920
          : outcome.event.kind === 'move_committed'
            ? Math.max(950, (outcome.event.move.waypoints.length + 1) * 240)
            : 900;
      scheduleBotIfNeeded(outcome.room, nextDelay);
    }, delayMs);

    botTimers.set(room.roomCode, timer);
  }

  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    const pathname = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`).pathname;
    if (pathname === '/ws') {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req);
      });
    }
  });

  wss.on('connection', (ws) => {
    ws.on('message', (raw) => {
      let msg: ClientToServerMessage;
      try {
        msg = JSON.parse(String(raw)) as ClientToServerMessage;
      } catch {
        sendToClient(ws, {
          type: 'room:error',
          code: 'BAD_PAYLOAD',
          message: 'Invalid message format.',
        });
        return;
      }

      if (msg.type === 'ping') {
        sendToClient(ws, { type: 'pong' });
        return;
      }

      if ('clientId' in msg && msg.clientId) {
        clientSockets.set(msg.clientId, ws);
        socketToClientId.set(ws, msg.clientId);
      }

      if (msg.type === 'room:create') {
        const { room, seatIndex } = roomManager.createRoom({
          clientId: msg.clientId,
          playerName: msg.playerName,
          mode: msg.mode,
          playerCount: msg.playerCount,
          tokensPerPlayer: msg.tokensPerPlayer,
          themeId: msg.themeId,
          fillWithBots: msg.fillWithBots,
        });
        sendToClient(ws, {
          type: 'room:joined',
          room: snapshotRoom(room),
          mySeatIndex: seatIndex,
          gameState: room.gameState,
        });
        return;
      }

      if (msg.type === 'room:join') {
        const res = roomManager.joinRoom({
          clientId: msg.clientId,
          roomCode: msg.roomCode,
          playerName: msg.playerName,
        });
        if (!res.ok) {
          sendToClient(ws, { type: 'room:error', code: res.code, message: res.message });
          return;
        }
        sendToClient(ws, {
          type: 'room:joined',
          room: snapshotRoom(res.room),
          mySeatIndex: res.seatIndex,
          gameState: res.room.gameState,
        });
        broadcastToRoom(res.room, {
          type: 'room:update',
          room: snapshotRoom(res.room),
        });
        return;
      }

      if (msg.type === 'room:leave') {
        const prevRoom = roomManager.getRoomByClientId(msg.clientId);
        const prevCode = prevRoom?.roomCode;
        const { room, deleted } = roomManager.leaveRoom(msg.clientId);
        if (deleted && prevCode) {
          clearBotTimer(prevCode);
        } else if (room) {
          broadcastToRoom(room, { type: 'room:update', room: snapshotRoom(room) });
          if (room.status === 'playing' && room.gameState) {
            broadcastToRoom(room, {
              type: 'game:event',
              event: { kind: 'state_sync', nextState: room.gameState },
            });
            scheduleBotIfNeeded(room, 900);
          }
        }
        return;
      }

      if (msg.type === 'room:update_settings') {
        const res = roomManager.updateSettings(msg.clientId, {
          mode: msg.mode,
          playerCount: msg.playerCount,
          tokensPerPlayer: msg.tokensPerPlayer,
          fillWithBots: msg.fillWithBots,
        });
        if (!res.ok) {
          sendToClient(ws, { type: 'room:error', code: res.code, message: res.message });
          return;
        }
        broadcastToRoom(res.room, {
          type: 'room:update',
          room: snapshotRoom(res.room),
        });
        return;
      }

      if (msg.type === 'room:start') {
        const res = roomManager.startMatch(msg.clientId);
        if (!res.ok || !res.room.gameState) {
          sendToClient(ws, {
            type: 'room:error',
            code: res.ok ? 'START_FAILED' : res.code,
            message: res.ok ? 'Unable to start match.' : res.message,
          });
          return;
        }
        broadcastToRoom(res.room, {
          type: 'room:started',
          room: snapshotRoom(res.room),
          gameState: res.room.gameState,
        });
        scheduleBotIfNeeded(res.room, 900);
        return;
      }

      if (msg.type === 'game:action') {
        const res = roomManager.applyGameAction(msg.clientId, msg.action);
        if (!res.ok) {
          sendToClient(ws, { type: 'room:error', code: res.code, message: res.message });
          return;
        }
        if (res.event) {
          broadcastToRoom(res.room, {
            type: 'game:event',
            event: res.event,
          });
          const nextDelay =
            res.event.kind === 'dice_rolled'
              ? 920
              : res.event.kind === 'move_committed'
                ? Math.max(950, (res.event.move.waypoints.length + 1) * 240)
                : 880;
          scheduleBotIfNeeded(res.room, nextDelay);
        }
      }
    });

    ws.on('close', () => {
      const clientId = socketToClientId.get(ws);
      if (!clientId) return;
      if (clientSockets.get(clientId) === ws) {
        clientSockets.delete(clientId);
      }
      const room = roomManager.markDisconnected(clientId);
      if (room) {
        broadcastToRoom(room, { type: 'room:update', room: snapshotRoom(room) });
      }
    });
  });

  // Periodic cleanup of abandoned idle rooms (zero database needed)
  setInterval(() => {
    roomManager.pruneIdleRooms();
  }, 60_000);

  // Lightweight room-existence health endpoint
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, app: 'Mango Ludo' });
  });

  if (!IS_PROD) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Mango Ludo server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start Mango Ludo server:', err);
  process.exit(1);
});
