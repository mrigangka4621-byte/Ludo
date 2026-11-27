/**
 * Hand-crafted vector artwork for the Mango Ludo arcade landing screen:
 * - Tilted subtle Ludo board tiled backdrop SVG
 * - Hero Mango Ludo crest (crown, colorful LUDO discs, mini 3D board, 4 glossy pawns & 3D die)
 * - Glossy arcade tile illustrations for Play Online, Join Friends, Computer, Pass & Play,
 *   and all 4 Game Modes (Classic, Flip-Track, Crazy, UNO).
 */

export function LudoPatternBackdrop() {
  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 w-full h-full opacity-[0.13] select-none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <pattern
          id="mango-ludo-bg-tile"
          width="176"
          height="176"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(-24)"
        >
          {/* Mini Ludo home yard 4-spot square */}
          <rect x="10" y="10" width="66" height="66" rx="10" fill="none" stroke="#93C5FD" strokeWidth="2.5" />
          <rect x="20" y="20" width="46" height="46" rx="6" fill="none" stroke="#93C5FD" strokeWidth="1.6" />
          <circle cx="33" cy="33" r="6" fill="#93C5FD" opacity="0.55" />
          <circle cx="53" cy="33" r="6" fill="#93C5FD" opacity="0.55" />
          <circle cx="33" cy="53" r="6" fill="#93C5FD" opacity="0.55" />
          <circle cx="53" cy="53" r="6" fill="#93C5FD" opacity="0.55" />

          {/* Mini 3-column track cells + star */}
          <rect x="86" y="10" width="24" height="22" fill="none" stroke="#93C5FD" strokeWidth="1.5" />
          <rect x="110" y="10" width="24" height="22" fill="none" stroke="#93C5FD" strokeWidth="1.5" />
          <rect x="134" y="10" width="24" height="22" fill="none" stroke="#93C5FD" strokeWidth="1.5" />
          <rect x="86" y="32" width="24" height="22" fill="none" stroke="#93C5FD" strokeWidth="1.5" />
          <rect x="110" y="32" width="24" height="22" fill="#93C5FD" opacity="0.22" stroke="#93C5FD" strokeWidth="1.5" />
          <rect x="134" y="32" width="24" height="22" fill="none" stroke="#93C5FD" strokeWidth="1.5" />
          <rect x="86" y="54" width="24" height="22" fill="none" stroke="#93C5FD" strokeWidth="1.5" />
          <rect x="110" y="54" width="24" height="22" fill="#93C5FD" opacity="0.22" stroke="#93C5FD" strokeWidth="1.5" />
          <rect x="134" y="54" width="24" height="22" fill="none" stroke="#93C5FD" strokeWidth="1.5" />

          {/* Center home triangle cluster */}
          <polygon points="88,88 126,126 88,164" fill="none" stroke="#93C5FD" strokeWidth="2" />
          <polygon points="164,88 126,126 164,164" fill="none" stroke="#93C5FD" strokeWidth="2" />
          <polygon points="88,88 126,126 164,88" fill="#93C5FD" opacity="0.16" stroke="#93C5FD" strokeWidth="2" />
          <polygon points="88,164 126,126 164,164" fill="none" stroke="#93C5FD" strokeWidth="2" />

          {/* Safe star + directional arrow */}
          <path
            d="M43 102 L46 111 L56 111 L48 117 L51 126 L43 120 L35 126 L38 117 L30 111 L40 111 Z"
            fill="none"
            stroke="#93C5FD"
            strokeWidth="2"
          />
          <path d="M24 148 H58 M50 141 L58 148 L50 155" fill="none" stroke="#93C5FD" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#mango-ludo-bg-tile)" />
    </svg>
  );
}

export function MangoLudoHeroCrest({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={`relative mx-auto flex items-center justify-center select-none ${
        compact ? 'w-[240px] h-[126px] sm:w-[270px] sm:h-[140px]' : 'w-[300px] h-[168px] sm:w-[375px] sm:h-[210px]'
      }`}
    >
      <svg
        viewBox="0 0 420 236"
        className="w-full h-full drop-shadow-[0_12px_24px_rgba(4,16,48,0.62)]"
        role="img"
        aria-label="Mango Ludo royal crest with crown, dice, and 4 pawns"
      >
        <defs>
          <linearGradient id="crest-crown-gold" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#FEF08A" />
            <stop offset="50%" stopColor="#FACC15" />
            <stop offset="100%" stopColor="#CA8A04" />
          </linearGradient>
          <linearGradient id="crest-mango-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#FDE047" />
            <stop offset="50%" stopColor="#FB923C" />
            <stop offset="100%" stopColor="#EA580C" />
          </linearGradient>
          <linearGradient id="crest-pawn-blue" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#7DD3FC" />
            <stop offset="45%" stopColor="#0EA5E9" />
            <stop offset="100%" stopColor="#0369A1" />
          </linearGradient>
          <linearGradient id="crest-pawn-red" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#FCA5A5" />
            <stop offset="45%" stopColor="#EF4444" />
            <stop offset="100%" stopColor="#991B1B" />
          </linearGradient>
          <linearGradient id="crest-pawn-green" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#86EFAC" />
            <stop offset="45%" stopColor="#22C55E" />
            <stop offset="100%" stopColor="#15803D" />
          </linearGradient>
          <linearGradient id="crest-pawn-yellow" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#FEF9C3" />
            <stop offset="45%" stopColor="#FACC15" />
            <stop offset="100%" stopColor="#CA8A04" />
          </linearGradient>
          <linearGradient id="crest-die-top" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="100%" stopColor="#E2E8F0" />
          </linearGradient>
          <linearGradient id="crest-die-side" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#E2E8F0" />
            <stop offset="100%" stopColor="#94A3B8" />
          </linearGradient>
          <radialGradient id="crest-glow" cx="50%" cy="55%" r="48%">
            <stop offset="0%" stopColor="#60A5FA" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#60A5FA" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Soft spotlight aura behind emblem */}
        <ellipse cx="210" cy="136" rx="185" ry="74" fill="url(#crest-glow)" />

        {/* Back Pawns (Red left, Green right) */}
        <g transform="translate(88, 108)">
          <ellipse cx="18" cy="48" rx="16" ry="5" fill="#07153A" opacity="0.45" />
          <path d="M5 44 C5 28 11 19 18 19 C25 19 31 28 31 44 C26 49 10 49 5 44 Z" fill="url(#crest-pawn-red)" stroke="#07153A" strokeWidth="2.4" />
          <circle cx="18" cy="13" r="10.5" fill="url(#crest-pawn-red)" stroke="#07153A" strokeWidth="2.4" />
          <ellipse cx="14.5" cy="9.5" rx="3.2" ry="2.2" fill="#FFFFFF" opacity="0.65" />
        </g>

        <g transform="translate(296, 108)">
          <ellipse cx="18" cy="48" rx="16" ry="5" fill="#07153A" opacity="0.45" />
          <path d="M5 44 C5 28 11 19 18 19 C25 19 31 28 31 44 C26 49 10 49 5 44 Z" fill="url(#crest-pawn-green)" stroke="#07153A" strokeWidth="2.4" />
          <circle cx="18" cy="13" r="10.5" fill="url(#crest-pawn-green)" stroke="#07153A" strokeWidth="2.4" />
          <ellipse cx="14.5" cy="9.5" rx="3.2" ry="2.2" fill="#FFFFFF" opacity="0.65" />
        </g>

        {/* 3D Perspective Mini Ludo Board Base */}
        <g>
          {/* Board Drop Shadow & Rim Thickness */}
          <polygon points="88,200 332,200 304,132 116,132" fill="#07153A" opacity="0.42" transform="translate(0, 8)" />
          <polygon points="88,199 332,199 332,205 88,205" fill="#0B1C3D" />
          <polygon points="90,198 330,198 302,132 118,132" fill="#FFFFFF" stroke="#0B1C3D" strokeWidth="3" strokeLinejoin="round" />

          {/* Top-Left Red Yard */}
          <polygon points="122,135 192,135 186,161 108,161" fill="#EF4444" stroke="#0B1C3D" strokeWidth="1.5" />
          <polygon points="130,139 182,139 178,156 120,156" fill="#FFFFFF" />
          <ellipse cx="143" cy="145" rx="5.5" ry="2.6" fill="#EF4444" />
          <ellipse cx="164" cy="145" rx="5.5" ry="2.6" fill="#EF4444" />
          <ellipse cx="139" cy="152" rx="5.5" ry="2.6" fill="#EF4444" />
          <ellipse cx="161" cy="152" rx="5.5" ry="2.6" fill="#EF4444" />

          {/* Top-Right Green Yard */}
          <polygon points="228,135 298,135 312,161 234,161" fill="#22C55E" stroke="#0B1C3D" strokeWidth="1.5" />
          <polygon points="238,139 290,139 300,156 242,156" fill="#FFFFFF" />
          <ellipse cx="256" cy="145" rx="5.5" ry="2.6" fill="#22C55E" />
          <ellipse cx="277" cy="145" rx="5.5" ry="2.6" fill="#22C55E" />
          <ellipse cx="260" cy="152" rx="5.5" ry="2.6" fill="#22C55E" />
          <ellipse cx="282" cy="152" rx="5.5" ry="2.6" fill="#22C55E" />

          {/* Bottom-Left Blue Yard */}
          <polygon points="103,170 184,170 179,195 94,195" fill="#0EA5E9" stroke="#0B1C3D" strokeWidth="1.5" />
          <polygon points="113,174 174,174 170,190 106,190" fill="#FFFFFF" />
          <ellipse cx="129" cy="179" rx="6.2" ry="2.9" fill="#0EA5E9" />
          <ellipse cx="155" cy="179" rx="6.2" ry="2.9" fill="#0EA5E9" />
          <ellipse cx="125" cy="186" rx="6.2" ry="2.9" fill="#0EA5E9" />
          <ellipse cx="152" cy="186" rx="6.2" ry="2.9" fill="#0EA5E9" />

          {/* Bottom-Right Yellow Yard */}
          <polygon points="236,170 317,170 326,195 241,195" fill="#FACC15" stroke="#0B1C3D" strokeWidth="1.5" />
          <polygon points="246,174 307,174 314,190 250,190" fill="#FFFFFF" />
          <ellipse cx="265" cy="179" rx="6.2" ry="2.9" fill="#EAB308" />
          <ellipse cx="291" cy="179" rx="6.2" ry="2.9" fill="#EAB308" />
          <ellipse cx="268" cy="186" rx="6.2" ry="2.9" fill="#EAB308" />
          <ellipse cx="295" cy="186" rx="6.2" ry="2.9" fill="#EAB308" />

          {/* Center Cross Track Stripes */}
          <polygon points="203,135 217,135 220,195 200,195" fill="#E0F2FE" stroke="#0B1C3D" strokeWidth="1" />
          <polygon points="205,172 215,172 217,195 203,195" fill="#38BDF8" />
          <polygon points="107,162 313,162 316,169 104,169" fill="#F8FAFC" stroke="#0B1C3D" strokeWidth="1" />
          <polygon points="186,162 234,162 236,170 184,170" fill="#FACC15" opacity="0.65" />
        </g>

        {/* Tilted 3D Glossy White Die sitting on center of board */}
        <g transform="translate(182, 114) rotate(-8)">
          <ellipse cx="32" cy="54" rx="25" ry="7" fill="#07153A" opacity="0.42" />
          {/* Top face */}
          <polygon points="6,16 32,4 58,16 32,29" fill="url(#crest-die-top)" stroke="#1E293B" strokeWidth="2.2" strokeLinejoin="round" />
          {/* Left face */}
          <polygon points="6,16 32,29 32,54 6,40" fill="#F1F5F9" stroke="#1E293B" strokeWidth="2.2" strokeLinejoin="round" />
          {/* Right face */}
          <polygon points="58,16 32,29 32,54 58,40" fill="url(#crest-die-side)" stroke="#1E293B" strokeWidth="2.2" strokeLinejoin="round" />
          {/* Top pips (5) */}
          <ellipse cx="32" cy="16" rx="3.4" ry="2" fill="#0F172A" />
          <ellipse cx="20" cy="16" rx="3" ry="1.8" fill="#0F172A" />
          <ellipse cx="44" cy="16" rx="3" ry="1.8" fill="#0F172A" />
          <ellipse cx="32" cy="10" rx="3" ry="1.7" fill="#0F172A" />
          <ellipse cx="32" cy="22" rx="3" ry="1.7" fill="#0F172A" />
          {/* Left face pips (3) */}
          <circle cx="13" cy="26" r="2.7" fill="#0F172A" />
          <circle cx="19" cy="34" r="2.7" fill="#0F172A" />
          <circle cx="25" cy="42" r="2.7" fill="#0F172A" />
          {/* Right face pips (2) */}
          <circle cx="40" cy="41" r="2.7" fill="#0F172A" />
          <circle cx="50" cy="28" r="2.7" fill="#0F172A" />
        </g>

        {/* Front Giant Glossy Pawns (Cyan Left, Golden Yellow Right) */}
        <g transform="translate(46, 128)">
          <ellipse cx="30" cy="82" rx="28" ry="8" fill="#07153A" opacity="0.52" />
          <path d="M8 74 C9 46 18 31 30 31 C42 31 51 46 52 74 C44 82 16 82 8 74 Z" fill="url(#crest-pawn-blue)" stroke="#07153A" strokeWidth="3" />
          <circle cx="30" cy="21" r="16.5" fill="url(#crest-pawn-blue)" stroke="#07153A" strokeWidth="3" />
          <ellipse cx="24" cy="15" rx="5.5" ry="3.5" fill="#FFFFFF" opacity="0.72" transform="rotate(-20 24 15)" />
          <path d="M16 66 C18 49 22 41 24 41" stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round" opacity="0.45" fill="none" />
        </g>

        <g transform="translate(314, 128)">
          <ellipse cx="30" cy="82" rx="28" ry="8" fill="#07153A" opacity="0.52" />
          <path d="M8 74 C9 46 18 31 30 31 C42 31 51 46 52 74 C44 82 16 82 8 74 Z" fill="url(#crest-pawn-yellow)" stroke="#07153A" strokeWidth="3" />
          <circle cx="30" cy="21" r="16.5" fill="url(#crest-pawn-yellow)" stroke="#07153A" strokeWidth="3" />
          <ellipse cx="24" cy="15" rx="5.5" ry="3.5" fill="#FFFFFF" opacity="0.78" transform="rotate(-20 24 15)" />
          <path d="M16 66 C18 49 22 41 24 41" stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round" opacity="0.48" fill="none" />
        </g>

        {/* "MANGO" Gold Crest with Glossy Mango Fruit (Top Right, matching KING placement) */}
        <g transform="translate(216, 12)">
          {/* Cute Mango Emblem */}
          <g transform="translate(106, 2)">
            <path
              d="M14 5 C20 5 24 10 23 17 C22 24 16 30 9 30 C4 30 2 25 4 19 C5 13 9 5 14 5 Z"
              fill="url(#crest-mango-grad)"
              stroke="#07153A"
              strokeWidth="2.2"
            />
            <path d="M14 6 C14 3 18 1 21 3 C18 5 16 6 14 6 Z" fill="#22C55E" stroke="#07153A" strokeWidth="1.4" />
            <ellipse cx="10.5" cy="14" rx="2.2" ry="4" fill="#FEF9C3" opacity="0.7" transform="rotate(15 10.5 14)" />
          </g>
          <text
            x="102"
            y="29"
            textAnchor="end"
            fontFamily="'Fredoka', sans-serif"
            fontWeight="700"
            fontSize="26"
            letterSpacing="2"
            fill="#FDE047"
            stroke="#07153A"
            strokeWidth="5"
            paintOrder="stroke"
          >
            MANGO
          </text>
        </g>

        {/* 4 Colorful Glossy Circular Letter Tiles: L U D O */}
        {[
          { letter: 'L', cx: 118, fill: '#0284C7', stroke: '#07153A' },
          { letter: 'U', cx: 179, fill: '#DC2626', stroke: '#07153A' },
          { letter: 'D', cx: 241, fill: '#16A34A', stroke: '#07153A' },
          { letter: 'O', cx: 302, fill: '#EAB308', stroke: '#07153A' },
        ].map((item) => (
          <g key={item.letter} transform={`translate(${item.cx}, 80)`}>
            <circle cx="0" cy="4" r="30" fill="#07153A" opacity="0.48" />
            <circle cx="0" cy="0" r="29" fill="#FFFFFF" stroke="#07153A" strokeWidth="3.2" />
            <circle cx="0" cy="0" r="24" fill="none" stroke="#CBD5E1" strokeWidth="1.5" />
            <text
              x="0"
              y="12"
              textAnchor="middle"
              fontFamily="'Fredoka', sans-serif"
              fontWeight="700"
              fontSize="38"
              fill={item.fill}
              stroke="#07153A"
              strokeWidth="2.2"
              paintOrder="stroke"
            >
              {item.letter}
            </text>
          </g>
        ))}

        {/* Golden Royal Crown Tilted Playfully over "L" */}
        <g transform="translate(58, 12) rotate(-18)">
          <path
            d="M12 46 L4 14 L25 28 L42 6 L59 28 L80 14 L72 46 Z"
            fill="url(#crest-crown-gold)"
            stroke="#07153A"
            strokeWidth="3"
            strokeLinejoin="round"
          />
          <rect x="12" y="44" width="60" height="10" rx="4" fill="#EAB308" stroke="#07153A" strokeWidth="2.8" />
          {/* Crown Jewels & Tips */}
          <circle cx="4" cy="12" r="4.5" fill="#FEF08A" stroke="#07153A" strokeWidth="2" />
          <circle cx="42" cy="5" r="5" fill="#FEF08A" stroke="#07153A" strokeWidth="2" />
          <circle cx="80" cy="12" r="4.5" fill="#FEF08A" stroke="#07153A" strokeWidth="2" />
          <circle cx="42" cy="33" r="4.5" fill="#EF4444" stroke="#07153A" strokeWidth="1.8" />
          <circle cx="24" cy="36" r="3.4" fill="#38BDF8" stroke="#07153A" strokeWidth="1.6" />
          <circle cx="60" cy="36" r="3.4" fill="#22C55E" stroke="#07153A" strokeWidth="1.6" />
        </g>
      </svg>
    </div>
  );
}

/* ==================== STEP 1 HOME TILE ARTWORK (MATCHES LUDO KING TILES) ==================== */

export function TileArtPlayOnline() {
  return (
    <svg viewBox="0 0 160 66" className="w-full h-full max-h-[54px] sm:max-h-[62px]" aria-hidden="true">
      {/* Left Phone */}
      <rect x="10" y="10" width="32" height="46" rx="6" fill="#FACC15" stroke="#07153A" strokeWidth="2.5" />
      <rect x="15" y="16" width="22" height="31" rx="2.5" fill="#CA8A04" />
      <circle cx="26" cy="51.5" r="2" fill="#07153A" />

      {/* Right Phone */}
      <rect x="118" y="10" width="32" height="46" rx="6" fill="#FACC15" stroke="#07153A" strokeWidth="2.5" />
      <rect x="123" y="16" width="22" height="31" rx="2.5" fill="#CA8A04" />
      <circle cx="134" cy="51.5" r="2" fill="#07153A" />

      {/* Dotted golden orbital arcs */}
      <path d="M46 18 Q80 2 114 18" fill="none" stroke="#FDE047" strokeWidth="3.5" strokeDasharray="3 6" strokeLinecap="round" />
      <path d="M46 48 Q80 64 114 48" fill="none" stroke="#FDE047" strokeWidth="3.5" strokeDasharray="3 6" strokeLinecap="round" />

      {/* Glowing Globe in Center */}
      <circle cx="80" cy="33" r="16" fill="#0284C7" stroke="#07153A" strokeWidth="2.4" />
      <path d="M71 23 C75 21 81 22 83 27 C85 31 79 34 75 36 C71 38 69 30 71 23 Z" fill="#22C55E" />
      <path d="M84 34 C88 33 93 36 91 42 C88 46 82 45 81 40 C80 37 82 35 84 34 Z" fill="#22C55E" />
      <ellipse cx="74" cy="25" rx="4" ry="2.2" fill="#FFFFFF" opacity="0.45" transform="rotate(-25 74 25)" />
    </svg>
  );
}

export function TileArtPlayWithFriends() {
  return (
    <svg viewBox="0 0 160 66" className="w-full h-full max-h-[54px] sm:max-h-[62px]" aria-hidden="true">
      {/* Left Phone */}
      <rect x="10" y="10" width="32" height="46" rx="6" fill="#FACC15" stroke="#07153A" strokeWidth="2.5" />
      <rect x="15" y="16" width="22" height="31" rx="2.5" fill="#CA8A04" />
      <circle cx="26" cy="51.5" r="2" fill="#07153A" />

      {/* Right Phone */}
      <rect x="118" y="10" width="32" height="46" rx="6" fill="#FACC15" stroke="#07153A" strokeWidth="2.5" />
      <rect x="123" y="16" width="22" height="31" rx="2.5" fill="#CA8A04" />
      <circle cx="134" cy="51.5" r="2" fill="#07153A" />

      {/* Dotted golden orbital arcs */}
      <path d="M46 18 Q80 2 114 18" fill="none" stroke="#FDE047" strokeWidth="3.5" strokeDasharray="3 6" strokeLinecap="round" />
      <path d="M46 48 Q80 64 114 48" fill="none" stroke="#FDE047" strokeWidth="3.5" strokeDasharray="3 6" strokeLinecap="round" />

      {/* Twin Hearts */}
      <path
        d="M72 45 C72 45 55 34 55 25 C55 20 59 17 63.5 17 C67 17 70 19 72 22 C74 19 77 17 80.5 17 C85 17 89 20 89 25 C89 34 72 45 72 45 Z"
        fill="#EF4444"
        stroke="#07153A"
        strokeWidth="2.2"
      />
      <path
        d="M91 45 C91 45 77 35 77 27 C77 22.5 80.5 19.5 84.5 19.5 C87.5 19.5 89.5 21 91 23.5 C92.5 21 94.5 19.5 97.5 19.5 C101.5 19.5 105 22.5 105 27 C105 35 91 45 91 45 Z"
        fill="#F87171"
        stroke="#07153A"
        strokeWidth="2.2"
      />
    </svg>
  );
}

export function TileArtComputer() {
  return (
    <svg viewBox="0 0 160 66" className="w-full h-full max-h-[54px] sm:max-h-[62px]" aria-hidden="true">
      {/* Golden VS Tablet / Monitor */}
      <rect x="57" y="7" width="46" height="52" rx="7" fill="#FACC15" stroke="#07153A" strokeWidth="2.8" />
      <rect x="63" y="13" width="34" height="36" rx="3.5" fill="#EAB308" stroke="#92400E" strokeWidth="1.4" />
      <circle cx="80" cy="54" r="2.2" fill="#07153A" />
      <text
        x="80"
        y="38"
        textAnchor="middle"
        fontFamily="'Fredoka', sans-serif"
        fontWeight="700"
        fontSize="22"
        fill="#FFFFFF"
        stroke="#07153A"
        strokeWidth="3.5"
        paintOrder="stroke"
      >
        VS
      </text>
    </svg>
  );
}

export function TileArtPassAndPlay() {
  return (
    <svg viewBox="0 0 160 66" className="w-full h-full max-h-[54px] sm:max-h-[62px]" aria-hidden="true">
      {/* Left Player Silhouette */}
      <circle cx="34" cy="18" r="9.5" fill="#FDE047" stroke="#07153A" strokeWidth="2.4" />
      <path
        d="M17 53 C17 37 24 29 35 29 C43 29 49 34 55 39 L63 36 L65 42 L53 47 C47 49 44 53 44 56 L19 56 Z"
        fill="#FACC15"
        stroke="#07153A"
        strokeWidth="2.4"
        strokeLinejoin="round"
      />

      {/* Right Player Silhouette */}
      <circle cx="126" cy="18" r="9.5" fill="#FDE047" stroke="#07153A" strokeWidth="2.4" />
      <path
        d="M143 53 C143 37 136 29 125 29 C117 29 111 34 105 39 L97 36 L95 42 L107 47 C113 49 116 53 116 56 L141 56 Z"
        fill="#FACC15"
        stroke="#07153A"
        strokeWidth="2.4"
        strokeLinejoin="round"
      />

      {/* Tabletop Diamond Board Between Players */}
      <polygon
        points="80,36 101,46 80,57 59,46"
        fill="#FDE047"
        stroke="#07153A"
        strokeWidth="2.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* ==================== STEP 2 GAME MODE TILE ARTWORK ==================== */

export function ModeArtClassic() {
  return (
    <svg viewBox="0 0 160 66" className="w-full h-full max-h-[54px] sm:max-h-[62px]" aria-hidden="true">
      {/* Safe Star */}
      <path
        d="M36 14 L39 22 L48 22 L41 27 L43 35 L36 30 L29 35 L31 27 L24 22 L33 22 Z"
        fill="#FDE047"
        stroke="#07153A"
        strokeWidth="2"
      />
      {/* Glossy White Die */}
      <g transform="translate(56, 9) rotate(-8)">
        <rect x="4" y="4" width="44" height="44" rx="10" fill="#FFFFFF" stroke="#07153A" strokeWidth="3" />
        <circle cx="16" cy="16" r="4" fill="#DC2626" />
        <circle cx="36" cy="16" r="4" fill="#DC2626" />
        <circle cx="16" cy="26" r="4" fill="#DC2626" />
        <circle cx="36" cy="26" r="4" fill="#DC2626" />
        <circle cx="16" cy="36" r="4" fill="#DC2626" />
        <circle cx="36" cy="36" r="4" fill="#DC2626" />
      </g>
      {/* Classic Pawn */}
      <g transform="translate(110, 14)">
        <path d="M6 42 C6 28 11 21 18 21 C25 21 30 28 30 42 Z" fill="#38BDF8" stroke="#07153A" strokeWidth="2.5" />
        <circle cx="18" cy="13" r="9.5" fill="#38BDF8" stroke="#07153A" strokeWidth="2.5" />
      </g>
    </svg>
  );
}

export function ModeArtFlipTrack() {
  return (
    <svg viewBox="0 0 160 66" className="w-full h-full max-h-[54px] sm:max-h-[62px]" aria-hidden="true">
      {/* Top Forward Curved Arrow */}
      <path
        d="M34 24 C48 8 106 8 122 22"
        fill="none"
        stroke="#38BDF8"
        strokeWidth="6.5"
        strokeLinecap="round"
      />
      <polygon points="128,26 112,26 123,12" fill="#38BDF8" stroke="#07153A" strokeWidth="2" strokeLinejoin="round" />

      {/* Bottom Backward Curved Arrow */}
      <path
        d="M126 42 C112 58 54 58 38 44"
        fill="none"
        stroke="#FACC15"
        strokeWidth="6.5"
        strokeLinecap="round"
      />
      <polygon points="32,40 48,40 37,54" fill="#FACC15" stroke="#07153A" strokeWidth="2" strokeLinejoin="round" />

      {/* Center Pawn */}
      <circle cx="80" cy="33" r="14" fill="#0F172A" opacity="0.45" />
      <circle cx="80" cy="33" r="12" fill="#22D3EE" stroke="#07153A" strokeWidth="2.5" />
      <circle cx="80" cy="33" r="5" fill="#FFFFFF" />
    </svg>
  );
}

export function ModeArtCrazy() {
  return (
    <svg viewBox="0 0 160 66" className="w-full h-full max-h-[54px] sm:max-h-[62px]" aria-hidden="true">
      {/* Explosive Burst Behind */}
      <polygon
        points="80,4 92,20 116,12 106,30 128,40 104,46 110,62 84,52 64,62 68,46 42,40 64,28 54,12 72,20"
        fill="#F97316"
        opacity="0.35"
      />
      {/* Fiery Lightning Bolt */}
      <polygon
        points="88,6 58,36 78,36 69,60 105,28 84,28"
        fill="#FDE047"
        stroke="#07153A"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      {/* Double-Six Badge */}
      <rect x="20" y="18" width="28" height="28" rx="6" fill="#EF4444" stroke="#07153A" strokeWidth="2.4" />
      <text x="34" y="38" textAnchor="middle" fontFamily="'Fredoka', sans-serif" fontWeight="700" fontSize="17" fill="#FFFFFF">6</text>
      <rect x="112" y="18" width="28" height="28" rx="6" fill="#EF4444" stroke="#07153A" strokeWidth="2.4" />
      <text x="126" y="38" textAnchor="middle" fontFamily="'Fredoka', sans-serif" fontWeight="700" fontSize="17" fill="#FFFFFF">6</text>
    </svg>
  );
}

export function ModeArtUno() {
  return (
    <svg viewBox="0 0 160 66" className="w-full h-full max-h-[54px] sm:max-h-[62px]" aria-hidden="true">
      {/* Fanned Colorful UNO Cards */}
      <g transform="translate(36, 12) rotate(-18)">
        <rect x="0" y="0" width="32" height="44" rx="6" fill="#EF4444" stroke="#FFFFFF" strokeWidth="2.4" />
        <text x="16" y="29" textAnchor="middle" fontFamily="'Fredoka', sans-serif" fontWeight="700" fontSize="17" fill="#FFFFFF">-2</text>
      </g>
      <g transform="translate(56, 8) rotate(-6)">
        <rect x="0" y="0" width="32" height="44" rx="6" fill="#2563EB" stroke="#FFFFFF" strokeWidth="2.4" />
        <text x="16" y="29" textAnchor="middle" fontFamily="'Fredoka', sans-serif" fontWeight="700" fontSize="18" fill="#FFFFFF">6</text>
      </g>
      <g transform="translate(76, 8) rotate(8)">
        <rect x="0" y="0" width="32" height="44" rx="6" fill="#16A34A" stroke="#FFFFFF" strokeWidth="2.4" />
        <text x="16" y="29" textAnchor="middle" fontFamily="'Fredoka', sans-serif" fontWeight="700" fontSize="18" fill="#FFFFFF">⟲</text>
      </g>
      <g transform="translate(94, 14) rotate(20)">
        <rect x="0" y="0" width="32" height="44" rx="6" fill="#111827" stroke="#FACC15" strokeWidth="2.4" />
        <text x="16" y="29" textAnchor="middle" fontFamily="'Fredoka', sans-serif" fontWeight="700" fontSize="16" fill="#FACC15">-4</text>
      </g>
    </svg>
  );
}
