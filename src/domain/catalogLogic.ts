import type { Variant, VariantOptions, Category, CatalogStep } from './types';

export const CATALOG_STEPS: Record<Category, string[]> = {
  iPhone: ['model', 'storage', 'color', 'simType'],
  iPad: ['model', 'size', 'storage', 'connectivity', 'color'],
  MacBook: ['model', 'size', 'chip'],
  Watch: ['model', 'size', 'connectivity', 'color'],
  AirPods: ['model', 'anc', 'color'],
};

const STEP_LABELS: Record<string, string> = {
  model: 'Модель',
  storage: 'Память',
  color: 'Цвет',
  simType: 'SIM',
  connectivity: 'Связь',
  size: 'Размер',
  chip: 'Чип',
  anc: 'Шумоподавление',
};

export function getStepLabel(key: string): string {
  return STEP_LABELS[key] || key;
}

export function getCatalogSteps(
  category: Category,
  variants: Variant[],
  selected: Record<string, string>
): CatalogStep[] {
  const keys = CATALOG_STEPS[category];
  const steps: CatalogStep[] = [];

  for (const key of keys) {
    let filtered = variants;
    for (const [sk, sv] of Object.entries(selected)) {
      if (sk === key) break;
      filtered = filtered.filter((v) => v.options[sk] === sv);
    }

    const values = [...new Set(
      filtered
        .map((v) => v.options[key])
        .filter((v): v is string => v !== undefined && v !== '')
    )].sort();

    if (values.length === 0) continue;
    steps.push({ key, label: getStepLabel(key), values });

    if (!selected[key]) break;
  }

  return steps;
}

function sortOptionValues(key: string, values: string[]): string[] {
  if (key === 'storage') {
    return values.sort((a, b) => Number(a) - Number(b));
  }
  return values.sort();
}

export function getAllOptionValues(
  variants: Variant[],
  familyId: string,
): Record<string, string[]> {
  const familyVariants = variants.filter((v) => v.family_id === familyId);
  const result: Record<string, string[]> = {};

  const optionKeys = new Set<string>();
  familyVariants.forEach((v) => {
    Object.keys(v.options).forEach((k) => {
      if (v.options[k]) optionKeys.add(k);
    });
  });

  for (const key of optionKeys) {
    result[key] = sortOptionValues(key, [...new Set(
      familyVariants.map((v) => v.options[key]).filter((v): v is string => !!v)
    )]);
  }

  return result;
}

export function getAvailableOptionValues(
  variants: Variant[],
  familyId: string,
  selectedOptions: Partial<VariantOptions>
): Record<string, string[]> {
  const familyVariants = variants.filter((v) => v.family_id === familyId);
  const result: Record<string, string[]> = {};

  const optionKeys = new Set<string>();
  familyVariants.forEach((v) => {
    Object.keys(v.options).forEach((k) => {
      if (v.options[k]) optionKeys.add(k);
    });
  });

  for (const key of optionKeys) {
    const compatible = familyVariants.filter((v) => {
      for (const [sk, sv] of Object.entries(selectedOptions)) {
        if (sk === key || !sv) continue;
        if (v.options[sk] !== sv) return false;
      }
      return true;
    });

    result[key] = sortOptionValues(key, [...new Set(
      compatible.map((v) => v.options[key]).filter((v): v is string => !!v)
    )]);
  }

  return result;
}

export function resolveVariant(
  variants: Variant[],
  familyId: string,
  selectedOptions: Partial<VariantOptions>
): Variant | null {
  const familyVariants = variants.filter((v) => v.family_id === familyId);
  const selectedEntries = Object.entries(selectedOptions).filter(([, v]) => !!v);

  return (
    familyVariants.find((v) => {
      return selectedEntries.every(([k, val]) => v.options[k] === val);
    }) ?? null
  );
}

export function filterVariants(
  variants: Variant[],
  filters: Record<string, string | undefined>,
  families: { id: string; category: string }[]
): Variant[] {
  const { category, ...rest } = filters;

  let result = variants;

  if (category) {
    const familyIds = new Set(families.filter((f) => f.category === category).map((f) => f.id));
    result = result.filter((v) => familyIds.has(v.family_id));
  }

  for (const [key, value] of Object.entries(rest)) {
    if (!value) continue;
    result = result.filter((v) => v.options[key] === value);
  }

  return result;
}

export function getMinPrice(variants: Variant[], familyId: string): number | null {
  const prices = variants.filter((v) => v.family_id === familyId && v.in_stock).map((v) => v.price);
  return prices.length ? Math.min(...prices) : null;
}

export function hasStock(variants: Variant[], familyId: string): boolean {
  return variants.some((v) => v.family_id === familyId && v.in_stock);
}
