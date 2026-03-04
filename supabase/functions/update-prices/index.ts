import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

interface PriceItem { xmlid: string; price: number; description: string; categoryGuess: string }
interface RequestBody { items: PriceItem[]; mode: 'prices_only' | 'sync_stock'; requestId?: string }
interface NotFoundEntry { xmlid: string; description: string; price: number; reason: string; parsed?: Record<string, string>; candidates?: number }
interface VerifyEntry { xmlid: string; found: boolean; in_stock: boolean | null; price: number | null; familyTitle: string | null }

const MAX_CREATE_IPHONE = 50;

// ══════════════════════════════════════════════════════════════════════
// ── COLOR ───────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════
const COLOR_CANONICAL: Record<string, string> = {
  'deep blue': 'blue', 'cosmic orange': 'orange',
  'black titanium': 'black', 'white titanium': 'white',
  'natural titanium': 'natural', 'desert titanium': 'desert',
  'space gray': 'gray', 'space grey': 'gray', 'sky blue': 'skyblue',
};
function normalizeColorForMatch(label: string): string {
  const l = label.toLowerCase().trim();
  if (COLOR_CANONICAL[l]) return COLOR_CANONICAL[l];
  const stripped = l.replace(/\s*titanium$/i, '').replace(/\s*alumini?um$/i, '').trim();
  return COLOR_CANONICAL[stripped] || stripped;
}

const COLOR_RESOLVE_PRO: Record<string, string> = {
  orange: 'Cosmic Orange', blue: 'Deep Blue', silver: 'Silver',
  black: 'Black Titanium', white: 'White Titanium',
  natural: 'Natural Titanium', desert: 'Desert Titanium', green: 'Green',
};
const COLOR_RESOLVE_DEFAULT: Record<string, string> = {
  black: 'Black', white: 'White', blue: 'Blue', green: 'Green',
  pink: 'Pink', yellow: 'Yellow', orange: 'Orange', red: 'Red',
  purple: 'Purple', starlight: 'Starlight', midnight: 'Midnight',
  ultramarine: 'Ultramarine', teal: 'Teal', gold: 'Gold',
};
function resolveColorLabel(colorRaw: string, modelLine: string): string {
  const key = colorRaw.toLowerCase().trim();
  if (/pro/i.test(modelLine)) return COLOR_RESOLVE_PRO[key] || COLOR_RESOLVE_DEFAULT[key] || colorRaw;
  return COLOR_RESOLVE_DEFAULT[key] || colorRaw;
}

const COLOR_HEX: Record<string, string> = {
  'Deep Blue': '#1B3A5C', 'Cosmic Orange': '#E8642C', 'Silver': '#C0C0C0',
  'Black Titanium': '#3C3C3C', 'White Titanium': '#F5F5F0',
  'Natural Titanium': '#9A8B7A', 'Desert Titanium': '#BFB09A',
  'Green': '#394F3E', 'Black': '#111111', 'White': '#F5F5F5',
  'Blue': '#3478F6', 'Pink': '#F2A9B7', 'Yellow': '#F9E87C',
  'Orange': '#F5A623', 'Red': '#BF0013', 'Purple': '#8B72BE',
  'Starlight': '#F0E8D8', 'Midnight': '#1E1E2E',
  'Ultramarine': '#3F51B5', 'Teal': '#008080', 'Gold': '#D4AF37',
};
function colorToSnake(label: string): string {
  return label.toLowerCase().replace(/\s+/g, '_');
}

// ══════════════════════════════════════════════════════════════════════
// ── IPHONE PARSER ───────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════
interface ParsedIphone {
  familyTitle: string; familyAliases: string[];
  storage: string; colorLabel: string; colorSnake: string; colorHex: string;
  optionKey: 'simType' | 'market'; optionValue: string;
}

function normalizeStorage(raw: string): string {
  const s = raw.trim().toLowerCase();
  const tb = s.match(/^(\d+)\s*tb$/);
  if (tb) return String(parseInt(tb[1]) * 1024);
  return s.replace(/\s*gb$/i, '');
}
function normalizeSim(raw: string): string {
  const s = raw.replace(/\s+/g, '').toLowerCase();
  if (/2\s*sim|dual/i.test(s)) return 'Dual SIM';
  if (/esim\+sim|esim\+nano|sim\+esim|nano\+esim/.test(s)) return 'eSIM+SIM';
  if (/esim/.test(s)) return 'eSIM';
  return raw.trim();
}

const OLD_IPHONE_RE = /^iPhone\s+(1[2345]|SE)\b/i;

const IPHONE_RE = /^iPhone\s+(17\s*Air|Air|17e|17\s+Pro\s+Max|17\s+Pro|17|16\s+Pro\s+Max|16\s+Plus|16\s+Pro|16e|16)\s+(\d+(?:\s*[TtGg][Bb])?)\s*(?:\(([^)]+)\))?\s*(.+)$/i;

function parseIphoneDescription(desc: string): ParsedIphone | null {
  const m = desc.trim().match(IPHONE_RE);
  if (!m) return null;
  const modelPart = m[1].trim();
  let colorRaw = m[4].trim();
  // Strip trailing region/market markers
  colorRaw = colorRaw
    .replace(/\s+LL\/A$/i, '')
    .replace(/\s+(EU|JP|US|CN|HK|KR|IN|TH|VN|MY|SG|ZA|ZP|KH|LL)$/i, '')
    .replace(/\s*\([^)]*\)\s*$/, '')
    .trim();
  let extraMarket = '';
  if (/\(2-?sim\)/i.test(colorRaw)) { extraMarket = 'Dual SIM'; colorRaw = colorRaw.replace(/\(2-?sim\)/i, '').trim(); }
  const mp = modelPart.toLowerCase().replace(/[\s-]+/g, ' ').trim();

  let familyTitle: string; let familyAliases: string[] = [];
  const isGen17 = /^17|^air$/i.test(mp);

  if (mp === '17 pro max') familyTitle = 'Apple iPhone 17 Pro Max';
  else if (mp === '17 pro') familyTitle = 'Apple iPhone 17 Pro';
  else if (mp === '17') familyTitle = 'Apple iPhone 17';
  else if (mp === '17 air' || mp === '17air' || mp === 'air') { familyTitle = 'Apple iPhone Air'; familyAliases = ['Apple iPhone 17 Air']; }
  else if (mp === '17e') familyTitle = 'Apple iPhone 17e';
  else if (mp === '16 pro max') familyTitle = 'Apple iPhone 16 Pro Max';
  else if (mp === '16 plus') familyTitle = 'Apple iPhone 16 Plus';
  else if (mp === '16 pro') familyTitle = 'Apple iPhone 16 Pro';
  else if (mp === '16e') familyTitle = 'Apple iPhone 16e';
  else if (mp === '16') familyTitle = 'Apple iPhone 16';
  else return null;

  let optionKey: 'simType' | 'market'; let optionValue: string;
  if (isGen17) { optionKey = 'simType'; optionValue = m[3] ? normalizeSim(m[3]) : 'eSIM+SIM'; }
  else { optionKey = 'market'; optionValue = extraMarket || (m[3] && normalizeSim(m[3]) === 'Dual SIM' ? 'Dual SIM' : 'EU'); }

  const colorLabel = resolveColorLabel(colorRaw, modelPart);

  return {
    familyTitle, familyAliases,
    storage: normalizeStorage(m[2]),
    colorLabel,
    colorSnake: colorToSnake(colorLabel),
    colorHex: COLOR_HEX[colorLabel] || '#888888',
    optionKey, optionValue,
  };
}

// ══════════════════════════════════════════════════════════════════════
// ── WATCH / AIRPODS PARSERS ─────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════
interface ParsedWatch { line: string; familyTitle: string }
const WLT: Record<string,string> = { S10:'Apple Watch Series 10', S11:'Apple Watch Series 11', SE2:'Apple Watch SE (2nd gen)', SE3:'Apple Watch SE (3rd gen)', Ultra2:'Apple Watch Ultra 2', Ultra3:'Apple Watch Ultra 3' };
const WLP: [RegExp,string][] = [[/\bUltra\s*3\b/i,'Ultra3'],[/\bUltra\s*2\b/i,'Ultra2'],[/\bSE\s*3\b/i,'SE3'],[/\bSE\s*2\b/i,'SE2'],[/\bS11\b/i,'S11'],[/\bS10\b/i,'S10']];
const WACC = /charger|заряд|usb|cable|кабел|adapter|адаптер/i;
function parseWatch(desc: string): ParsedWatch | null { for (const [re,line] of WLP) { if (re.test(desc)) { const ft = WLT[line]; if (ft) return { line, familyTitle: ft }; } } return null; }

interface ParsedAirPods { familyTitle: string; isMax: boolean; colorLabel?: string }
const APACC = /charger|заряд|usb|cable|кабел|adapter|адаптер|чехол|case/i;
const APMC: Record<string,string> = { midnight:'Midnight',starlight:'Starlight',orange:'Orange',purple:'Purple',blue:'Blue','space gray':'Space Gray','space grey':'Space Gray',silver:'Silver',green:'Green',pink:'Pink','sky blue':'Sky Blue',red:'Red' };
const APMC_HEX: Record<string,string> = { Midnight:'#1E1E2E',Starlight:'#F0E8D8',Orange:'#F5A623',Purple:'#8B72BE',Blue:'#3478F6','Space Gray':'#8D8D92',Silver:'#C0C0C0',Green:'#394F3E',Pink:'#F2A9B7','Sky Blue':'#87CEEB',Red:'#BF0013' };
function parseAirPods(desc: string): ParsedAirPods | null {
  const d = desc.toLowerCase();
  if (/airpods\s*max/i.test(desc)) { let cl: string|undefined; for (const [k,v] of Object.entries(APMC)) if (d.includes(k)){cl=v;break;} return { familyTitle:'Apple AirPods Max', isMax:true, colorLabel:cl }; }
  if (/airpods\s*pro\s*3/i.test(desc)) return { familyTitle:'Apple AirPods Pro 3', isMax:false };
  if (/airpods\s*pro\s*(?:2|\(2)/i.test(desc)) return { familyTitle:'Apple AirPods Pro 2', isMax:false };
  if (/airpods\s*4/i.test(desc)) { if (/anc|noise\s*cancell|шумоподав/i.test(desc)) return { familyTitle:'Apple AirPods 4 (ANC)', isMax:false }; return { familyTitle:'Apple AirPods 4', isMax:false }; }
  return null;
}

// ══════════════════════════════════════════════════════════════════════
// ── IPAD PARSER ─────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════
const IPAD_ACC = /pencil|keyboard|клавиатура|чехол|case|folio|smart\s*cover|magic|adapter|адаптер|charger|заряд|usb|cable|кабел/i;
interface ParsedIPad { familyTitle: string; storage?: string; connectivity?: string; size?: string; chip?: string; colorLabel?: string; colorHex?: string; colorKey?: string }

const IPAD_FAMILY_PATTERNS: [RegExp, string][] = [
  [/iPad\s+Pro\s+13/i, 'Apple iPad Pro 13'],
  [/iPad\s+Pro\s+11/i, 'Apple iPad Pro 11'],
  [/iPad\s+Air\s+7/i, 'Apple iPad Air 7'],
  [/iPad\s+Air\s+6/i, 'Apple iPad Air 6'],
  [/iPad\s+Air\s+13/i, 'Apple iPad Air 13'],
  [/iPad\s+Air\s+11/i, 'Apple iPad Air 11'],
  [/iPad\s+mini\s*7/i, 'Apple iPad mini 7'],
  [/iPad\s+mini\s*6/i, 'Apple iPad mini 6'],
  [/iPad\s+\(?A16\)?/i, 'Apple iPad (A16)'],
  [/iPad\s+10/i, 'Apple iPad 10'],
  [/iPad\s+Air\b/i, 'Apple iPad Air'],
  [/iPad\s+Pro\b/i, 'Apple iPad Pro'],
  [/iPad\s+mini\b/i, 'Apple iPad mini'],
  [/iPad\b/i, 'Apple iPad'],
];

const IPAD_COLORS: Record<string, [string, string]> = {
  'space black': ['space_black', '#1D1D1F'],
  'space gray': ['space_gray', '#8D8D92'],
  'space grey': ['space_gray', '#8D8D92'],
  silver: ['silver', '#C0C0C0'],
  starlight: ['starlight', '#F0E8D8'],
  blue: ['blue', '#3478F6'],
  purple: ['purple', '#8B72BE'],
  pink: ['pink', '#F2A9B7'],
  yellow: ['yellow', '#F9E87C'],
  white: ['white', '#F5F5F5'],
  black: ['black', '#111111'],
  gold: ['gold', '#D4AF37'],
  'rose gold': ['rose_gold', '#B76E79'],
  midnight: ['midnight', '#1E1E2E'],
};

function parseIPad(desc: string): ParsedIPad | null {
  let familyTitle = '';
  for (const [re, title] of IPAD_FAMILY_PATTERNS) {
    if (re.test(desc)) { familyTitle = title; break; }
  }
  if (!familyTitle) return null;

  const storageMatch = desc.match(/\b(\d+)\s*(?:GB|ГБ|TB|ТБ)\b/i);
  let storage: string | undefined;
  if (storageMatch) {
    const num = parseInt(storageMatch[1]);
    const isTb = /tb|тб/i.test(storageMatch[0]);
    storage = String(isTb ? num * 1024 : num);
  }

  let connectivity: string | undefined;
  if (/\bLTE\b|cellular|сотовая/i.test(desc)) connectivity = 'LTE';
  else if (/\bwifi\b|wi-fi/i.test(desc)) connectivity = 'WiFi';

  let size: string | undefined;
  const sizeMatch = desc.match(/\b(11|13|10[.,]?\d?|12[.,]9|8[.,]3)\s*["''″]?\s*(?:inch|дюйм)?/i);
  if (sizeMatch) size = sizeMatch[1].replace(',', '.');

  let chip: string | undefined;
  const chipMatch = desc.match(/\b(M[1-4]|A1[4-9]|A\d{2})\b/i);
  if (chipMatch) chip = chipMatch[1].toUpperCase();

  const cleaned = desc
    .replace(/\s+LL\/A$/i, '')
    .replace(/\s+(EU|JP|US|CN|HK|KR|IN|TH|VN|MY|SG|ZA|ZP|KH|LL)$/i, '')
    .replace(/\s*\([^)]*\)\s*/g, ' ')
    .replace(/\b\d+\s*(?:GB|ГБ|TB|ТБ)\b/i, '')
    .replace(/\biPad\b.*?(Pro|Air|mini|A16|\d+)\s*/i, '')
    .trim();

  let colorLabel: string | undefined;
  let colorHex: string | undefined;
  let colorKey: string | undefined;
  const cl = cleaned.toLowerCase();
  for (const [pattern, [key, hex]] of Object.entries(IPAD_COLORS)) {
    if (cl.includes(pattern)) {
      colorLabel = pattern.split(' ').map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
      colorHex = hex;
      colorKey = key;
      break;
    }
  }

  return { familyTitle, storage, connectivity, size, chip, colorLabel, colorHex, colorKey };
}

// ══════════════════════════════════════════════════════════════════════
// ── MACBOOK PARSER ──────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════
const MAC_ACC = /charger|заряд|usb|cable|кабел|adapter|адаптер|чехол|case|sleeve|кейс/i;
const MAC_EXCLUDE = /iphone|ipad|watch|airpods/i;
interface ParsedMacBook {
  familyTitle: string; line: string; size: string;
  chip?: string; memStorage?: string;
  colorLabel?: string; colorKey?: string; colorHex?: string;
}

const MAC_COLORS: Record<string, [string, string]> = {
  'space black': ['space_black', '#1D1D1F'],
  'space gray': ['space_gray', '#8D8D92'],
  'space grey': ['space_gray', '#8D8D92'],
  silver: ['silver', '#C0C0C0'],
  black: ['black', '#1D1D1F'],
  starlight: ['starlight', '#F0E8D8'],
  midnight: ['midnight', '#1E1E2E'],
  'sky blue': ['sky_blue', '#87CEEB'],
  gold: ['gold', '#D4AF37'],
};

function parseMacBook(desc: string): ParsedMacBook | null {
  if (MAC_EXCLUDE.test(desc)) return null;

  const d = desc.replace(/[""]/g, '"');
  let line: string | null = null;
  let size: string | null = null;

  if (/\bAir\b/i.test(d)) line = 'Air';
  else if (/\bPro\b/i.test(d)) line = 'Pro';
  if (!line) return null;

  const sizeMatch = d.match(/\b(13|14|15|16)\s*[""]?\s*(?:inch|дюйм)?/i);
  if (sizeMatch) size = sizeMatch[1];
  if (!size) return null;

  if (line === 'Air' && !['13', '15'].includes(size)) return null;
  if (line === 'Pro' && !['14', '16'].includes(size)) return null;

  const familyTitle = `Apple MacBook ${line} ${size}`;

  const chipMatch = d.match(/\b(M[1-5])\s*(Pro|Max)?\b/i);
  let chip: string | undefined;
  if (chipMatch) {
    chip = chipMatch[1].toUpperCase();
    if (chipMatch[2]) chip += ' ' + chipMatch[2][0].toUpperCase() + chipMatch[2].slice(1).toLowerCase();
  }

  let memStorage: string | undefined;
  const msMatch = d.match(/\b(\d{1,3})\s*[\/\\]\s*(\d+)\s*(?:Tb|TB|Gb|GB)?/i);
  if (msMatch) {
    const ram = msMatch[1];
    let disk = parseInt(msMatch[2]);
    if (/tb/i.test(d.slice(msMatch.index!, msMatch.index! + msMatch[0].length + 3))) disk = disk * 1024;
    if (disk <= 8) disk = disk * 1024;
    memStorage = `${ram}/${disk}`;
  }
  if (!memStorage) {
    const altMatch = d.match(/(\d{1,3})\s*GB?\s*[\/\\]\s*(\d+)\s*(Tb|TB|Gb|GB)?/i);
    if (altMatch) {
      const ram = altMatch[1];
      let disk = parseInt(altMatch[2]);
      if (altMatch[3] && /tb/i.test(altMatch[3])) disk = disk * 1024;
      if (disk <= 8) disk = disk * 1024;
      memStorage = `${ram}/${disk}`;
    }
  }

  const cleaned = d
    .replace(/\s+LL\/A$/i, '')
    .replace(/\s+(EU|JP|US|CN|HK|KR|IN|TH|VN|MY|SG|ZA|ZP|KH|LL)$/i, '')
    .toLowerCase();

  let colorLabel: string | undefined;
  let colorKey: string | undefined;
  let colorHex: string | undefined;
  for (const [pattern, [key, hex]] of Object.entries(MAC_COLORS)) {
    if (cleaned.includes(pattern)) {
      colorLabel = pattern.split(' ').map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
      colorKey = key;
      colorHex = hex;
      break;
    }
  }

  return { familyTitle, line, size, chip, memStorage, colorLabel, colorKey, colorHex };
}

// ══════════════════════════════════════════════════════════════════════
// ── HELPERS ─────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════
function normalizeXmlid(raw: string): string { return raw.replace(/^0+/, '') || '0'; }
function ms(start: number) { return Date.now() - start; }

// ══════════════════════════════════════════════════════════════════════
// ── HANDLER ─────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const T0 = Date.now();

  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const body = (await req.json()) as RequestBody;
    const { items, mode } = body;
    const requestId = body.requestId || crypto.randomUUID();
    const L = (phase: string, msg: string) => console.log(`[${requestId.slice(0,8)}] ${phase}: ${msg}`);

    if (!items || !Array.isArray(items) || items.length === 0) {
      return new Response(JSON.stringify({ ok: false, error: 'No items provided', requestId }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const now = new Date().toISOString();
    const isSyncStock = mode === 'sync_stock';
    const errors: string[] = [];
    L('init', `mode=${mode} items=${items.length} isSyncStock=${isSyncStock}`);

    let updatedPricesCount = 0, setInStockTrueCount = 0, createdCount = 0;
    const iphoneReport = {
      matchedByXmlidCount: 0, boundXmlidCount: 0, ambiguousCount: 0,
      notFoundCount: 0, createdCount: 0, dedupedHits: 0,
      skippedOldCount: 0, unknownColorCount: 0,
      examples: [] as NotFoundEntry[],
      createdExamples: [] as { xmlid: string; description: string; familyTitle: string; storage: string; color: string; sim: string }[],
    };
    const watchReport = { updatedCount: 0, createdCount: 0 };
    const airpodsReport = { updatedCount: 0, createdCount: 0 };
    const airpodsMaxReport = { matchedCount: 0, boundXmlidCount: 0, createdCount: 0, notFoundCount: 0, examples: [] as NotFoundEntry[] };
    const ipadReport = { updatedCount: 0, createdCount: 0, dedupHits: 0, notFoundCount: 0, examples: [] as NotFoundEntry[] };
    const macbookReport = { updatedCount: 0, createdCount: 0, dedupHits: 0, notFoundCount: 0, examples: [] as NotFoundEntry[], createdExamples: [] as { xmlid: string; description: string; family: string; chip: string; memStorage: string }[] };
    const debugMacbook: { xmlid: string; desc: string; parsed: ParsedMacBook | null; action: string }[] = [];
    const otherReport = { updatedCount: 0, notFoundCount: 0 };
    const allNotFound: NotFoundEntry[] = [];

    // ── Split items ────────────────────────────────────────────────
    const iphoneItems: (PriceItem & { parsed: ParsedIphone })[] = [];
    const watchItems: (PriceItem & { parsed: ParsedWatch })[] = [];
    const airpodsItems: (PriceItem & { parsed: ParsedAirPods })[] = [];
    const ipadItems: (PriceItem & { parsed: ParsedIPad })[] = [];
    const macbookItems: (PriceItem & { parsed: ParsedMacBook })[] = [];
    const otherItems: PriceItem[] = [];

    for (const item of items) {
      if (item.categoryGuess === 'iphone') {
        if (OLD_IPHONE_RE.test(item.description.trim())) {
          iphoneReport.skippedOldCount++;
          continue;
        }
        const p = parseIphoneDescription(item.description);
        if (p) iphoneItems.push({ ...item, parsed: p });
        else {
          const nf: NotFoundEntry = { xmlid: item.xmlid, description: item.description, price: item.price, reason: 'parse_fail' };
          allNotFound.push(nf); iphoneReport.notFoundCount++;
          if (iphoneReport.examples.length < 20) iphoneReport.examples.push(nf);
        }
      } else if (item.categoryGuess === 'ipad' || /\bipad\b/i.test(item.description)) {
        if (IPAD_ACC.test(item.description)) continue;
        const p = parseIPad(item.description);
        if (p) ipadItems.push({ ...item, parsed: p });
        else {
          const nf: NotFoundEntry = { xmlid: item.xmlid, description: item.description, price: item.price, reason: 'parse_fail' };
          allNotFound.push(nf); ipadReport.notFoundCount++;
          if (ipadReport.examples.length < 10) ipadReport.examples.push(nf);
        }
      } else if (/apple\s*watch/i.test(item.description)) {
        if (WACC.test(item.description)) continue;
        const p = parseWatch(item.description);
        if (p) watchItems.push({ ...item, parsed: p });
        else allNotFound.push({ xmlid: item.xmlid, description: item.description, price: item.price, reason: 'parse_fail' });
      } else if (/air\s*pods/i.test(item.description)) {
        if (APACC.test(item.description)) continue;
        const p = parseAirPods(item.description);
        if (p) airpodsItems.push({ ...item, parsed: p });
        else allNotFound.push({ xmlid: item.xmlid, description: item.description, price: item.price, reason: 'parse_fail' });
      } else if (item.categoryGuess === 'macbook' || item.categoryGuess === 'mac' || /\b(macbook|mac\s?book)\b/i.test(item.description)) {
        if (MAC_ACC.test(item.description)) continue;
        if (/\b(imac|mac\s?mini|mac\s?pro|mac\s?studio)\b/i.test(item.description)) { otherItems.push(item); continue; }
        const p = parseMacBook(item.description);
        if (p) macbookItems.push({ ...item, parsed: p });
        else otherItems.push(item);
      } else {
        // Try MacBook parse for lines starting with "Air"/"Pro" that have chip + size
        const mpAttempt = parseMacBook(item.description);
        if (mpAttempt) macbookItems.push({ ...item, parsed: mpAttempt });
        else otherItems.push(item);
      }
    }
    L('split', `iphone=${iphoneItems.length} ipad=${ipadItems.length} watch=${watchItems.length} airpods=${airpodsItems.length} macbook=${macbookItems.length} other=${otherItems.length} skippedOldIphone=${iphoneReport.skippedOldCount} parseFails=${allNotFound.length}`);

    const verifyXmlids: string[] = [];
    for (const arr of [iphoneItems as PriceItem[], ipadItems, watchItems, airpodsItems, macbookItems]) {
      for (const it of arr) { if (verifyXmlids.length < 5) verifyXmlids.push(it.xmlid); }
    }

    // ════════════════════════════════════════════════════════════════
    // ── PHASE 1: DISABLE ALL (sync_stock only) ─────────────────────
    // ════════════════════════════════════════════════════════════════
    let setInStockFalseCount = 0;
    let disableAllAppleCount = 0;
    let appleFamiliesFoundCount = 0;

    if (isSyncStock) {
      const t1 = Date.now();
      const { data: fams, error: famErr } = await supabase
        .from('product_families').select('id').in('category', ['iphone', 'watch', 'airpods', 'ipad', 'macbook']);

      if (famErr) { L('disable_all', `ERROR: ${famErr.message}`); errors.push(`CRITICAL fetch families: ${famErr.message}`); }

      const familyIds = (fams || []).map((f: { id: string }) => f.id);
      appleFamiliesFoundCount = familyIds.length;
      L('disable_all', `familyIds: ${familyIds.length} -> [${familyIds.join(', ')}]`);

      if (familyIds.length > 0) {
        const { count: beforeCount } = await supabase
          .from('variants').select('id', { count: 'exact', head: true })
          .in('family_id', familyIds).eq('in_stock', true);
        setInStockFalseCount = beforeCount || 0;

        const { data: updated, error: updErr, count } = await supabase
          .from('variants').update({ in_stock: false })
          .in('family_id', familyIds).select('id', { count: 'exact' });

        if (updErr) { L('disable_all', `ERROR update: ${updErr.message}`); errors.push(`CRITICAL disable: ${updErr.message}`); }
        disableAllAppleCount = count ?? (updated || []).length;
        L('disable_all', `Done ${ms(t1)}ms. wasTrue=${setInStockFalseCount} disabled=${disableAllAppleCount}`);
      }

      if (disableAllAppleCount === 0) {
        L('disable_all', 'CRITICAL: 0 rows disabled');
        errors.push('CRITICAL: disable_all updated 0 rows');
      }
    }

    // ════════════════════════════════════════════════════════════════
    // ── PHASE 2: IPHONE — match / bind / auto-create ────────────────
    // ════════════════════════════════════════════════════════════════
    let iphoneCreateBudget = MAX_CREATE_IPHONE;

    if (iphoneItems.length > 0) {
      const t2 = Date.now();
      const { data: iphoneFamilies } = await supabase
        .from('product_families').select('id, title').in('category', ['iphone']);
      const titleToId = new Map<string, string>();
      for (const f of iphoneFamilies || []) titleToId.set(f.title, f.id);
      L('iphone', `DB families: ${[...titleToId.keys()].join(', ')}`);

      function resolveFamilyId(p: ParsedIphone): string | null {
        const d = titleToId.get(p.familyTitle);
        if (d) return d;
        for (const a of p.familyAliases) { const aid = titleToId.get(a); if (aid) return aid; }
        return null;
      }

      const allFids = [...new Set([...titleToId.values()])];
      let allIphoneVariants: any[] = [];
      for (let i = 0; i < allFids.length; i += 50) {
        const batch = allFids.slice(i, i + 50);
        const { data } = await supabase.from('variants').select('id, family_id, options, supplier_xmlid').in('family_id', batch);
        if (data) allIphoneVariants.push(...data);
      }
      L('iphone', `Loaded ${allIphoneVariants.length} existing variants`);

      const xmlidToVar = new Map<string, any>();
      for (const v of allIphoneVariants) { if (v.supplier_xmlid) xmlidToVar.set(normalizeXmlid(v.supplier_xmlid), v); }

      const optIdx = new Map<string, any[]>();
      for (const v of allIphoneVariants) {
        const o = v.options as Record<string, string>;
        const mv = o.market ?? o.simType ?? '';
        const cn = normalizeColorForMatch(o.colorLabel || '');
        const k = `${v.family_id}|${o.storage || ''}|${mv}|${cn}`;
        if (!optIdx.has(k)) optIdx.set(k, []);
        optIdx.get(k)!.push(v);
      }

      for (const item of iphoneItems) {
        const nx = normalizeXmlid(item.xmlid);
        const p = item.parsed;

        // A) Match by supplier_xmlid
        const byXmlid = xmlidToVar.get(nx);
        if (byXmlid) {
          const up: Record<string, unknown> = { price: item.price, updated_at: now };
          if (isSyncStock) up.in_stock = true;
          const { error: e } = await supabase.from('variants').update(up).eq('id', byXmlid.id);
          if (!e) { updatedPricesCount++; iphoneReport.matchedByXmlidCount++; if (isSyncStock) setInStockTrueCount++; }
          else errors.push(`iPhone update xmlid=${item.xmlid}: ${e.message}`);
          continue;
        }

        // Resolve family
        const fid = resolveFamilyId(p);
        if (!fid) {
          const nf: NotFoundEntry = { xmlid: item.xmlid, description: item.description, price: item.price, reason: 'no_family', parsed: { family: p.familyTitle, storage: p.storage, sim: p.optionValue, color: p.colorLabel } };
          allNotFound.push(nf); iphoneReport.notFoundCount++;
          if (iphoneReport.examples.length < 20) iphoneReport.examples.push(nf);
          continue;
        }

        // B) Match by options (bind xmlid)
        const cn = normalizeColorForMatch(p.colorLabel);
        const lk = `${fid}|${p.storage}|${p.optionValue}|${cn}`;
        const cands = optIdx.get(lk) || [];

        if (cands.length === 1) {
          const tgt = cands[0];
          const up: Record<string, unknown> = { price: item.price, supplier_xmlid: item.xmlid, updated_at: now };
          if (isSyncStock) up.in_stock = true;
          if (tgt.supplier_xmlid && normalizeXmlid(tgt.supplier_xmlid) !== nx) {
            const opts = { ...(tgt.options as Record<string, unknown>) };
            const prev = (opts._xmlid_audit as string[] | undefined) || [];
            opts._xmlid_audit = [...prev, `${tgt.supplier_xmlid}→${item.xmlid}@${now}`];
            up.options = opts;
          }
          const { error: e } = await supabase.from('variants').update(up).eq('id', tgt.id);
          if (!e) { updatedPricesCount++; iphoneReport.boundXmlidCount++; if (isSyncStock) setInStockTrueCount++; xmlidToVar.set(nx, tgt); }
          else errors.push(`iPhone bind xmlid=${item.xmlid}: ${e.message}`);
          continue;
        }

        if (cands.length > 1) {
          const nf: NotFoundEntry = { xmlid: item.xmlid, description: item.description, price: item.price, reason: 'ambiguous', candidates: cands.length, parsed: { family: p.familyTitle, storage: p.storage, sim: p.optionValue, color: p.colorLabel } };
          allNotFound.push(nf); iphoneReport.ambiguousCount++;
          if (iphoneReport.examples.length < 20) iphoneReport.examples.push(nf);
          continue;
        }

        // C) Dedup check: look for existing variant with same options in this family
        //    (broader search — match by storage + sim/market + colorLabel, ignoring xmlid)
        {
          const allFamilyVars = allIphoneVariants.filter((v: any) => v.family_id === fid);
          const existingDup = allFamilyVars.find((v: any) => {
            const o = v.options as Record<string, string>;
            if (o.storage !== p.storage) return false;
            const vSim = o[p.optionKey] || o.market || o.simType || '';
            if (vSim !== p.optionValue) return false;
            const vColorNorm = normalizeColorForMatch(o.colorLabel || o.color || '');
            return vColorNorm === cn;
          });

          if (existingDup) {
            const up: Record<string, unknown> = { price: item.price, supplier_xmlid: item.xmlid, updated_at: now };
            if (isSyncStock) up.in_stock = true;
            const { error: e } = await supabase.from('variants').update(up).eq('id', existingDup.id);
            if (!e) { updatedPricesCount++; iphoneReport.dedupedHits++; if (isSyncStock) setInStockTrueCount++; xmlidToVar.set(nx, existingDup); }
            else errors.push(`iPhone dedup-bind xmlid=${item.xmlid}: ${e.message}`);
            continue;
          }
        }

        // Auto-create (only if budget allows and all fields resolved)
        if (iphoneCreateBudget <= 0) {
          errors.push(`iPhone auto-create limit (${MAX_CREATE_IPHONE}) reached — skipping remaining`);
          const nf: NotFoundEntry = { xmlid: item.xmlid, description: item.description, price: item.price, reason: 'create_limit', parsed: { family: p.familyTitle, storage: p.storage, sim: p.optionValue, color: p.colorLabel } };
          allNotFound.push(nf); iphoneReport.notFoundCount++;
          if (iphoneReport.examples.length < 20) iphoneReport.examples.push(nf);
          continue;
        }

        const storageNum = parseInt(p.storage);
        if (!storageNum || ![128, 256, 512, 1024, 2048].includes(storageNum)) {
          const nf: NotFoundEntry = { xmlid: item.xmlid, description: item.description, price: item.price, reason: 'bad_storage', parsed: { family: p.familyTitle, storage: p.storage, sim: p.optionValue, color: p.colorLabel } };
          allNotFound.push(nf); iphoneReport.notFoundCount++;
          if (iphoneReport.examples.length < 20) iphoneReport.examples.push(nf);
          continue;
        }

        if (!p.colorLabel || p.colorHex === '#888888') {
          const nf: NotFoundEntry = { xmlid: item.xmlid, description: item.description, price: item.price, reason: 'unknown_color', parsed: { family: p.familyTitle, storage: p.storage, sim: p.optionValue, color: p.colorLabel } };
          allNotFound.push(nf); iphoneReport.notFoundCount++; iphoneReport.unknownColorCount++;
          if (iphoneReport.examples.length < 20) iphoneReport.examples.push(nf);
          continue;
        }

        const newOptions: Record<string, unknown> = {
          storage: p.storage,
          color: p.colorSnake,
          colorLabel: p.colorLabel,
          colorHex: p.colorHex,
          [p.optionKey]: p.optionValue,
        };

        const skuParts = [
          p.familyTitle.replace(/^Apple\s+/i, '').replace(/\s+/g, '-').toLowerCase(),
          p.storage,
          p.colorSnake,
          p.optionValue.replace(/\s+/g, '').toLowerCase(),
        ];

        const { error: cErr } = await supabase.from('variants').insert({
          family_id: fid,
          options: newOptions,
          images: [],
          price: item.price,
          in_stock: isSyncStock,
          sku_code: skuParts.join('-'),
          supplier_xmlid: item.xmlid,
        });

        if (cErr) {
          errors.push(`iPhone create xmlid=${item.xmlid}: ${cErr.message}`);
          const nf: NotFoundEntry = { xmlid: item.xmlid, description: item.description, price: item.price, reason: 'create_error', parsed: { family: p.familyTitle, error: cErr.message } };
          allNotFound.push(nf); iphoneReport.notFoundCount++;
          if (iphoneReport.examples.length < 20) iphoneReport.examples.push(nf);
        } else {
          createdCount++;
          iphoneReport.createdCount++;
          iphoneCreateBudget--;
          if (isSyncStock) setInStockTrueCount++;
          if (iphoneReport.createdExamples.length < 5) {
            iphoneReport.createdExamples.push({
              xmlid: item.xmlid, description: item.description,
              familyTitle: p.familyTitle, storage: p.storage,
              color: p.colorLabel, sim: p.optionValue,
            });
          }
        }
      }

      L('iphone', `Done ${ms(t2)}ms. byXmlid=${iphoneReport.matchedByXmlidCount} bound=${iphoneReport.boundXmlidCount} deduped=${iphoneReport.dedupedHits} created=${iphoneReport.createdCount} ambiguous=${iphoneReport.ambiguousCount} notFound=${iphoneReport.notFoundCount} unknownColor=${iphoneReport.unknownColorCount} skippedOld=${iphoneReport.skippedOldCount}`);

      if (iphoneCreateBudget <= 0) {
        errors.push(`iPhone auto-create limit (${MAX_CREATE_IPHONE}) was exhausted`);
      }
    }

    // ════════════════════════════════════════════════════════════════
    // ── PHASE 3: WATCH ──────────────────────────────────────────────
    // ════════════════════════════════════════════════════════════════
    if (watchItems.length > 0) {
      const t3 = Date.now();
      const wTitles = [...new Set(watchItems.map(i => i.parsed.familyTitle))];
      const { data: wFams } = await supabase.from('product_families').select('id, title').in('title', wTitles);
      const wMap = new Map<string, string>(); for (const f of wFams || []) wMap.set(f.title, f.id);

      const wxAll = watchItems.map(i => i.xmlid);
      const wxExp = [...new Set([...wxAll, ...wxAll.map(normalizeXmlid)])];
      const wExRows: any[] = [];
      for (let i = 0; i < wxExp.length; i += 200) {
        const b = wxExp.slice(i, i + 200);
        const { data } = await supabase.from('variants').select('id, options, supplier_xmlid').in('supplier_xmlid', b);
        if (data) wExRows.push(...data);
      }
      const wExMap = new Map<string, { id: string; options: Record<string, unknown> }>();
      for (const v of wExRows) wExMap.set(normalizeXmlid(v.supplier_xmlid), { id: v.id, options: v.options || {} });

      for (const item of watchItems) {
        const ex = wExMap.get(normalizeXmlid(item.xmlid));
        if (ex) {
          const up: Record<string, unknown> = { price: item.price, supplier_xmlid: item.xmlid, options: { ...ex.options, raw: item.description, supplierTitle: item.description }, updated_at: now };
          if (isSyncStock) up.in_stock = true;
          const { error: e } = await supabase.from('variants').update(up).eq('id', ex.id);
          if (!e) { updatedPricesCount++; watchReport.updatedCount++; if (isSyncStock) setInStockTrueCount++; }
          else errors.push(`Watch update: ${e.message}`);
        } else {
          const fid = wMap.get(item.parsed.familyTitle);
          if (!fid) { allNotFound.push({ xmlid: item.xmlid, description: item.description, price: item.price, reason: 'no_family' }); continue; }
          const { error: e } = await supabase.from('variants').insert({
            family_id: fid, options: { line: item.parsed.line, raw: item.description, supplierTitle: item.description },
            images: [], price: item.price, in_stock: isSyncStock, sku_code: `watch-${item.parsed.line.toLowerCase()}-${item.xmlid}`, supplier_xmlid: item.xmlid,
          });
          if (!e) { createdCount++; watchReport.createdCount++; if (isSyncStock) setInStockTrueCount++; }
          else errors.push(`Watch create: ${e.message}`);
        }
      }
      L('watch', `Done ${ms(t3)}ms. updated=${watchReport.updatedCount} created=${watchReport.createdCount}`);
    }

    // ════════════════════════════════════════════════════════════════
    // ── PHASE 3B: IPAD (like Watch — match by xmlid, auto-create) ──
    // ════════════════════════════════════════════════════════════════
    if (ipadItems.length > 0) {
      const tIpad = Date.now();
      const ipTitles = [...new Set(ipadItems.map(i => i.parsed.familyTitle))];
      const { data: ipFams } = await supabase.from('product_families').select('id, title').in('category', ['ipad']);
      const ipMap = new Map<string, string>(); for (const f of ipFams || []) ipMap.set(f.title, f.id);

      const ixAll = ipadItems.map(i => i.xmlid);
      const ixExp = [...new Set([...ixAll, ...ixAll.map(normalizeXmlid)])];
      const iExRows: any[] = [];
      for (let i = 0; i < ixExp.length; i += 200) {
        const b = ixExp.slice(i, i + 200);
        const { data } = await supabase.from('variants').select('id, family_id, options, supplier_xmlid').in('supplier_xmlid', b);
        if (data) iExRows.push(...data);
      }
      const iExMap = new Map<string, { id: string; family_id: string; options: Record<string, unknown> }>();
      for (const v of iExRows) iExMap.set(normalizeXmlid(v.supplier_xmlid), { id: v.id, family_id: v.family_id, options: v.options || {} });

      // Load all iPad variants for dedup checks
      const allIpadFids = [...new Set([...ipMap.values()])];
      let allIpadVariants: any[] = [];
      for (let i = 0; i < allIpadFids.length; i += 50) {
        const batch = allIpadFids.slice(i, i + 50);
        const { data } = await supabase.from('variants').select('id, family_id, options, supplier_xmlid').in('family_id', batch);
        if (data) allIpadVariants.push(...data);
      }

      for (const item of ipadItems) {
        const nx = normalizeXmlid(item.xmlid);
        const ex = iExMap.get(nx);
        if (ex) {
          const up: Record<string, unknown> = {
            price: item.price,
            supplier_xmlid: item.xmlid,
            options: { ...ex.options, raw: item.description, supplierTitle: item.description },
            updated_at: now,
          };
          if (isSyncStock) up.in_stock = true;
          const { error: e } = await supabase.from('variants').update(up).eq('id', ex.id);
          if (!e) { updatedPricesCount++; ipadReport.updatedCount++; if (isSyncStock) setInStockTrueCount++; }
          else errors.push(`iPad update: ${e.message}`);
          continue;
        }

        // Resolve family
        let fid = ipMap.get(item.parsed.familyTitle);
        if (!fid) {
          // Try partial match on existing families
          for (const [title, id] of ipMap) {
            if (title.includes(item.parsed.familyTitle.replace('Apple ', '')) || item.parsed.familyTitle.includes(title.replace('Apple ', ''))) {
              fid = id; break;
            }
          }
        }
        if (!fid) {
          // Auto-create family
          const { data: newFam, error: fErr } = await supabase.from('product_families').insert({
            category: 'ipad', title: item.parsed.familyTitle, description: '', images: [], popularity_score: 0,
          }).select('id').single();
          if (fErr || !newFam) {
            errors.push(`iPad create family "${item.parsed.familyTitle}": ${fErr?.message}`);
            const nf: NotFoundEntry = { xmlid: item.xmlid, description: item.description, price: item.price, reason: 'no_family' };
            allNotFound.push(nf); ipadReport.notFoundCount++;
            if (ipadReport.examples.length < 10) ipadReport.examples.push(nf);
            continue;
          }
          fid = newFam.id;
          ipMap.set(item.parsed.familyTitle, fid);
          L('ipad', `Created family "${item.parsed.familyTitle}" id=${fid}`);
        }

        // Dedup: check if variant with same key options already exists
        const p = item.parsed;
        const dedupMatch = allIpadVariants.find((v: any) => {
          if (v.family_id !== fid) return false;
          const o = v.options as Record<string, string>;
          if (p.storage && o.storage !== p.storage) return false;
          if (p.connectivity && o.connectivity !== p.connectivity) return false;
          if (p.colorKey && (o.color || '').toLowerCase() !== p.colorKey) return false;
          return true;
        });

        if (dedupMatch) {
          const up: Record<string, unknown> = {
            price: item.price,
            supplier_xmlid: item.xmlid,
            options: { ...(dedupMatch.options as Record<string, unknown>), raw: item.description, supplierTitle: item.description },
            updated_at: now,
          };
          if (isSyncStock) up.in_stock = true;
          const { error: e } = await supabase.from('variants').update(up).eq('id', dedupMatch.id);
          if (!e) { updatedPricesCount++; ipadReport.dedupHits++; if (isSyncStock) setInStockTrueCount++; iExMap.set(nx, dedupMatch); }
          else errors.push(`iPad dedup-bind: ${e.message}`);
          continue;
        }

        // Auto-create variant
        const newOpts: Record<string, unknown> = { raw: item.description, supplierTitle: item.description };
        if (p.storage) newOpts.storage = p.storage;
        if (p.connectivity) newOpts.connectivity = p.connectivity;
        if (p.size) newOpts.size = p.size;
        if (p.chip) newOpts.chip = p.chip;
        if (p.colorLabel) { newOpts.colorLabel = p.colorLabel; newOpts.colorHex = p.colorHex || '#888888'; newOpts.color = p.colorKey || colorToSnake(p.colorLabel); }
        const skuParts = ['ipad', p.storage || 'x', p.connectivity || 'x', p.colorKey || 'x', item.xmlid].join('-');

        const { error: cErr } = await supabase.from('variants').insert({
          family_id: fid, options: newOpts, images: [], price: item.price,
          in_stock: isSyncStock, sku_code: skuParts, supplier_xmlid: item.xmlid,
        });
        if (!cErr) {
          createdCount++; ipadReport.createdCount++;
          if (isSyncStock) setInStockTrueCount++;
          allIpadVariants.push({ id: 'new-' + item.xmlid, family_id: fid, options: newOpts, supplier_xmlid: item.xmlid });
        } else {
          errors.push(`iPad create variant: ${cErr.message}`);
          const nf: NotFoundEntry = { xmlid: item.xmlid, description: item.description, price: item.price, reason: 'create_error' };
          allNotFound.push(nf); ipadReport.notFoundCount++;
          if (ipadReport.examples.length < 10) ipadReport.examples.push(nf);
        }
      }
      L('ipad', `Done ${ms(tIpad)}ms. updated=${ipadReport.updatedCount} created=${ipadReport.createdCount} dedup=${ipadReport.dedupHits} nf=${ipadReport.notFoundCount}`);
    }

    // ════════════════════════════════════════════════════════════════
    // ── PHASE 3C: MACBOOK (like Watch — match by xmlid, auto-create)
    // ════════════════════════════════════════════════════════════════
    if (macbookItems.length > 0) {
      const tMac = Date.now();
      const { data: mbFams } = await supabase.from('product_families').select('id, title').in('category', ['macbook']);
      const mbMap = new Map<string, string>(); for (const f of mbFams || []) mbMap.set(f.title, f.id);

      const mxAll = macbookItems.map(i => i.xmlid);
      const mxExp = [...new Set([...mxAll, ...mxAll.map(normalizeXmlid)])];
      const mExRows: any[] = [];
      for (let i = 0; i < mxExp.length; i += 200) {
        const b = mxExp.slice(i, i + 200);
        const { data } = await supabase.from('variants').select('id, family_id, options, supplier_xmlid').in('supplier_xmlid', b);
        if (data) mExRows.push(...data);
      }
      const mExMap = new Map<string, { id: string; family_id: string; options: Record<string, unknown> }>();
      for (const v of mExRows) mExMap.set(normalizeXmlid(v.supplier_xmlid), { id: v.id, family_id: v.family_id, options: v.options || {} });

      const allMbFids = [...new Set([...mbMap.values()])];
      let allMbVariants: any[] = [];
      for (let i = 0; i < allMbFids.length; i += 50) {
        const batch = allMbFids.slice(i, i + 50);
        const { data } = await supabase.from('variants').select('id, family_id, options, supplier_xmlid').in('family_id', batch);
        if (data) allMbVariants.push(...data);
      }

      for (const item of macbookItems) {
        const nx = normalizeXmlid(item.xmlid);
        const dbg = debugMacbook.length < 20;
        const ex = mExMap.get(nx);
        if (ex) {
          const up: Record<string, unknown> = {
            price: item.price, supplier_xmlid: item.xmlid,
            options: { ...ex.options, raw: item.description, supplierTitle: item.description },
            updated_at: now,
          };
          if (isSyncStock) up.in_stock = true;
          const { error: e } = await supabase.from('variants').update(up).eq('id', ex.id);
          if (!e) { updatedPricesCount++; macbookReport.updatedCount++; if (isSyncStock) setInStockTrueCount++; }
          else errors.push(`MacBook update: ${e.message}`);
          if (dbg) debugMacbook.push({ xmlid: item.xmlid, desc: item.description.slice(0, 80), parsed: item.parsed, action: 'matched_xmlid' });
          continue;
        }

        const p = item.parsed;
        let fid = mbMap.get(p.familyTitle);
        if (!fid) {
          const { data: newFam, error: fErr } = await supabase.from('product_families').insert({
            category: 'macbook', title: p.familyTitle, description: '', images: [], popularity_score: 0,
          }).select('id').single();
          if (fErr || !newFam) {
            errors.push(`MacBook create family "${p.familyTitle}": ${fErr?.message}`);
            const nf: NotFoundEntry = { xmlid: item.xmlid, description: item.description, price: item.price, reason: 'no_family' };
            allNotFound.push(nf); macbookReport.notFoundCount++;
            if (macbookReport.examples.length < 10) macbookReport.examples.push(nf);
            continue;
          }
          fid = newFam.id;
          mbMap.set(p.familyTitle, fid);
          L('macbook', `Created family "${p.familyTitle}" id=${fid}`);
        }

        // Dedup: match by chip + memStorage + color in same family
        const dedupMatch = allMbVariants.find((v: any) => {
          if (v.family_id !== fid) return false;
          const o = v.options as Record<string, string>;
          if (p.chip && String(o.chip || '') !== p.chip) return false;
          if (p.memStorage && String(o.memStorage || '') !== p.memStorage) return false;
          if (p.colorKey && (o.color || '').toLowerCase() !== p.colorKey) return false;
          return true;
        });

        if (dedupMatch) {
          const up: Record<string, unknown> = {
            price: item.price, supplier_xmlid: item.xmlid,
            options: { ...(dedupMatch.options as Record<string, unknown>), raw: item.description, supplierTitle: item.description },
            updated_at: now,
          };
          if (isSyncStock) up.in_stock = true;
          const { error: e } = await supabase.from('variants').update(up).eq('id', dedupMatch.id);
          if (!e) { updatedPricesCount++; macbookReport.dedupHits++; if (isSyncStock) setInStockTrueCount++; mExMap.set(nx, dedupMatch); }
          else errors.push(`MacBook dedup-bind: ${e.message}`);
          if (dbg) debugMacbook.push({ xmlid: item.xmlid, desc: item.description.slice(0, 80), parsed: item.parsed, action: 'dedup_bind' });
          continue;
        }

        // Auto-create variant
        const newOpts: Record<string, unknown> = {
          line: p.line, size: p.size,
          raw: item.description, supplierTitle: item.description,
        };
        if (p.chip) newOpts.chip = p.chip;
        if (p.memStorage) newOpts.memStorage = p.memStorage;
        if (p.colorLabel) { newOpts.colorLabel = p.colorLabel; newOpts.colorHex = p.colorHex || '#888888'; newOpts.color = p.colorKey || colorToSnake(p.colorLabel); }
        const skuParts = ['macbook', p.line.toLowerCase(), p.size, p.chip || 'x', p.memStorage?.replace('/', '-') || 'x', item.xmlid].join('-');

        const { error: cErr } = await supabase.from('variants').insert({
          family_id: fid, options: newOpts, images: [], price: item.price,
          in_stock: isSyncStock, sku_code: skuParts, supplier_xmlid: item.xmlid,
        });
        if (!cErr) {
          createdCount++; macbookReport.createdCount++;
          if (isSyncStock) setInStockTrueCount++;
          allMbVariants.push({ id: 'new-' + item.xmlid, family_id: fid, options: newOpts, supplier_xmlid: item.xmlid });
          if (macbookReport.createdExamples.length < 5) {
            macbookReport.createdExamples.push({ xmlid: item.xmlid, description: item.description, family: p.familyTitle, chip: p.chip || '?', memStorage: p.memStorage || '?' });
          }
          if (dbg) debugMacbook.push({ xmlid: item.xmlid, desc: item.description.slice(0, 80), parsed: item.parsed, action: 'created' });
        } else {
          errors.push(`MacBook create: ${cErr.message}`);
          const nf: NotFoundEntry = { xmlid: item.xmlid, description: item.description, price: item.price, reason: 'create_error' };
          allNotFound.push(nf); macbookReport.notFoundCount++;
          if (macbookReport.examples.length < 10) macbookReport.examples.push(nf);
          if (dbg) debugMacbook.push({ xmlid: item.xmlid, desc: item.description.slice(0, 80), parsed: item.parsed, action: 'create_error: ' + cErr.message });
        }
      }
      L('macbook', `Done ${ms(tMac)}ms. updated=${macbookReport.updatedCount} created=${macbookReport.createdCount} dedup=${macbookReport.dedupHits} nf=${macbookReport.notFoundCount}`);
    }

    // ════════════════════════════════════════════════════════════════
    // ── PHASE 4: AIRPODS ────────────────────────────────────────────
    // ════════════════════════════════════════════════════════════════
    if (airpodsItems.length > 0) {
      const t4 = Date.now();
      const apTitles = [...new Set(airpodsItems.map(i => i.parsed.familyTitle))];
      const { data: apFams } = await supabase.from('product_families').select('id, title').in('title', apTitles);
      const apMap = new Map<string, string>(); for (const f of apFams || []) apMap.set(f.title, f.id);

      const axAll = airpodsItems.map(i => i.xmlid);
      const axExp = [...new Set([...axAll, ...axAll.map(normalizeXmlid)])];
      const aExRows: any[] = [];
      for (let i = 0; i < axExp.length; i += 200) {
        const b = axExp.slice(i, i + 200);
        const { data } = await supabase.from('variants').select('id, options, supplier_xmlid').in('supplier_xmlid', b);
        if (data) aExRows.push(...data);
      }
      const aExMap = new Map<string, { id: string; options: Record<string, unknown> }>();
      for (const v of aExRows) aExMap.set(normalizeXmlid(v.supplier_xmlid), { id: v.id, options: v.options || {} });

      // Find AirPods Max family: try exact title first, then search by category+pattern
      let maxFid = apMap.get('Apple AirPods Max');
      if (!maxFid) {
        const { data: maxFams } = await supabase.from('product_families')
          .select('id, title').in('category', ['airpods', 'AirPods']).ilike('title', '%Max%');
        if (maxFams && maxFams.length > 0) {
          maxFid = maxFams[0].id;
          L('airpods', `Found AirPods Max family by pattern: id=${maxFid} title="${maxFams[0].title}"`);
        }
      }
      let maxVars: { id: string; options: Record<string, string>; supplier_xmlid: string | null }[] = [];
      if (maxFid) {
        const { data: mv } = await supabase.from('variants').select('id, options, supplier_xmlid').eq('family_id', maxFid);
        maxVars = (mv || []) as typeof maxVars;
        L('airpods', `AirPods Max variants loaded: ${maxVars.length}, colors: ${maxVars.map(v => v.options?.colorLabel || '?').join(', ')}`);
      } else {
        L('airpods', 'WARNING: AirPods Max family not found in DB');
      }

      for (const item of airpodsItems) {
        const ex = aExMap.get(normalizeXmlid(item.xmlid));
        if (ex) {
          const up: Record<string, unknown> = { price: item.price, supplier_xmlid: item.xmlid, options: { ...ex.options, raw: item.description, supplierTitle: item.description }, updated_at: now };
          if (isSyncStock) up.in_stock = true;
          const { error: e } = await supabase.from('variants').update(up).eq('id', ex.id);
          if (!e) { updatedPricesCount++; if (item.parsed.isMax) airpodsMaxReport.matchedCount++; else airpodsReport.updatedCount++; if (isSyncStock) setInStockTrueCount++; }
          else errors.push(`AirPods update: ${e.message}`);
        } else if (item.parsed.isMax) {
          if (item.parsed.colorLabel) {
            const nc = normalizeColorForMatch(item.parsed.colorLabel);
            // Match by colorLabel OR color (snake_case key)
            const matchFn = (v: typeof maxVars[0]) => {
              const vl = normalizeColorForMatch(v.options?.colorLabel || '');
              if (vl === nc) return true;
              const vc = (v.options?.color || '').toLowerCase().replace(/[\s_]+/g, '');
              const pc = nc.replace(/[\s_]+/g, '');
              return vc === pc;
            };
            const cm = maxVars.find(v => matchFn(v) && !v.supplier_xmlid)
                     || maxVars.find(v => matchFn(v));
            if (cm) {
              const up: Record<string, unknown> = { price: item.price, supplier_xmlid: item.xmlid, options: { ...cm.options, raw: item.description, supplierTitle: item.description }, updated_at: now };
              if (isSyncStock) up.in_stock = true;
              if (cm.supplier_xmlid && normalizeXmlid(cm.supplier_xmlid) !== normalizeXmlid(item.xmlid)) {
                const o = up.options as Record<string, unknown>;
                o._xmlid_audit = [...((o._xmlid_audit as string[]) || []), `${cm.supplier_xmlid}→${item.xmlid}@${now}`];
              }
              const { error: e } = await supabase.from('variants').update(up).eq('id', cm.id);
              if (!e) { updatedPricesCount++; airpodsMaxReport.boundXmlidCount++; if (isSyncStock) setInStockTrueCount++; }
              else errors.push(`AirPods Max bind: ${e.message}`);
              continue;
            }
          }
          // Auto-create AirPods Max variant by color if family exists and color is known
          if (maxFid && item.parsed.colorLabel) {
            const cl = item.parsed.colorLabel;
            const ck = colorToSnake(cl);
            const ch = APMC_HEX[cl] || COLOR_HEX[cl] || '#888888';
            if (ch !== '#888888') {
              const { error: cErr } = await supabase.from('variants').insert({
                family_id: maxFid,
                options: { color: ck, colorLabel: cl, colorHex: ch, raw: item.description, supplierTitle: item.description },
                images: [], price: item.price, in_stock: isSyncStock,
                sku_code: `airpods-max-${ck}-${item.xmlid}`,
                supplier_xmlid: item.xmlid,
              });
              if (!cErr) {
                createdCount++; airpodsMaxReport.createdCount++;
                if (isSyncStock) setInStockTrueCount++;
                maxVars.push({ id: 'new', options: { color: ck, colorLabel: cl, colorHex: ch } as any, supplier_xmlid: item.xmlid });
                continue;
              }
              errors.push(`AirPods Max create: ${cErr.message}`);
            }
          }
          const nf: NotFoundEntry = { xmlid: item.xmlid, description: item.description, price: item.price, reason: item.parsed.colorLabel ? 'unknown_color' : 'no_color_parsed', parsed: { color: item.parsed.colorLabel || '?', maxVariantsCount: String(maxVars.length), maxColors: maxVars.map(v => v.options?.colorLabel || v.options?.color || '?').join(',') } };
          allNotFound.push(nf); airpodsMaxReport.notFoundCount++; if (airpodsMaxReport.examples.length < 10) airpodsMaxReport.examples.push(nf);
        } else {
          const fid = apMap.get(item.parsed.familyTitle);
          if (!fid) { allNotFound.push({ xmlid: item.xmlid, description: item.description, price: item.price, reason: 'no_family' }); continue; }
          const { error: e } = await supabase.from('variants').insert({
            family_id: fid, options: { raw: item.description, supplierTitle: item.description }, images: [], price: item.price,
            in_stock: isSyncStock, sku_code: `airpods-${item.xmlid}`, supplier_xmlid: item.xmlid,
          });
          if (!e) { createdCount++; airpodsReport.createdCount++; if (isSyncStock) setInStockTrueCount++; }
          else errors.push(`AirPods create: ${e.message}`);
        }
      }
      L('airpods', `Done ${ms(t4)}ms. updated=${airpodsReport.updatedCount} created=${airpodsReport.createdCount} maxMatched=${airpodsMaxReport.matchedCount} maxBound=${airpodsMaxReport.boundXmlidCount} maxCreated=${airpodsMaxReport.createdCount} maxNF=${airpodsMaxReport.notFoundCount}`);
    }

    // ════════════════════════════════════════════════════════════════
    // ── PHASE 5: OTHER (iPad, MacBook) ──────────────────────────────
    // ════════════════════════════════════════════════════════════════
    if (otherItems.length > 0) {
      const t5 = Date.now();
      for (let i = 0; i < otherItems.length; i += 50) {
        const batch = otherItems.slice(i, i + 50);
        const xids = [...new Set([...batch.map(b => b.xmlid), ...batch.map(b => normalizeXmlid(b.xmlid))])];
        const rows: any[] = [];
        for (let j = 0; j < xids.length; j += 200) { const { data } = await supabase.from('variants').select('id, supplier_xmlid').in('supplier_xmlid', xids.slice(j, j + 200)); if (data) rows.push(...data); }
        const em = new Map<string, string>(); for (const v of rows) em.set(normalizeXmlid(v.supplier_xmlid), v.id);
        for (const item of batch) {
          const vid = em.get(normalizeXmlid(item.xmlid));
          if (!vid) { allNotFound.push({ xmlid: item.xmlid, description: item.description, price: item.price, reason: 'no_match' }); otherReport.notFoundCount++; continue; }
          const up: Record<string, unknown> = { price: item.price, updated_at: now };
          if (isSyncStock) up.in_stock = true;
          const { error: e } = await supabase.from('variants').update(up).eq('id', vid);
          if (!e) { updatedPricesCount++; otherReport.updatedCount++; if (isSyncStock) setInStockTrueCount++; }
          else errors.push(`Other: ${e.message}`);
        }
      }
      L('other', `Done ${ms(t5)}ms. updated=${otherReport.updatedCount} nf=${otherReport.notFoundCount}`);
    }

    // ════════════════════════════════════════════════════════════════
    // ── CLEANUP ─────────────────────────────────────────────────────
    // ════════════════════════════════════════════════════════════════
    {
      const { data: orphans } = await supabase.from('variants').select('id').is('supplier_xmlid', null).eq('price', 0).eq('in_stock', false);
      const oids = (orphans || []).map((o: { id: string }) => o.id);
      for (let i = 0; i < oids.length; i += 200) await supabase.from('variants').delete().in('id', oids.slice(i, i + 200));

      const { data: allV } = await supabase.from('variants').select('id, supplier_xmlid, in_stock').not('supplier_xmlid', 'is', null);
      if (allV) {
        const g = new Map<string, typeof allV>(); for (const v of allV) { const k = normalizeXmlid(v.supplier_xmlid); if (!g.has(k)) g.set(k, []); g.get(k)!.push(v); }
        const dd: string[] = [];
        for (const [, gr] of g) { if (gr.length <= 1) continue; const keep = gr.find(v => v.in_stock) || gr[0]; for (const v of gr) if (v.id !== keep.id) dd.push(v.id); }
        for (let i = 0; i < dd.length; i += 200) await supabase.from('variants').delete().in('id', dd.slice(i, i + 200));
        if (dd.length > 0) L('cleanup', `Removed ${dd.length} duplicate variants`);
      }
    }

    // ════════════════════════════════════════════════════════════════
    // ── VERIFY ──────────────────────────────────────────────────────
    // ════════════════════════════════════════════════════════════════
    const verify: VerifyEntry[] = [];
    if (verifyXmlids.length > 0) {
      const vxExp = [...new Set([...verifyXmlids, ...verifyXmlids.map(normalizeXmlid)])];
      const { data: vRows } = await supabase.from('variants')
        .select('supplier_xmlid, in_stock, price, family_id').in('supplier_xmlid', vxExp);
      const famIds = [...new Set((vRows || []).map((r: any) => r.family_id))];
      const { data: famRows } = famIds.length > 0
        ? await supabase.from('product_families').select('id, title').in('id', famIds)
        : { data: [] };
      const famMap = new Map<string, string>(); for (const f of famRows || []) famMap.set(f.id, f.title);

      for (const xid of verifyXmlids) {
        const row = (vRows || []).find((r: any) => normalizeXmlid(r.supplier_xmlid) === normalizeXmlid(xid));
        verify.push({ xmlid: xid, found: !!row, in_stock: row ? row.in_stock : null, price: row ? row.price : null, familyTitle: row ? (famMap.get(row.family_id) || null) : null });
      }
      L('verify', JSON.stringify(verify));
    }

    if (isSyncStock) {
      setInStockFalseCount = Math.max(0, setInStockFalseCount - setInStockTrueCount);
    }

    const ok = !(isSyncStock && disableAllAppleCount === 0) && iphoneCreateBudget >= 0;

    L('done', `Total ${ms(T0)}ms. ok=${ok} prices=${updatedPricesCount} true=${setInStockTrueCount} false=${setInStockFalseCount} created=${createdCount} iphoneCreated=${iphoneReport.createdCount} ipadCreated=${ipadReport.createdCount} nf=${allNotFound.length}`);

    return new Response(JSON.stringify({
      ok, requestId, mode,
      appleFamiliesFoundCount, disableAllUpdatedCount: disableAllAppleCount,
      totalRows: items.length,
      appleRows: items.filter(i => i.categoryGuess !== 'other').length,
      updatedPricesCount, setInStockTrueCount, setInStockFalseCount, createdCount,
      notFoundCount: allNotFound.length,
      iphone: iphoneReport, ipad: ipadReport, macbook: macbookReport, watch: watchReport, airpods: airpodsReport, airpodsMax: airpodsMaxReport, other: otherReport,
      debugMacbook,
      topNotFoundExamples: allNotFound.slice(0, 20),
      verify, errors,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error(`[update-prices] FATAL: ${(err as Error).message}`);
    return new Response(JSON.stringify({ ok: false, error: (err as Error).message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
