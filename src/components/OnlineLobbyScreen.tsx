import { useMemo, useState } from 'react';
import {
  ArrowLeft,
  Bot,
  Check,
  Copy,
  Crown,
  Link2,
  Play,
  Users,
  WifiOff,
} from 'lucide-react';
import { createDefaultPlayers, createInitialGameState } from '../game/engine';
import { soundFx } from '../game/sound';
import { BOARD_THEMES, PLAYER_PALETTES } from '../game/themes';
import type { GameMode, ThemeId } from '../game/types';
import type { OnlineRoomSnapshot } from '../multiplayer/protocol';
import type { ConnectionStatus } from '../multiplayer/wsClient';
import { TeardropPinBadge } from './GameHud';
import { LudoBoard } from './LudoBoard';
import { TitleEmblem } from './TitleEmblem';

interface OnlineLobbyScreenProps {
  room: OnlineRoomSnapshot;
  mySeatIndex: number;
  myClientId: string;
  themeId: ThemeId;
  connectionStatus: ConnectionStatus;
  error: string | null;
  onUpdateSettings: (patch: {
    mode?: GameMode;
    playerCount?: number;
    tokensPerPlayer?: 2 | 4;
    fillWithBots?: boolean;
  }) => void;
  onStartMatch: () => void;
  onLeaveRoom: () => void;
}

const MODES: Array<{ id: GameMode; label: string }> = [
  { id: 'classic', label: 'Classic Ludo' },
  { id: 'flip', label: 'Flip-Track (↔)' },
  { id: 'crazy', label: 'Crazy Mode ⚡' },
  { id: 'uno', label: 'UNO Ludo 🃏' },
];

const PLAYER_COUNTS = [2, 3, 4, 5, 6, 7, 8, 9, 10];

export function OnlineLobbyScreen({
  room,
  mySeatIndex,
  myClientId,
  themeId,
  connectionStatus,
  error,
  onUpdateSettings,
  onStartMatch,
  onLeaveRoom,
}: OnlineLobbyScreenProps) {
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const theme = BOARD_THEMES[themeId];
  const isArcade = theme.id === 'arcade';
  const isHost = room.hostClientId === myClientId;

  const previewState = useMemo(() => {
    const defaults = createDefaultPlayers(room.playerCount);
    return createInitialGameState({
      playerCount: room.playerCount,
      mode: room.mode,
      tokensPerPlayer: room.tokensPerPlayer,
      themeId,
      players: defaults.map((def, idx) => {
        const seat = room.seats[idx];
        return {
          ...def,
          name: seat ? seat.name : room.fillWithBots ? `CPU ${idx + 1}` : `Open Seat ${idx + 1}`,
          isBot: !seat && room.fillWithBots,
        };
      }),
    });
  }, [room.fillWithBots, room.mode, room.playerCount, room.seats, room.tokensPerPlayer, themeId]);

  const effectivePlayers = room.fillWithBots ? room.playerCount : room.seats.length;
  const canHostStart = isHost && effectivePlayers >= 2;

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(room.roomCode);
      setCopiedCode(true);
      soundFx.playButtonClick();
      window.setTimeout(() => setCopiedCode(false), 1800);
    } catch {
      // ignore clipboard errors
    }
  };

  const handleCopyInviteLink = async () => {
    try {
      const url = new URL(window.location.href);
      url.search = '';
      url.searchParams.set('room', room.roomCode);
      await navigator.clipboard.writeText(url.toString());
      setCopiedLink(true);
      soundFx.playButtonClick();
      window.setTimeout(() => setCopiedLink(false), 1800);
    } catch {
      // ignore clipboard errors
    }
  };

  return (
    <div
      className={`min-h-screen lg:h-screen w-full flex flex-col lg:flex-row overflow-y-auto lg:overflow-hidden ${
        isArcade ? 'ludo-arcade-wallpaper' : ''
      }`}
      style={{ backgroundColor: theme.pageBg, color: theme.textPrimary }}
    >
      {/* Left/Center Live Room Board Preview + Centered Room Code Overlay */}
      <section
        aria-label="Online room board preview"
        className="relative flex-1 flex flex-col items-center justify-center p-5 sm:p-8 lg:p-10 min-h-[340px] lg:min-h-0"
      >
        <div
          key={`${room.playerCount}-${room.mode}-${themeId}`}
          className="relative w-full max-w-[620px] aspect-square flex items-center justify-center animate-spring-pop"
        >
          <LudoBoard
            state={previewState}
            theme={theme}
            legalMoves={[]}
            mode={room.mode}
            selectedDirection="forward"
            activeAnimation={null}
            flyingCaptures={[]}
            hopTrails={[]}
            boardEffects={[]}
            interactive={false}
            isLiveMatch={false}
          />

          {/* Room Code Share Card centered neatly over the middle of the board */}
          <div className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center p-4">
            <div
              className="pointer-events-auto rounded-2xl px-6 py-4 shadow-2xl text-center space-y-2.5 max-w-[300px] w-full"
              style={{
                backgroundColor: 'rgba(11, 28, 61, 0.94)',
                border: '3px solid #FACC15',
                color: '#FFFFFF',
              }}
            >
              <div className="text-[11px] font-bold tracking-wider uppercase text-yellow-300">
                Share Room Code
              </div>
              <div
                className="font-mono-num text-3xl sm:text-4xl font-black tracking-[0.22em] text-white"
                data-testid="lobby-room-code"
              >
                {room.roomCode}
              </div>
              <div className="flex items-center justify-center gap-2 pt-0.5">
                <button
                  type="button"
                  onClick={handleCopyCode}
                  data-testid="copy-room-code-btn"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-extrabold transition-transform active:scale-95"
                  style={{ backgroundColor: '#FACC15', color: '#0B1C3D' }}
                >
                  {copiedCode ? <Check size={13} /> : <Copy size={13} />}
                  <span>{copiedCode ? 'Copied' : 'Copy Code'}</span>
                </button>
                <button
                  type="button"
                  onClick={handleCopyInviteLink}
                  data-testid="copy-invite-link-btn"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-transform active:scale-95"
                  style={{
                    backgroundColor: 'rgba(255,255,255,0.14)',
                    color: '#FFFFFF',
                    border: '1px solid rgba(255,255,255,0.28)',
                  }}
                >
                  {copiedLink ? <Check size={13} /> : <Link2 size={13} />}
                  <span>{copiedLink ? 'Link Copied' : 'Invite Link'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Right Live Lobby Panel */}
      <section
        aria-label="Online room lobby"
        data-testid="online-lobby-panel"
        className="w-full lg:w-[490px] xl:w-[530px] shrink-0 flex flex-col lg:h-full overflow-y-auto border-t-2 lg:border-t-0 lg:border-l-2"
        style={{
          backgroundColor: theme.panelBg,
          borderColor: isArcade ? '#FACC15' : theme.panelBorder,
        }}
      >
        <div className="flex-1 px-6 sm:px-8 py-4 space-y-4">
          <TitleEmblem theme={theme} subtitle={`Online Room · ${room.roomCode}`} />

          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              data-testid="lobby-leave-btn"
              onClick={() => {
                soundFx.playButtonClick();
                onLeaveRoom();
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-transform active:scale-95"
              style={{
                backgroundColor: theme.panelMutedBg,
                color: theme.textPrimary,
                border: `1.5px solid ${theme.panelBorder}`,
              }}
            >
              <ArrowLeft size={14} />
              <span>Leave Room</span>
            </button>

            <div className="inline-flex items-center gap-1.5 text-xs font-bold">
              {connectionStatus !== 'connected' ? (
                <>
                  <WifiOff size={14} className="text-amber-400" />
                  <span className="text-amber-300">Reconnecting...</span>
                </>
              ) : (
                <span style={{ color: theme.accent }}>
                  {isHost ? 'Room Host' : 'Room Guest'}
                </span>
              )}
            </div>
          </div>

          {error && (
            <div
              role="alert"
              className="px-3.5 py-2.5 rounded-xl text-xs font-bold"
              style={{
                backgroundColor: 'rgba(220, 38, 38, 0.22)',
                border: '1.5px solid #EF4444',
                color: '#FECACA',
              }}
            >
              {error}
            </div>
          )}

          {/* Connected Players Roster */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-bold">
              <span className="inline-flex items-center gap-1.5" style={{ color: theme.textMuted }}>
                <Users size={14} />
                <span>Players in Room</span>
              </span>
              <span className="font-mono-num" style={{ color: theme.accent }}>
                {room.seats.length}/{room.playerCount} Joined
              </span>
            </div>

            <ul className="space-y-1.5 max-h-72 overflow-y-auto pr-1" data-testid="lobby-player-list">
              {Array.from({ length: room.playerCount }).map((_, idx) => {
                const seat = room.seats[idx];
                const defaults = createDefaultPlayers(room.playerCount);
                const palette = PLAYER_PALETTES[seat?.paletteIndex ?? defaults[idx].paletteIndex];
                const isMe = seat && seat.seatIndex === mySeatIndex;

                return (
                  <li
                    key={idx}
                    className="flex items-center justify-between gap-2.5 px-3 py-2 rounded-xl"
                    style={{
                      backgroundColor: isMe ? 'rgba(250, 204, 21, 0.14)' : 'rgba(0,0,0,0.16)',
                      border: `1.5px solid ${
                        isMe ? '#FACC15' : seat ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.06)'
                      }`,
                    }}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <TeardropPinBadge color={palette.color} darkColor={palette.dark} size={26} />
                      <div className="min-w-0">
                        <div className="text-sm font-bold truncate flex items-center gap-1.5">
                          <span>
                            {seat
                              ? seat.name
                              : room.fillWithBots
                                ? `CPU ${idx + 1}`
                                : `Open Seat ${idx + 1}`}
                          </span>
                          {seat?.isHost && (
                            <Crown size={13} className="text-yellow-300 shrink-0" aria-label="Host" />
                          )}
                          {isMe && (
                            <span className="text-[10px] font-extrabold text-yellow-300">
                              (You)
                            </span>
                          )}
                        </div>
                        <div className="text-[11px]" style={{ color: theme.textMuted }}>
                          {seat
                            ? seat.connected
                              ? 'Connected'
                              : 'Reconnecting...'
                            : room.fillWithBots
                              ? 'Smart CPU will play this seat'
                              : 'Waiting for friend with code'}
                        </div>
                      </div>
                    </div>

                    {!seat && room.fillWithBots && (
                      <Bot size={15} className="shrink-0 opacity-75" />
                    )}
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Room Match Settings (Host can edit live; Guests see live updates) */}
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs font-bold">
              <span style={{ color: theme.textMuted }}>Game Mode</span>
              {!isHost && (
                <span className="text-[11px]" style={{ color: theme.textMuted }}>
                  Host controls settings
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              {MODES.map((m) => {
                const selected = room.mode === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    disabled={!isHost}
                    onClick={() => {
                      soundFx.playButtonClick();
                      onUpdateSettings({ mode: m.id });
                    }}
                    aria-pressed={selected}
                    className="px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all disabled:cursor-default"
                    style={{
                      backgroundColor: selected ? theme.accent : theme.panelMutedBg,
                      color: selected ? theme.accentText : theme.textSecondary,
                      border: `1.5px solid ${selected ? '#FFFFFF' : 'rgba(255,255,255,0.14)'}`,
                    }}
                  >
                    {m.label}
                  </button>
                );
              })}
            </div>

            {isHost && (
              <div className="space-y-2.5 pt-1">
                <div className="flex items-center justify-between text-xs font-bold">
                  <span style={{ color: theme.textMuted }}>Max Players</span>
                  <span className="font-mono-num" style={{ color: theme.accent }}>
                    {room.playerCount} Seats
                  </span>
                </div>
                <div className="grid grid-cols-9 gap-1.5">
                  {PLAYER_COUNTS.map((cnt) => {
                    const selected = room.playerCount === cnt;
                    const disabled = cnt < room.seats.length;
                    return (
                      <button
                        key={cnt}
                        type="button"
                        disabled={disabled}
                        onClick={() => {
                          soundFx.playButtonClick();
                          onUpdateSettings({ playerCount: cnt });
                        }}
                        className="h-9 rounded-lg font-mono-num text-xs font-bold disabled:opacity-35"
                        style={{
                          backgroundColor: selected ? theme.accent : theme.panelMutedBg,
                          color: selected ? theme.accentText : theme.textPrimary,
                          border: `1.5px solid ${
                            selected ? theme.accent : 'rgba(255,255,255,0.16)'
                          }`,
                        }}
                      >
                        {cnt}
                      </button>
                    );
                  })}
                </div>

                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-1.5">
                    {([4, 2] as const).map((tk) => (
                      <button
                        key={tk}
                        type="button"
                        onClick={() => onUpdateSettings({ tokensPerPlayer: tk })}
                        className="px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap"
                        style={{
                          backgroundColor:
                            room.tokensPerPlayer === tk ? theme.panelMutedBg : 'transparent',
                          color:
                            room.tokensPerPlayer === tk ? theme.textPrimary : theme.textMuted,
                          border: `1.5px solid ${
                            room.tokensPerPlayer === tk ? theme.accent : 'rgba(255,255,255,0.18)'
                          }`,
                        }}
                      >
                        {tk === 4 ? '4 Tokens' : '2 Tokens (Quick)'}
                      </button>
                    ))}
                  </div>

                  <label className="inline-flex items-center gap-2 text-xs font-bold cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={room.fillWithBots}
                      onChange={(e) => onUpdateSettings({ fillWithBots: e.target.checked })}
                      className="w-4 h-4 rounded"
                      style={{ accentColor: theme.accent }}
                    />
                    <span>Fill empty seats with CPU</span>
                  </label>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Sticky Lobby Footer CTA */}
        <div
          className="px-6 sm:px-8 py-4 shrink-0"
          style={{ borderTop: `1.5px solid ${isArcade ? 'rgba(250,204,21,0.35)' : theme.panelBorder}` }}
        >
          {isHost ? (
            <button
              type="button"
              disabled={!canHostStart}
              data-testid="lobby-start-btn"
              onClick={() => {
                soundFx.playDeploy();
                onStartMatch();
              }}
              className="w-full py-3.5 px-5 rounded-2xl font-display font-black text-base flex items-center justify-center gap-2 shadow-xl transition-transform hover:scale-[1.01] active:scale-[0.98] disabled:opacity-50"
              style={{
                background: isArcade
                  ? 'linear-gradient(180deg, #FDE047 0%, #FACC15 55%, #EAB308 100%)'
                  : theme.accent,
                color: isArcade ? '#0B1C3D' : theme.accentText,
                border: '2.5px solid #FFFFFF',
              }}
            >
              <Play size={18} fill="currentColor" />
              <span>Start Online Match ({effectivePlayers} Players)</span>
            </button>
          ) : (
            <div
              className="w-full py-3 px-4 rounded-xl text-center text-sm font-bold"
              data-testid="lobby-waiting-host"
              style={{
                backgroundColor: theme.panelMutedBg,
                color: '#FDE047',
                border: '1.5px solid rgba(250,204,21,0.45)',
              }}
            >
              Waiting for the host to start the match...
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
