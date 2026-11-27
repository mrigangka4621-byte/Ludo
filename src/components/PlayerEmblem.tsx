import type { EmblemKind } from '../game/types';

interface PlayerEmblemProps {
  emblem: EmblemKind;
  color?: string;
  size?: number;
}

/**
 * Distinct geometric icon path per player palette so every seat is identifiable
 * by shape as well as color (color-blind accessible).
 */
export function renderEmblemPath(emblem: EmblemKind): string {
  switch (emblem) {
    case 'crown':
      return 'M4 17 L6 8 L10 12 L12 6 L14 12 L18 8 L20 17 Z';
    case 'shield':
      return 'M12 3 L19 6 V12 C19 16.5 16 19.8 12 21 C8 19.8 5 16.5 5 12 V6 Z';
    case 'leaf':
      return 'M19 5 C11 5 6 10 6 18 C14 18 19 13 19 5 Z M6 18 L13 11';
    case 'sun':
      return 'M12 7 A5 5 0 1 0 12 17 A5 5 0 1 0 12 7 Z M12 2 V4 M12 20 V22 M2 12 H4 M20 12 H22';
    case 'diamond':
      return 'M12 3 L20 12 L12 21 L4 12 Z';
    case 'wave':
      return 'M3 14 C6 10 9 10 12 14 C15 18 18 18 21 14 M3 9 C6 5 9 5 12 9 C15 13 18 13 21 9';
    case 'star':
      return 'M12 3 L14.7 8.8 L21 9.6 L16.3 14 L17.5 20.2 L12 17.2 L6.5 20.2 L7.7 14 L3 9.6 L9.3 8.8 Z';
    case 'flame':
      return 'M12 3 C15 7 18 10 18 14 A6 6 0 1 1 6 14 C6 11 8 8.5 9.5 7 C9.5 9 10.5 10 11.5 10 C11 7.5 11.2 5 12 3 Z';
    case 'moon':
      return 'M16.5 15.5 A6.5 6.5 0 0 1 8.5 7.5 A6.5 6.5 0 1 0 16.5 15.5 Z';
    case 'clover':
      return 'M12 12 C9 12 7 9.8 7 7.5 A2.8 2.8 0 0 1 12 6.2 A2.8 2.8 0 0 1 17 7.5 C17 9.8 15 12 12 12 Z M12 12 C15 12 17 14.2 17 16.5 A2.8 2.8 0 0 1 12 17.8 A2.8 2.8 0 0 1 7 16.5 C7 14.2 9 12 12 12 Z';
  }
}

export function PlayerEmblem({ emblem, color = '#FFFFFF', size = 14 }: PlayerEmblemProps) {
  const isStroke = emblem === 'wave' || emblem === 'sun';
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={isStroke ? 'none' : color}
      stroke={isStroke ? color : 'none'}
      strokeWidth={isStroke ? 2.4 : 0}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={renderEmblemPath(emblem)} />
    </svg>
  );
}
