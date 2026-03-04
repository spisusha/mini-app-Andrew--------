# Apple Store — Telegram Mini App

Мобильный магазин техники Apple как Telegram Mini App.  
React + TypeScript + Vite + Zustand + Supabase.

---

## Быстрый старт (локально)

```bash
npm install
npm run dev
```

Приложение откроется на `http://localhost:5173`.  
**Без Supabase** — используются встроенные моковые данные (mockData).

---

## Подключение Supabase

### 1. Создать проект

1. Зайди на [supabase.com](https://supabase.com) → **New Project**
2. Задай имя, пароль БД, выбери регион (ближайший к пользователям)
3. Дождись создания (1-2 мин)

### 2. Создать таблицы (SQL Editor)

Открой **SQL Editor** (значок `<>` в левом меню) и выполни:

```sql
-- Семейства товаров
CREATE TABLE product_families (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  images JSONB DEFAULT '[]'::jsonb,
  popularity_score INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Варианты (SKU)
CREATE TABLE variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID REFERENCES product_families(id) ON DELETE CASCADE,
  options JSONB DEFAULT '{}'::jsonb,
  price NUMERIC NOT NULL,
  in_stock BOOLEAN DEFAULT true,
  sku_code TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Заказы
CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Индексы
CREATE INDEX idx_variants_family ON variants(family_id);
CREATE INDEX idx_families_category ON product_families(category);

-- RLS: разрешить анонимное чтение каталога
ALTER TABLE product_families ENABLE ROW LEVEL SECURITY;
ALTER TABLE variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read families" ON product_families FOR SELECT USING (true);
CREATE POLICY "Public read variants" ON variants FOR SELECT USING (true);
CREATE POLICY "Anyone can insert orders" ON orders FOR INSERT WITH CHECK (true);
CREATE POLICY "No public read orders" ON orders FOR SELECT USING (false);
```

### 2b. Добавить колонку supplier_xmlid (для импорта цен)

```sql
ALTER TABLE variants ADD COLUMN IF NOT EXISTS supplier_xmlid TEXT;
CREATE INDEX idx_variants_supplier_xmlid ON variants(supplier_xmlid);
```

Заполни `supplier_xmlid` для каждого варианта значением `xmlid` из файла поставщика.

### 3. Наполнить данные

В **Table Editor** добавь product_families и variants.  
Или используй SQL INSERT — примеры смотри в `src/api/mockData.ts`.

### 4. Получить ключи

1. **Settings → API** (левая панель)
2. Скопируй:
   - **Project URL** → `VITE_SUPABASE_URL`
   - **anon public** key → `VITE_SUPABASE_ANON_KEY`

### 5. Создать `.env.local`

В корне проекта создай файл `.env.local`:

```
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGci...
```

Перезапусти dev-server (`npm run dev`).

---

## Деплой на Vercel

1. Запушь проект на GitHub
2. Зайди на [vercel.com](https://vercel.com) → **New Project** → импортируй репозиторий
3. **Framework Preset**: Vite
4. **Environment Variables** — добавь:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
5. Нажми **Deploy**
6. Через ~1 мин получишь URL вида `https://your-app.vercel.app`

---

## Подключение к Telegram Bot

### 1. Создать бота

1. Открой [@BotFather](https://t.me/BotFather) в Telegram
2. `/newbot` → задай имя и username
3. Скопируй токен бота (для будущих интеграций)

### 2. Привязать Web App

Напиши BotFather:

```
/mybots → выбери бота → Bot Settings → Menu Button → Configure menu button
```

Вставь URL твоего Vercel-деплоя: `https://your-app.vercel.app`

### 3. Проверить

Открой бота → нажми кнопку меню → Mini App откроется внутри Telegram.

---

## Админка: импорт цен из XLSX

Страница `/admin/prices` позволяет загрузить XLSX-файл от поставщика и обновить цены (и опционально наличие) в базе.

### Как работает

1. Загружаешь XLSX → парсится на фронте (SheetJS)
2. Автоматически фильтруются только Apple-товары (по description)
3. Предпросмотр первых 20 позиций
4. Два режима:
   - **Только цены** — обновляет `price` по совпадению `supplier_xmlid`
   - **Цены + наличие** — плюс ставит `in_stock=false` для Apple-вариантов, отсутствующих в файле
5. Обновление идёт через Supabase Edge Function (`update-prices`)

### Настройка Edge Function

1. Установи [Supabase CLI](https://supabase.com/docs/guides/cli):
   ```bash
   npm install -g supabase
   ```

2. Залогинься:
   ```bash
   supabase login
   ```

3. Привяжи проект:
   ```bash
   supabase link --project-ref YOUR_PROJECT_REF
   ```
   (`YOUR_PROJECT_REF` — из URL проекта: `https://YOUR_PROJECT_REF.supabase.co`)

4. Задеплой функцию:
   ```bash
   supabase functions deploy update-prices
   ```

5. Добавь секрет `SERVICE_ROLE_KEY` (service role key из Settings → API):
   ```bash
   supabase secrets set SERVICE_ROLE_KEY=eyJhbGci...your-service-role-key
   ```

6. Открой `/admin/prices` в браузере и загрузи файл.

---

## Админка: управление фото (/admin/media)

Страница `/admin/media` — загрузка и управление фотографиями товаров по цветам.

### Настройка

1. **Создай Storage bucket** `products` (public):
   - Supabase Dashboard → Storage → New Bucket
   - Name: `products`, Public: **ON**

2. **Установи секреты** (через CLI):
   ```bash
   supabase secrets set ADMIN_PIN=123456
   supabase secrets set ADMIN_TOKEN_SECRET=$(openssl rand -hex 32)
   ```

3. **Задеплой Edge Functions:**
   ```bash
   supabase functions deploy admin-login --no-verify-jwt
   supabase functions deploy media-upload-and-apply --no-verify-jwt
   supabase functions deploy media-remove-image --no-verify-jwt
   supabase functions deploy media-clear-color --no-verify-jwt
   supabase functions deploy media-set-family-cover --no-verify-jwt
   ```

4. **Добавь колонку images в variants** (если ещё нет):
   ```sql
   ALTER TABLE variants ADD COLUMN IF NOT EXISTS images JSONB DEFAULT '[]'::jsonb;
   ```

5. Открой `/admin/media`, введи PIN и работай.

### Смена пароля

Достаточно обновить секрет — фронтенд не нужно менять:
```bash
supabase secrets set ADMIN_PIN=новый_пин
```

---

## Структура проекта

```
src/
  app/            — Router, App (providers)
  screens/        — HomeScreen, CatalogScreen, ProductListScreen,
                    ProductDetailScreen, CartScreen, CheckoutScreen,
                    OrderResultScreen
  components/     — ProductCard, OptionSelector, SortBar,
                    CategoryFilter, BottomNav, Loader
  store/          — cartStore (Zustand + persist), catalogStore
  domain/         — types.ts, catalogLogic.ts (фильтры, опции, resolve)
  api/            — supabaseClient, catalogRepo, orderRepo, mockData
  telegram/       — telegramWebApp.ts (обёртка Telegram.WebApp)
  styles/         — theme.css (CSS-переменные), globals.css
```

## Стек

- **React 19** + TypeScript + Vite
- **react-router-dom** v7
- **Zustand** (state management + localStorage persist)
- **@supabase/supabase-js** (данные и заказы)
- Без тяжёлых UI-фреймворков, чистый CSS
#   S u s h a  
 