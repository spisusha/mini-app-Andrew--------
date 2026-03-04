import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { CartItem } from '../domain/types';

interface CartState {
  items: CartItem[];
  add: (item: Omit<CartItem, 'qty'>) => void;
  remove: (variantId: string) => void;
  setQty: (variantId: string, qty: number) => void;
  clear: () => void;
  total: () => number;
  count: () => number;
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],

      add: (item) =>
        set((s) => {
          const existing = s.items.find((i) => i.variantId === item.variantId);
          if (existing) {
            return {
              items: s.items.map((i) =>
                i.variantId === item.variantId ? { ...i, qty: i.qty + 1 } : i
              ),
            };
          }
          return { items: [...s.items, { ...item, qty: 1 }] };
        }),

      remove: (variantId) =>
        set((s) => ({ items: s.items.filter((i) => i.variantId !== variantId) })),

      setQty: (variantId, qty) =>
        set((s) => {
          if (qty <= 0) return { items: s.items.filter((i) => i.variantId !== variantId) };
          return {
            items: s.items.map((i) => (i.variantId === variantId ? { ...i, qty } : i)),
          };
        }),

      clear: () => set({ items: [] }),

      total: () => get().items.reduce((sum, i) => sum + i.priceSnapshot * i.qty, 0),

      count: () => get().items.reduce((sum, i) => sum + i.qty, 0),
    }),
    { name: 'apple-cart' }
  )
);
