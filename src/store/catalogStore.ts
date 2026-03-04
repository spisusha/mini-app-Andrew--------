import { create } from 'zustand';
import type { ProductFamily, Variant, SortOption } from '../domain/types';
import { fetchFamilies, fetchVariants } from '../api/catalogRepo';

interface CatalogState {
  families: ProductFamily[];
  variants: Variant[];
  loading: boolean;
  loaded: boolean;
  sort: SortOption;
  setSort: (s: SortOption) => void;
  load: () => Promise<void>;
}

export const useCatalogStore = create<CatalogState>()((set, get) => ({
  families: [],
  variants: [],
  loading: false,
  loaded: false,
  sort: 'popularity',

  setSort: (sort) => set({ sort }),

  load: async () => {
    if (get().loaded || get().loading) return;
    set({ loading: true });
    const [families, variants] = await Promise.all([fetchFamilies(), fetchVariants()]);
    set({ families, variants, loading: false, loaded: true });
  },
}));
