import { supabase } from './supabaseClient';
import { mockFamilies, mockVariants } from './mockData';
import type { ProductFamily, Variant, Category } from '../domain/types';

const CATEGORY_MAP: Record<string, Category> = {
  iphone: 'iPhone',
  ipad: 'iPad',
  macbook: 'MacBook',
  watch: 'Watch',
  airpods: 'AirPods',
};

function normalizeCategory(raw: string): Category {
  return CATEGORY_MAP[raw.toLowerCase()] ?? (raw as Category);
}

function normalizeFamilyImages(raw: unknown): { images: string[]; imagesByColor: Record<string, string[]> } {
  if (Array.isArray(raw)) return { images: raw as string[], imagesByColor: {} };
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const obj = raw as Record<string, unknown>;
    return {
      images: Array.isArray(obj.cover) ? (obj.cover as string[]) : [],
      imagesByColor: (obj.byColor as Record<string, string[]>) || {},
    };
  }
  return { images: [], imagesByColor: {} };
}

export async function fetchFamilies(): Promise<ProductFamily[]> {
  if (!supabase) return mockFamilies;
  const { data, error } = await supabase
    .from('product_families')
    .select('*')
    .order('popularity_score', { ascending: false });
  if (error) {
    console.error('fetchFamilies error', error);
    return mockFamilies;
  }
  return (data as ProductFamily[]).map((f) => {
    const { images, imagesByColor } = normalizeFamilyImages((f as any).images);
    return { ...f, category: normalizeCategory(f.category), images, imagesByColor };
  });
}

export async function fetchVariants(): Promise<Variant[]> {
  if (!supabase) return mockVariants;
  const { data, error } = await supabase.from('variants').select('*');
  if (error) {
    console.error('fetchVariants error', error);
    return mockVariants;
  }
  return data as Variant[];
}

export async function fetchFamilyById(id: string): Promise<ProductFamily | null> {
  if (!supabase) return mockFamilies.find((f) => f.id === id) ?? null;
  const { data, error } = await supabase
    .from('product_families')
    .select('*')
    .eq('id', id)
    .single();
  if (error) return null;
  const f = data as ProductFamily;
  const { images, imagesByColor } = normalizeFamilyImages((f as any).images);
  return { ...f, category: normalizeCategory(f.category), images, imagesByColor };
}

export async function fetchVariantsByFamily(familyId: string): Promise<Variant[]> {
  if (!supabase) return mockVariants.filter((v) => v.family_id === familyId);
  const { data, error } = await supabase
    .from('variants')
    .select('*')
    .eq('family_id', familyId);
  if (error) return [];
  return data as Variant[];
}
