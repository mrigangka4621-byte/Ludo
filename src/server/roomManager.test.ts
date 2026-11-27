import test from 'node:test';
import assert from 'node:assert/strict';
import { RoomManager } from './roomManager';

test('RoomManager creates a 6-character room, joins guests, and enforces seat limits', () => {
  const manager = new RoomManager(() => 0.25);

  const created = manager.createRoom({
    clientId: 'host-1',
    playerName: 'Aarav',
    mode: 'classic',
    playerCount: 2,
    tokensPerPlayer: 4,
    themeId: 'arcade',
    fillWithBots: false,
  });

  assert.equal(created.seatIndex, 0);
  assert.equal(created.room.roomCode.length, 6);
  assert.equal(created.room.seats.length, 1);
  assert.equal(created.room.seats[0].isHost, true);

  const joined = manager.joinRoom({
    clientId: 'guest-2',
    roomCode: created.room.roomCode.toLowerCase(),
    playerName: 'Maya',
  });
  assert.equal(joined.ok, true);
  if (joined.ok) {
    assert.equal(joined.seatIndex, 1);
    assert.equal(joined.room.seats.length, 2);
  }

  // Third player should be rejected because room capacity is 2
  const full = manager.joinRoom({
    clientId: 'guest-3',
    roomCode: created.room.roomCode,
    playerName: 'Extra',
  });
  assert.equal(full.ok, false);
  if (!full.ok) {
    assert.equal(full.code, 'ROOM_FULL');
  }

  // Reconnecting with same clientId reclaims existing seat cleanly
  manager.markDisconnected('guest-2');
  const rejoined = manager.joinRoom({
    clientId: 'guest-2',
    roomCode: created.room.roomCode,
    playerName: 'Maya',
  });
  assert.equal(rejoined.ok, true);
  if (rejoined.ok) {
    assert.equal(rejoined.seatIndex, 1);
    assert.equal(rejoined.room.seats[1].connected, true);
  }
});

test('RoomManager enforces host permissions, turn authority, and synced dice + UNO actions', () => {
  const manager = new RoomManager(() => 0.99); // rolls 6

  const { room } = manager.createRoom({
    clientId: 'host-1',
    playerName: 'Host',
    mode: 'classic',
    playerCount: 2,
    tokensPerPlayer: 4,
    themeId: 'arcade',
    fillWithBots: false,
  });

  manager.joinRoom({
    clientId: 'guest-2',
    roomCode: room.roomCode,
    playerName: 'Guest',
  });

  // Non-host cannot change settings or start match
  const badSettings = manager.updateSettings('guest-2', { mode: 'crazy' });
  assert.equal(badSettings.ok, false);
  const badStart = manager.startMatch('guest-2');
  assert.equal(badStart.ok, false);

  // Host starts match
  const started = manager.startMatch('host-1');
  assert.equal(started.ok, true);
  assert.equal(room.status, 'playing');
  assert.ok(room.gameState);
  assert.equal(room.gameState.activePlayerIndex, 0);

  // Guest cannot roll on Host's turn
  const wrongTurn = manager.applyGameAction('guest-2', { type: 'roll_dice' });
  assert.equal(wrongTurn.ok, false);
  if (!wrongTurn.ok) {
    assert.equal(wrongTurn.code, 'NOT_YOUR_TURN');
  }

  // Host rolls a 6 and deploys a pawn
  const rollRes = manager.applyGameAction('host-1', { type: 'roll_dice' });
  assert.equal(rollRes.ok, true);
  if (rollRes.ok && rollRes.event?.kind === 'dice_rolled') {
    assert.equal(rollRes.event.diceValue, 6);
    assert.equal(rollRes.event.nextState.phase, 'choosing_move');
  }

  const moveRes = manager.applyGameAction('host-1', {
    type: 'select_move',
    tokenId: 'p0-t0',
    direction: 'forward',
  });
  assert.equal(moveRes.ok, true);
  if (moveRes.ok && moveRes.event?.kind === 'move_committed') {
    assert.equal(moveRes.event.nextState.players[0].tokens[0].zone, 'track');
  }
});

test('RoomManager supports UNO online turns and CPU takeover when a player leaves mid-match', () => {
  const manager = new RoomManager(() => 0.15);

  const { room } = manager.createRoom({
    clientId: 'host-uno',
    playerName: 'Nadia',
    mode: 'uno',
    playerCount: 3,
    tokensPerPlayer: 4,
    themeId: 'arcade',
    fillWithBots: true,
  });

  manager.joinRoom({
    clientId: 'guest-uno',
    roomCode: room.roomCode,
    playerName: 'Rohan',
  });

  const started = manager.startMatch('host-uno');
  assert.equal(started.ok, true);
  assert.ok(room.gameState);
  assert.equal(room.gameState.players.length, 3);
  assert.equal(room.gameState.players[0].isBot, false);
  assert.equal(room.gameState.players[1].isBot, false);
  assert.equal(room.gameState.players[2].isBot, true);

  // Leaving mid-match turns departing human seat into CPU bot so remaining player is never stuck
  const left = manager.leaveRoom('guest-uno');
  assert.equal(left.deleted, false);
  assert.equal(room.gameState.players[1].isBot, true);
});
