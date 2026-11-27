import type React from 'react';
import type { BoardEffectKind } from './LudoBoard';

const CONFETTI_RIBBONS: Array<{
  tx: number;
  ty: number;
  rot: string;
  color: string;
  delay: number;
  shape: 'rect' | 'dot' | 'star';
}> = [
  { tx: -62, ty: -64, rot: '-160deg', color: '#FF3B30', delay: 0, shape: 'rect' },
  { tx: 60, ty: -62, rot: '185deg', color: '#38BDF8', delay: 35, shape: 'rect' },
  { tx: -76, ty: -18, rot: '-210deg', color: '#FACC15', delay: 60, shape: 'star' },
  { tx: 76, ty: -20, rot: '220deg', color: '#4ADE80', delay: 80, shape: 'star' },
  { tx: -34, ty: -84, rot: '-140deg', color: '#F472B6', delay: 45, shape: 'dot' },
  { tx: 36, ty: -82, rot: '150deg', color: '#A855F7', delay: 25, shape: 'rect' },
  { tx: -54, ty: 24, rot: '-190deg', color: '#FB923C', delay: 75, shape: 'dot' },
  { tx: 54, ty: 22, rot: '195deg', color: '#22D3EE', delay: 55, shape: 'rect' },
];

/**
 * Shared SVG gradient definitions rendered once inside the board <defs>
 * so every animated cartoon sticker has rich glossy 3D shading with zero filter lag.
 */
export function AnimatedStickerDefs() {
  return (
    <defs>
      <radialGradient id="sticker-gold-face" cx="38%" cy="32%" r="68%">
        <stop offset="0%" stopColor="#FFF59D" />
        <stop offset="48%" stopColor="#FACC15" />
        <stop offset="100%" stopColor="#EA580C" />
      </radialGradient>
      <radialGradient id="sticker-rage-face" cx="38%" cy="30%" r="70%">
        <stop offset="0%" stopColor="#FCA5A5" />
        <stop offset="45%" stopColor="#EF4444" />
        <stop offset="100%" stopColor="#991B1B" />
      </radialGradient>
      <radialGradient id="sticker-cry-face" cx="38%" cy="32%" r="68%">
        <stop offset="0%" stopColor="#FEF08A" />
        <stop offset="55%" stopColor="#FBBF24" />
        <stop offset="100%" stopColor="#D97706" />
      </radialGradient>
      <radialGradient id="sticker-dizzy-face" cx="38%" cy="32%" r="68%">
        <stop offset="0%" stopColor="#D9F99D" />
        <stop offset="55%" stopColor="#84CC16" />
        <stop offset="100%" stopColor="#3F6212" />
      </radialGradient>
      <radialGradient id="sticker-sleep-face" cx="38%" cy="32%" r="68%">
        <stop offset="0%" stopColor="#E0F2FE" />
        <stop offset="55%" stopColor="#7DD3FC" />
        <stop offset="100%" stopColor="#0284C7" />
      </radialGradient>
      <linearGradient id="sticker-shield-gold" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#FEF08A" />
        <stop offset="50%" stopColor="#F59E0B" />
        <stop offset="100%" stopColor="#B45309" />
      </linearGradient>
      <linearGradient id="sticker-rocket-body" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#FFFFFF" />
        <stop offset="70%" stopColor="#E2E8F0" />
        <stop offset="100%" stopColor="#94A3B8" />
      </linearGradient>
      <linearGradient id="sticker-boot" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#38BDF8" />
        <stop offset="55%" stopColor="#1D4ED8" />
        <stop offset="100%" stopColor="#0F172A" />
      </linearGradient>
      <linearGradient id="sticker-tear" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="#BAE6FD" />
        <stop offset="55%" stopColor="#38BDF8" />
        <stop offset="100%" stopColor="#0284C7" />
      </linearGradient>
    </defs>
  );
}

/**
 * 1. DEPLOY PARTY FACE + ANIMATED PARTY HORN & CONFETTI SPRINKLERS
 */
function PartyDeploySticker() {
  return (
    <g>
      {/* Spraying Confetti Ribbons & Sparkles */}
      {CONFETTI_RIBBONS.map((c, idx) => (
        <g
          key={idx}
          className="animate-confetti-spray"
          style={
            {
              '--tx': `${c.tx}px`,
              '--ty': `${c.ty}px`,
              '--rot': c.rot,
              animationDelay: `${c.delay}ms`,
            } as React.CSSProperties
          }
        >
          {c.shape === 'rect' && (
            <rect
              x="-5"
              y="-3"
              width="10"
              height="6"
              rx="1.5"
              fill={c.color}
              stroke="#0B1C3D"
              strokeWidth="1.2"
            />
          )}
          {c.shape === 'dot' && (
            <circle cx="0" cy="0" r="4.5" fill={c.color} stroke="#0B1C3D" strokeWidth="1.2" />
          )}
          {c.shape === 'star' && (
            <polygon
              points="0,-7 2,-2 7,0 2,2 0,7 -2,2 -7,0 -2,-2"
              fill={c.color}
              stroke="#0B1C3D"
              strokeWidth="1.1"
            />
          )}
        </g>
      ))}

      {/* Bouncing Squash-and-Stretch Party Character */}
      <g className="animate-party-hop">
        {/* Glossy Round Smiley Head */}
        <circle
          cx="0"
          cy="2"
          r="24"
          fill="url(#sticker-gold-face)"
          stroke="#0B1C3D"
          strokeWidth="3"
        />
        {/* Specular shine */}
        <ellipse cx="-8" cy="-8" rx="7" ry="4" transform="rotate(-24 -8 -8)" fill="#FFFFFF" fillOpacity="0.52" />

        {/* Bouncing Striped Party Hat */}
        <g className="animate-hat-bounce">
          <polygon
            points="-14,-18 2,-45 16,-16"
            fill="#EC4899"
            stroke="#0B1C3D"
            strokeWidth="2.6"
            strokeLinejoin="round"
          />
          <path d="M -9,-25 L 11,-22 M -4,-34 L 7,-32" stroke="#FDE047" strokeWidth="3.5" strokeLinecap="round" />
          <circle cx="2" cy="-46" r="5" fill="#38BDF8" stroke="#0B1C3D" strokeWidth="2.2" />
        </g>

        {/* Happy ^ ^ Squinting Eyes */}
        <path d="M -13,-1 Q -8,-8 -3,-1" fill="none" stroke="#0B1C3D" strokeWidth="3.2" strokeLinecap="round" />
        <path d="M 3,-1 Q 8,-8 13,-1" fill="none" stroke="#0B1C3D" strokeWidth="3.2" strokeLinecap="round" />

        {/* Rosy Cheeks */}
        <ellipse cx="-14" cy="7" rx="4.5" ry="2.8" fill="#FB7185" fillOpacity="0.7" />
        <ellipse cx="14" cy="7" rx="4.5" ry="2.8" fill="#FB7185" fillOpacity="0.7" />

        {/* Animated Uncurling Party Horn / Noisemaker (nested so translate is preserved!) */}
        <g transform="translate(3, 11)">
          <g className="animate-horn-blow">
            <polygon
              points="0,-4 26,-9 26,5 0,4"
              fill="#38BDF8"
              stroke="#0B1C3D"
              strokeWidth="2.2"
              strokeLinejoin="round"
            />
            <line x1="9" y1="-5" x2="9" y2="4" stroke="#FDE047" strokeWidth="2.5" />
            <line x1="17" y1="-7" x2="17" y2="4" stroke="#FDE047" strokeWidth="2.5" />
            <circle cx="29" cy="-2" r="5" fill="#F43F5E" stroke="#0B1C3D" strokeWidth="2" />
          </g>
        </g>
      </g>
    </g>
  );
}

/**
 * 2. CAPTURE KICK STRIKE — LUNGING CARTOON LEG + EXPLODING COMIC POW STARBURST
 */
function KickStrikeSticker({ isAmbush }: { isAmbush: boolean }) {
  return (
    <g className="animate-kick-lunge">
      {/* Comic Jagged Impact Starburst */}
      <g className="animate-starburst-pulse">
        <polygon
          points="0,-36 8,-15 30,-26 17,-7 38,0 17,9 29,28 8,16 0,36 -8,16 -29,28 -17,9 -38,0 -17,-7 -30,-26 -8,-15"
          fill="#FACC15"
          stroke="#DC2626"
          strokeWidth="3"
          strokeLinejoin="round"
        />
        <polygon
          points="0,-22 5,-9 18,-15 10,-4 23,0 10,5 17,17 5,10 0,22 -5,10 -17,17 -10,5 -23,0 -10,-4 -18,-15 -5,-9"
          fill="#FEF9C3"
        />
      </g>

      {/* Flying Impact Knockout Stars */}
      <polygon
        points="28,-22 30,-17 35,-17 31,-14 33,-9 28,-12 23,-9 25,-14 21,-17 26,-17"
        fill="#FFFFFF"
        stroke="#0B1C3D"
        strokeWidth="1.4"
        className="animate-confetti-spray"
        style={{ '--tx': '26px', '--ty': '-26px', '--rot': '180deg' } as React.CSSProperties}
      />
      <polygon
        points="28,16 30,21 35,21 31,24 33,29 28,26 23,29 25,24 21,21 26,21"
        fill="#FDE047"
        stroke="#0B1C3D"
        strokeWidth="1.4"
        className="animate-confetti-spray"
        style={{ '--tx': '28px', '--ty': '22px', '--rot': '-180deg', animationDelay: '70ms' } as React.CSSProperties}
      />

      {/* Impact Speed Lines */}
      <path d="M 18,-18 L 36,-24 M 22,0 L 42,0 M 18,16 L 36,24" stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round" />

      {/* Animated Swinging Cartoon Kicking Leg & Sneaker */}
      <g className="animate-leg-kick">
        <path
          d="M -24,-22 L -6,2 L 6,2 L -10,-26 Z"
          fill="#FDBA74"
          stroke="#0B1C3D"
          strokeWidth="2.8"
          strokeLinejoin="round"
        />
        {isAmbush && (
          <path
            d="M -19,-14 L -9,-21 L -5,-15 L -15,-8 Z"
            fill="#DC2626"
            stroke="#0B1C3D"
            strokeWidth="1.8"
          />
        )}
        <path
          d="M -8,0 L 16,-4 C 24,-4 28,2 26,9 C 24,14 14,14 -8,12 Z"
          fill="url(#sticker-boot)"
          stroke="#0B1C3D"
          strokeWidth="2.8"
          strokeLinejoin="round"
        />
        <path d="M -7,10 L 25,10" stroke="#FFFFFF" strokeWidth="3.5" strokeLinecap="round" />
        <path d="M 4,-1 L 8,5 M 10,-2 L 14,4" stroke="#FDE047" strokeWidth="2.4" strokeLinecap="round" />
      </g>
    </g>
  );
}

/**
 * 3. TAUNTING LAUGHING FACE WITH WAGGING TONGUE (Capturer's Yard)
 */
function TauntLaughSticker() {
  return (
    <g className="animate-taunt-dance">
      <g className="animate-taunt-rock">
        {/* Glossy Smiley Head */}
        <circle
          cx="0"
          cy="0"
          r="24"
          fill="url(#sticker-gold-face)"
          stroke="#0B1C3D"
          strokeWidth="3"
        />
        <ellipse cx="-8" cy="-10" rx="7" ry="4" transform="rotate(-24 -8 -10)" fill="#FFFFFF" fillOpacity="0.5" />

        {/* Left Winking Eye (>) */}
        <path d="M -14,-7 L -6,-3 L -14,1" fill="none" stroke="#0B1C3D" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />

        {/* Right Mischievous Open Eye */}
        <circle cx="9" cy="-4" r="6" fill="#FFFFFF" stroke="#0B1C3D" strokeWidth="2.2" />
        <circle cx="10.5" cy="-3.5" r="3" fill="#0B1C3D" />
        <circle cx="11.5" cy="-5" r="1.1" fill="#FFFFFF" />

        {/* Raised Smug Eyebrow */}
        <path d="M 4,-13 Q 9,-17 15,-12" fill="none" stroke="#0B1C3D" strokeWidth="2.5" strokeLinecap="round" />

        {/* Laughing Open Mouth */}
        <path
          d="M -12,6 Q 0,10 12,6 Q 10,19 0,19 Q -10,19 -12,6 Z"
          fill="#7F1D1D"
          stroke="#0B1C3D"
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
        {/* Animated Wagging Pink Tongue */}
        <g className="animate-tongue-wag">
          <path
            d="M -6,12 C -6,26 6,26 6,12 Z"
            fill="#FB7185"
            stroke="#0B1C3D"
            strokeWidth="2.2"
          />
          <line x1="0" y1="13" x2="0" y2="21" stroke="#BE123C" strokeWidth="1.8" strokeLinecap="round" />
        </g>
      </g>

      {/* Bouncing Mini Laugh Sparks */}
      <text
        x="-34"
        y="-18"
        textAnchor="middle"
        fill="#FDE047"
        stroke="#0B1C3D"
        strokeWidth="3"
        paintOrder="stroke fill"
        fontSize="14"
        fontWeight="900"
        className="font-display animate-hat-bounce"
      >
        HA!
      </text>
      <text
        x="36"
        y="-12"
        textAnchor="middle"
        fill="#38BDF8"
        stroke="#0B1C3D"
        strokeWidth="3"
        paintOrder="stroke fill"
        fontSize="14"
        fontWeight="900"
        className="font-display animate-hat-bounce"
        style={{ animationDelay: '180ms' }}
      >
        HEH!
      </text>
    </g>
  );
}

/**
 * 4. FURIOUS STEAMING ANGRY FACE (Victim's Yard) — STOMPING + SHOOTING EAR STEAM
 */
function AngryRageSticker() {
  return (
    <g className="animate-rage-stomp">
      {/* Animated Steam Puffs Shooting Far Out from Both Ears */}
      <g className="animate-steam-left">
        <circle cx="-28" cy="-4" r="6.5" fill="#FFFFFF" stroke="#94A3B8" strokeWidth="1.8" />
        <circle cx="-37" cy="-11" r="8.5" fill="#F8FAFC" stroke="#94A3B8" strokeWidth="1.8" />
        <circle cx="-46" cy="-6" r="5.5" fill="#FFFFFF" stroke="#94A3B8" strokeWidth="1.6" />
      </g>
      <g className="animate-steam-right">
        <circle cx="28" cy="-4" r="6.5" fill="#FFFFFF" stroke="#94A3B8" strokeWidth="1.8" />
        <circle cx="37" cy="-11" r="8.5" fill="#F8FAFC" stroke="#94A3B8" strokeWidth="1.8" />
        <circle cx="46" cy="-6" r="5.5" fill="#FFFFFF" stroke="#94A3B8" strokeWidth="1.6" />
      </g>

      {/* Violently Trembling Red Head */}
      <g className="animate-rage-tremble">
        <circle
          cx="0"
          cy="0"
          r="24"
          fill="url(#sticker-rage-face)"
          stroke="#0B1C3D"
          strokeWidth="3"
        />

        {/* Throbbing Anime Anger Vein on Forehead (nested wrapper preserves position!) */}
        <g transform="translate(11, -13)">
          <g className="animate-vein-throb">
            <path
              d="M -4,-4 L -1,-1 L -4,2 M 4,-4 L 1,-1 L 4,2 M -1,-5 L -1,-2 M 1,3 L 1,0"
              fill="none"
              stroke="#FEF08A"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>
        </g>

        {/* Glaring White Eyes */}
        <circle cx="-9" cy="-2" r="5.5" fill="#FFFFFF" stroke="#0B1C3D" strokeWidth="2.2" />
        <circle cx="9" cy="-2" r="5.5" fill="#FFFFFF" stroke="#0B1C3D" strokeWidth="2.2" />
        <circle cx="-8" cy="-1.5" r="2.4" fill="#0B1C3D" />
        <circle cx="8" cy="-1.5" r="2.4" fill="#0B1C3D" />

        {/* Thick Slammed V-Shaped Angry Eyebrows */}
        <path d="M -16,-11 L -3,-5 M 16,-11 L 3,-5" stroke="#0B1C3D" strokeWidth="4" strokeLinecap="round" />

        {/* Shouting Clenched-Teeth Mouth */}
        <g className="animate-mouth-yell">
          <rect
            x="-12"
            y="8"
            width="24"
            height="10"
            rx="4"
            fill="#FFFFFF"
            stroke="#0B1C3D"
            strokeWidth="2.5"
          />
          <line x1="-12" y1="13" x2="12" y2="13" stroke="#0B1C3D" strokeWidth="1.8" />
          <line x1="-5" y1="8" x2="-5" y2="18" stroke="#0B1C3D" strokeWidth="1.6" />
          <line x1="5" y1="8" x2="5" y2="18" stroke="#0B1C3D" strokeWidth="1.6" />
        </g>
      </g>
    </g>
  );
}

/**
 * 5. CRYING WATERFALL FACE (Rides above crawling captured pawn all the way back to yard!)
 */
export function CryingCrawlSticker({ phase }: { phase: 'kicked' | 'crawling' }) {
  if (phase === 'kicked') {
    return (
      <g>
        {/* Orbiting Knockout Stars */}
        <g className="animate-orbit-spin">
          <polygon
            points="0,-29 2,-24 7,-24 3,-21 4,-16 0,-19 -4,-16 -3,-21 -7,-24 -2,-24"
            fill="#FDE047"
            stroke="#0B1C3D"
            strokeWidth="1.3"
          />
          <polygon
            points="22,-18 23.5,-14 27.5,-14 24,-12 25,-8 22,-10 19,-8 20,-12 16.5,-14 20.5,-14"
            fill="#38BDF8"
            stroke="#0B1C3D"
            strokeWidth="1.2"
          />
        </g>
        <g className="animate-rage-tremble">
          <circle
            cx="0"
            cy="0"
            r="20"
            fill="url(#sticker-gold-face)"
            stroke="#0B1C3D"
            strokeWidth="2.8"
          />
          {/* Knocked-out X X eyes */}
          <path d="M -11,-6 L -4,1 M -4,-6 L -11,1" stroke="#0B1C3D" strokeWidth="2.8" strokeLinecap="round" />
          <path d="M 4,-6 L 11,1 M 11,-6 L 4,1" stroke="#0B1C3D" strokeWidth="2.8" strokeLinecap="round" />
          {/* Stunned O mouth */}
          <circle cx="0" cy="10" r="5" fill="#7F1D1D" stroke="#0B1C3D" strokeWidth="2.2" />
        </g>
      </g>
    );
  }

  return (
    <g className="animate-cry-sob">
      {/* Animated Gushing Cyan Tear Waterfalls Streaming Down Both Cheeks */}
      <g className="animate-waterfall-tear">
        <path
          d="M -12,0 C -17,12 -18,24 -14,34 C -11,36 -8,34 -9,24 C -9,14 -8,6 -8,0 Z"
          fill="url(#sticker-tear)"
          stroke="#0369A1"
          strokeWidth="1.5"
        />
        <path
          d="M 12,0 C 17,12 18,24 14,34 C 11,36 8,34 9,24 C 9,14 8,6 8,0 Z"
          fill="url(#sticker-tear)"
          stroke="#0369A1"
          strokeWidth="1.5"
        />
      </g>

      {/* Spraying Tear Droplets on Both Sides */}
      <circle
        cx="-15"
        cy="12"
        r="3.4"
        fill="#38BDF8"
        stroke="#0369A1"
        strokeWidth="1.2"
        className="animate-tear-drop"
        style={{ '--tear-x': '-10px' } as React.CSSProperties}
      />
      <circle
        cx="15"
        cy="12"
        r="3.4"
        fill="#38BDF8"
        stroke="#0369A1"
        strokeWidth="1.2"
        className="animate-tear-drop"
        style={{ '--tear-x': '10px', animationDelay: '220ms' } as React.CSSProperties}
      />
      <circle
        cx="-18"
        cy="4"
        r="2.6"
        fill="#BAE6FD"
        stroke="#0369A1"
        strokeWidth="1.1"
        className="animate-tear-drop"
        style={{ '--tear-x': '-14px', animationDelay: '360ms' } as React.CSSProperties}
      />
      <circle
        cx="18"
        cy="4"
        r="2.6"
        fill="#BAE6FD"
        stroke="#0369A1"
        strokeWidth="1.1"
        className="animate-tear-drop"
        style={{ '--tear-x': '14px', animationDelay: '110ms' } as React.CSSProperties}
      />

      {/* Sobbing Face Head */}
      <circle
        cx="0"
        cy="0"
        r="20"
        fill="url(#sticker-cry-face)"
        stroke="#0B1C3D"
        strokeWidth="2.8"
      />
      {/* Sad Slanted Brows */}
      <path d="M -13,-10 L -5,-13 M 13,-10 L 5,-13" stroke="#0B1C3D" strokeWidth="2.4" strokeLinecap="round" />
      {/* Tightly Squeezed > < Crying Eyes */}
      <path d="M -12,-5 L -5,-2 L -12,1" fill="none" stroke="#0B1C3D" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M 12,-5 L 5,-2 L 12,1" fill="none" stroke="#0B1C3D" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />

      {/* Quivering Open Bawling Mouth */}
      <g className="animate-sob-mouth">
        <path
          d="M -8,12 Q 0,3 8,12 Q 6,17 0,16 Q -6,17 -8,12 Z"
          fill="#7F1D1D"
          stroke="#0B1C3D"
          strokeWidth="2.2"
          strokeLinejoin="round"
        />
        <ellipse cx="0" cy="14" rx="4" ry="2.2" fill="#FB7185" />
      </g>
    </g>
  );
}

/**
 * 6. SAFE STAR — COOL SUNGLASSES SMILEY WITH SHINING LENSES & ORBITING STARS
 */
function SafeStarSticker() {
  return (
    <g className="animate-swagger-sway">
      {/* Orbiting Twinkling Golden Stars */}
      <polygon
        points="-32,-18 -29,-12 -23,-12 -28,-8 -26,-2 -32,-6 -38,-2 -36,-8 -41,-12 -35,-12"
        fill="#FDE047"
        stroke="#0B1C3D"
        strokeWidth="1.6"
        className="animate-hat-bounce"
      />
      <polygon
        points="32,-20 35,-14 41,-14 36,-10 38,-4 32,-8 26,-4 28,-10 23,-14 29,-14"
        fill="#38BDF8"
        stroke="#0B1C3D"
        strokeWidth="1.6"
        className="animate-hat-bounce"
        style={{ animationDelay: '200ms' }}
      />

      {/* Glossy Head */}
      <circle cx="0" cy="0" r="23" fill="url(#sticker-gold-face)" stroke="#0B1C3D" strokeWidth="3" />
      {/* Cool Dark Shades */}
      <path
        d="M -20,-6 L -3,-6 L -4,4 C -6,8 -17,8 -19,3 Z M 3,-6 L 20,-6 L 19,3 C 17,8 6,8 4,4 Z M -4,-4 L 4,-4"
        fill="#0F172A"
        stroke="#0B1C3D"
        strokeWidth="2.4"
        strokeLinejoin="round"
      />
      {/* Animated Sweeping Lens Glints */}
      <g className="animate-glint-sweep">
        <path d="M -15,-3 L -10,3 M 8,-3 L 13,3" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round" />
      </g>
      {/* Cool Smirk */}
      <path d="M -8,11 Q 2,16 11,9" fill="none" stroke="#0B1C3D" strokeWidth="3" strokeLinecap="round" />
    </g>
  );
}

/**
 * 7. SAFE STACK — SLAMMING GOLDEN FORTRESS SHIELD WITH SHIMMER RING
 */
function SafeStackSticker() {
  return (
    <g className="animate-shield-slam">
      <circle
        cx="0"
        cy="2"
        r="26"
        fill="none"
        stroke="#FDE047"
        strokeWidth="3"
        className="animate-pulse-ring"
      />
      <g className="animate-hat-bounce">
        <path
          d="M 0,-28 L 22,-18 L 20,4 C 19,17 10,25 0,29 C -10,25 -19,17 -20,4 L -22,-18 Z"
          fill="url(#sticker-shield-gold)"
          stroke="#0B1C3D"
          strokeWidth="3"
          strokeLinejoin="round"
        />
        <path
          d="M 0,-20 L 14,-13 L 13,3 C 12,12 6,18 0,21 C -6,18 -12,12 -13,3 L -14,-13 Z"
          fill="#FEF9C3"
          fillOpacity="0.45"
        />
        <path
          d="M -9,1 L -2,8 L 10,-6"
          fill="none"
          stroke="#0B1C3D"
          strokeWidth="4.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
    </g>
  );
}

/**
 * 8. ENTER HOME STRETCH — BLASTING CARTOON ROCKET FLYING DIAGONALLY UPWARD
 */
function HomeStretchSticker() {
  return (
    <g className="animate-rocket-launch">
      <g transform="rotate(32)">
        {/* Trailing Smoke Puffs */}
        <circle
          cx="-4"
          cy="28"
          r="5"
          fill="#E2E8F0"
          fillOpacity="0.85"
          className="animate-ember-rise"
          style={{ '--ex': '-6px' } as React.CSSProperties}
        />
        <circle
          cx="4"
          cy="32"
          r="4"
          fill="#CBD5E1"
          fillOpacity="0.8"
          className="animate-ember-rise"
          style={{ '--ex': '6px', animationDelay: '180ms' } as React.CSSProperties}
        />
        {/* Flickering Exhaust Flame */}
        <g className="animate-flame-flicker">
          <path d="M -8,16 Q 0,44 8,16 Z" fill="#EF4444" stroke="#0B1C3D" strokeWidth="2" />
          <path d="M -4.5,16 Q 0,34 4.5,16 Z" fill="#FDE047" />
        </g>
        {/* Rocket Fins */}
        <path d="M -11,4 L -20,18 L -9,15 Z M 11,4 L 20,18 L 9,15 Z" fill="#EF4444" stroke="#0B1C3D" strokeWidth="2.4" strokeLinejoin="round" />
        {/* Rocket Body */}
        <path
          d="M 0,-28 C 12,-14 13,4 10,16 L -10,16 C -13,4 -12,-14 0,-28 Z"
          fill="url(#sticker-rocket-body)"
          stroke="#0B1C3D"
          strokeWidth="2.8"
          strokeLinejoin="round"
        />
        {/* Nose Cone */}
        <path d="M 0,-28 C 6,-21 8,-15 9,-11 L -9,-11 C -8,-15 -6,-21 0,-28 Z" fill="#EF4444" stroke="#0B1C3D" strokeWidth="2.2" />
        {/* Window */}
        <circle cx="0" cy="-1" r="5.5" fill="#38BDF8" stroke="#0B1C3D" strokeWidth="2.2" />
        <circle cx="-1.5" cy="-2.5" r="1.8" fill="#FFFFFF" />
      </g>
    </g>
  );
}

/**
 * 9. FINAL GOAL & VICTORY — JUMPING GOLDEN TROPHY + HOPPING CROWN + FIREWORKS
 */
function GoalTrophySticker() {
  return (
    <g>
      {/* Festive Confetti Fireworks */}
      {CONFETTI_RIBBONS.map((c, idx) => (
        <polygon
          key={idx}
          points="0,-6 2,-2 6,0 2,2 0,6 -2,2 -6,0 -2,-2"
          fill={c.color}
          stroke="#0B1C3D"
          strokeWidth="1"
          className="animate-confetti-spray"
          style={
            {
              '--tx': `${c.tx * 1.15}px`,
              '--ty': `${c.ty * 1.15}px`,
              '--rot': c.rot,
              animationDelay: `${c.delay}ms`,
            } as React.CSSProperties
          }
        />
      ))}

      <g className="animate-trophy-cheer">
        {/* Golden Trophy Cup */}
        <path
          d="M -16,-12 C -26,-12 -26,4 -14,5 M 16,-12 C 26,-12 26,4 14,5"
          fill="none"
          stroke="#FACC15"
          strokeWidth="4.5"
          strokeLinecap="round"
        />
        <path
          d="M -16,-16 L 16,-16 L 13,4 C 11,13 6,16 0,16 C -6,16 -11,13 -13,4 Z"
          fill="url(#sticker-shield-gold)"
          stroke="#0B1C3D"
          strokeWidth="2.8"
          strokeLinejoin="round"
        />
        <rect x="-4" y="15" width="8" height="8" fill="#F59E0B" stroke="#0B1C3D" strokeWidth="2.4" />
        <rect x="-14" y="22" width="28" height="6" rx="2.5" fill="#B45309" stroke="#0B1C3D" strokeWidth="2.6" />
        <polygon
          points="0,-9 2.5,-3 9,-3 4,1 6,7 0,3.5 -6,7 -4,1 -9,-3 -2.5,-3"
          fill="#FEF9C3"
          stroke="#0B1C3D"
          strokeWidth="1.4"
        />

        {/* Bouncing Royal Crown on Top (nested wrapper preserves position!) */}
        <g transform="translate(0, -24)">
          <g className="animate-hat-bounce">
            <polygon
              points="-13,6 -16,-8 -5,-1 0,-11 5,-1 16,-8 13,6"
              fill="#FDE047"
              stroke="#0B1C3D"
              strokeWidth="2.4"
              strokeLinejoin="round"
            />
            <circle cx="0" cy="-1" r="2.6" fill="#EF4444" />
          </g>
        </g>
      </g>
    </g>
  );
}

/**
 * 10. ON-FIRE HOT STREAK — SURGING BLAZING FLAME + RISING EMBERS
 */
function OnFireSticker() {
  return (
    <g className="animate-fire-surge">
      {/* Rising Fire Embers */}
      <circle
        cx="-16"
        cy="-12"
        r="3.5"
        fill="#FDE047"
        stroke="#DC2626"
        strokeWidth="1.2"
        className="animate-ember-rise"
        style={{ '--ex': '-12px' } as React.CSSProperties}
      />
      <circle
        cx="16"
        cy="-10"
        r="3.5"
        fill="#FB923C"
        stroke="#DC2626"
        strokeWidth="1.2"
        className="animate-ember-rise"
        style={{ '--ex': '12px', animationDelay: '220ms' } as React.CSSProperties}
      />
      <circle
        cx="0"
        cy="-24"
        r="3"
        fill="#FEF08A"
        className="animate-ember-rise"
        style={{ '--ex': '4px', animationDelay: '380ms' } as React.CSSProperties}
      />

      {/* Outer Dancing Red/Orange Flame Aura */}
      <g className="animate-flame-flicker">
        <path
          d="M 0,-40 C 16,-24 28,-12 25,8 C 23,24 12,30 0,30 C -12,30 -23,24 -25,8 C -28,-12 -16,-24 0,-40 Z"
          fill="#EF4444"
          stroke="#0B1C3D"
          strokeWidth="3"
          strokeLinejoin="round"
        />
        <path
          d="M 0,-30 C 12,-16 19,-6 18,9 C 16,21 8,26 0,26 C -8,26 -16,21 -18,9 C -19,-6 -12,-16 0,-30 Z"
          fill="#F97316"
        />
        <path
          d="M 0,-18 C 8,-8 12,0 11,11 C 10,20 5,23 0,23 C -5,23 -10,20 -11,11 C -12,0 -8,-8 0,-18 Z"
          fill="#FDE047"
        />
      </g>
      {/* Fierce Determined Eyes & Grin inside the Flame */}
      <path d="M -11,0 L -4,3 M 11,0 L 4,3" stroke="#0B1C3D" strokeWidth="3.2" strokeLinecap="round" />
      <circle cx="-7" cy="6" r="2.8" fill="#0B1C3D" />
      <circle cx="7" cy="6" r="2.8" fill="#0B1C3D" />
      <path d="M -8,14 Q 0,20 8,14" fill="none" stroke="#0B1C3D" strokeWidth="2.8" strokeLinecap="round" />
    </g>
  );
}

/**
 * 11. MERCY 6 / LUCKY 6 — TUMBLING GOLDEN 6-PIP DIE + SPINNING LUCKY CLOVER
 */
function LuckySixSticker({ isMercy }: { isMercy: boolean }) {
  return (
    <g className="animate-die-celebrate">
      {isMercy && (
        <g transform="translate(-26, -12)">
          <g className="animate-hat-bounce">
            <circle cx="-6" cy="-6" r="7" fill="#22C55E" stroke="#0B1C3D" strokeWidth="2" />
            <circle cx="6" cy="-6" r="7" fill="#22C55E" stroke="#0B1C3D" strokeWidth="2" />
            <circle cx="-6" cy="6" r="7" fill="#16A34A" stroke="#0B1C3D" strokeWidth="2" />
            <circle cx="6" cy="6" r="7" fill="#16A34A" stroke="#0B1C3D" strokeWidth="2" />
            <path d="M 0,10 Q 2,20 8,22" fill="none" stroke="#15803D" strokeWidth="3" strokeLinecap="round" />
          </g>
        </g>
      )}

      {/* Bouncing Glossy 6-Pip Die */}
      <g className="animate-taunt-rock">
        <rect
          x="-20"
          y="-20"
          width="40"
          height="40"
          rx="9"
          fill="#FDE047"
          stroke="#0B1C3D"
          strokeWidth="3"
        />
        <rect x="-15" y="-15" width="30" height="10" rx="4" fill="#FFFFFF" fillOpacity="0.45" />
        {[-9, 9].map((px) =>
          [-10, 0, 10].map((py) => (
            <circle key={`${px}-${py}`} cx={px} cy={py} r="3.6" fill="#0B1C3D" />
          ))
        )}
      </g>
    </g>
  );
}

/**
 * 12. 3x SIXES FORFEIT — SWAYING DIZZY FACE WITH SPINNING HALO STARS
 */
function ForfeitDizzySticker() {
  return (
    <g className="animate-dizzy-sway">
      <g className="animate-rage-tremble">
        <circle cx="0" cy="2" r="22" fill="url(#sticker-dizzy-face)" stroke="#0B1C3D" strokeWidth="3" />
        <circle cx="-8" cy="-3" r="6" fill="#FFFFFF" stroke="#0B1C3D" strokeWidth="2" />
        <circle cx="-8" cy="-3" r="2.6" fill="none" stroke="#0B1C3D" strokeWidth="2" />
        <circle cx="8" cy="-3" r="6" fill="#FFFFFF" stroke="#0B1C3D" strokeWidth="2" />
        <circle cx="8" cy="-3" r="2.6" fill="none" stroke="#0B1C3D" strokeWidth="2" />
        <path
          d="M -10,12 Q -5,8 0,12 Q 5,16 10,12"
          fill="none"
          stroke="#0B1C3D"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </g>
      {/* Orbiting Dizzy Halo */}
      <ellipse cx="0" cy="-24" rx="22" ry="6" fill="none" stroke="#FDE047" strokeWidth="2.2" strokeDasharray="5 4" />
      <g className="animate-taunt-rock">
        <polygon
          points="-18,-28 -16,-24 -12,-24 -15,-21 -14,-17 -18,-19 -22,-17 -21,-21 -24,-24 -20,-24"
          fill="#FDE047"
          stroke="#0B1C3D"
          strokeWidth="1.2"
        />
        <polygon
          points="18,-28 20,-24 24,-24 21,-21 22,-17 18,-19 14,-17 15,-21 12,-24 16,-24"
          fill="#FDE047"
          stroke="#0B1C3D"
          strokeWidth="1.2"
        />
      </g>
    </g>
  );
}

/**
 * 13. NO MOVES SKIP — NODDING SLEEPY FACE + BREATHING BUBBLE + RISING Zzz
 */
function SkipSleepySticker() {
  return (
    <g className="animate-sleep-nod">
      <circle cx="0" cy="2" r="21" fill="url(#sticker-sleep-face)" stroke="#0B1C3D" strokeWidth="2.8" />
      <path d="M -12,-2 Q -8,3 -4,-2 M 4,-2 Q 8,3 12,-2" fill="none" stroke="#0B1C3D" strokeWidth="2.8" strokeLinecap="round" />
      <circle cx="0" cy="10" r="3.6" fill="#0B1C3D" />
      {/* Expanding & Shrinking Sleep Bubble */}
      <circle
        cx="9"
        cy="12"
        r="7.5"
        fill="#BAE6FD"
        fillOpacity="0.82"
        stroke="#0284C7"
        strokeWidth="1.8"
        className="animate-bubble-breathe"
      />
      {/* Rising Floating Zzz */}
      <g transform="translate(22, -10)">
        <text
          x="0"
          y="0"
          fill="#E0F2FE"
          stroke="#0B1C3D"
          strokeWidth="3"
          paintOrder="stroke fill"
          fontSize="16"
          fontWeight="900"
          className="font-display animate-zzz-float"
        >
          Zzz
        </text>
      </g>
    </g>
  );
}

/**
 * 14. CRAZY MODE GUARANTEED SNIPE — LOCKING CROSSHAIR TARGET + WINKING SNIPER STAR
 */
function CrazySnipeSticker() {
  return (
    <g className="animate-kick-lunge">
      <g className="animate-starburst-pulse">
        <circle cx="0" cy="0" r="28" fill="#FEE2E2" fillOpacity="0.92" stroke="#DC2626" strokeWidth="4" />
        <circle cx="0" cy="0" r="16" fill="none" stroke="#EF4444" strokeWidth="3" />
        <circle cx="0" cy="0" r="5" fill="#DC2626" />
        <path d="M 0,-34 L 0,-12 M 0,12 L 0,34 M -34,0 L -12,0 M 12,0 L 34,0" stroke="#0B1C3D" strokeWidth="3.2" strokeLinecap="round" />
      </g>
    </g>
  );
}

/**
 * 15. CRAZY MODE CHAOS STAR — ELECTRIC LIGHTNING BOLT + SPINNING VORTEX
 */
function ChaosBoostSticker() {
  return (
    <g className="animate-fire-surge">
      <g className="animate-orbit-spin">
        <circle cx="0" cy="0" r="26" fill="none" stroke="#A855F7" strokeWidth="4" strokeDasharray="10 8" />
      </g>
      <g className="animate-taunt-rock">
        <polygon
          points="4,-32 -16,2 -2,2 -10,32 18,-4 3,-4"
          fill="#FDE047"
          stroke="#0B1C3D"
          strokeWidth="3"
          strokeLinejoin="round"
        />
      </g>
    </g>
  );
}

/**
 * 16. UNO REVERSE — SPINNING VIBRANT DOUBLE-ARROW UNO CARD BADGE
 */
function UnoReverseSticker() {
  return (
    <g className="animate-die-celebrate">
      <circle cx="0" cy="0" r="26" fill="#22C55E" stroke="#0B1C3D" strokeWidth="3.2" />
      <ellipse cx="0" cy="0" rx="20" ry="13" transform="rotate(-24)" fill="#FFFFFF" stroke="#0B1C3D" strokeWidth="2" />
      <g className="animate-taunt-rock">
        <path
          d="M -11,-4 L 6,-4 L 2,-9 M 11,4 L -6,4 L -2,9"
          fill="none"
          stroke="#15803D"
          strokeWidth="3.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
    </g>
  );
}

/**
 * 17. UNO SKIP — BOUNCING CRIMSON FORBIDDEN SKIP BADGE
 */
function UnoSkipSticker() {
  return (
    <g className="animate-shield-slam">
      <circle cx="0" cy="0" r="25" fill="#EF4444" stroke="#0B1C3D" strokeWidth="3.2" />
      <circle cx="0" cy="0" r="15" fill="none" stroke="#FFFFFF" strokeWidth="4.5" />
      <line x1="-11" y1="-11" x2="11" y2="11" stroke="#FFFFFF" strokeWidth="4.8" strokeLinecap="round" />
    </g>
  );
}

/**
 * 18. UNO KNOCKBACK (-2 / -4) — FLYING EXPLODING WILD CARD SMASH
 */
function UnoKnockbackSticker() {
  return (
    <g className="animate-kick-lunge">
      <g className="animate-starburst-pulse">
        <polygon
          points="0,-34 9,-14 29,-24 16,-6 36,2 16,10 28,27 7,16 0,34 -8,16 -28,27 -16,10 -36,2 -16,-6 -29,-24 -9,-14"
          fill="#FB923C"
          stroke="#991B1B"
          strokeWidth="3"
          strokeLinejoin="round"
        />
      </g>
      <g className="animate-taunt-rock">
        <rect x="-18" y="-22" width="26" height="36" rx="5" transform="rotate(-14)" fill="#E52521" stroke="#FFFFFF" strokeWidth="2.5" />
        <rect x="-6" y="-16" width="26" height="36" rx="5" transform="rotate(10)" fill="#1E1B4B" stroke="#FDE047" strokeWidth="2.5" />
        <text
          x="7"
          y="7"
          textAnchor="middle"
          fill="#FDE047"
          stroke="#0B1C3D"
          strokeWidth="2.4"
          paintOrder="stroke fill"
          fontSize="16"
          fontWeight="900"
          className="font-display"
        >
          -N!
        </text>
      </g>
    </g>
  );
}

/**
 * Master dispatcher rendering the custom multi-part animated cartoon sticker for every Ludo event!
 */
export function AnimatedEventSticker({ kind }: { kind: BoardEffectKind }) {
  switch (kind) {
    case 'deploy':
      return <PartyDeploySticker />;
    case 'capture':
      return <KickStrikeSticker isAmbush={false} />;
    case 'ambush':
      return <KickStrikeSticker isAmbush={true} />;
    case 'taunt':
      return <TauntLaughSticker />;
    case 'angry':
      return <AngryRageSticker />;
    case 'safe':
      return <SafeStarSticker />;
    case 'stack_safe':
      return <SafeStackSticker />;
    case 'enter_home':
      return <HomeStretchSticker />;
    case 'finish':
    case 'victory':
      return <GoalTrophySticker />;
    case 'fire_ignite':
      return <OnFireSticker />;
    case 'mercy_six':
      return <LuckySixSticker isMercy={true} />;
    case 'bonus_six':
      return <LuckySixSticker isMercy={false} />;
    case 'forfeit':
      return <ForfeitDizzySticker />;
    case 'skip':
      return <SkipSleepySticker />;
    case 'crazy_snipe':
      return <CrazySnipeSticker />;
    case 'chaos_boost':
      return <ChaosBoostSticker />;
    case 'uno_reverse':
      return <UnoReverseSticker />;
    case 'uno_skip':
      return <UnoSkipSticker />;
    case 'uno_knockback':
      return <UnoKnockbackSticker />;
  }
}
