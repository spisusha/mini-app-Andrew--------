import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { verifyAdminToken, unauthorized } from '../_shared/adminAuth.ts';

interface RequestBody {
  familyId: string;
  colorLabel: string;
  urlToRemove: string;
  deleteFromStorage?: boolean;
}

function normalizeColorKey(value: string): string {
  return value.trim().toLowerCase().replace(/[\s-]+/g, '_').replace(/[^a-z0-9_]/g, '');
}

interface FamilyImages { cover: string[]; byColor: Record<string, string[]> }
function parseFamilyImages(raw: unknown): FamilyImages {
  if (Array.isArray(raw)) return { cover: raw as string[], byColor: {} };
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const obj = raw as Record<string, unknown>;
    return { cover: Array.isArray(obj.cover) ? (obj.cover as string[]) : [], byColor: (obj.byColor as Record<string, string[]>) || {} };
  }
  return { cover: [], byColor: {} };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (!(await verifyAdminToken(req))) return unauthorized();

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { familyId, colorLabel, urlToRemove, deleteFromStorage } =
      (await req.json()) as RequestBody;

    if (!familyId || !colorLabel || !urlToRemove) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const colorKey = normalizeColorKey(colorLabel);

    const { data: famRow, error: famErr } = await supabase
      .from('product_families')
      .select('images')
      .eq('id', familyId)
      .single();
    if (famErr) throw new Error(famErr.message);

    const fi = parseFamilyImages(famRow?.images);
    const existing = fi.byColor[colorKey] || [];
    fi.byColor[colorKey] = existing.filter((u) => u !== urlToRemove);
    fi.cover = fi.cover.filter((u) => u !== urlToRemove);

    const { error: updateErr } = await supabase
      .from('product_families')
      .update({ images: fi })
      .eq('id', familyId);
    if (updateErr) throw new Error(updateErr.message);

    if (deleteFromStorage) {
      try {
        const bucketBase = `/storage/v1/object/public/products/`;
        const idx = urlToRemove.indexOf(bucketBase);
        if (idx !== -1) {
          const path = urlToRemove.slice(idx + bucketBase.length);
          await supabase.storage.from('products').remove([decodeURIComponent(path)]);
        }
      } catch { /* non-critical */ }
    }

    return new Response(
      JSON.stringify({ ok: true, colorKey, remaining: fi.byColor[colorKey] }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
