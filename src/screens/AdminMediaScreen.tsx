import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../api/supabaseClient';
import './AdminMediaScreen.css';

const BASE = import.meta.env.VITE_SUPABASE_URL as string;
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
const LS_TOKEN = 'admin_token';
const LS_EXPIRES = 'admin_expires';

// ── helpers ──────────────────────────────────────────────────────────

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

async function callFn<T = unknown>(
  name: string,
  body: unknown,
  token: string,
): Promise<T> {
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

function colorSlug(label: string) {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/_+$/, '');
}

interface Family {
  id: string;
  title: string;
}

interface VariantRow {
  id: string;
  options: Record<string, string>;
  images: string[] | null;
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
    <div className="page admin-page media-login">
      <h1 className="page-title">Admin Media</h1>
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

// ── Main media UI ────────────────────────────────────────────────────

function MediaManager({ onLogout }: { onLogout: () => void }) {
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

  // Load families
  useEffect(() => {
    if (!supabase) return;
    supabase
      .from('product_families')
      .select('id, title')
      .order('title')
      .then(({ data }) => {
        if (data) setFamilies(data);
      });
  }, []);

  // Load variants when family changes
  useEffect(() => {
    if (!supabase || !familyId) {
      setVariants([]);
      setColors([]);
      setColorLabel('');
      return;
    }
    supabase
      .from('variants')
      .select('id, options, images')
      .eq('family_id', familyId)
      .then(({ data }) => {
        const rows = (data || []) as VariantRow[];
        setVariants(rows);
        const unique = [
          ...new Set(rows.map((v) => v.options?.colorLabel).filter(Boolean)),
        ].sort() as string[];
        setColors(unique);
        setColorLabel('');
      });
  }, [familyId]);

  // Load current images when color changes
  useEffect(() => {
    if (!colorLabel || variants.length === 0) {
      setCurrentImages([]);
      return;
    }
    const match = variants.find((v) => v.options?.colorLabel === colorLabel);
    setCurrentImages((match?.images as string[]) || []);
  }, [colorLabel, variants]);

  // File selection
  const handleFiles = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || []).slice(0, 10);
    setFiles(selected);
    setPreviews(selected.map((f) => URL.createObjectURL(f)));
  }, []);

  // Cleanup previews
  useEffect(() => {
    return () => previews.forEach((u) => URL.revokeObjectURL(u));
  }, [previews]);

  // Refresh images from DB
  const refreshImages = useCallback(async () => {
    if (!supabase || !familyId || !colorLabel) return;
    const { data } = await supabase
      .from('variants')
      .select('images')
      .eq('family_id', familyId)
      .eq('options->>colorLabel', colorLabel)
      .limit(1);
    setCurrentImages(((data?.[0]?.images as string[]) || []));
  }, [familyId, colorLabel]);

  // Upload & Apply
  const handleUpload = async () => {
    if (!supabase || files.length === 0 || !familyId || !colorLabel) return;
    setUploading(true);
    setError('');
    setMessage('');

    try {
      const slug = colorSlug(colorLabel);
      const urls: string[] = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setProgress(`Загрузка ${i + 1}/${files.length}: ${file.name}`);
        const ts = Date.now();
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const path = `iphone/${familyId}/${slug}/${ts}-${safeName}`;

        const { error: upErr } = await supabase.storage
          .from('products')
          .upload(path, file, { upsert: true });
        if (upErr) throw new Error(`Upload ${file.name}: ${upErr.message}`);

        const {
          data: { publicUrl },
        } = supabase.storage.from('products').getPublicUrl(path);
        urls.push(publicUrl);
      }

      setProgress('Применение к вариантам...');
      const result = await callFn<{ updatedVariantsCount: number; savedUrls: string[] }>(
        'media-upload-and-apply',
        { familyId, colorLabel, mode, publicUrls: urls, setAsCover },
        auth.token,
      );

      setMessage(
        `Готово! Обновлено ${result.updatedVariantsCount} вариантов, ${result.savedUrls.length} фото.`,
      );
      setFiles([]);
      setPreviews([]);
      if (fileRef.current) fileRef.current.value = '';
      await refreshImages();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
      setProgress('');
    }
  };

  // Remove single image
  const handleRemove = async (url: string) => {
    if (!confirm('Удалить это изображение?')) return;
    setError('');
    try {
      await callFn('media-remove-image', {
        familyId,
        colorLabel,
        urlToRemove: url,
        deleteFromStorage: true,
      }, auth.token);
      await refreshImages();
      setMessage('Изображение удалено');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Remove failed');
    }
  };

  // Clear all color images
  const handleClear = async () => {
    if (!confirm(`Очистить все фото для "${colorLabel}"?`)) return;
    setError('');
    try {
      await callFn('media-clear-color', { familyId, colorLabel }, auth.token);
      await refreshImages();
      setMessage('Все фото цвета очищены');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Clear failed');
    }
  };

  // Set as family cover
  const handleSetCover = async () => {
    if (currentImages.length === 0) return;
    if (!confirm('Установить текущие фото цвета как обложку товара?')) return;
    setError('');
    try {
      await callFn('media-set-family-cover', {
        familyId,
        mode: 'replace',
        publicUrls: currentImages,
      }, auth.token);
      setMessage('Обложка товара обновлена');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Cover update failed');
    }
  };

  return (
    <div className="page admin-page">
      <div className="media-header">
        <h1 className="page-title">Media Manager</h1>
        <button className="btn btn-outline media-logout" onClick={onLogout}>
          Выйти
        </button>
      </div>

      {/* Family selector */}
      <div className="media-section">
        <label className="media-label">Модель</label>
        <select
          className="media-select"
          value={familyId}
          onChange={(e) => setFamilyId(e.target.value)}
        >
          <option value="">— Выберите модель —</option>
          {families.map((f) => (
            <option key={f.id} value={f.id}>
              {f.title}
            </option>
          ))}
        </select>
      </div>

      {/* Color selector */}
      {colors.length > 0 && (
        <div className="media-section">
          <label className="media-label">Цвет</label>
          <select
            className="media-select"
            value={colorLabel}
            onChange={(e) => setColorLabel(e.target.value)}
          >
            <option value="">— Выберите цвет —</option>
            {colors.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Current images */}
      {colorLabel && (
        <div className="media-section">
          <h3 className="media-subtitle">
            Текущие фото ({currentImages.length})
          </h3>
          {currentImages.length === 0 ? (
            <p className="media-empty">Нет фото для этого цвета</p>
          ) : (
            <div className="media-grid">
              {currentImages.map((url, i) => (
                <div key={i} className="media-card">
                  <img
                    src={url}
                    alt={`${colorLabel} ${i + 1}`}
                    className="media-card__img"
                  />
                  <div className="media-card__actions">
                    <span className="media-card__idx">#{i + 1}</span>
                    <button
                      className="btn btn-sm btn-danger"
                      onClick={() => handleRemove(url)}
                    >
                      Удалить
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="media-toolbar">
            <button
              className="btn btn-outline btn-sm"
              onClick={handleSetCover}
              disabled={currentImages.length === 0}
            >
              Установить как обложку
            </button>
            <button
              className="btn btn-outline btn-sm btn-danger-outline"
              onClick={handleClear}
              disabled={currentImages.length === 0}
            >
              Очистить все фото цвета
            </button>
          </div>
        </div>
      )}

      {/* Upload block */}
      {colorLabel && (
        <div className="media-section">
          <h3 className="media-subtitle">Загрузка</h3>

          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            onChange={handleFiles}
            className="media-file-input"
          />

          {previews.length > 0 && (
            <div className="media-previews">
              {previews.map((src, i) => (
                <img
                  key={i}
                  src={src}
                  alt={`preview ${i + 1}`}
                  className="media-preview-img"
                />
              ))}
            </div>
          )}

          <div className="media-mode">
            <label className={`media-mode-opt${mode === 'append' ? ' active' : ''}`}>
              <input
                type="radio"
                name="mode"
                checked={mode === 'append'}
                onChange={() => setMode('append')}
              />
              Добавить к существующим
            </label>
            <label className={`media-mode-opt${mode === 'replace' ? ' active' : ''}`}>
              <input
                type="radio"
                name="mode"
                checked={mode === 'replace'}
                onChange={() => setMode('replace')}
              />
              Заменить полностью
            </label>
          </div>

          <label className="media-checkbox">
            <input
              type="checkbox"
              checked={setAsCover}
              onChange={(e) => setSetAsCover(e.target.checked)}
            />
            Также установить как обложку модели
          </label>

          <button
            className="btn btn-primary btn-block"
            disabled={uploading || files.length === 0}
            onClick={handleUpload}
          >
            {uploading
              ? progress || 'Загрузка...'
              : `Загрузить и применить (${files.length} файлов)`}
          </button>
        </div>
      )}

      {error && <p className="admin-error">{error}</p>}
      {message && <p className="media-success">{message}</p>}
    </div>
  );
}

// ── Root component ───────────────────────────────────────────────────

export default function AdminMediaScreen() {
  const [authed, setAuthed] = useState(() => !!getAuth());

  const handleLogout = () => {
    localStorage.removeItem(LS_TOKEN);
    localStorage.removeItem(LS_EXPIRES);
    setAuthed(false);
  };

  if (!authed) return <LoginScreen onLogin={() => setAuthed(true)} />;
  return <MediaManager onLogout={handleLogout} />;
}
