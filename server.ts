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
  const aliveSockets = new WeakSet<WebSocket>();
  const botTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const disconnectBotTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const crazyTimers = new Map<string, ReturnType<typeof setTimeout>>();

  function clearCrazyTimer(roomCode: string) {
    const existing = crazyTimers.get(roomCode);
    if (existing) {
      clearTimeout(existing);
      crazyTimers.delete(roomCode);
    }
  }

  function scheduleCrazyTimerIfNeeded(room: ManagedRoom) {
    clearCrazyTimer(room.roomCode);
    const state = room.gameState;
    if (
      room.status !== 'playing' ||
      !state ||
      state.config.mode !== 'crazy' ||
      state.phase === 'finished' ||
      typeof state.crazyTimerEndsAt !== 'number'
    ) {
      return;
    }

    const delayMs = Math.max(0, state.crazyTimerEndsAt - Date.now());
    const timer = setTimeout(() => {
      crazyTimers.delete(room.roomCode);
      try {
        const expired = roomManager.expireCrazyTimer(room.roomCode);
        if (!expired || !expired.gameState) return;
        clearBotTimer(room.roomCode);
        broadcastToRoom(expired, {
          type: 'game:event',
          event: { kind: 'state_sync', nextState: expired.gameState },
        });
      } catch (err) {
        console.error('Crazy timer expiration error in room', room.roomCode, err);
      }
    }, delayMs);
    crazyTimers.set(room.roomCode, timer);
  }

  function clearDisconnectBotTimer(roomCode: string, clientId: string) {
    const key = `${roomCode}:${clientId}`;
    const existing = disconnectBotTimers.get(key);
    if (existing) {
      clearTimeout(existing);
      disconnectBotTimers.delete(key);
    }
  }

  function scheduleDisconnectBotFallback(room: ManagedRoom, clientId: string, graceMs = 12_000) {
    if (room.status !== 'playing' || !room.gameState) return;
    const key = `${room.roomCode}:${clientId}`;
    clearDisconnectBotTimer(room.roomCode, clientId);
    const timer = setTimeout(() => {
      disconnectBotTimers.delete(key);
      try {
        const updated = roomManager.takeoverDisconnectedSeatWithBot(room.roomCode, clientId);
        if (!updated || !updated.gameState) return;
        broadcastToRoom(updated, { type: 'room:update', room: snapshotRoom(updated) });
        broadcastToRoom(updated, {
          type: 'game:event',
          event: { kind: 'state_sync', nextState: updated.gameState },
        });
        scheduleBotIfNeeded(updated, 850);
      } catch (err) {
        console.error('Disconnect CPU fallback error in room', room.roomCode, err);
      }
    }, graceMs);
    disconnectBotTimers.set(key, timer);
  }

  function sendToClient(ws: WebSocket | undefined, msg: ServerToClientMessage) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      // ignore transient write errors on closing sockets
    }
  }

  function broadcastToRoom(room: ManagedRoom, msg: ServerToClientMessage) {
    const serialized = JSON.stringify(msg);
    for (const seat of room.seats) {
      const ws = clientSockets.get(seat.clientId);
      if (ws && ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(serialized);
        } catch {
          // ignore transient write errors
        }
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
      try {
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
      } catch (err) {
        console.error('Bot step error in room', room.roomCode, err);
      }
    }, delayMs);

    botTimers.set(room.roomCode, timer);
  }

  const wss = new WebSocketServer({
    noServer: true,
    perMessageDeflate: false,
    maxPayload: 256 * 1024,
  });

  server.on('upgrade', (req, socket, head) => {
    const pathname = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`).pathname;
    if (pathname === '/ws') {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req);
      });
    }
  });

  // Server-side 20s ping keepalive prevents Cloud Run / mobile proxies from dropping active games
  const wsKeepAliveTimer = setInterval(() => {
    for (const client of wss.clients) {
      if (!aliveSockets.has(client)) {
        try {
          client.terminate();
        } catch {
          // ignore
        }
        continue;
      }
      aliveSockets.delete(client);
      try {
        client.ping();
      } catch {
        // ignore
      }
    }
  }, 20_000);
  wsKeepAliveTimer.unref?.();

  wss.on('connection', (ws) => {
    aliveSockets.add(ws);
    ws.on('pong', () => {
      aliveSockets.add(ws);
    });
    ws.on('error', () => {
      // Absorb abrupt client TCP resets so they never crash the Node process
    });

    ws.on('message', (raw) => {
      aliveSockets.add(ws);
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

      try {

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
          crazyTimerMinutes: msg.crazyTimerMinutes,
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
        clearDisconnectBotTimer(res.room.roomCode, msg.clientId);
        if (res.replacedClientId) {
          clearDisconnectBotTimer(res.room.roomCode, res.replacedClientId);
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
        if (res.room.status === 'playing' && res.room.gameState) {
          if (res.stateSynced) {
            broadcastToRoom(res.room, {
              type: 'game:event',
              event: { kind: 'state_sync', nextState: res.room.gameState },
            });
          }
          scheduleBotIfNeeded(res.room, 900);
        }
        return;
      }

      if (msg.type === 'room:leave') {
        const prevRoom = roomManager.getRoomByClientId(msg.clientId);
        const prevCode = prevRoom?.roomCode;
        if (prevCode) {
          clearDisconnectBotTimer(prevCode, msg.clientId);
        }
        const { room, deleted } = roomManager.leaveRoom(msg.clientId);
        if (deleted && prevCode) {
          clearBotTimer(prevCode);
          clearCrazyTimer(prevCode);
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
          crazyTimerMinutes: msg.crazyTimerMinutes,
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
        scheduleCrazyTimerIfNeeded(res.room);
        return;
      }

      if (msg.type === 'voice:state') {
        const res = roomManager.updateVoiceState(msg.clientId, {
          joined: msg.joined,
          muted: msg.muted,
          speaking: msg.speaking,
        });
        if (!res) return;
        if (res.fullChanged) {
          broadcastToRoom(res.room, {
            type: 'room:update',
            room: snapshotRoom(res.room),
          });
        } else if (res.speakingChanged) {
          broadcastToRoom(res.room, {
            type: 'voice:speaking',
            clientId: msg.clientId,
            speaking: res.speaking,
          });
        }
        return;
      }

      if (msg.type === 'voice:signal') {
        const room = roomManager.canRelayVoiceSignal(msg.clientId, msg.targetClientId);
        if (!room) return;
        const targetWs = clientSockets.get(msg.targetClientId);
        sendToClient(targetWs, {
          type: 'voice:signal',
          fromClientId: msg.clientId,
          signal: msg.signal,
        });
        return;
      }

      if (msg.type === 'voice:audio') {
        if (
          typeof msg.data !== 'string' ||
          msg.data.length === 0 ||
          msg.data.length > 24_000 ||
          !Number.isFinite(msg.sampleRate) ||
          msg.sampleRate < 6000 ||
          msg.sampleRate > 48000
        ) {
          return;
        }
        const recipients = roomManager.getVoiceRelayRecipients(msg.clientId, msg.targetClientIds);
        if (recipients.length === 0) return;
        const payload = JSON.stringify({
          type: 'voice:audio',
          fromClientId: msg.clientId,
          sampleRate: msg.sampleRate,
          data: msg.data,
        } satisfies ServerToClientMessage);
        for (const targetId of recipients) {
          const targetWs = clientSockets.get(targetId);
          if (targetWs && targetWs.readyState === WebSocket.OPEN) {
            try {
              targetWs.send(payload);
            } catch {
              // ignore transient write errors
            }
          }
        }
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
          if (msg.action.type === 'restart_match') {
            scheduleCrazyTimerIfNeeded(res.room);
          } else if (res.room.gameState?.phase === 'finished') {
            clearCrazyTimer(res.room.roomCode);
          }
          scheduleBotIfNeeded(res.room, nextDelay);
        }
      }
      } catch (err) {
        console.error('WebSocket message handler error:', err);
      }
    });

    ws.on('close', () => {
      const clientId = socketToClientId.get(ws);
      if (!clientId) return;
      // CRITICAL: Ignore close events from a superseded/stale socket so a freshly reconnected session isn't wiped!
      if (clientSockets.get(clientId) !== ws) return;
      clientSockets.delete(clientId);
      const room = roomManager.markDisconnected(clientId);
      if (room) {
        broadcastToRoom(room, { type: 'room:update', room: snapshotRoom(room) });
        if (room.status === 'playing') {
          scheduleDisconnectBotFallback(room, clientId, 12_000);
        }
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
      server: {
        middlewareMode: true,
        hmr: false,
        ws: { server },
        watch: process.env.DISABLE_HMR === 'true' ? null : {},
      },
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

  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 70_000;

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Mango Ludo server running on http://0.0.0.0:${PORT}`);
  });
}

process.on('uncaughtException', (err) => {
  console.error('Uncaught server exception (kept alive):', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled server rejection (kept alive):', reason);
});

startServer().catch((err) => {
  console.error('Failed to start Mango Ludo server:', err);
  process.exit(1);
});
