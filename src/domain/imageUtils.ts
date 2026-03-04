import type { ProductFamily, Variant } from './types';

export function normalizeColorKey(value: string | undefined | null): string {
  if (!value) return '';
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
}

/**
 * Resolve the best images for a variant, following the priority chain:
 * 1) variant.images (if non-empty)
 * 2) family.imagesByColor[colorKey] (if exists)
 * 3) family.images (cover)
 * 4) empty array
 */
export function getDisplayImages(
  variant: Variant | null | undefined,
  family: ProductFamily | null | undefined,
): string[] {
  if (variant?.images?.length) return variant.images;

  if (family && variant) {
    const colorKey =
      normalizeColorKey(variant.options?.color) ||
      normalizeColorKey(variant.options?.colorLabel);
    if (colorKey && family.imagesByColor?.[colorKey]?.length) {
      return family.imagesByColor[colorKey];
    }
  }

  if (family?.images?.length) return family.images;

  return [];
}

export function getFirstImage(
  variant: Variant | null | undefined,
  family: ProductFamily | null | undefined,
): string {
  return getDisplayImages(variant, family)[0] || '/placeholder.png';
}
