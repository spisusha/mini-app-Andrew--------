export interface WatchDisplay {
  shortTitle: string;
  longTitle: string;
  subtitle: string;
  subtitleParts: string[];
}

const MODEL_PATTERNS: [RegExp, string][] = [
  [/^Apple\s+Watch\s+Ultra\s*3\b/i, 'Apple Watch Ultra 3'],
  [/^Apple\s+Watch\s+Ultra\s*2\b/i, 'Apple Watch Ultra 2'],
  [/^Apple\s+Watch\s+SE\s*3\b/i, 'Apple Watch SE 3'],
  [/^Apple\s+Watch\s+SE\s*2\b/i, 'Apple Watch SE 2'],
  [/^Apple\s+Watch\s+S11\b/i, 'Apple Watch Series 11'],
  [/^Apple\s+Watch\s+S10\b/i, 'Apple Watch Series 10'],
  [/^Apple\s+Watch\s+Series\s*11\b/i, 'Apple Watch Series 11'],
  [/^Apple\s+Watch\s+Series\s*10\b/i, 'Apple Watch Series 10'],
];

const BAND_TYPE_RE =
  /(Sport\s+Band|Sport\s+Loop|Ocean\s+Band|Alpine\s+Loop|Milanese\s+Loop)/i;

function applyAliases(s: string): string {
  return s
    .replace(/\bBlack\s+TiT\b/gi, 'Black Titanium')
    .replace(/\bTiT\b/g, 'Titanium')
    .replace(/\bTi\b(?!\w)/g, 'Titanium')
    .replace(/\btitan\b/gi, 'Titanium')
    .replace(/\bJet\s*B\b/gi, 'Jet Black')
    .replace(/\bJetBlack\b/gi, 'Jet Black')
    .replace(/\bSp\.?\s*Gra?y\.?\b/gi, 'Space Grey')
    .replace(/\bRoseGold\b/gi, 'Rose Gold')
    .replace(/\bLightBlush\b/gi, 'Light Blush')
    .replace(/\bPur\s+Fog\b/gi, 'Purple Fog')
    .replace(/\(([^)]*?)\s*(Ocean\s+Band)\)/gi, '$1 $2')
    .replace(/\bSB\b/, 'Sport Band')
    .replace(/\bSL\b/, 'Sport Loop')
    .replace(/\bmilano\w*/gi, 'Milanese Loop')
    .replace(/\bAlp\s+Lp\b/gi, 'Alpine Loop')
    .replace(/\bAlp\b(?!\s*(?:ine|Loop))/gi, 'Alpine Loop');
}

const EMPTY: WatchDisplay = { shortTitle: '', longTitle: '', subtitle: '', subtitleParts: [] };

export function formatWatchDisplay(raw: string | undefined): WatchDisplay {
  if (!raw) return EMPTY;

  let s = raw.trim().replace(/apple\s*watch/i, 'Apple Watch');

  let shortTitle = 'Apple Watch';
  let rest = '';

  for (const [re, title] of MODEL_PATTERNS) {
    const m = s.match(re);
    if (m) {
      shortTitle = title;
      rest = s.slice(m[0].length).trim();
      break;
    }
  }
  if (!rest) return { shortTitle: s, longTitle: s, subtitle: '', subtitleParts: [] };

  rest = applyAliases(rest);

  // Extract product code from end (4-6 mixed alphanum like MF0J4)
  let code = '';
  const codeMatch = rest.match(/\s+([A-Za-z0-9]{4,6})\s*$/);
  if (codeMatch && /[A-Za-z]/.test(codeMatch[1]) && /\d/.test(codeMatch[1])) {
    code = codeMatch[1];
    rest = rest.slice(0, codeMatch.index).trim();
  }

  // Extract band size from end
  let bandSize = '';
  const bsMatch = rest.match(/\s+(S\/M|M\/L)\s*$/);
  if (bsMatch) {
    bandSize = bsMatch[1];
    rest = rest.slice(0, bsMatch.index).trim();
  } else {
    const single = rest.match(/\s+([SML])\s*$/);
    if (single) {
      bandSize = single[1];
      rest = rest.slice(0, single.index).trim();
    }
  }

  // Extract case size
  let caseSize = '';
  const csMatch = rest.match(/\b(40|42|44|46|49)\s*(?:mm|мм)?\b/i);
  if (csMatch) {
    caseSize = `${csMatch[1]} мм`;
    rest = rest.replace(csMatch[0], '').trim();
  }

  // Remove default material keyword
  rest = rest.replace(/\bAlumini?um\b/gi, '').replace(/\s+/g, ' ').trim();

  // Split around band type
  const btMatch = rest.match(BAND_TYPE_RE);
  let caseDesc = '';
  let bandDesc = '';

  if (btMatch && btMatch.index !== undefined) {
    caseDesc = rest.slice(0, btMatch.index).trim();
    const bandColor = rest.slice(btMatch.index + btMatch[0].length).trim();
    bandDesc = bandColor ? `${btMatch[1]} ${bandColor}` : btMatch[1];
  } else {
    caseDesc = rest;
  }

  const parts: string[] = [];
  if (caseSize) parts.push(caseSize);
  if (caseDesc) parts.push(caseDesc);
  if (bandDesc) parts.push(bandDesc);
  if (bandSize) parts.push(bandSize);
  if (code) parts.push(code);

  const subtitle = parts.join(' • ');
  const longTitle = parts.length > 0 ? `${shortTitle} • ${subtitle}` : shortTitle;

  return { shortTitle, longTitle, subtitle, subtitleParts: parts };
}
