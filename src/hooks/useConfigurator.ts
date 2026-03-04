import { useState, useMemo, useEffect, useRef } from 'react';
import type { Variant } from '../domain/types';

export const CONF_COLOR_KEYS = new Set(['color', 'colorHex', 'colorLabel']);
export const CONF_SERVICE_KEYS = new Set(['raw', 'supplierTitle', 'line', 'market', '_xmlid_audit']);

export interface ColorEntry {
  color: string;
  hex: string;
  label: string;
}

export interface ConfiguratorState {
  hasColorOptions: boolean;
  colorEntries: ColorEntry[];
  selectedColorHex: string | undefined;
  selectedColorLabel: string | undefined;
  handleColorSelect: (entry: ColorEntry) => void;

  nonColorKeys: string[];
  allOptionValues: Record<string, string[]>;
  disabledOptionValues: Record<string, string[]>;
  selectedOptions: Record<string, string | undefined>;
  handleOptionChange: (key: string, val: string) => void;

  resolvedVariant: Variant | null;
  displayImages: string[];
  imgIdx: number;
  setImgIdx: (i: number) => void;
}

function sortValues(key: string, values: string[]): string[] {
  if (key === 'storage') return [...values].sort((a, b) => Number(a) - Number(b));
  return [...values].sort();
}

function variantToOpts(v: Variant): Record<string, string | undefined> {
  const opts: Record<string, string | undefined> = {};
  for (const [k, val] of Object.entries(v.options)) {
    if (CONF_SERVICE_KEYS.has(k)) continue;
    if (val) opts[k] = val;
  }
  return opts;
}

function extractNonColorOpts(opts: Record<string, string | undefined>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [k, v] of Object.entries(opts)) {
    if (v && !CONF_COLOR_KEYS.has(k) && !CONF_SERVICE_KEYS.has(k)) result[k] = v;
  }
  return result;
}

function findVariant(
  variants: Variant[],
  opts: Record<string, string | undefined>,
): Variant | null {
  const entries = Object.entries(opts).filter(([, v]) => !!v);
  if (!entries.length) return null;
  return variants.find((v) => entries.every(([k, val]) => v.options[k] === val)) ?? null;
}

function pickBestVariant(
  variants: Variant[],
  required: Record<string, string>,
  preferred: Array<[string, string | undefined]>,
): Variant | null {
  const prefDefined = preferred.filter((p): p is [string, string] => p[1] !== undefined);
  const inStock = variants.filter(
    (v) => v.in_stock && Object.entries(required).every(([k, val]) => v.options[k] === val),
  );

  if (inStock.length) {
    for (let take = prefDefined.length; take >= 0; take--) {
      const active = prefDefined.slice(0, take);
      const match = inStock.find((v) => active.every(([k, val]) => v.options[k] === val));
      if (match) return match;
    }
  }

  return variants.find((v) => Object.entries(required).every(([k, val]) => v.options[k] === val)) ?? null;
}

export function useConfigurator(variants: Variant[], familyImages: string[]): ConfiguratorState {
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string | undefined>>({});
  const [imgIdx, setImgIdx] = useState(0);

  // Remembers last working (sim+memory+…) per colorHex
  const lastGoodRef = useRef<Record<string, Record<string, string>>>({});

  const hasColorOptions = useMemo(() => variants.some((v) => !!v.options.colorHex), [variants]);

  const colorEntries = useMemo((): ColorEntry[] => {
    if (!hasColorOptions) return [];
    const seen = new Map<string, ColorEntry>();
    for (const v of variants) {
      const hex = v.options.colorHex;
      if (!hex) continue;
      const key = (v.options.color || v.options.colorLabel || hex).toLowerCase();
      if (seen.has(key)) continue;
      seen.set(key, { hex, color: v.options.color || '', label: v.options.colorLabel || v.options.color || hex });
    }
    return [...seen.values()];
  }, [variants, hasColorOptions]);

  const nonColorKeys = useMemo(() => {
    const keys = new Set<string>();
    variants.forEach((v) =>
      Object.keys(v.options).forEach((k) => {
        if (v.options[k] && !CONF_COLOR_KEYS.has(k) && !CONF_SERVICE_KEYS.has(k)) keys.add(k);
      }),
    );
    return [...keys];
  }, [variants]);

  const allOptionValues = useMemo(() => {
    const result: Record<string, string[]> = {};
    for (const key of nonColorKeys) {
      const raw = variants.map((v) => v.options[key]).filter((v): v is string => !!v);
      if (key === 'storage') {
        const nums = [...new Set(raw.map((v) => String(parseInt(v) || v)))];
        result[key] = nums.sort((a, b) => Number(a) - Number(b));
      } else {
        result[key] = sortValues(key, [...new Set(raw)]);
      }
    }
    return result;
  }, [variants, nonColorKeys]);

  // SIM depends only on color; storage depends on color+SIM; others check all
  const OPTION_DEPS: Record<string, string[]> = {
    simType: [],
    storage: ['simType'],
  };

  const disabledOptionValues = useMemo(() => {
    const result: Record<string, string[]> = {};
    const colorHex = selectedOptions.colorHex;

    for (const key of nonColorKeys) {
      const allVals = allOptionValues[key] ?? [];
      const deps = OPTION_DEPS[key];

      result[key] = allVals.filter((val) =>
        !variants.some((v) => {
          if (!v.in_stock || v.options[key] !== val) return false;
          if (colorHex && v.options.colorHex !== colorHex) return false;

          if (deps !== undefined) {
            for (const dk of deps) {
              const sv = selectedOptions[dk];
              if (sv && v.options[dk] !== sv) return false;
            }
          } else {
            for (const [k, sv] of Object.entries(selectedOptions)) {
              if (k === key || CONF_COLOR_KEYS.has(k) || !sv) continue;
              if (v.options[k] !== sv) return false;
            }
          }
          return true;
        }),
      );
    }
    return result;
  }, [variants, nonColorKeys, allOptionValues, selectedOptions]);

  // Init: first in-stock variant
  useEffect(() => {
    if (variants.length === 0 || Object.keys(selectedOptions).length > 0) return;
    const first = variants.find((v) => v.in_stock) ?? variants[0];
    if (!first) return;
    setSelectedOptions(variantToOpts(first));
  }, [variants]); // eslint-disable-line react-hooks/exhaustive-deps

  const resolvedVariant = useMemo(() => {
    const entries = Object.entries(selectedOptions).filter(([, v]) => !!v);
    if (!entries.length) return null;
    return variants.find((v) => entries.every(([k, val]) => v.options[k] === val)) ?? null;
  }, [variants, selectedOptions]);

  // Persist last good (in_stock) non-color combo per color
  useEffect(() => {
    if (!resolvedVariant?.in_stock) return;
    const hex = selectedOptions.colorHex;
    if (!hex) return;
    lastGoodRef.current[hex] = extractNonColorOpts(selectedOptions);
  }, [resolvedVariant, selectedOptions]);

  const displayImages = useMemo(() => {
    if (resolvedVariant?.images?.length) return resolvedVariant.images;
    const colorLabel = selectedOptions.colorLabel;
    if (colorLabel) {
      const match = variants.find((v) => v.options.colorLabel === colorLabel && v.images?.length);
      if (match?.images?.length) return match.images;
    }
    return familyImages;
  }, [resolvedVariant, selectedOptions.colorLabel, variants, familyImages]);

  const handleColorSelect = (entry: ColorEntry) => {
    setImgIdx(0);

    // Save current good combo BEFORE switching
    const curHex = selectedOptions.colorHex;
    if (curHex && resolvedVariant?.in_stock) {
      lastGoodRef.current[curHex] = extractNonColorOpts(selectedOptions);
    }

    const colorOpts: Record<string, string> = {
      color: entry.color,
      colorHex: entry.hex,
      colorLabel: entry.label,
    };

    // 1) Try remembered combo for this color
    const lastGood = lastGoodRef.current[entry.hex];
    if (lastGood) {
      const found = findVariant(variants, { ...colorOpts, ...lastGood });
      if (found?.in_stock) { setSelectedOptions(variantToOpts(found)); return; }
    }

    // 2) Try keeping current non-color opts
    const curNonColor = extractNonColorOpts(selectedOptions);
    const found2 = findVariant(variants, { ...colorOpts, ...curNonColor });
    if (found2?.in_stock) { setSelectedOptions(variantToOpts(found2)); return; }

    // 3) Soft fallback: fix color, prefer remembered then current
    const preferred: Array<[string, string | undefined]> = nonColorKeys.map(
      (k) => [k, lastGood?.[k] ?? curNonColor[k]],
    );
    const best = pickBestVariant(variants, { colorHex: entry.hex }, preferred);
    if (best) { setSelectedOptions(variantToOpts(best)); return; }

    // 4) Nothing at all — just set color
    setSelectedOptions((prev) => ({ ...prev, ...colorOpts }));
  };

  /**
   * Minimal option change: fix color + changed key, keep others if possible.
   * Only adjust other options when the exact combo doesn't exist.
   */
  const handleOptionChange = (key: string, val: string) => {
    // 1) Try swapping just this one key
    const tryOpts = { ...selectedOptions, [key]: val };
    const direct = findVariant(variants, tryOpts);
    if (direct) { setSelectedOptions(variantToOpts(direct)); return; }

    // 2) Fix color + changed key, adjust others
    const colorHex = selectedOptions.colorHex;
    const required: Record<string, string> = { [key]: val };
    if (colorHex) required.colorHex = colorHex;

    const preferred: Array<[string, string | undefined]> = nonColorKeys
      .filter((k) => k !== key)
      .map((k) => [k, selectedOptions[k]]);

    const best = pickBestVariant(variants, required, preferred);
    if (best) { setSelectedOptions(variantToOpts(best)); return; }

    // 3) No match — just set value
    setSelectedOptions((prev) => ({ ...prev, [key]: val }));
  };

  return {
    hasColorOptions,
    colorEntries,
    selectedColorHex: selectedOptions.colorHex,
    selectedColorLabel: selectedOptions.colorLabel,
    handleColorSelect,
    nonColorKeys,
    allOptionValues,
    disabledOptionValues,
    selectedOptions,
    handleOptionChange,
    resolvedVariant,
    displayImages,
    imgIdx,
    setImgIdx,
  };
}
