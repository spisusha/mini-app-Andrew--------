import { useState, useCallback } from 'react';
import { read, utils } from 'xlsx';

import './AdminPricesScreen.css';

interface ParsedItem {
  xmlid: string;
  description: string;
  price: number;
  categoryGuess: string;
}

type UpdateMode = 'prices_only' | 'sync_stock';

interface ReportItem {
  xmlid: string;
  description: string;
  price: number;
}

interface UpdateReport {
  updatedCount: number;
  notFoundCount: number;
  matchedExamples?: ReportItem[];
  notFoundExamples?: ReportItem[];
  notFound: ReportItem[];
  outOfStockCount?: number;
  errors: string[];
}


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

    items.push({
      xmlid,
      description,
      price,
      categoryGuess: guessCategory(description),
    });
  }

  return items;
}

export default function AdminPricesScreen() {
  const [allItems, setAllItems] = useState<ParsedItem[]>([]);
  const [appleItems, setAppleItems] = useState<ParsedItem[]>([]);
  const [fileName, setFileName] = useState('');
  const [mode, setMode] = useState<UpdateMode>('prices_only');
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<UpdateReport | null>(null);
  const [error, setError] = useState('');

  const handleFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setReport(null);
    setError('');
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const buf = ev.target?.result as ArrayBuffer;
        const parsed = parseXlsx(buf);
        setAllItems(parsed);
        setAppleItems(parsed.filter((i) => i.categoryGuess !== 'other'));
      } catch (err) {
        setError(`Ошибка парсинга файла: ${err instanceof Error ? err.message : err}`);
        setAllItems([]);
        setAppleItems([]);
      }
    };
    reader.readAsArrayBuffer(file);
  }, []);

  const handleUpdate = async () => {
    if (appleItems.length === 0) return;
    if (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY) {
      setError('Supabase не настроен. Добавьте VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY в .env.local');
      return;
    }

    setLoading(true);
    setError('');
    setReport(null);

    try {
      const payload = {
        items: appleItems.map((i) => ({
          xmlid: i.xmlid,
          price: i.price,
          description: i.description,
          categoryGuess: i.categoryGuess,
        })),
        mode,
      };

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/update-prices`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify(payload),
        },
      );

      if (!res.ok) {
        const text = await res.text();
        setError(`Edge Function error (${res.status}): ${text}`);
      } else {
        const data = await res.json();
        setReport(data as UpdateReport);
      }
    } catch (err) {
      setError(`Ошибка: ${err instanceof Error ? err.message : err}`);
    } finally {
      setLoading(false);
    }
  };

  const preview = appleItems.slice(0, 20);

  return (
    <div className="page admin-page">
      <h1 className="page-title">Обновление цен</h1>
      <p className="admin-subtitle">
        Загрузите XLSX-файл от поставщика. Будут обработаны только Apple-товары.
      </p>

      <div className="admin-upload">
        <label className="admin-upload-label">
          <input type="file" accept=".xlsx,.xls" onChange={handleFile} />
          <span className="btn btn-outline btn-block">
            {fileName || 'Выбрать XLSX-файл'}
          </span>
        </label>
      </div>

      {error && <p className="admin-error">{error}</p>}

      {allItems.length > 0 && (
        <div className="admin-stats">
          <div className="admin-stat-card">
            <span className="admin-stat-num">{allItems.length}</span>
            <span className="admin-stat-label">Всего строк</span>
          </div>
          <div className="admin-stat-card admin-stat-card--accent">
            <span className="admin-stat-num">{appleItems.length}</span>
            <span className="admin-stat-label">Apple-товаров</span>
          </div>
          <div className="admin-stat-card">
            <span className="admin-stat-num">{allItems.length - appleItems.length}</span>
            <span className="admin-stat-label">Пропущено</span>
          </div>
        </div>
      )}

      {preview.length > 0 && (
        <>
          <h3 className="admin-section-title">Предпросмотр (первые {preview.length} Apple-позиций)</h3>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>xmlid</th>
                  <th>description</th>
                  <th>price</th>
                  <th>cat</th>
                </tr>
              </thead>
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
              <input
                type="radio"
                name="mode"
                checked={mode === 'prices_only'}
                onChange={() => setMode('prices_only')}
              />
              <div>
                <strong>Только цены</strong>
                <span>Обновить price для найденных xmlid. Поле in_stock не трогать.</span>
              </div>
            </label>
            <label className={`admin-mode-option${mode === 'sync_stock' ? ' active' : ''}`}>
              <input
                type="radio"
                name="mode"
                checked={mode === 'sync_stock'}
                onChange={() => setMode('sync_stock')}
              />
              <div>
                <strong>Цены + синхронизация наличия</strong>
                <span>xmlid из файла → in_stock=true. Отсутствующие Apple-варианты → in_stock=false.</span>
              </div>
            </label>
          </div>

          <button
            className="btn btn-primary btn-block admin-update-btn"
            onClick={handleUpdate}
            disabled={loading}
          >
            {loading ? 'Обновляем...' : `Обновить цены (${appleItems.length} позиций)`}
          </button>
        </>
      )}

      {report && (
        <div className="admin-report">
          <h3 className="admin-section-title">Результат</h3>
          <div className="admin-stats">
            <div className="admin-stat-card admin-stat-card--accent">
              <span className="admin-stat-num">{report.updatedCount}</span>
              <span className="admin-stat-label">Обновлено</span>
            </div>
            <div className="admin-stat-card admin-stat-card--warn">
              <span className="admin-stat-num">{report.notFoundCount}</span>
              <span className="admin-stat-label">Не найдено</span>
            </div>
            {report.outOfStockCount !== undefined && (
              <div className="admin-stat-card">
                <span className="admin-stat-num">{report.outOfStockCount}</span>
                <span className="admin-stat-label">Убрано из наличия</span>
              </div>
            )}
          </div>

          {report.errors.length > 0 && (
            <div className="admin-errors">
              <h4>Ошибки:</h4>
              {report.errors.map((err, i) => (
                <p key={i} className="admin-error">{err}</p>
              ))}
            </div>
          )}

          {report.matchedExamples && report.matchedExamples.length > 0 && (
            <>
              <h4 className="admin-section-title" style={{ marginTop: 16 }}>
                Обновлено (примеры, до 10)
              </h4>
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>xmlid</th>
                      <th>description</th>
                      <th>price</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.matchedExamples.map((m, i) => (
                      <tr key={i}>
                        <td className="admin-td-mono">{m.xmlid}</td>
                        <td>{m.description}</td>
                        <td className="admin-td-price">{m.price.toLocaleString('ru-RU')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {report.notFoundExamples && report.notFoundExamples.length > 0 && (
            <>
              <h4 className="admin-section-title" style={{ marginTop: 16 }}>
                Не найдено в базе ({report.notFoundCount})
              </h4>
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>xmlid</th>
                      <th>description</th>
                      <th>price</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.notFoundExamples.map((nf, i) => (
                      <tr key={i}>
                        <td className="admin-td-mono">{nf.xmlid}</td>
                        <td>{nf.description}</td>
                        <td className="admin-td-price">{nf.price.toLocaleString('ru-RU')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
