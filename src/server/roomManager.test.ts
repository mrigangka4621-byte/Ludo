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

test('RoomManager manages authoritative voice presence, speaking delta updates, room-isolated signaling, and disconnect cleanup', () => {
  const manager = new RoomManager(() => 0.42);
  const { room: roomA } = manager.createRoom({
    clientId: 'voice-host',
    playerName: 'Host',
    mode: 'classic',
    playerCount: 4,
    tokensPerPlayer: 4,
    themeId: 'arcade',
  });
  manager.joinRoom({ clientId: 'voice-guest', roomCode: roomA.roomCode, playerName: 'Guest' });

  const { room: roomB } = manager.createRoom({
    clientId: 'outsider',
    playerName: 'Outsider',
    mode: 'classic',
    playerCount: 2,
    tokensPerPlayer: 4,
    themeId: 'arcade',
  });
  assert.notEqual(roomA.roomCode, roomB.roomCode);

  // Joining voice triggers fullChanged=true so peers initiate WebRTC mesh
  const joinedVoice = manager.updateVoiceState('voice-host', {
    joined: true,
    muted: false,
    speaking: false,
  });
  assert.ok(joinedVoice);
  assert.equal(joinedVoice.fullChanged, true);
  assert.equal(roomA.seats[0].voiceJoined, true);
  assert.equal(roomA.seats[0].voiceMuted, false);
  assert.equal(roomA.seats[0].voiceSpeaking, false);

  // Speaking toggle only triggers speakingChanged (lightweight delta)
  const startedSpeaking = manager.updateVoiceState('voice-host', {
    joined: true,
    muted: false,
    speaking: true,
  });
  assert.ok(startedSpeaking);
  assert.equal(startedSpeaking.fullChanged, false);
  assert.equal(startedSpeaking.speakingChanged, true);
  assert.equal(roomA.seats[0].voiceSpeaking, true);

  // Muting immediately clears speaking flag
  const mutedRes = manager.updateVoiceState('voice-host', {
    joined: true,
    muted: true,
    speaking: true,
  });
  assert.ok(mutedRes);
  assert.equal(mutedRes.fullChanged, true);
  assert.equal(roomA.seats[0].voiceMuted, true);
  assert.equal(roomA.seats[0].voiceSpeaking, false);

  // Signaling allowed between connected peers in the same room, blocked across different rooms
  assert.ok(manager.canRelayVoiceSignal('voice-host', 'voice-guest'));
  assert.equal(manager.canRelayVoiceSignal('voice-host', 'outsider'), null);
  assert.equal(manager.canRelayVoiceSignal('voice-host', 'voice-host'), null);

  // Disconnecting clears voice state cleanly
  manager.markDisconnected('voice-host');
  assert.equal(roomA.seats[0].voiceJoined, false);
  assert.equal(roomA.seats[0].voiceMuted, false);
  assert.equal(roomA.seats[0].voiceSpeaking, false);
  assert.equal(manager.canRelayVoiceSignal('voice-host', 'voice-guest'), null);
});

test('RoomManager isolates voice audio relay to unmuted voice peers in the same room and restores human control on reconnect', () => {
  const manager = new RoomManager(() => 0.31);
  const { room: roomA } = manager.createRoom({
    clientId: 'p1',
    playerName: 'Host',
    mode: 'classic',
    playerCount: 3,
    tokensPerPlayer: 4,
    themeId: 'arcade',
    fillWithBots: true,
  });
  manager.joinRoom({ clientId: 'p2', roomCode: roomA.roomCode, playerName: 'Guest2' });
  manager.joinRoom({ clientId: 'p3', roomCode: roomA.roomCode, playerName: 'Guest3' });
  const { room: roomB } = manager.createRoom({
    clientId: 'other',
    playerName: 'Other',
    mode: 'classic',
    playerCount: 2,
    tokensPerPlayer: 4,
    themeId: 'arcade',
  });
  assert.notEqual(roomA.roomCode, roomB.roomCode);

  manager.updateVoiceState('p1', { joined: true, muted: false, speaking: true });
  manager.updateVoiceState('p2', { joined: true, muted: false, speaking: false });
  // p3 has not joined voice; other is in another room
  assert.deepEqual(manager.getVoiceRelayRecipients('p1', ['p2', 'p3', 'other', 'p1']), ['p2']);

  // Muted sender cannot relay audio
  manager.updateVoiceState('p1', { joined: true, muted: true, speaking: false });
  assert.deepEqual(manager.getVoiceRelayRecipients('p1', ['p2']), []);

  // Start match, disconnect p2, and verify reconnect cleanly restores connected & human control
  const started = manager.startMatch('p1');
  assert.equal(started.ok, true);
  manager.markDisconnected('p2');
  assert.equal(roomA.seats[1].connected, false);
  const rejoined = manager.joinRoom({ clientId: 'p2', roomCode: roomA.roomCode, playerName: 'Guest2' });
  assert.equal(rejoined.ok, true);
  if (rejoined.ok) {
    assert.equal(rejoined.seatIndex, 1);
    assert.equal(rejoined.room.seats[1].connected, true);
    assert.equal(rejoined.room.gameState?.players[1].isBot, false);
  }
});

test('RoomManager lets departed players rejoin with a new clientId, lets substitutes take vacated seats, and lets friends take open CPU seats mid-game', () => {
  const manager = new RoomManager(() => 0.99);

  const { room } = manager.createRoom({
    clientId: 'host-a',
    playerName: 'Aarav',
    mode: 'classic',
    playerCount: 4,
    tokensPerPlayer: 4,
    themeId: 'arcade',
    fillWithBots: true,
  });
  manager.joinRoom({ clientId: 'guest-b', roomCode: room.roomCode, playerName: 'Maya' });

  const started = manager.startMatch('host-a');
  assert.equal(started.ok, true);
  assert.equal(room.gameState?.players[0].isBot, false);
  assert.equal(room.gameState?.players[1].isBot, false);
  assert.equal(room.gameState?.players[2].isBot, true);
  assert.equal(room.gameState?.players[3].isBot, true);

  // 1. Maya leaves mid-game -> CPU takes over her seat, room stays alive
  const left = manager.leaveRoom('guest-b');
  assert.equal(left.deleted, false);
  assert.equal(room.seats[1].connected, false);
  assert.equal(room.gameState?.players[1].isBot, true);

  // 2. Maya comes back on a fresh tab/device (BRAND NEW clientId) using the same room code & name
  const rejoinedFreshTab = manager.joinRoom({
    clientId: 'maya-new-tab',
    roomCode: room.roomCode,
    playerName: 'Maya',
  });
  assert.equal(rejoinedFreshTab.ok, true);
  if (rejoinedFreshTab.ok) {
    assert.equal(rejoinedFreshTab.seatIndex, 1);
    assert.equal(rejoinedFreshTab.stateSynced, true);
    assert.equal(rejoinedFreshTab.room.gameState?.players[1].isBot, false);
    assert.equal(rejoinedFreshTab.room.gameState?.players[1].name, 'Maya');
  }

  // 3. Maya abruptly disconnects -> after grace timer, CPU takes over while keeping seat open
  manager.markDisconnected('maya-new-tab');
  const cpuFallback = manager.takeoverDisconnectedSeatWithBot(room.roomCode, 'maya-new-tab');
  assert.ok(cpuFallback);
  assert.equal(room.gameState?.players[1].isBot, true);

  // 4. A DIFFERENT substitute player ("Kabir") enters the same room code and takes over Maya's vacated seat!
  const subJoined = manager.joinRoom({
    clientId: 'kabir-sub',
    roomCode: room.roomCode,
    playerName: 'Kabir',
  });
  assert.equal(subJoined.ok, true);
  if (subJoined.ok) {
    assert.equal(subJoined.seatIndex, 1);
    assert.equal(subJoined.room.gameState?.players[1].isBot, false);
    assert.equal(subJoined.room.gameState?.players[1].name, 'Kabir');
  }

  // 5. Another friend ("Zara") joins mid-game with the same code and takes over open CPU seat 2!
  const cpuTakeover = manager.joinRoom({
    clientId: 'zara-late',
    roomCode: room.roomCode,
    playerName: 'Zara',
  });
  assert.equal(cpuTakeover.ok, true);
  if (cpuTakeover.ok) {
    assert.equal(cpuTakeover.seatIndex, 2);
    assert.equal(cpuTakeover.room.gameState?.players[2].isBot, false);
    assert.equal(cpuTakeover.room.gameState?.players[2].name, 'Zara');
  }

  // 6. Take over last CPU seat 3 -> now all 4 seats are active humans -> 5th player gets ROOM_FULL
  const seat3 = manager.joinRoom({
    clientId: 'dev-late',
    roomCode: room.roomCode,
    playerName: 'Dev',
  });
  assert.equal(seat3.ok, true);
  const fifth = manager.joinRoom({
    clientId: 'extra-5',
    roomCode: room.roomCode,
    playerName: 'Extra',
  });
  assert.equal(fifth.ok, false);
  if (!fifth.ok) {
    assert.equal(fifth.code, 'ROOM_FULL');
  }

  // 7. Even if ALL humans leave mid-game, room remains open for rejoin with same code!
  manager.leaveRoom('host-a');
  manager.leaveRoom('kabir-sub');
  manager.leaveRoom('zara-late');
  const lastLeave = manager.leaveRoom('dev-late');
  assert.equal(lastLeave.deleted, false);
  const comeback = manager.joinRoom({
    clientId: 'host-comeback',
    roomCode: room.roomCode,
    playerName: 'Aarav',
  });
  assert.equal(comeback.ok, true);
  if (comeback.ok) {
    assert.equal(comeback.seatIndex, 0);
    assert.equal(comeback.room.hostClientId, 'host-comeback');
  }
});

test('RoomManager auto-numbers default multiplayer names sequentially (Player 1, Player 2, Player 3...) and enforces host-adjustable Crazy Mode 10-30 min timer + timeout ranking', () => {
  const manager = new RoomManager();

  // Create Crazy Mode room with blank host name and out-of-range timer (5 -> clamped to 10)
  const created = manager.createRoom({
    clientId: 'host-1',
    playerName: '',
    playerCount: 4,
    tokensPerPlayer: 4,
    mode: 'crazy',
    themeId: 'walnut',
    crazyTimerMinutes: 5,
  });
  assert.equal(created.room.seats[0].name, 'Player 1');
  assert.equal(created.room.crazyTimerMinutes, 10);

  // Guest 2 joins leaving default "Player 1" unchanged -> auto-renamed to "Player 2"
  const g2 = manager.joinRoom({
    clientId: 'guest-2',
    roomCode: created.room.roomCode,
    playerName: 'Player 1',
  });
  assert.equal(g2.ok, true);
  if (g2.ok) {
    assert.equal(g2.seatIndex, 1);
    assert.equal(g2.room.seats[1].name, 'Player 2');
  }

  // Guest 3 joins with blank name -> auto-renamed to "Player 3"
  const g3 = manager.joinRoom({
    clientId: 'guest-3',
    roomCode: created.room.roomCode,
    playerName: '   ',
  });
  assert.equal(g3.ok, true);
  if (g3.ok) {
    assert.equal(g3.seatIndex, 2);
    assert.equal(g3.room.seats[2].name, 'Player 3');
  }

  // Guest 4 enters a custom name "Riya" -> preserved verbatim!
  const g4 = manager.joinRoom({
    clientId: 'guest-4',
    roomCode: created.room.roomCode,
    playerName: 'Riya',
  });
  assert.equal(g4.ok, true);
  if (g4.ok) {
    assert.equal(g4.seatIndex, 3);
    assert.equal(g4.room.seats[3].name, 'Riya');
  }

  // Non-host cannot adjust Crazy timer
  const guestSettings = manager.updateSettings('guest-2', {
    crazyTimerMinutes: 25,
  });
  assert.equal(guestSettings.ok, false);

  // Host adjusts Crazy timer to 20 min (and values above 30 clamp to 30)
  const hostClamped = manager.updateSettings('host-1', {
    crazyTimerMinutes: 45,
  });
  assert.equal(hostClamped.ok, true);
  assert.equal(created.room.crazyTimerMinutes, 30);

  const host20 = manager.updateSettings('host-1', {
    crazyTimerMinutes: 20,
  });
  assert.equal(host20.ok, true);
  assert.equal(created.room.crazyTimerMinutes, 20);

  // Start match -> crazyTimerEndsAt set ~20 min in future, player names match seats
  const beforeStart = Date.now();
  const started = manager.startMatch('host-1');
  assert.equal(started.ok, true);
  assert.ok(created.room.gameState);
  assert.deepEqual(
    created.room.gameState.players.map((p) => p.name),
    ['Player 1', 'Player 2', 'Player 3', 'Riya']
  );
  assert.ok(
    (created.room.gameState.crazyTimerEndsAt ?? 0) >= beforeStart + 19 * 60_000 &&
      (created.room.gameState.crazyTimerEndsAt ?? 0) <= beforeStart + 21 * 60_000
  );

  // Give Riya (seat 3) the highest board progress, Player 2 (seat 1) second highest, then expire timer!
  created.room.gameState = {
    ...created.room.gameState,
    players: created.room.gameState.players.map((p, idx) =>
      idx === 3
        ? {
            ...p,
            tokens: p.tokens.map((t, ti) =>
              ti === 0 ? { ...t, zone: 'home_stretch' as const, homeIndex: 3, ringIndex: -1, lapProgress: 52 } : t
            ),
          }
        : idx === 1
          ? {
              ...p,
              tokens: p.tokens.map((t, ti) =>
                ti === 0 ? { ...t, zone: 'track' as const, ringIndex: 25, lapProgress: 25 } : t
              ),
            }
          : p
    ),
  };

  const expired = manager.expireCrazyTimer(created.room.roomCode);
  assert.ok(expired?.gameState);
  assert.equal(expired.gameState.phase, 'finished');
  assert.equal(expired.gameState.endedByTimer, true);
  assert.equal(expired.gameState.finishedOrder[0], 3); // Riya 1st
  assert.equal(expired.gameState.finishedOrder[1], 1); // Player 2 2nd
});

