import type { ProductFamily, Variant } from '../domain/types';

export const mockFamilies: ProductFamily[] = [
  {
    id: 'fam-iphone-16-pro',
    category: 'iPhone',
    title: 'iPhone 16 Pro',
    description: 'Титановый корпус, чип A18 Pro, кнопка «Управление камерой»',
    images: [
      'https://store.storeimages.cdn-apple.com/1/as-images.apple.com/is/iphone-16-pro-finish-select-202409-6-3inch-deserttitanium?wid=400&hei=400&fmt=png-alpha',
      'https://store.storeimages.cdn-apple.com/1/as-images.apple.com/is/iphone-16-pro-finish-select-202409-6-3inch-naturaltitanium?wid=400&hei=400&fmt=png-alpha',
    ],
    popularity_score: 100,
    created_at: '2025-09-20T00:00:00Z',
  },
  {
    id: 'fam-iphone-16',
    category: 'iPhone',
    title: 'iPhone 16',
    description: 'Чип A18, Dynamic Island, 48 Мп камера',
    images: [
      'https://store.storeimages.cdn-apple.com/1/as-images.apple.com/is/iphone-16-finish-select-202409-6-1inch-ultramarine?wid=400&hei=400&fmt=png-alpha',
    ],
    popularity_score: 90,
    created_at: '2025-09-20T00:00:00Z',
  },
  {
    id: 'fam-iphone-15',
    category: 'iPhone',
    title: 'iPhone 15',
    description: 'Dynamic Island, 48 Мп, USB-C',
    images: [
      'https://store.storeimages.cdn-apple.com/1/as-images.apple.com/is/iphone-15-finish-select-202309-6-1inch-blue?wid=400&hei=400&fmt=png-alpha',
    ],
    popularity_score: 70,
    created_at: '2024-09-20T00:00:00Z',
  },
  {
    id: 'fam-ipad-air',
    category: 'iPad',
    title: 'iPad Air M2',
    description: 'Чип M2, 11" или 13" Liquid Retina',
    images: [
      'https://store.storeimages.cdn-apple.com/1/as-images.apple.com/is/ipad-air-select-wifi-blue-202405?wid=400&hei=400&fmt=png-alpha',
    ],
    popularity_score: 80,
    created_at: '2025-03-01T00:00:00Z',
  },
  {
    id: 'fam-macbook-air-m3',
    category: 'MacBook',
    title: 'MacBook Air M3',
    description: 'Чип M3, до 18ч автономности, 13" или 15"',
    images: [
      'https://store.storeimages.cdn-apple.com/1/as-images.apple.com/is/mba13-midnight-select-202402?wid=400&hei=400&fmt=png-alpha',
    ],
    popularity_score: 85,
    created_at: '2025-03-08T00:00:00Z',
  },
  {
    id: 'fam-watch-ultra-2',
    category: 'Watch',
    title: 'Apple Watch Ultra 2',
    description: 'Титановый корпус 49 мм, яркий дисплей, точный GPS',
    images: [
      'https://store.storeimages.cdn-apple.com/1/as-images.apple.com/is/watch-ultra-2-702702?wid=400&hei=400&fmt=png-alpha',
    ],
    popularity_score: 75,
    created_at: '2025-09-22T00:00:00Z',
  },
  {
    id: 'fam-airpods-pro-2',
    category: 'AirPods',
    title: 'AirPods Pro 2',
    description: 'Активное шумоподавление, адаптивный звук, USB-C',
    images: [
      'https://store.storeimages.cdn-apple.com/1/as-images.apple.com/is/airpods-pro-2-hero-select-202409?wid=400&hei=400&fmt=png-alpha',
    ],
    popularity_score: 88,
    created_at: '2025-09-09T00:00:00Z',
  },
  {
    id: 'fam-airpods-4',
    category: 'AirPods',
    title: 'AirPods 4',
    description: 'Открытый дизайн, персональный звук, USB-C',
    images: [
      'https://store.storeimages.cdn-apple.com/1/as-images.apple.com/is/airpods-4-hero-select-202409?wid=400&hei=400&fmt=png-alpha',
    ],
    popularity_score: 82,
    created_at: '2025-09-09T00:00:00Z',
  },
];

function v(
  id: string,
  family_id: string,
  options: Record<string, string>,
  price: number,
  in_stock: boolean,
  sku: string
): Variant {
  return { id, family_id, options, price, in_stock, sku_code: sku, images: [], updated_at: '2025-12-01T00:00:00Z' };
}

export const mockVariants: Variant[] = [
  // iPhone 16 Pro
  v('v1', 'fam-iphone-16-pro', { model: 'iPhone 16 Pro', storage: '256 ГБ', color: 'Титан пустыни', simType: 'eSIM' }, 129990, true, 'IP16P-256-DT-E'),
  v('v2', 'fam-iphone-16-pro', { model: 'iPhone 16 Pro', storage: '256 ГБ', color: 'Натуральный титан', simType: 'eSIM' }, 129990, true, 'IP16P-256-NT-E'),
  v('v3', 'fam-iphone-16-pro', { model: 'iPhone 16 Pro', storage: '512 ГБ', color: 'Титан пустыни', simType: 'eSIM' }, 149990, true, 'IP16P-512-DT-E'),
  v('v4', 'fam-iphone-16-pro', { model: 'iPhone 16 Pro', storage: '512 ГБ', color: 'Натуральный титан', simType: 'eSIM' }, 149990, false, 'IP16P-512-NT-E'),
  v('v5', 'fam-iphone-16-pro', { model: 'iPhone 16 Pro', storage: '1 ТБ', color: 'Титан пустыни', simType: 'eSIM' }, 179990, true, 'IP16P-1T-DT-E'),
  v('v6', 'fam-iphone-16-pro', { model: 'iPhone 16 Pro Max', storage: '256 ГБ', color: 'Чёрный титан', simType: 'eSIM' }, 149990, true, 'IP16PM-256-BT-E'),
  v('v7', 'fam-iphone-16-pro', { model: 'iPhone 16 Pro Max', storage: '512 ГБ', color: 'Чёрный титан', simType: 'eSIM' }, 169990, true, 'IP16PM-512-BT-E'),
  v('v8', 'fam-iphone-16-pro', { model: 'iPhone 16 Pro Max', storage: '1 ТБ', color: 'Натуральный титан', simType: 'Nano-SIM + eSIM' }, 199990, true, 'IP16PM-1T-NT-NE'),

  // iPhone 16
  v('v10', 'fam-iphone-16', { model: 'iPhone 16', storage: '128 ГБ', color: 'Ультрамарин', simType: 'eSIM' }, 99990, true, 'IP16-128-UL-E'),
  v('v11', 'fam-iphone-16', { model: 'iPhone 16', storage: '256 ГБ', color: 'Ультрамарин', simType: 'eSIM' }, 109990, true, 'IP16-256-UL-E'),
  v('v12', 'fam-iphone-16', { model: 'iPhone 16', storage: '128 ГБ', color: 'Белый', simType: 'Nano-SIM + eSIM' }, 99990, true, 'IP16-128-WH-NE'),
  v('v13', 'fam-iphone-16', { model: 'iPhone 16', storage: '256 ГБ', color: 'Белый', simType: 'eSIM' }, 109990, false, 'IP16-256-WH-E'),

  // iPhone 15
  v('v20', 'fam-iphone-15', { model: 'iPhone 15', storage: '128 ГБ', color: 'Синий', simType: 'Nano-SIM + eSIM' }, 84990, true, 'IP15-128-BL-NE'),
  v('v21', 'fam-iphone-15', { model: 'iPhone 15', storage: '256 ГБ', color: 'Синий', simType: 'Nano-SIM + eSIM' }, 94990, true, 'IP15-256-BL-NE'),
  v('v22', 'fam-iphone-15', { model: 'iPhone 15', storage: '128 ГБ', color: 'Зелёный', simType: 'eSIM' }, 84990, false, 'IP15-128-GR-E'),

  // iPad Air
  v('v30', 'fam-ipad-air', { model: 'iPad Air', size: '11"', storage: '128 ГБ', connectivity: 'Wi-Fi', color: 'Синий' }, 79990, true, 'IPA-11-128-W-BL'),
  v('v31', 'fam-ipad-air', { model: 'iPad Air', size: '11"', storage: '256 ГБ', connectivity: 'Wi-Fi', color: 'Серый космос' }, 89990, true, 'IPA-11-256-W-SG'),
  v('v32', 'fam-ipad-air', { model: 'iPad Air', size: '13"', storage: '256 ГБ', connectivity: 'Wi-Fi + Cellular', color: 'Сияющая звезда' }, 109990, true, 'IPA-13-256-C-SS'),
  v('v33', 'fam-ipad-air', { model: 'iPad Air', size: '13"', storage: '512 ГБ', connectivity: 'Wi-Fi', color: 'Синий' }, 119990, false, 'IPA-13-512-W-BL'),

  // MacBook Air M3
  v('v40', 'fam-macbook-air-m3', { model: 'MacBook Air', size: '13"', chip: 'M3', storage: '256 ГБ', color: 'Тёмная ночь' }, 139990, true, 'MBA-13-M3-256-MN'),
  v('v41', 'fam-macbook-air-m3', { model: 'MacBook Air', size: '13"', chip: 'M3', storage: '512 ГБ', color: 'Сияющая звезда' }, 159990, true, 'MBA-13-M3-512-SS'),
  v('v42', 'fam-macbook-air-m3', { model: 'MacBook Air', size: '15"', chip: 'M3', storage: '256 ГБ', color: 'Тёмная ночь' }, 159990, true, 'MBA-15-M3-256-MN'),
  v('v43', 'fam-macbook-air-m3', { model: 'MacBook Air', size: '15"', chip: 'M3', storage: '512 ГБ', color: 'Серебристый' }, 179990, false, 'MBA-15-M3-512-SL'),

  // Watch Ultra 2
  v('v50', 'fam-watch-ultra-2', { model: 'Ultra 2', size: '49 мм', connectivity: 'GPS + Cellular', color: 'Титан' }, 99990, true, 'WU2-49-GC-TI'),

  // AirPods Pro 2
  v('v60', 'fam-airpods-pro-2', { model: 'AirPods Pro 2', anc: 'Да', color: 'Белый' }, 29990, true, 'APP2-W'),
  v('v61', 'fam-airpods-pro-2', { model: 'AirPods Pro 2', anc: 'Да', color: 'Белый' }, 29990, true, 'APP2-W2'),

  // AirPods 4
  v('v70', 'fam-airpods-4', { model: 'AirPods 4', anc: 'Нет', color: 'Белый' }, 17990, true, 'AP4-W'),
  v('v71', 'fam-airpods-4', { model: 'AirPods 4 с ANC', anc: 'Да', color: 'Белый' }, 22990, true, 'AP4A-W'),
];
