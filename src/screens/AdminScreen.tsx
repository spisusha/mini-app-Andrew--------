import { useState, useEffect, useCallback, useRef } from 'react';
import { read, utils } from 'xlsx';
import { supabase } from '../api/supabaseClient';
import './AdminPricesScreen.css';
import './AdminMediaScreen.css';
import './AdminScreen.css';

const BASE = import.meta.env.VITE_SUPABASE_URL as string;
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
const LS_TOKEN = 'admin_token';
const LS_EXPIRES = 'admin_expires';

type Tab = 'prices' | 'media';

// ── Auth helpers ─────────────────────────────────────────────────────

function getAuth(): { token: string; expiresAt: string } | null {
  const token = localStorage.getItem(LS_TOKEN);
  const expiresAt = localStorage.getItem(LS_EXPIRES);
  if (!token || !expiresAt) return null;
  if (new Date(expiresAt) < new Date()) {
    localStorage.removeItem(LS_TOKEN);
    localStorage.removeItem(LS_EXPIRES);
    return null;
  }
  return { token, expiresAt };
}

async function callFn<T = unknown>(name: string, body: unknown, token: string): Promise<T> {
  const res = await fetch(`${BASE}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      apikey: ANON,
    },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
  return json as T;
}

// ── Login screen ─────────────────────────────────────────────────────

function LoginScreen({ onLogin }: { onLogin: () => void }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`${BASE}/functions/v1/admin-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: ANON },
        body: JSON.stringify({ pin }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Login failed');
      localStorage.setItem(LS_TOKEN, data.token);
      localStorage.setItem(LS_EXPIRES, data.expiresAt);
      onLogin();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page admin-page admin-login">
      <h1 className="page-title">Admin Panel</h1>
      <form className="media-login__form" onSubmit={handleSubmit}>
        <input
          className="media-input"
          type="password"
          placeholder="PIN"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          autoFocus
        />
        <button className="btn btn-primary btn-block" disabled={loading || !pin}>
          {loading ? 'Вход...' : 'Войти'}
        </button>
        {error && <p className="admin-error">{error}</p>}
      </form>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
//  PRICES TAB
// ═══════════════════════════════════════════════════════════════════════

interface ParsedItem { xmlid: string; description: string; price: number; categoryGuess: string }
interface ReportItem { xmlid: string; description: string; price: number }
interface UpdateReport {
  updatedCount: number; notFoundCount: number;
  matchedExamples?: ReportItem[]; notFoundExamples?: ReportItem[];
  notFound: ReportItem[]; outOfStockCount?: number; errors: string[];
}
type UpdateMode = 'prices_only' | 'sync_stock';

function guessCategory(desc: string): string {
  const d = desc.toLowerCase();
  if (/iphone/.test(d)) return 'iphone';
  if (/ipad/.test(d)) return 'ipad';
  if (/macbook|mac\s?book/.test(d)) return 'macbook';
  if (/airpods|air\s?pods/.test(d)) return 'airpods';
  if (/watch/.test(d)) return 'watch';
  if (/imac|mac\s?pro|mac\s?mini|mac\s?studio/.test(d)) return 'mac';
  return 'other';
}

function parseXlsx(buffer: ArrayBuffer): ParsedItem[] {
  const wb = read(buffer, { type: 'array' });
  const sheetName = wb.SheetNames.find((n) => n.toLowerCase().includes('список товаров'))
    || wb.SheetNames.find((n) => n.toLowerCase().includes('список'))
    || wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const rows = utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });
  const items: ParsedItem[] = [];
  for (const row of rows) {
    const xmlid = String(row['xmlid'] ?? row['XMLID'] ?? row['XmlId'] ?? '').trim();
    const description = String(row['description'] ?? row['Description'] ?? row['DESCRIPTION'] ?? '').trim();
    const priceRaw = row['price'] ?? row['Price'] ?? row['PRICE'] ?? 0;
    const price = typeof priceRaw === 'number' ? priceRaw : parseFloat(String(priceRaw).replace(/[^\d.]/g, '')) || 0;
    if (!xmlid || price <= 0) continue;
    items.push({ xmlid, description, price, categoryGuess: guessCategory(description) });
  }
  return items;
}

function PricesTab() {
  const [allItems, setAllItems] = useState<ParsedItem[]>([]);
  const [appleItems, setAppleItems] = useState<ParsedItem[]>([]);
  const [fileName, setFileName] = useState('');
  const [mode, setMode] = useState<UpdateMode>('prices_only');
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<UpdateReport | null>(null);
  const [error, setError] = useState('');

  const handleFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setReport(null); setError('');
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = parseXlsx(ev.target?.result as ArrayBuffer);
        setAllItems(parsed);
        setAppleItems(parsed.filter((i) => i.categoryGuess !== 'other'));
      } catch (err) {
        setError(`Ошибка парсинга: ${err instanceof Error ? err.message : err}`);
        setAllItems([]); setAppleItems([]);
      }
    };
    reader.readAsArrayBuffer(file);
  }, []);

  const handleUpdate = async () => {
    if (appleItems.length === 0) return;
    const auth = getAuth();
    if (!auth) return;
    setLoading(true); setError(''); setReport(null);
    try {
      const payload = {
        items: appleItems.map((i) => ({ xmlid: i.xmlid, price: i.price, description: i.description, categoryGuess: i.categoryGuess })),
        mode,
      };
      const result = await callFn<UpdateReport>('update-prices', payload, auth.token);
      setReport(result);
    } catch (err) { setError(`Ошибка: ${err instanceof Error ? err.message : err}`); }
    finally { setLoading(false); }
  };

  const preview = appleItems.slice(0, 20);

  return (
    <>
      <p className="admin-subtitle">Загрузите XLSX-файл от поставщика. Будут обработаны только Apple-товары.</p>

      <div className="admin-upload">
        <label className="admin-upload-label">
          <input type="file" accept=".xlsx,.xls" onChange={handleFile} />
          <span className="btn btn-outline btn-block">{fileName || 'Выбрать XLSX-файл'}</span>
        </label>
      </div>

      {error && <p className="admin-error">{error}</p>}

      {allItems.length > 0 && (
        <div className="admin-stats">
          <div className="admin-stat-card"><span className="admin-stat-num">{allItems.length}</span><span className="admin-stat-label">Всего строк</span></div>
          <div className="admin-stat-card admin-stat-card--accent"><span className="admin-stat-num">{appleItems.length}</span><span className="admin-stat-label">Apple-товаров</span></div>
          <div className="admin-stat-card"><span className="admin-stat-num">{allItems.length - appleItems.length}</span><span className="admin-stat-label">Пропущено</span></div>
        </div>
      )}

      {preview.length > 0 && (
        <>
          <h3 className="admin-section-title">Предпросмотр (первые {preview.length} Apple-позиций)</h3>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead><tr><th>xmlid</th><th>description</th><th>price</th><th>cat</th></tr></thead>
              <tbody>
                {preview.map((item, i) => (
                  <tr key={i}>
                    <td className="admin-td-mono">{item.xmlid}</td>
                    <td>{item.description}</td>
                    <td className="admin-td-price">{item.price.toLocaleString('ru-RU')}</td>
                    <td><span className={`admin-cat admin-cat--${item.categoryGuess}`}>{item.categoryGuess}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="admin-mode">
            <h3 className="admin-section-title">Режим обновления</h3>
            <label className={`admin-mode-option${mode === 'prices_only' ? ' active' : ''}`}>
              <input type="radio" name="mode" checked={mode === 'prices_only'} onChange={() => setMode('prices_only')} />
              <div><strong>Только цены</strong><span>Обновить price. Поле in_stock не трогать.</span></div>
            </label>
            <label className={`admin-mode-option${mode === 'sync_stock' ? ' active' : ''}`}>
              <input type="radio" name="mode" checked={mode === 'sync_stock'} onChange={() => setMode('sync_stock')} />
              <div><strong>Цены + синхронизация наличия</strong><span>xmlid из файла → in_stock=true. Отсутствующие → in_stock=false.</span></div>
            </label>
          </div>

          <button className="btn btn-primary btn-block admin-update-btn" onClick={handleUpdate} disabled={loading}>
            {loading ? 'Обновляем...' : `Обновить цены (${appleItems.length} позиций)`}
          </button>
        </>
      )}

      {report && (
        <div className="admin-report">
          <h3 className="admin-section-title">Результат</h3>
          <div className="admin-stats">
            <div className="admin-stat-card admin-stat-card--accent"><span className="admin-stat-num">{report.updatedCount}</span><span className="admin-stat-label">Обновлено</span></div>
            <div className="admin-stat-card admin-stat-card--warn"><span className="admin-stat-num">{report.notFoundCount}</span><span className="admin-stat-label">Не найдено</span></div>
            {report.outOfStockCount !== undefined && (
              <div className="admin-stat-card"><span className="admin-stat-num">{report.outOfStockCount}</span><span className="admin-stat-label">Убрано из наличия</span></div>
            )}
          </div>
          {report.errors.length > 0 && (
            <div className="admin-errors"><h4>Ошибки:</h4>{report.errors.map((err, i) => <p key={i} className="admin-error">{err}</p>)}</div>
          )}
          {report.matchedExamples && report.matchedExamples.length > 0 && (
            <>
              <h4 className="admin-section-title" style={{ marginTop: 16 }}>Обновлено (примеры, до 10)</h4>
              <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>xmlid</th><th>description</th><th>price</th></tr></thead><tbody>
                {report.matchedExamples.map((m, i) => <tr key={i}><td className="admin-td-mono">{m.xmlid}</td><td>{m.description}</td><td className="admin-td-price">{m.price.toLocaleString('ru-RU')}</td></tr>)}
              </tbody></table></div>
            </>
          )}
          {report.notFoundExamples && report.notFoundExamples.length > 0 && (
            <>
              <h4 className="admin-section-title" style={{ marginTop: 16 }}>Не найдено в базе ({report.notFoundCount})</h4>
              <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>xmlid</th><th>description</th><th>price</th></tr></thead><tbody>
                {report.notFoundExamples.map((nf, i) => <tr key={i}><td className="admin-td-mono">{nf.xmlid}</td><td>{nf.description}</td><td className="admin-td-price">{nf.price.toLocaleString('ru-RU')}</td></tr>)}
              </tbody></table></div>
            </>
          )}
        </div>
      )}
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════
//  MEDIA TAB
// ═══════════════════════════════════════════════════════════════════════

import { formatWatchDisplay } from '../domain/watchFormat';

type MediaMode = 'iphone' | 'watch' | 'airpods_sku' | 'airpods_max';
interface Family { id: string; title: string; category?: string }
interface VariantRow { id: string; options: Record<string, string>; images: string[] | null }

function colorSlug(label: string) {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/_+$/, '');
}

function MediaTab() {
  const [mediaMode, setMediaMode] = useState<MediaMode>('iphone');

  return (
    <>
      <div className="media-section">
        <div className="media-mode" style={{ flexWrap: 'wrap' }}>
          <label className={`media-mode-opt${mediaMode === 'iphone' ? ' active' : ''}`}>
            <input type="radio" name="mediaKind" checked={mediaMode === 'iphone'} onChange={() => setMediaMode('iphone')} />
            iPhone (по цвету)
          </label>
          <label className={`media-mode-opt${mediaMode === 'watch' ? ' active' : ''}`}>
            <input type="radio" name="mediaKind" checked={mediaMode === 'watch'} onChange={() => setMediaMode('watch')} />
            Watch (по SKU)
          </label>
          <label className={`media-mode-opt${mediaMode === 'airpods_sku' ? ' active' : ''}`}>
            <input type="radio" name="mediaKind" checked={mediaMode === 'airpods_sku'} onChange={() => setMediaMode('airpods_sku')} />
            AirPods (по SKU)
          </label>
          <label className={`media-mode-opt${mediaMode === 'airpods_max' ? ' active' : ''}`}>
            <input type="radio" name="mediaKind" checked={mediaMode === 'airpods_max'} onChange={() => setMediaMode('airpods_max')} />
            AirPods Max (по цвету)
          </label>
        </div>
      </div>
      {mediaMode === 'iphone' && <IPhoneMediaSection />}
      {mediaMode === 'watch' && <SkuMediaSection category="watch" storagePath="watch" label="Watch" />}
      {mediaMode === 'airpods_sku' && <SkuMediaSection category="airpods" storagePath="airpods" label="AirPods" filterMax={false} />}
      {mediaMode === 'airpods_max' && <ColorMediaSection category="airpods" storagePath="airpods_max" label="AirPods Max" filterTitle="Max" />}
    </>
  );
}

// ── iPhone media (existing, unchanged logic) ─────────────────────────

function IPhoneMediaSection() {
  const auth = getAuth()!;

  const [families, setFamilies] = useState<Family[]>([]);
  const [familyId, setFamilyId] = useState('');
  const [variants, setVariants] = useState<VariantRow[]>([]);
  const [colors, setColors] = useState<string[]>([]);
  const [colorLabel, setColorLabel] = useState('');
  const [currentImages, setCurrentImages] = useState<string[]>([]);

  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [mode, setMode] = useState<'append' | 'replace'>('append');
  const [setAsCover, setSetAsCover] = useState(false);

  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!supabase) return;
    supabase.from('product_families').select('id, title').order('title').then(({ data }) => { if (data) setFamilies(data); });
  }, []);

  useEffect(() => {
    if (!supabase || !familyId) { setVariants([]); setColors([]); setColorLabel(''); return; }
    supabase.from('variants').select('id, options, images').eq('family_id', familyId).then(({ data }) => {
      const rows = (data || []) as VariantRow[];
      setVariants(rows);
      setColors([...new Set(rows.map((v) => v.options?.colorLabel).filter(Boolean))].sort() as string[]);
      setColorLabel('');
    });
  }, [familyId]);

  useEffect(() => {
    if (!colorLabel || variants.length === 0) { setCurrentImages([]); return; }
    const match = variants.find((v) => v.options?.colorLabel === colorLabel);
    setCurrentImages((match?.images as string[]) || []);
  }, [colorLabel, variants]);

  const handleFiles = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || []).slice(0, 10);
    setFiles(selected);
    setPreviews(selected.map((f) => URL.createObjectURL(f)));
  }, []);

  useEffect(() => { return () => previews.forEach((u) => URL.revokeObjectURL(u)); }, [previews]);

  const refreshImages = useCallback(async () => {
    if (!supabase || !familyId || !colorLabel) return;
    const { data } = await supabase.from('variants').select('images').eq('family_id', familyId).eq('options->>colorLabel', colorLabel).limit(1);
    setCurrentImages((data?.[0]?.images as string[]) || []);
  }, [familyId, colorLabel]);

  const handleUpload = async () => {
    if (!supabase || files.length === 0 || !familyId || !colorLabel) return;
    setUploading(true); setError(''); setMessage('');
    try {
      const slug = colorSlug(colorLabel);
      const urls: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setProgress(`Загрузка ${i + 1}/${files.length}: ${file.name}`);
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const path = `iphone/${familyId}/${slug}/${Date.now()}-${safeName}`;
        const { error: upErr } = await supabase.storage.from('products').upload(path, file, { upsert: true });
        if (upErr) throw new Error(`Upload ${file.name}: ${upErr.message}`);
        const { data: { publicUrl } } = supabase.storage.from('products').getPublicUrl(path);
        urls.push(publicUrl);
      }
      setProgress('Применение к вариантам...');
      const result = await callFn<{ updatedVariantsCount: number; savedUrls: string[] }>(
        'media-upload-and-apply', { familyId, colorLabel, mode, publicUrls: urls, setAsCover }, auth.token,
      );
      setMessage(`Готово! Обновлено ${result.updatedVariantsCount} вариантов, ${result.savedUrls.length} фото.`);
      setFiles([]); setPreviews([]);
      if (fileRef.current) fileRef.current.value = '';
      await refreshImages();
    } catch (err) { setError(err instanceof Error ? err.message : 'Upload failed'); }
    finally { setUploading(false); setProgress(''); }
  };

  const handleRemove = async (url: string) => {
    if (!confirm('Удалить это изображение?')) return;
    setError('');
    try {
      await callFn('media-remove-image', { familyId, colorLabel, urlToRemove: url, deleteFromStorage: true }, auth.token);
      await refreshImages(); setMessage('Изображение удалено');
    } catch (err) { setError(err instanceof Error ? err.message : 'Remove failed'); }
  };

  const handleClear = async () => {
    if (!confirm(`Очистить все фото для "${colorLabel}"?`)) return;
    setError('');
    try {
      await callFn('media-clear-color', { familyId, colorLabel }, auth.token);
      await refreshImages(); setMessage('Все фото цвета очищены');
    } catch (err) { setError(err instanceof Error ? err.message : 'Clear failed'); }
  };

  const handleSetCover = async () => {
    if (currentImages.length === 0) return;
    if (!confirm('Установить текущие фото цвета как обложку товара?')) return;
    setError('');
    try {
      await callFn('media-set-family-cover', { familyId, mode: 'replace', publicUrls: currentImages }, auth.token);
      setMessage('Обложка товара обновлена');
    } catch (err) { setError(err instanceof Error ? err.message : 'Cover update failed'); }
  };

  return (
    <>
      <div className="media-section">
        <label className="media-label">Модель</label>
        <select className="media-select" value={familyId} onChange={(e) => setFamilyId(e.target.value)}>
          <option value="">— Выберите модель —</option>
          {families.map((f) => <option key={f.id} value={f.id}>{f.title}</option>)}
        </select>
      </div>

      {colors.length > 0 && (
        <div className="media-section">
          <label className="media-label">Цвет</label>
          <select className="media-select" value={colorLabel} onChange={(e) => setColorLabel(e.target.value)}>
            <option value="">— Выберите цвет —</option>
            {colors.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      )}

      {colorLabel && (
        <div className="media-section">
          <h3 className="media-subtitle">Текущие фото ({currentImages.length})</h3>
          {currentImages.length === 0 ? (
            <p className="media-empty">Нет фото для этого цвета</p>
          ) : (
            <div className="media-grid">
              {currentImages.map((url, i) => (
                <div key={i} className="media-card">
                  <img src={url} alt={`${colorLabel} ${i + 1}`} className="media-card__img" />
                  <div className="media-card__actions">
                    <span className="media-card__idx">#{i + 1}</span>
                    <button className="btn btn-sm btn-danger" onClick={() => handleRemove(url)}>Удалить</button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="media-toolbar">
            <button className="btn btn-outline btn-sm" onClick={handleSetCover} disabled={currentImages.length === 0}>Установить как обложку</button>
            <button className="btn btn-outline btn-sm btn-danger-outline" onClick={handleClear} disabled={currentImages.length === 0}>Очистить все фото цвета</button>
          </div>
        </div>
      )}

      {colorLabel && (
        <div className="media-section">
          <h3 className="media-subtitle">Загрузка</h3>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={handleFiles} className="media-file-input" />
          {previews.length > 0 && (
            <div className="media-previews">
              {previews.map((src, i) => <img key={i} src={src} alt={`preview ${i + 1}`} className="media-preview-img" />)}
            </div>
          )}
          <div className="media-mode">
            <label className={`media-mode-opt${mode === 'append' ? ' active' : ''}`}>
              <input type="radio" name="iphoneMediaMode" checked={mode === 'append'} onChange={() => setMode('append')} /> Добавить к существующим
            </label>
            <label className={`media-mode-opt${mode === 'replace' ? ' active' : ''}`}>
              <input type="radio" name="iphoneMediaMode" checked={mode === 'replace'} onChange={() => setMode('replace')} /> Заменить полностью
            </label>
          </div>
          <label className="media-checkbox">
            <input type="checkbox" checked={setAsCover} onChange={(e) => setSetAsCover(e.target.checked)} />
            Также установить как обложку модели
          </label>
          <button className="btn btn-primary btn-block" disabled={uploading || files.length === 0} onClick={handleUpload}>
            {uploading ? progress || 'Загрузка...' : `Загрузить и применить (${files.length} файлов)`}
          </button>
        </div>
      )}

      {error && <p className="admin-error">{error}</p>}
      {message && <p className="media-success">{message}</p>}
    </>
  );
}

// ── Generic SKU media (Watch / AirPods non-Max) ─────────────────────

function SkuMediaSection({ category, storagePath, label, filterMax }: {
  category: string; storagePath: string; label: string; filterMax?: boolean;
}) {
  const auth = getAuth()!;

  const [families, setFamilies] = useState<Family[]>([]);
  const [familyId, setFamilyId] = useState('');
  const [variants, setVariants] = useState<VariantRow[]>([]);
  const [variantId, setVariantId] = useState('');
  const [currentImages, setCurrentImages] = useState<string[]>([]);

  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [mode, setMode] = useState<'append' | 'replace'>('append');

  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!supabase) return;
    supabase
      .from('product_families')
      .select('id, title, category')
      .eq('category', category)
      .order('title')
      .then(({ data }) => {
        let list = (data || []) as Family[];
        if (filterMax === false) list = list.filter((f) => !/max/i.test(f.title));
        setFamilies(list);
      });
  }, [category, filterMax]);

  useEffect(() => {
    if (!supabase || !familyId) { setVariants([]); setVariantId(''); return; }
    supabase
      .from('variants')
      .select('id, options, images')
      .eq('family_id', familyId)
      .order('sku_code')
      .then(({ data }) => {
        setVariants((data || []) as VariantRow[]);
        setVariantId('');
      });
  }, [familyId]);

  useEffect(() => {
    if (!variantId) { setCurrentImages([]); return; }
    const v = variants.find((r) => r.id === variantId);
    setCurrentImages((v?.images as string[]) || []);
  }, [variantId, variants]);

  const handleFiles = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || []).slice(0, 10);
    setFiles(selected);
    setPreviews(selected.map((f) => URL.createObjectURL(f)));
  }, []);

  useEffect(() => { return () => previews.forEach((u) => URL.revokeObjectURL(u)); }, [previews]);

  const refreshImages = useCallback(async () => {
    if (!supabase || !variantId) return;
    const { data } = await supabase.from('variants').select('images').eq('id', variantId).single();
    const imgs = (data?.images as string[]) || [];
    setCurrentImages(imgs);
    setVariants((prev) => prev.map((v) => v.id === variantId ? { ...v, images: imgs } : v));
  }, [variantId]);

  const handleUpload = async () => {
    if (!supabase || files.length === 0 || !variantId) return;
    setUploading(true); setError(''); setMessage('');
    try {
      const urls: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setProgress(`Загрузка ${i + 1}/${files.length}: ${file.name}`);
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const path = `${storagePath}/${variantId}/${Date.now()}-${safeName}`;
        const { error: upErr } = await supabase.storage.from('products').upload(path, file, { upsert: true });
        if (upErr) throw new Error(`Upload ${file.name}: ${upErr.message}`);
        const { data: { publicUrl } } = supabase.storage.from('products').getPublicUrl(path);
        urls.push(publicUrl);
      }
      setProgress('Применение к варианту...');
      await callFn<{ ok: boolean; savedUrls: string[]; finalCount: number }>(
        'media-watch-apply', { variantId, mode, publicUrls: urls }, auth.token,
      );
      setMessage(`Готово! ${urls.length} фото загружено.`);
      setFiles([]); setPreviews([]);
      if (fileRef.current) fileRef.current.value = '';
      await refreshImages();
    } catch (err) { setError(err instanceof Error ? err.message : 'Upload failed'); }
    finally { setUploading(false); setProgress(''); }
  };

  const handleRemove = async (url: string) => {
    if (!confirm('Удалить это изображение?')) return;
    setError(''); setMessage('');
    try {
      await callFn('media-watch-remove', { variantId, urlToRemove: url }, auth.token);
      await refreshImages(); setMessage('Изображение удалено');
    } catch (err) { setError(err instanceof Error ? err.message : 'Remove failed'); }
  };

  const handleClear = async () => {
    if (!confirm('Очистить все фото этого SKU?')) return;
    setError(''); setMessage('');
    try {
      await callFn('media-watch-clear', { variantId }, auth.token);
      await refreshImages(); setMessage('Все фото SKU очищены');
    } catch (err) { setError(err instanceof Error ? err.message : 'Clear failed'); }
  };

  const variantLabel = (v: VariantRow) => {
    const raw = v.options?.supplierTitle || v.options?.raw || '';
    if (raw && category === 'watch') return formatWatchDisplay(raw).longTitle;
    if (raw) return raw;
    return v.id.slice(0, 8);
  };

  const radioName = `skuMedia_${category}`;

  return (
    <>
      <div className="media-section">
        <label className="media-label">Семейство {label}</label>
        <select className="media-select" value={familyId} onChange={(e) => setFamilyId(e.target.value)}>
          <option value="">— Выберите семейство —</option>
          {families.map((f) => <option key={f.id} value={f.id}>{f.title}</option>)}
        </select>
      </div>

      {variants.length > 0 && (
        <div className="media-section">
          <label className="media-label">SKU (вариант)</label>
          <select className="media-select" value={variantId} onChange={(e) => setVariantId(e.target.value)}>
            <option value="">— Выберите вариант —</option>
            {variants.map((v) => (
              <option key={v.id} value={v.id}>{variantLabel(v)}</option>
            ))}
          </select>
        </div>
      )}

      {variantId && (
        <div className="media-section">
          <h3 className="media-subtitle">Текущие фото ({currentImages.length})</h3>
          {currentImages.length === 0 ? (
            <p className="media-empty">Нет фото для этого SKU</p>
          ) : (
            <div className="media-grid">
              {currentImages.map((url, i) => (
                <div key={i} className="media-card">
                  <img src={url} alt={`${label}-img ${i + 1}`} className="media-card__img" />
                  <div className="media-card__actions">
                    <span className="media-card__idx">#{i + 1}</span>
                    <button className="btn btn-sm btn-danger" onClick={() => handleRemove(url)}>Удалить</button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="media-toolbar">
            <button className="btn btn-outline btn-sm btn-danger-outline" onClick={handleClear} disabled={currentImages.length === 0}>
              Очистить все фото SKU
            </button>
          </div>
        </div>
      )}

      {variantId && (
        <div className="media-section">
          <h3 className="media-subtitle">Загрузка</h3>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={handleFiles} className="media-file-input" />
          {previews.length > 0 && (
            <div className="media-previews">
              {previews.map((src, i) => <img key={i} src={src} alt={`preview ${i + 1}`} className="media-preview-img" />)}
            </div>
          )}
          <div className="media-mode">
            <label className={`media-mode-opt${mode === 'append' ? ' active' : ''}`}>
              <input type="radio" name={radioName} checked={mode === 'append'} onChange={() => setMode('append')} /> Добавить к существующим
            </label>
            <label className={`media-mode-opt${mode === 'replace' ? ' active' : ''}`}>
              <input type="radio" name={radioName} checked={mode === 'replace'} onChange={() => setMode('replace')} /> Заменить полностью
            </label>
          </div>
          <button className="btn btn-primary btn-block" disabled={uploading || files.length === 0} onClick={handleUpload}>
            {uploading ? progress || 'Загрузка...' : `Загрузить и применить (${files.length} файлов)`}
          </button>
        </div>
      )}

      {error && <p className="admin-error">{error}</p>}
      {message && <p className="media-success">{message}</p>}
    </>
  );
}

// ── Color-based media (AirPods Max, reuses iPhone media functions) ───

function ColorMediaSection({ category, storagePath, label, filterTitle }: {
  category: string; storagePath: string; label: string; filterTitle: string;
}) {
  const auth = getAuth()!;

  const [families, setFamilies] = useState<Family[]>([]);
  const [familyId, setFamilyId] = useState('');
  const [variants, setVariants] = useState<VariantRow[]>([]);
  const [colors, setColors] = useState<string[]>([]);
  const [colorLabel, setColorLabel] = useState('');
  const [currentImages, setCurrentImages] = useState<string[]>([]);

  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [mode, setMode] = useState<'append' | 'replace'>('append');
  const [setAsCover, setSetAsCover] = useState(false);

  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!supabase) return;
    supabase
      .from('product_families')
      .select('id, title, category')
      .eq('category', category)
      .order('title')
      .then(({ data }) => {
        const list = (data || []) as Family[];
        setFamilies(list.filter((f) => new RegExp(filterTitle, 'i').test(f.title)));
      });
  }, [category, filterTitle]);

  useEffect(() => {
    if (!supabase || !familyId) { setVariants([]); setColors([]); setColorLabel(''); return; }
    supabase.from('variants').select('id, options, images').eq('family_id', familyId).then(({ data }) => {
      const rows = (data || []) as VariantRow[];
      setVariants(rows);
      setColors([...new Set(rows.map((v) => v.options?.colorLabel).filter(Boolean))].sort() as string[]);
      setColorLabel('');
    });
  }, [familyId]);

  useEffect(() => {
    if (!colorLabel || variants.length === 0) { setCurrentImages([]); return; }
    const match = variants.find((v) => v.options?.colorLabel === colorLabel);
    setCurrentImages((match?.images as string[]) || []);
  }, [colorLabel, variants]);

  const handleFiles = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || []).slice(0, 10);
    setFiles(selected);
    setPreviews(selected.map((f) => URL.createObjectURL(f)));
  }, []);

  useEffect(() => { return () => previews.forEach((u) => URL.revokeObjectURL(u)); }, [previews]);

  const refreshImages = useCallback(async () => {
    if (!supabase || !familyId || !colorLabel) return;
    const { data } = await supabase.from('variants').select('images').eq('family_id', familyId).eq('options->>colorLabel', colorLabel).limit(1);
    setCurrentImages((data?.[0]?.images as string[]) || []);
  }, [familyId, colorLabel]);

  const handleUpload = async () => {
    if (!supabase || files.length === 0 || !familyId || !colorLabel) return;
    setUploading(true); setError(''); setMessage('');
    try {
      const slug = colorSlug(colorLabel);
      const urls: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setProgress(`Загрузка ${i + 1}/${files.length}: ${file.name}`);
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const path = `${storagePath}/${familyId}/${slug}/${Date.now()}-${safeName}`;
        const { error: upErr } = await supabase.storage.from('products').upload(path, file, { upsert: true });
        if (upErr) throw new Error(`Upload ${file.name}: ${upErr.message}`);
        const { data: { publicUrl } } = supabase.storage.from('products').getPublicUrl(path);
        urls.push(publicUrl);
      }
      setProgress('Применение к вариантам...');
      const result = await callFn<{ updatedVariantsCount: number; savedUrls: string[] }>(
        'media-upload-and-apply', { familyId, colorLabel, mode, publicUrls: urls, setAsCover }, auth.token,
      );
      setMessage(`Готово! Обновлено ${result.updatedVariantsCount} вариантов, ${result.savedUrls.length} фото.`);
      setFiles([]); setPreviews([]);
      if (fileRef.current) fileRef.current.value = '';
      await refreshImages();
    } catch (err) { setError(err instanceof Error ? err.message : 'Upload failed'); }
    finally { setUploading(false); setProgress(''); }
  };

  const handleRemove = async (url: string) => {
    if (!confirm('Удалить это изображение?')) return;
    setError('');
    try {
      await callFn('media-remove-image', { familyId, colorLabel, urlToRemove: url, deleteFromStorage: true }, auth.token);
      await refreshImages(); setMessage('Изображение удалено');
    } catch (err) { setError(err instanceof Error ? err.message : 'Remove failed'); }
  };

  const handleClear = async () => {
    if (!confirm(`Очистить все фото для "${colorLabel}"?`)) return;
    setError('');
    try {
      await callFn('media-clear-color', { familyId, colorLabel }, auth.token);
      await refreshImages(); setMessage('Все фото цвета очищены');
    } catch (err) { setError(err instanceof Error ? err.message : 'Clear failed'); }
  };

  const handleSetCover = async () => {
    if (currentImages.length === 0) return;
    if (!confirm('Установить текущие фото цвета как обложку товара?')) return;
    setError('');
    try {
      await callFn('media-set-family-cover', { familyId, mode: 'replace', publicUrls: currentImages }, auth.token);
      setMessage('Обложка товара обновлена');
    } catch (err) { setError(err instanceof Error ? err.message : 'Cover update failed'); }
  };

  const radioName = `colorMedia_${category}`;

  return (
    <>
      <div className="media-section">
        <label className="media-label">Модель {label}</label>
        <select className="media-select" value={familyId} onChange={(e) => setFamilyId(e.target.value)}>
          <option value="">— Выберите модель —</option>
          {families.map((f) => <option key={f.id} value={f.id}>{f.title}</option>)}
        </select>
      </div>

      {colors.length > 0 && (
        <div className="media-section">
          <label className="media-label">Цвет</label>
          <select className="media-select" value={colorLabel} onChange={(e) => setColorLabel(e.target.value)}>
            <option value="">— Выберите цвет —</option>
            {colors.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      )}

      {colorLabel && (
        <div className="media-section">
          <h3 className="media-subtitle">Текущие фото ({currentImages.length})</h3>
          {currentImages.length === 0 ? (
            <p className="media-empty">Нет фото для этого цвета</p>
          ) : (
            <div className="media-grid">
              {currentImages.map((url, i) => (
                <div key={i} className="media-card">
                  <img src={url} alt={`${colorLabel} ${i + 1}`} className="media-card__img" />
                  <div className="media-card__actions">
                    <span className="media-card__idx">#{i + 1}</span>
                    <button className="btn btn-sm btn-danger" onClick={() => handleRemove(url)}>Удалить</button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="media-toolbar">
            <button className="btn btn-outline btn-sm" onClick={handleSetCover} disabled={currentImages.length === 0}>Установить как обложку</button>
            <button className="btn btn-outline btn-sm btn-danger-outline" onClick={handleClear} disabled={currentImages.length === 0}>Очистить все фото цвета</button>
          </div>
        </div>
      )}

      {colorLabel && (
        <div className="media-section">
          <h3 className="media-subtitle">Загрузка</h3>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={handleFiles} className="media-file-input" />
          {previews.length > 0 && (
            <div className="media-previews">
              {previews.map((src, i) => <img key={i} src={src} alt={`preview ${i + 1}`} className="media-preview-img" />)}
            </div>
          )}
          <div className="media-mode">
            <label className={`media-mode-opt${mode === 'append' ? ' active' : ''}`}>
              <input type="radio" name={radioName} checked={mode === 'append'} onChange={() => setMode('append')} /> Добавить к существующим
            </label>
            <label className={`media-mode-opt${mode === 'replace' ? ' active' : ''}`}>
              <input type="radio" name={radioName} checked={mode === 'replace'} onChange={() => setMode('replace')} /> Заменить полностью
            </label>
          </div>
          <label className="media-checkbox">
            <input type="checkbox" checked={setAsCover} onChange={(e) => setSetAsCover(e.target.checked)} />
            Также установить как обложку модели
          </label>
          <button className="btn btn-primary btn-block" disabled={uploading || files.length === 0} onClick={handleUpload}>
            {uploading ? progress || 'Загрузка...' : `Загрузить и применить (${files.length} файлов)`}
          </button>
        </div>
      )}

      {error && <p className="admin-error">{error}</p>}
      {message && <p className="media-success">{message}</p>}
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════
//  ROOT — login gate + tabs
// ═══════════════════════════════════════════════════════════════════════

export default function AdminScreen() {
  const [authed, setAuthed] = useState(() => !!getAuth());
  const [tab, setTab] = useState<Tab>('prices');

  const handleLogout = () => {
    localStorage.removeItem(LS_TOKEN);
    localStorage.removeItem(LS_EXPIRES);
    setAuthed(false);
  };

  if (!authed) return <LoginScreen onLogin={() => setAuthed(true)} />;

  return (
    <div className="page admin-page">
      <div className="admin-topbar">
        <h1 className="page-title">Admin Panel</h1>
        <button className="btn btn-outline admin-topbar__logout" onClick={handleLogout}>Выйти</button>
      </div>

      <div className="admin-tabs">
        <button className={`admin-tab${tab === 'prices' ? ' admin-tab--active' : ''}`} onClick={() => setTab('prices')}>Цены</button>
        <button className={`admin-tab${tab === 'media' ? ' admin-tab--active' : ''}`} onClick={() => setTab('media')}>Медиа</button>
      </div>

      {tab === 'prices' && <PricesTab />}
      {tab === 'media' && <MediaTab />}
    </div>
  );
}
