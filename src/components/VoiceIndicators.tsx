import { Headphones, HeadphoneOff, Mic, MicOff, PhoneOff, Radio } from 'lucide-react';
import type { BoardTheme } from '../game/types';
import type { OnlineSeat } from '../multiplayer/protocol';
import type { VoiceUiSnapshot } from '../multiplayer/voiceChat';

/**
 * Crisp 3-bar animated voice equalizer shown whenever a player is actively speaking.
 */
export function SpeakingWaves({
  color = '#4ADE80',
  size = 'sm',
}: {
  color?: string;
  size?: 'xs' | 'sm';
}) {
  const heightClass = size === 'xs' ? 'h-3' : 'h-3.5';
  const widthClass = size === 'xs' ? 'w-[2.5px]' : 'w-[3px]';
  return (
    <span
      className={`inline-flex items-end gap-[2px] ${heightClass} shrink-0`}
      aria-label="Speaking"
      data-testid="speaking-waves"
    >
      <span
        className={`${widthClass} rounded-full animate-voice-wave-1`}
        style={{ backgroundColor: color, height: '45%' }}
      />
      <span
        className={`${widthClass} rounded-full animate-voice-wave-2`}
        style={{ backgroundColor: color, height: '100%' }}
      />
      <span
        className={`${widthClass} rounded-full animate-voice-wave-3`}
        style={{ backgroundColor: color, height: '65%' }}
      />
    </span>
  );
}

/**
 * Per-seat voice status badge shown next to online players in the Lobby roster and in-game Standings.
 */
export function SeatVoiceBadge({
  voiceJoined,
  voiceMuted,
  voiceSpeaking,
  testIdPrefix,
}: {
  voiceJoined?: boolean;
  voiceMuted?: boolean;
  voiceSpeaking?: boolean;
  testIdPrefix?: string;
}) {
  if (!voiceJoined) return null;

  if (voiceMuted) {
    return (
      <span
        data-testid={testIdPrefix ? `${testIdPrefix}-muted` : undefined}
        title="Microphone muted"
        aria-label="Microphone muted"
        className="inline-flex items-center justify-center w-6 h-6 rounded-md shrink-0"
        style={{
          backgroundColor: 'rgba(239, 68, 68, 0.2)',
          border: '1px solid rgba(248, 113, 113, 0.55)',
          color: '#FCA5A5',
        }}
      >
        <MicOff size={12} />
      </span>
    );
  }

  if (voiceSpeaking) {
    return (
      <span
        data-testid={testIdPrefix ? `${testIdPrefix}-speaking` : undefined}
        title="Speaking live"
        className="inline-flex items-center gap-1 px-1.5 h-6 rounded-md shrink-0 animate-voice-speak-glow"
        style={{
          backgroundColor: 'rgba(34, 197, 94, 0.24)',
          border: '1.5px solid #4ADE80',
          color: '#86EFAC',
        }}
      >
        <Mic size={11} />
        <SpeakingWaves color="#4ADE80" size="xs" />
      </span>
    );
  }

  return (
    <span
      data-testid={testIdPrefix ? `${testIdPrefix}-live` : undefined}
      title="In voice chat"
      aria-label="In voice chat"
      className="inline-flex items-center justify-center w-6 h-6 rounded-md shrink-0"
      style={{
        backgroundColor: 'rgba(34, 197, 94, 0.14)',
        border: '1px solid rgba(74, 222, 128, 0.4)',
        color: '#86EFAC',
      }}
    >
      <Mic size={12} />
    </span>
  );
}

interface VoiceChatBarProps {
  theme: BoardTheme;
  voice: VoiceUiSnapshot;
  seats: OnlineSeat[];
  onJoinVoice: () => void;
  onLeaveVoice: () => void;
  onToggleMute: () => void;
  onToggleDeafen: () => void;
}

/**
 * Full-width compact Voice Chat control panel for the Online Room Lobby.
 */
export function VoiceChatBar({
  theme,
  voice,
  seats,
  onJoinVoice,
  onLeaveVoice,
  onToggleMute,
  onToggleDeafen,
}: VoiceChatBarProps) {
  const voiceMembersCount = seats.filter((s) => s.connected && s.voiceJoined).length;
  const speakingNames = seats
    .filter((s) => s.connected && s.voiceJoined && !s.voiceMuted && s.voiceSpeaking)
    .map((s) => s.name);

  return (
    <div
      data-testid="lobby-voice-bar"
      className="rounded-xl p-3 space-y-2"
      style={{
        backgroundColor: voice.joined
          ? 'rgba(16, 185, 129, 0.12)'
          : theme.panelMutedBg,
        border: `1.5px solid ${
          voice.localSpeaking
            ? '#4ADE80'
            : voice.joined
              ? 'rgba(74, 222, 128, 0.55)'
              : theme.panelBorder
        }`,
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
            style={{
              backgroundColor: voice.joined
                ? 'rgba(34, 197, 94, 0.22)'
                : 'rgba(250, 204, 21, 0.14)',
              color: voice.joined ? '#4ADE80' : theme.accent,
            }}
          >
            {voice.localSpeaking ? <SpeakingWaves color="#4ADE80" size="xs" /> : <Radio size={15} />}
          </span>
          <div className="min-w-0">
            <div className="text-xs font-extrabold leading-tight flex items-center gap-1.5">
              <span>Room Voice Chat</span>
              {voiceMembersCount > 0 && (
                <span className="font-mono-num text-[11px] font-bold text-emerald-300">
                  · {voiceMembersCount} Live
                </span>
              )}
            </div>
            <div className="text-[11px] truncate" style={{ color: theme.textMuted }}>
              {speakingNames.length > 0
                ? `Speaking: ${speakingNames.join(', ')}`
                : voice.joined
                  ? voice.muted
                    ? 'Mic muted · Tap mic to speak'
                    : 'Mic live · Talk with your room'
                  : 'Talk live with friends in this room'}
            </div>
          </div>
        </div>

        {!voice.joined ? (
          <button
            type="button"
            disabled={voice.joining}
            data-testid="voice-join-btn"
            onClick={onJoinVoice}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-extrabold whitespace-nowrap shrink-0 transition-transform active:scale-95 disabled:opacity-60"
            style={{
              backgroundColor: '#22C55E',
              color: '#052E16',
            }}
          >
            <Mic size={14} />
            <span>{voice.joining ? 'Connecting...' : 'Join Voice'}</span>
          </button>
        ) : (
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              data-testid="voice-mute-btn"
              aria-label={voice.muted ? 'Unmute microphone' : 'Mute microphone'}
              aria-pressed={voice.muted}
              onClick={onToggleMute}
              className={`h-8 px-2.5 rounded-lg inline-flex items-center gap-1 text-xs font-extrabold transition-transform active:scale-95 ${
                voice.localSpeaking ? 'animate-voice-speak-glow' : ''
              }`}
              style={{
                backgroundColor: voice.muted
                  ? 'rgba(239, 68, 68, 0.24)'
                  : 'rgba(34, 197, 94, 0.24)',
                color: voice.muted ? '#FCA5A5' : '#86EFAC',
                border: `1.5px solid ${voice.muted ? '#EF4444' : '#4ADE80'}`,
              }}
            >
              {voice.muted ? <MicOff size={14} /> : <Mic size={14} />}
              <span>{voice.muted ? 'Muted' : 'Mic On'}</span>
            </button>

            <button
              type="button"
              data-testid="voice-deafen-btn"
              aria-label={voice.deafened ? 'Unmute room voices' : 'Mute room voices'}
              aria-pressed={voice.deafened}
              title={voice.deafened ? 'Unmute room voices' : 'Mute room voices'}
              onClick={onToggleDeafen}
              className="w-8 h-8 rounded-lg inline-flex items-center justify-center transition-transform active:scale-95"
              style={{
                backgroundColor: voice.deafened
                  ? 'rgba(245, 158, 11, 0.25)'
                  : 'rgba(255,255,255,0.1)',
                color: voice.deafened ? '#FDE047' : theme.textPrimary,
                border: `1px solid ${voice.deafened ? '#FACC15' : 'rgba(255,255,255,0.2)'}`,
              }}
            >
              {voice.deafened ? <HeadphoneOff size={14} /> : <Headphones size={14} />}
            </button>

            <button
              type="button"
              data-testid="voice-leave-btn"
              aria-label="Leave voice chat"
              title="Leave voice chat"
              onClick={onLeaveVoice}
              className="w-8 h-8 rounded-lg inline-flex items-center justify-center transition-transform active:scale-95"
              style={{
                backgroundColor: 'rgba(239, 68, 68, 0.2)',
                color: '#FCA5A5',
                border: '1px solid rgba(248, 113, 113, 0.5)',
              }}
            >
              <PhoneOff size={14} />
            </button>
          </div>
        )}
      </div>

      {voice.error && (
        <div
          role="alert"
          data-testid="voice-error-banner"
          className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold"
          style={{
            backgroundColor: 'rgba(220, 38, 38, 0.22)',
            border: '1px solid rgba(248, 113, 113, 0.6)',
            color: '#FECACA',
          }}
        >
          {voice.error}
        </div>
      )}
    </div>
  );
}

interface TopBarVoiceControlsProps {
  theme: BoardTheme;
  voice: VoiceUiSnapshot;
  speakingCount: number;
  onJoinVoice: () => void;
  onLeaveVoice: () => void;
  onToggleMute: () => void;
  onToggleDeafen: () => void;
}

/**
 * Compact tactile voice controls mounted inside TopArcadeBar during a live online match.
 */
export function TopBarVoiceControls({
  theme,
  voice,
  speakingCount,
  onJoinVoice,
  onLeaveVoice,
  onToggleMute,
  onToggleDeafen,
}: TopBarVoiceControlsProps) {
  const isArcade = theme.id === 'arcade';
  const btnBg = isArcade ? '#0C2D63' : theme.panelBg;
  const btnBorder = isArcade ? '#FACC15' : theme.panelBorder;

  if (!voice.joined) {
    return (
      <button
        type="button"
        tabIndex={-1}
        disabled={voice.joining}
        data-testid="topbar-voice-join-btn"
        aria-label="Join room voice chat"
        title={voice.error ?? 'Join room voice chat'}
        onClick={(e) => {
          e.currentTarget.blur();
          onJoinVoice();
        }}
        className="h-9 px-2.5 rounded-lg inline-flex items-center gap-1.5 text-xs font-extrabold shadow-sm transition-transform active:scale-95 disabled:opacity-60"
        style={{
          backgroundColor: btnBg,
          color: speakingCount > 0 ? '#4ADE80' : '#FDE047',
          border: `1.5px solid ${speakingCount > 0 ? '#4ADE80' : btnBorder}`,
        }}
      >
        {speakingCount > 0 ? <SpeakingWaves color="#4ADE80" size="xs" /> : <Mic size={15} />}
        <span className="hidden sm:inline">{voice.joining ? 'Joining...' : 'Voice'}</span>
      </button>
    );
  }

  return (
    <div
      data-testid="topbar-voice-active-group"
      className="inline-flex items-center gap-1 rounded-lg p-0.5 shadow-sm"
      style={{
        backgroundColor: 'rgba(6, 20, 54, 0.88)',
        border: `1.5px solid ${voice.localSpeaking ? '#4ADE80' : 'rgba(74, 222, 128, 0.6)'}`,
      }}
    >
      <button
        type="button"
        tabIndex={-1}
        data-testid="topbar-voice-mute-btn"
        aria-label={voice.muted ? 'Unmute microphone' : 'Mute microphone'}
        aria-pressed={voice.muted}
        title={voice.muted ? 'Unmute Mic' : 'Mute Mic'}
        onClick={(e) => {
          e.currentTarget.blur();
          onToggleMute();
        }}
        className={`h-8 px-2 rounded-md inline-flex items-center gap-1 text-xs font-extrabold transition-transform active:scale-95 ${
          voice.localSpeaking ? 'animate-voice-speak-glow' : ''
        }`}
        style={{
          backgroundColor: voice.muted
            ? 'rgba(239, 68, 68, 0.28)'
            : 'rgba(34, 197, 94, 0.26)',
          color: voice.muted ? '#FCA5A5' : '#86EFAC',
        }}
      >
        {voice.muted ? (
          <MicOff size={14} />
        ) : voice.localSpeaking ? (
          <SpeakingWaves color="#4ADE80" size="xs" />
        ) : (
          <Mic size={14} />
        )}
        <span className="hidden md:inline">{voice.muted ? 'Muted' : 'Live'}</span>
      </button>

      <button
        type="button"
        tabIndex={-1}
        data-testid="topbar-voice-deafen-btn"
        aria-label={voice.deafened ? 'Unmute room voices' : 'Mute room voices'}
        aria-pressed={voice.deafened}
        title={voice.deafened ? 'Unmute room voices' : 'Mute room voices'}
        onClick={(e) => {
          e.currentTarget.blur();
          onToggleDeafen();
        }}
        className="w-8 h-8 rounded-md inline-flex items-center justify-center transition-transform active:scale-95"
        style={{
          backgroundColor: voice.deafened ? 'rgba(245, 158, 11, 0.26)' : 'transparent',
          color: voice.deafened ? '#FDE047' : theme.textPrimary,
        }}
      >
        {voice.deafened ? <HeadphoneOff size={14} /> : <Headphones size={14} />}
      </button>

      <button
        type="button"
        tabIndex={-1}
        data-testid="topbar-voice-leave-btn"
        aria-label="Leave voice chat"
        title="Leave voice chat"
        onClick={(e) => {
          e.currentTarget.blur();
          onLeaveVoice();
        }}
        className="w-8 h-8 rounded-md inline-flex items-center justify-center transition-transform active:scale-95"
        style={{
          backgroundColor: 'rgba(239, 68, 68, 0.2)',
          color: '#FCA5A5',
        }}
      >
        <PhoneOff size={14} />
      </button>
    </div>
  );
}
