import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

interface PriceItem {
  xmlid: string;
  price: number;
  description: string;
  categoryGuess: string;
}

interface RequestBody {
  items: PriceItem[];
  mode: 'prices_only' | 'sync_stock';
}

// ══════════════════════════════════════════════════════════════════════
// ── IPHONE PARSER (unchanged) ────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════

interface ParsedIphone {
  familyTitle: string;
  storage: string;
  colorLabel: string;
  /** Which DB option field to match on: 'simType' (17) or 'market' (16) */
  optionKey: 'simType' | 'market';
  optionValue: string;
  generation: '16' | '17';
}

// ── Color alias mapping ─────────────────────────────────────────────
const COLOR_ALIASES: Record<string, Record<string, string>> = {
  'pro/promax': {
    orange: 'Cosmic Orange',
    blue: 'Deep Blue',
    silver: 'Silver',
    black: 'Black Titanium',
    white: 'White Titanium',
    natural: 'Natural Titanium',
    desert: 'Desert Titanium',
    green: 'Green',
  },
  default: {},
};

function resolveColorLabel(colorRaw: string, modelLine: string): string {
  const key = colorRaw.toLowerCase().trim();
  const aliases =
    /pro/i.test(modelLine) ? COLOR_ALIASES['pro/promax'] : COLOR_ALIASES['default'];
  return aliases[key] || colorRaw;
}

// ── Storage normalisation ───────────────────────────────────────────
function normalizeStorage(raw: string): string {
  const s = raw.trim().toLowerCase();
  const tbMatch = s.match(/^(\d+)\s*tb$/);
  if (tbMatch) return String(parseInt(tbMatch[1]) * 1024);
  return s.replace(/\s*gb$/i, '');
}

// ── SIM normalisation (iPhone 17) ───────────────────────────────────
function normalizeSim(raw: string): string {
  const s = raw.replace(/\s+/g, '').toLowerCase();
  if (/esim\+sim|esim\+nano|sim\+esim|nano\+esim/.test(s)) return 'eSIM+SIM';
  if (/esim/.test(s)) return 'eSIM';
  return raw.trim();
}

// ── iPhone 17 parser ────────────────────────────────────────────────
const IPHONE17_RE =
  /^iPhone\s+(17[\s-]+Air|Air|17e|17\s+Pro\s+Max|17\s+Pro|17)\s+(\d+(?:\s*Tb)?)\s+\(([^)]+)\)\s+(.+)$/i;

function parseIphone17(desc: string): ParsedIphone | null {
  const m = desc.trim().match(IPHONE17_RE);
  if (!m) return null;

  const modelPart = m[1].trim();
  const storageRaw = m[2];
  const simRaw = m[3];
  const colorRaw = m[4].trim();

  const mp = modelPart.toLowerCase().replace(/[\s-]+/g, ' ');
  let familyTitle: string;
  if (mp === '17 pro max') familyTitle = 'Apple iPhone 17 Pro Max';
  else if (mp === '17 pro') familyTitle = 'Apple iPhone 17 Pro';
  else if (mp === '17') familyTitle = 'Apple iPhone 17';
  else if (mp === '17 air' || mp === 'air') familyTitle = 'Apple iPhone Air';
  else if (mp === '17e') familyTitle = 'Apple iPhone 17e';
  else return null;

  return {
    familyTitle,
    storage: normalizeStorage(storageRaw),
    colorLabel: resolveColorLabel(colorRaw, modelPart),
    optionKey: 'simType',
    optionValue: normalizeSim(simRaw),
    generation: '17',
  };
}

// ── iPhone 16 parser ────────────────────────────────────────────────
const IPHONE16_RE =
  /^iPhone\s+(16\s+Pro\s+Max|16\s+Plus|16\s+Pro|16e|16)\s+(\d+)\s*(?:Gb|GB)?\s+(.+)$/i;

function parseIphone16(desc: string): ParsedIphone | null {
  const m = desc.trim().match(IPHONE16_RE);
  if (!m) return null;

  const modelPart = m[1].trim();
  const storageRaw = m[2];
  let rest = m[3].trim();

  let market = 'EU';
  if (/\(2-sim\)/i.test(rest)) {
    market = 'Dual SIM';
    rest = rest.replace(/\(2-sim\)/i, '').trim();
  }
  // Remove trailing region markers
  rest = rest.replace(/\s+(EU|JP|US)$/i, '').trim();

  const colorRaw = rest;

  const mp = modelPart.toLowerCase().replace(/\s+/g, ' ');
  let familyTitle: string;
  if (mp === '16 pro max') familyTitle = 'Apple iPhone 16 Pro Max';
  else if (mp === '16 plus') familyTitle = 'Apple iPhone 16 Plus';
  else if (mp === '16 pro') familyTitle = 'Apple iPhone 16 Pro';
  else if (mp === '16e') familyTitle = 'Apple iPhone 16e';
  else if (mp === '16') familyTitle = 'Apple iPhone 16';
  else return null;

  return {
    familyTitle,
    storage: normalizeStorage(storageRaw),
    colorLabel: resolveColorLabel(colorRaw, modelPart),
    optionKey: 'market',
    optionValue: market,
    generation: '16',
  };
}

// ── Combined iPhone parser ──────────────────────────────────────────
function parseIphoneDescription(desc: string): ParsedIphone | null {
  return parseIphone17(desc) || parseIphone16(desc);
}

// ══════════════════════════════════════════════════════════════════════
// ── APPLE WATCH — LINE DETECTION + AUTO-CREATE ───────────────────────
// ══════════════════════════════════════════════════════════════════════

interface ParsedWatchLine {
  line: string;
  familyTitle: string;
}

const WATCH_LINE_TITLE: Record<string, string> = {
  S10: 'Apple Watch Series 10',
  S11: 'Apple Watch Series 11',
  SE2: 'Apple Watch SE (2nd gen)',
  SE3: 'Apple Watch SE (3rd gen)',
  Ultra2: 'Apple Watch Ultra 2',
  Ultra3: 'Apple Watch Ultra 3',
};

const WATCH_LINE_PATTERNS: [RegExp, string][] = [
  [/\bUltra\s*3\b/i, 'Ultra3'],
  [/\bUltra\s*2\b/i, 'Ultra2'],
  [/\bSE\s*3\b/i, 'SE3'],
  [/\bSE\s*2\b/i, 'SE2'],
  [/\bS11\b/i, 'S11'],
  [/\bS10\b/i, 'S10'],
];

const WATCH_ACCESSORY_RE =
  /charger|заряд|usb|cable|кабел|adapter|адаптер/i;

function parseWatchLine(desc: string): ParsedWatchLine | null {
  for (const [re, line] of WATCH_LINE_PATTERNS) {
    if (re.test(desc)) {
      const familyTitle = WATCH_LINE_TITLE[line];
      if (familyTitle) return { line, familyTitle };
    }
  }
  return null;
}

// ══════════════════════════════════════════════════════════════════════
// ── AIRPODS PARSER ──────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════

interface ParsedAirPods {
  familyTitle: string;
  isMax: boolean;
  colorLabel?: string;
}

const AIRPODS_ACCESSORY_RE = /charger|заряд|usb|cable|кабел|adapter|адаптер|чехол|case/i;

const AIRPODS_MAX_COLORS: Record<string, string> = {
  midnight: 'Midnight',
  starlight: 'Starlight',
  orange: 'Orange',
  purple: 'Purple',
  blue: 'Blue',
  'space gray': 'Space Gray',
  silver: 'Silver',
  green: 'Green',
  pink: 'Pink',
  'sky blue': 'Sky Blue',
};

function parseAirPods(desc: string): ParsedAirPods | null {
  const d = desc.toLowerCase();

  if (/airpods\s*max/i.test(desc)) {
    let colorLabel: string | undefined;
    for (const [key, label] of Object.entries(AIRPODS_MAX_COLORS)) {
      if (d.includes(key)) { colorLabel = label; break; }
    }
    return { familyTitle: 'Apple AirPods Max', isMax: true, colorLabel };
  }

  if (/airpods\s*pro\s*3/i.test(desc))
    return { familyTitle: 'Apple AirPods Pro 3', isMax: false };

  if (/airpods\s*pro\s*(?:2|\(2)/i.test(desc))
    return { familyTitle: 'Apple AirPods Pro 2', isMax: false };

  if (/airpods\s*4/i.test(desc)) {
    if (/anc|noise\s*cancell|шумоподав/i.test(desc))
      return { familyTitle: 'Apple AirPods 4 (ANC)', isMax: false };
    return { familyTitle: 'Apple AirPods 4', isMax: false };
  }

  return null;
}

// ══════════════════════════════════════════════════════════════════════
// ── HANDLER ──────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════

const OTHER_XMLID_CATEGORIES = ['ipad', 'macbook'];

function normalizeXmlid(raw: string): string {
  return raw.replace(/^0+/, '') || '0';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { items, mode } = (await req.json()) as RequestBody;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No items provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const now = new Date().toISOString();

    // ── iPhone accumulators ─────────────────────────────────────────
    let updatedCount = 0;
    const matched: { xmlid: string; description: string; price: number; familyTitle?: string }[] = [];
    const notFound: { xmlid: string; description: string; price: number }[] = [];
    const errors: string[] = [];

    // ── Watch accumulators ──────────────────────────────────────────
    let watchUpdatedCount = 0;
    let watchCreatedCount = 0;
    let watchSkippedCount = 0;
    const watchCreated: { xmlid: string; description: string; price: number; familyTitle?: string }[] = [];
    const watchNotFound: { xmlid: string; description: string; price: number }[] = [];

    // ── AirPods accumulators ────────────────────────────────────────
    let airpodsUpdatedCount = 0;
    let airpodsCreatedCount = 0;
    let airpodsMaxUpdatedCount = 0;
    let airpodsMaxColorMatchedCount = 0;
    let airpodsSkippedCount = 0;
    const airpodsNotFound: { xmlid: string; description: string; price: number }[] = [];
    const airpodsMaxNotFound: { xmlid: string; description: string; price: number }[] = [];

    // ── Split items: iPhone / Watch / AirPods / Other ────────────────
    const iphoneItems: (PriceItem & { parsed: ParsedIphone })[] = [];
    const watchItems: (PriceItem & { parsed: ParsedWatchLine })[] = [];
    const airpodsItems: (PriceItem & { parsed: ParsedAirPods })[] = [];
    const otherItems: PriceItem[] = [];

    for (const item of items) {
      // 1) iPhone
      if (item.categoryGuess === 'iphone') {
        const parsed = parseIphoneDescription(item.description);
        if (parsed) {
          iphoneItems.push({ ...item, parsed });
        } else {
          notFound.push({ xmlid: item.xmlid, description: item.description, price: item.price });
          errors.push(`Parse fail: "${item.description}"`);
        }
      // 2) Watch
      } else if (/apple\s*watch/i.test(item.description)) {
        if (WATCH_ACCESSORY_RE.test(item.description)) {
          watchSkippedCount++;
          continue;
        }
        const parsed = parseWatchLine(item.description);
        if (parsed) {
          watchItems.push({ ...item, parsed });
        } else {
          watchNotFound.push({ xmlid: item.xmlid, description: item.description, price: item.price });
        }
      // 3) AirPods
      } else if (/air\s*pods/i.test(item.description)) {
        if (AIRPODS_ACCESSORY_RE.test(item.description)) {
          airpodsSkippedCount++;
          continue;
        }
        const parsed = parseAirPods(item.description);
        if (parsed) {
          airpodsItems.push({ ...item, parsed });
        } else {
          airpodsNotFound.push({ xmlid: item.xmlid, description: item.description, price: item.price });
        }
      // 4) Everything else
      } else {
        otherItems.push(item);
      }
    }

    // ════════════════════════════════════════════════════════════════
    // ── IPHONE LOGIC (both gen 16 and 17) — UNCHANGED ──────────────
    // ════════════════════════════════════════════════════════════════
    if (iphoneItems.length > 0) {
      const uniqueTitles = [...new Set(iphoneItems.map((i) => i.parsed.familyTitle))];
      const { data: families, error: famErr } = await supabase
        .from('product_families')
        .select('id, title')
        .in('title', uniqueTitles);

      if (famErr) {
        errors.push(`Fetch iPhone families error: ${famErr.message}`);
      } else {
        const titleToId = new Map<string, string>();
        for (const f of families || []) titleToId.set(f.title, f.id);

        // For sync_stock we also need ALL families in the affected generations
        const has16 = iphoneItems.some((i) => i.parsed.generation === '16');
        const has17 = iphoneItems.some((i) => i.parsed.generation === '17');

        let syncFamilyIds: string[] = [];
        if (mode === 'sync_stock') {
          const orClauses: string[] = [];
          if (has16) orClauses.push('title.like.Apple iPhone 16%');
          if (has17) {
            orClauses.push('title.like.Apple iPhone 17%');
            orClauses.push('title.like.Apple iPhone Air%');
          }
          if (orClauses.length > 0) {
            const { data: syncFamilies, error: syncErr } = await supabase
              .from('product_families')
              .select('id')
              .or(orClauses.join(','));
            if (syncErr) {
              errors.push(`Fetch sync families error: ${syncErr.message}`);
            } else {
              syncFamilyIds = (syncFamilies || []).map((f: { id: string }) => f.id);
            }
          }
        }

        // Fetch all variants for matched + sync families
        const allFamilyIds = [...new Set([
          ...titleToId.values(),
          ...syncFamilyIds,
        ])];
        const { data: allVariants, error: varErr } = allFamilyIds.length > 0
          ? await supabase
              .from('variants')
              .select('id, family_id, options, supplier_xmlid')
              .in('family_id', allFamilyIds)
          : { data: [] as any[], error: null };

        if (varErr) {
          errors.push(`Fetch iPhone variants error: ${varErr.message}`);
        } else {
          // sync_stock: mark ALL variants of affected generations as out-of-stock
          if (mode === 'sync_stock' && syncFamilyIds.length > 0) {
            const syncFamilySet = new Set(syncFamilyIds);
            const idsToDisable = (allVariants || [])
              .filter((v: { family_id: string }) => syncFamilySet.has(v.family_id))
              .map((v: { id: string }) => v.id);
            if (idsToDisable.length > 0) {
              const batchSize = 200;
              for (let i = 0; i < idsToDisable.length; i += batchSize) {
                const batch = idsToDisable.slice(i, i + batchSize);
                const { error: offErr } = await supabase
                  .from('variants')
                  .update({ in_stock: false, updated_at: now })
                  .in('id', batch);
                if (offErr) errors.push(`iPhone stock-off error: ${offErr.message}`);
              }
            }
          }

          // Build lookup index — key adapts to the option field each variant uses
          const variantIndex = new Map<string, { id: string; supplier_xmlid: string | null }>();
          for (const v of allVariants || []) {
            const opts = v.options as Record<string, string>;
            const matchVal = opts.market ?? opts.simType ?? '';
            const key = `${v.family_id}|${opts.storage || ''}|${matchVal}|${opts.colorLabel || ''}`;
            variantIndex.set(key, { id: v.id, supplier_xmlid: v.supplier_xmlid });
          }

          // Match each iPhone item
          for (const item of iphoneItems) {
            const { parsed } = item;
            const familyId = titleToId.get(parsed.familyTitle);
            if (!familyId) {
              notFound.push({ xmlid: item.xmlid, description: item.description, price: item.price });
              continue;
            }

            const lookupKey = `${familyId}|${parsed.storage}|${parsed.optionValue}|${parsed.colorLabel}`;
            const found = variantIndex.get(lookupKey);

            if (!found) {
              notFound.push({ xmlid: item.xmlid, description: item.description, price: item.price });
              continue;
            }

            const updatePayload: Record<string, unknown> = {
              price: item.price,
              in_stock: true,
              supplier_xmlid: item.xmlid,
              updated_at: now,
            };

            const { error: updateErr } = await supabase
              .from('variants')
              .update(updatePayload)
              .eq('id', found.id);

            if (updateErr) {
              errors.push(`Update iPhone xmlid=${item.xmlid}: ${updateErr.message}`);
            } else {
              updatedCount++;
              matched.push({
                xmlid: item.xmlid,
                description: item.description,
                price: item.price,
                familyTitle: parsed.familyTitle,
              });
            }
          }
        }
      }
    }

    // ════════════════════════════════════════════════════════════════
    // ── APPLE WATCH: UPDATE-BY-XMLID OR AUTO-CREATE ────────────────
    // ════════════════════════════════════════════════════════════════
    if (watchItems.length > 0) {
      // 1) Resolve watch family titles → IDs
      const watchTitles = [...new Set(watchItems.map((i) => i.parsed.familyTitle))];
      const { data: watchFamilies, error: wfErr } = await supabase
        .from('product_families')
        .select('id, title')
        .in('title', watchTitles);

      if (wfErr) {
        errors.push(`Fetch Watch families error: ${wfErr.message}`);
      } else {
        const wTitleToId = new Map<string, string>();
        for (const f of watchFamilies || []) wTitleToId.set(f.title, f.id);

        // 2) sync_stock: disable ALL watch variants before processing
        if (mode === 'sync_stock') {
          const { data: allWatchFams, error: awfErr } = await supabase
            .from('product_families')
            .select('id')
            .eq('category', 'watch');
          if (awfErr) {
            errors.push(`Fetch all watch families error: ${awfErr.message}`);
          } else {
            const allWatchFamilyIds = (allWatchFams || []).map((f: { id: string }) => f.id);
            if (allWatchFamilyIds.length > 0) {
              const { data: watchVars } = await supabase
                .from('variants')
                .select('id')
                .in('family_id', allWatchFamilyIds);
              const idsToDisable = (watchVars || []).map((v: { id: string }) => v.id);
              const batchSize = 200;
              for (let i = 0; i < idsToDisable.length; i += batchSize) {
                const batch = idsToDisable.slice(i, i + batchSize);
                const { error: offErr } = await supabase
                  .from('variants')
                  .update({ in_stock: false, updated_at: now })
                  .in('id', batch);
                if (offErr) errors.push(`Watch stock-off error: ${offErr.message}`);
              }
            }
          }
        }

        // 3) Batch-fetch existing variants by supplier_xmlid (normalized)
        const existingMap = new Map<string, { id: string; options: Record<string, unknown> }>();
        const batchSize = 200;
        const allWatchXmlids = watchItems.map((i) => i.xmlid);
        const allWatchXmlidsExpanded = [...new Set([
          ...allWatchXmlids,
          ...allWatchXmlids.map(normalizeXmlid),
        ])];
        for (let i = 0; i < allWatchXmlidsExpanded.length; i += batchSize) {
          const batch = allWatchXmlidsExpanded.slice(i, i + batchSize);
          const { data: rows } = await supabase
            .from('variants')
            .select('id, options, supplier_xmlid')
            .in('supplier_xmlid', batch);
          for (const v of rows || []) {
            existingMap.set(normalizeXmlid(v.supplier_xmlid), {
              id: v.id,
              options: (v.options as Record<string, unknown>) || {},
            });
          }
        }

        // 4) Process each watch item: update or create
        for (const item of watchItems) {
          const existing = existingMap.get(normalizeXmlid(item.xmlid));

          if (existing) {
            const mergedOptions = {
              ...existing.options,
              raw: item.description,
              supplierTitle: item.description,
            };
            const { error: upErr } = await supabase
              .from('variants')
              .update({
                price: item.price,
                in_stock: true,
                supplier_xmlid: item.xmlid,
                options: mergedOptions,
                updated_at: now,
              })
              .eq('id', existing.id);

            if (upErr) {
              errors.push(`Watch update xmlid=${item.xmlid}: ${upErr.message}`);
            } else {
              watchUpdatedCount++;
            }
          } else {
            // ── AUTO-CREATE new variant ─────────────────────────────
            const familyId = wTitleToId.get(item.parsed.familyTitle);
            if (!familyId) {
              watchNotFound.push({
                xmlid: item.xmlid,
                description: item.description,
                price: item.price,
              });
              continue;
            }

            const { error: insErr } = await supabase
              .from('variants')
              .insert({
                family_id: familyId,
                options: {
                  line: item.parsed.line,
                  raw: item.description,
                  supplierTitle: item.description,
                },
                images: [],
                price: item.price,
                in_stock: true,
                sku_code: `watch-${item.parsed.line.toLowerCase()}-${item.xmlid}`,
                supplier_xmlid: item.xmlid,
              });

            if (insErr) {
              errors.push(`Watch create xmlid=${item.xmlid}: ${insErr.message}`);
            } else {
              watchCreatedCount++;
              watchCreated.push({
                xmlid: item.xmlid,
                description: item.description,
                price: item.price,
                familyTitle: item.parsed.familyTitle,
              });
            }
          }
        }
      }
    }

    // ════════════════════════════════════════════════════════════════
    // ── AIRPODS: UPDATE-BY-XMLID OR AUTO-CREATE / COLOR-MATCH ──────
    // ════════════════════════════════════════════════════════════════
    if (airpodsItems.length > 0) {
      const airpodsTitles = [...new Set(airpodsItems.map((i) => i.parsed.familyTitle))];
      const { data: apFamilies, error: apfErr } = await supabase
        .from('product_families')
        .select('id, title')
        .in('title', airpodsTitles);

      if (apfErr) {
        errors.push(`Fetch AirPods families error: ${apfErr.message}`);
      } else {
        const apTitleToId = new Map<string, string>();
        for (const f of apFamilies || []) apTitleToId.set(f.title, f.id);

        // sync_stock: disable ALL airpods variants
        if (mode === 'sync_stock') {
          const { data: allApFams } = await supabase
            .from('product_families')
            .select('id')
            .eq('category', 'airpods');
          const allApFamilyIds = (allApFams || []).map((f: { id: string }) => f.id);
          if (allApFamilyIds.length > 0) {
            const { data: apVars } = await supabase
              .from('variants')
              .select('id')
              .in('family_id', allApFamilyIds);
            const idsToDisable = (apVars || []).map((v: { id: string }) => v.id);
            for (let i = 0; i < idsToDisable.length; i += 200) {
              const batch = idsToDisable.slice(i, i + 200);
              const { error: offErr } = await supabase
                .from('variants')
                .update({ in_stock: false, updated_at: now })
                .in('id', batch);
              if (offErr) errors.push(`AirPods stock-off error: ${offErr.message}`);
            }
          }
        }

        // Batch-fetch existing variants by supplier_xmlid (normalized)
        const apExistingMap = new Map<string, { id: string; options: Record<string, unknown> }>();
        const allApXmlids = airpodsItems.map((i) => i.xmlid);
        const allApXmlidsExpanded = [...new Set([
          ...allApXmlids,
          ...allApXmlids.map(normalizeXmlid),
        ])];
        for (let i = 0; i < allApXmlidsExpanded.length; i += 200) {
          const batch = allApXmlidsExpanded.slice(i, i + 200);
          const { data: rows } = await supabase
            .from('variants')
            .select('id, options, supplier_xmlid')
            .in('supplier_xmlid', batch);
          for (const v of rows || []) {
            apExistingMap.set(normalizeXmlid(v.supplier_xmlid), {
              id: v.id,
              options: (v.options as Record<string, unknown>) || {},
            });
          }
        }

        // Also fetch Max variants for color matching
        const maxFamilyId = apTitleToId.get('Apple AirPods Max');
        let maxVariants: { id: string; options: Record<string, string>; supplier_xmlid: string | null }[] = [];
        if (maxFamilyId) {
          const { data: mv } = await supabase
            .from('variants')
            .select('id, options, supplier_xmlid')
            .eq('family_id', maxFamilyId);
          maxVariants = (mv || []) as typeof maxVariants;
        }

        for (const item of airpodsItems) {
          const existing = apExistingMap.get(normalizeXmlid(item.xmlid));

          if (existing) {
            const mergedOptions = {
              ...existing.options,
              raw: item.description,
              supplierTitle: item.description,
            };
            const { error: upErr } = await supabase
              .from('variants')
              .update({ price: item.price, in_stock: true, supplier_xmlid: item.xmlid, options: mergedOptions, updated_at: now })
              .eq('id', existing.id);

            if (upErr) {
              errors.push(`AirPods update xmlid=${item.xmlid}: ${upErr.message}`);
            } else {
              if (item.parsed.isMax) airpodsMaxUpdatedCount++;
              else airpodsUpdatedCount++;
            }
          } else if (item.parsed.isMax) {
            // AirPods Max: try color matching
            if (item.parsed.colorLabel) {
              const colorMatch = maxVariants.find(
                (v) => v.options?.colorLabel === item.parsed.colorLabel && !v.supplier_xmlid,
              ) || maxVariants.find(
                (v) => v.options?.colorLabel === item.parsed.colorLabel,
              );
              if (colorMatch) {
                const { error: upErr } = await supabase
                  .from('variants')
                  .update({
                    price: item.price,
                    in_stock: true,
                    supplier_xmlid: item.xmlid,
                    options: { ...colorMatch.options, raw: item.description, supplierTitle: item.description },
                    updated_at: now,
                  })
                  .eq('id', colorMatch.id);
                if (upErr) {
                  errors.push(`AirPods Max color match xmlid=${item.xmlid}: ${upErr.message}`);
                } else {
                  airpodsMaxColorMatchedCount++;
                }
                continue;
              }
            }
            airpodsMaxNotFound.push({ xmlid: item.xmlid, description: item.description, price: item.price });
          } else {
            // AirPods non-Max: AUTO-CREATE
            const familyId = apTitleToId.get(item.parsed.familyTitle);
            if (!familyId) {
              airpodsNotFound.push({ xmlid: item.xmlid, description: item.description, price: item.price });
              continue;
            }
            const { error: insErr } = await supabase
              .from('variants')
              .insert({
                family_id: familyId,
                options: { raw: item.description, supplierTitle: item.description },
                images: [],
                price: item.price,
                in_stock: true,
                sku_code: `airpods-${item.xmlid}`,
                supplier_xmlid: item.xmlid,
              });
            if (insErr) {
              errors.push(`AirPods create xmlid=${item.xmlid}: ${insErr.message}`);
            } else {
              airpodsCreatedCount++;
            }
          }
        }
      }
    }

    // ════════════════════════════════════════════════════════════════
    // ── OTHER CATEGORIES (existing supplier_xmlid logic) ───────────
    // ════════════════════════════════════════════════════════════════
    if (otherItems.length > 0) {
      const batchSize = 50;
      for (let i = 0; i < otherItems.length; i += batchSize) {
        const batch = otherItems.slice(i, i + batchSize);
        const xmlids = batch.map((b) => b.xmlid);
        const xmlidsExpanded = [...new Set([...xmlids, ...xmlids.map(normalizeXmlid)])];

        const { data: existingVariants, error: fetchErr } = await supabase
          .from('variants')
          .select('id, supplier_xmlid')
          .in('supplier_xmlid', xmlidsExpanded);

        if (fetchErr) {
          errors.push(`Fetch error batch ${i}: ${fetchErr.message}`);
          continue;
        }

        const existingMap = new Map<string, string>();
        for (const v of existingVariants || []) {
          existingMap.set(normalizeXmlid(v.supplier_xmlid), v.id);
        }

        for (const item of batch) {
          const variantId = existingMap.get(normalizeXmlid(item.xmlid));
          if (!variantId) {
            notFound.push({ xmlid: item.xmlid, description: item.description, price: item.price });
            continue;
          }

          const updatePayload: Record<string, unknown> = {
            price: item.price,
            updated_at: now,
          };
          if (mode === 'sync_stock') {
            updatePayload.in_stock = true;
          }

          const { error: updateErr } = await supabase
            .from('variants')
            .update(updatePayload)
            .eq('id', variantId);

          if (updateErr) {
            errors.push(`Update error xmlid=${item.xmlid}: ${updateErr.message}`);
          } else {
            updatedCount++;
            matched.push({ xmlid: item.xmlid, description: item.description, price: item.price });
          }
        }
      }

      // sync_stock for non-iPhone, non-Watch categories (ipad, airpods, macbook)
      if (mode === 'sync_stock') {
        const { data: otherFamilies, error: famErr } = await supabase
          .from('product_families')
          .select('id')
          .in('category', OTHER_XMLID_CATEGORIES);

        if (famErr) {
          errors.push(`Fetch other families error: ${famErr.message}`);
        } else if (otherFamilies && otherFamilies.length > 0) {
          const familyIds = otherFamilies.map((f: { id: string }) => f.id);

          const { data: toDisable, error: disableErr } = await supabase
            .from('variants')
            .select('id, supplier_xmlid')
            .in('family_id', familyIds)
            .not('supplier_xmlid', 'is', null)
            .eq('in_stock', true);

          if (disableErr) {
            errors.push(`Fetch variants to disable error: ${disableErr.message}`);
          } else if (toDisable) {
            const fileXmlids = new Set(otherItems.map((i) => i.xmlid));
            const idsToDisable = toDisable
              .filter((v: { supplier_xmlid: string }) => !fileXmlids.has(v.supplier_xmlid))
              .map((v: { id: string }) => v.id);

            if (idsToDisable.length > 0) {
              const { error: bulkErr } = await supabase
                .from('variants')
                .update({ in_stock: false, updated_at: now })
                .in('id', idsToDisable);

              if (bulkErr) errors.push(`Bulk disable error: ${bulkErr.message}`);
            }
          }
        }
      }
    }

    // ════════════════════════════════════════════════════════════════
    // ── CLEANUP: remove orphan seed variants (no xmlid, price=0)
    //    + deduplicate variants with same normalized xmlid
    // ════════════════════════════════════════════════════════════════
    {
      const { data: orphans } = await supabase
        .from('variants')
        .select('id')
        .is('supplier_xmlid', null)
        .eq('price', 0)
        .eq('in_stock', false);
      const orphanIds = (orphans || []).map((o: { id: string }) => o.id);
      if (orphanIds.length > 0) {
        for (let i = 0; i < orphanIds.length; i += 200) {
          const batch = orphanIds.slice(i, i + 200);
          await supabase.from('variants').delete().in('id', batch);
        }
      }

      const { data: allVars } = await supabase
        .from('variants')
        .select('id, supplier_xmlid, in_stock')
        .not('supplier_xmlid', 'is', null);
      if (allVars) {
        const grouped = new Map<string, typeof allVars>();
        for (const v of allVars) {
          const key = normalizeXmlid(v.supplier_xmlid);
          if (!grouped.has(key)) grouped.set(key, []);
          grouped.get(key)!.push(v);
        }
        const dupeIdsToDelete: string[] = [];
        for (const [, group] of grouped) {
          if (group.length <= 1) continue;
          const inStock = group.find((v) => v.in_stock);
          const keep = inStock || group[0];
          for (const v of group) {
            if (v.id !== keep.id) dupeIdsToDelete.push(v.id);
          }
        }
        if (dupeIdsToDelete.length > 0) {
          for (let i = 0; i < dupeIdsToDelete.length; i += 200) {
            const batch = dupeIdsToDelete.slice(i, i + 200);
            await supabase.from('variants').delete().in('id', batch);
          }
        }
      }
    }

    // ════════════════════════════════════════════════════════════════
    // ── RESPONSE ───────────────────────────────────────────────────
    // ════════════════════════════════════════════════════════════════
    const result = {
      updatedCount,
      notFoundCount: notFound.length,
      matchedExamples: matched.slice(0, 10),
      notFoundExamples: notFound.slice(0, 10),
      notFound,
      errors,
      watch: {
        updatedCount: watchUpdatedCount,
        createdCount: watchCreatedCount,
        skippedCount: watchSkippedCount,
        notFoundCount: watchNotFound.length,
        createdExamples: watchCreated.slice(0, 5),
        notFoundExamples: watchNotFound.slice(0, 5),
      },
      airpods: {
        updatedCount: airpodsUpdatedCount,
        createdCount: airpodsCreatedCount,
        maxUpdatedCount: airpodsMaxUpdatedCount,
        maxColorMatchedCount: airpodsMaxColorMatchedCount,
        skippedCount: airpodsSkippedCount,
        notFoundCount: airpodsNotFound.length,
        notFoundExamples: airpodsNotFound.slice(0, 10),
        maxNotFoundCount: airpodsMaxNotFound.length,
        maxNotFoundExamples: airpodsMaxNotFound.slice(0, 10),
      },
    };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
