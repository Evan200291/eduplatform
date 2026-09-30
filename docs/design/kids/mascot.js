/*
 * Pip — the Midas buddy. One SVG, five moods, no bitmap assets, so it scales
 * to any size, recolours from tokens and weighs ~1KB.
 * The production version is frontend/src/components/kids/Buddy.tsx (same paths).
 */
function mascot(mood = 'happy', size = 120, opts = {}) {
  const body = opts.body || '#58cc02';
  const edge = opts.edge || '#46a302';
  const belly = opts.belly || '#e5f8d0';
  const bob = opts.bob === false ? '' : ' bob';

  const eyes = {
    happy: `<g class="blink"><ellipse cx="78" cy="88" rx="15" ry="18" fill="#fff"/><ellipse cx="122" cy="88" rx="15" ry="18" fill="#fff"/></g>
            <circle cx="80" cy="91" r="8" fill="#2b3a55"/><circle cx="120" cy="91" r="8" fill="#2b3a55"/>
            <circle cx="83" cy="87" r="3" fill="#fff"/><circle cx="123" cy="87" r="3" fill="#fff"/>`,
    cheer: `<path d="M63 92 Q78 72 93 92" fill="none" stroke="#2b3a55" stroke-width="7" stroke-linecap="round"/>
            <path d="M107 92 Q122 72 137 92" fill="none" stroke="#2b3a55" stroke-width="7" stroke-linecap="round"/>`,
    think: `<ellipse cx="78" cy="88" rx="15" ry="18" fill="#fff"/><ellipse cx="122" cy="88" rx="15" ry="18" fill="#fff"/>
            <circle cx="86" cy="84" r="8" fill="#2b3a55"/><circle cx="130" cy="84" r="8" fill="#2b3a55"/>
            <circle cx="89" cy="80" r="3" fill="#fff"/><circle cx="133" cy="80" r="3" fill="#fff"/>
            <path d="M64 66 Q78 58 92 68" fill="none" stroke="#2b3a55" stroke-width="5" stroke-linecap="round"/>`,
    sleepy: `<path d="M63 92 Q78 102 93 92" fill="none" stroke="#2b3a55" stroke-width="7" stroke-linecap="round"/>
             <path d="M107 92 Q122 102 137 92" fill="none" stroke="#2b3a55" stroke-width="7" stroke-linecap="round"/>`,
    oops: `<ellipse cx="78" cy="90" rx="15" ry="18" fill="#fff"/><ellipse cx="122" cy="90" rx="15" ry="18" fill="#fff"/>
           <circle cx="78" cy="96" r="8" fill="#2b3a55"/><circle cx="122" cy="96" r="8" fill="#2b3a55"/>
           <circle cx="81" cy="92" r="3" fill="#fff"/><circle cx="125" cy="92" r="3" fill="#fff"/>
           <path d="M62 72 L92 66 M108 66 L138 72" stroke="#2b3a55" stroke-width="5" stroke-linecap="round"/>`,
  }[mood] || '';

  const mouth = {
    happy: `<path d="M88 122 Q100 136 112 122 Z" fill="#c2410c"/><path d="M92 126 Q100 132 108 126" fill="#ff8fa3"/>`,
    cheer: `<path d="M84 118 Q100 146 116 118 Z" fill="#c2410c"/><path d="M90 128 Q100 138 110 128" fill="#ff8fa3"/>`,
    think: `<path d="M92 128 Q100 124 108 128" fill="none" stroke="#c2410c" stroke-width="5" stroke-linecap="round"/>`,
    sleepy: `<ellipse cx="100" cy="128" rx="6" ry="5" fill="#c2410c"/>`,
    oops: `<path d="M90 132 Q100 122 110 132" fill="none" stroke="#c2410c" stroke-width="5" stroke-linecap="round"/>`,
  }[mood] || '';

  const extras = {
    cheer: `<g fill="#ffc800"><path d="M28 40 l4 10 10 4 -10 4 -4 10 -4 -10 -10 -4 10 -4z"/><path d="M168 30 l3 8 8 3 -8 3 -3 8 -3 -8 -8 -3 8 -3z"/></g>`,
    think: `<g fill="#fff" stroke="#c3cee3" stroke-width="3"><circle cx="168" cy="52" r="6"/><circle cx="178" cy="34" r="9"/><ellipse cx="176" cy="10" rx="20" ry="14"/></g><text x="168" y="16" font-size="18" font-weight="900" fill="#1cb0f6" font-family="Nunito,sans-serif">?</text>`,
    sleepy: `<g fill="#1cb0f6" font-family="Nunito,sans-serif" font-weight="900"><text x="150" y="48" font-size="22">z</text><text x="166" y="30" font-size="28">Z</text></g>`,
    happy: '', oops: '',
  }[mood] || '';

  const arms = mood === 'cheer'
    ? `<path d="M40 128 Q22 96 34 76" stroke="${body}" stroke-width="16" stroke-linecap="round" fill="none"/>
       <path d="M160 128 Q178 96 166 76" stroke="${body}" stroke-width="16" stroke-linecap="round" fill="none"/>`
    : `<ellipse cx="38" cy="140" rx="12" ry="20" fill="${edge}" transform="rotate(18 38 140)"/>
       <ellipse cx="162" cy="140" rx="12" ry="20" fill="${edge}" transform="rotate(-18 162 140)"/>`;

  return `<svg class="mascot${bob}" width="${size}" height="${size}" viewBox="0 0 200 200" role="img" aria-label="Pip the buddy, feeling ${mood}">
    <ellipse cx="100" cy="188" rx="52" ry="8" fill="rgba(43,58,85,.12)"/>
    ${arms}
    <path d="M100 26 C150 26 176 66 176 118 C176 166 144 186 100 186 C56 186 24 166 24 118 C24 66 50 26 100 26Z" fill="${body}"/>
    <path d="M100 26 C150 26 176 66 176 118 C176 166 144 186 100 186 C56 186 24 166 24 118" fill="none" stroke="${edge}" stroke-width="0"/>
    <path d="M62 30 L54 6 L82 24Z M138 30 L146 6 L118 24Z" fill="${body}"/>
    <ellipse cx="100" cy="146" rx="46" ry="36" fill="${belly}"/>
    <ellipse cx="58" cy="118" rx="11" ry="7" fill="#ff8fa3" opacity=".55"/><ellipse cx="142" cy="118" rx="11" ry="7" fill="#ff8fa3" opacity=".55"/>
    ${eyes}
    <path d="M91 104 L109 104 L100 116Z" fill="#ff9600"/>
    ${mouth}
    <ellipse cx="78" cy="184" rx="16" ry="7" fill="#ff9600"/><ellipse cx="122" cy="184" rx="16" ry="7" fill="#ff9600"/>
    ${extras}
  </svg>`;
}

/* Tiny helpers shared by every page: read-aloud button + confetti. */
function speak(text) {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 0.85; u.pitch = 1.15;
  window.speechSynthesis.speak(u);
}
function speaker(text) {
  return `<button class="speak" aria-label="Read this out loud" onclick="speak(${JSON.stringify(text).replace(/"/g, '&quot;')})">🔊</button>`;
}
function confetti(n = 26) {
  const cols = ['#58cc02', '#1cb0f6', '#ffc800', '#ff6fb5', '#a78bfa', '#ff9600'];
  let s = '<div class="confetti" aria-hidden="true">';
  for (let i = 0; i < n; i++) {
    s += `<i style="left:${(i * 37) % 100}%;background:${cols[i % 6]};animation-delay:${(i % 9) * 0.25}s;animation-duration:${2.2 + (i % 5) * 0.4}s"></i>`;
  }
  return s + '</div>';
}
