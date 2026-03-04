export interface ProductFamily {
  id: string;
  category: Category;
  title: string;
  description: string;
  images: string[];
  imagesByColor?: Record<string, string[]>;
  popularity_score: number;
  created_at: string;
}

export interface Variant {
  id: string;
  family_id: string;
  options: VariantOptions;
  price: number;
  in_stock: boolean;
  sku_code: string;
  images: string[];
  supplier_xmlid?: string;
  updated_at: string;
}

export interface VariantOptions {
  color?: string;
  storage?: string;
  simType?: string;
  connectivity?: string;
  size?: string;
  chip?: string;
  model?: string;
  anc?: string;
  [key: string]: string | undefined;
}

export type Category = 'iPhone' | 'iPad' | 'MacBook' | 'Watch' | 'AirPods';

export const ALL_CATEGORIES: Category[] = ['iPhone', 'iPad', 'MacBook', 'Watch', 'AirPods'];

export interface CartItem {
  variantId: string;
  familyId: string;
  titleSnapshot: string;
  optionsSnapshot: VariantOptions;
  priceSnapshot: number;
  image: string;
  qty: number;
}

export type DeliveryMethod = 'pickup' | 'delivery';
export type PaymentMethod = 'cash' | 'online';

export interface OrderPayload {
  items: CartItem[];
  totals: number;
  deliveryMethod: DeliveryMethod;
  address?: string;
  paymentMethod: PaymentMethod;
  tgUser?: TgUser | null;
  guestId?: string;
  createdAt: string;
}

export interface TgUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
}

export interface CatalogStep {
  key: string;
  label: string;
  values: string[];
}

export interface Filters {
  category?: Category;
  [key: string]: string | undefined;
}

export type SortOption = 'price_asc' | 'price_desc' | 'popularity' | 'newest';
