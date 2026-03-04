import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { verifyAdminToken, unauthorized } from '../_shared/adminAuth.ts';

interface RequestBody {
  familyId: string;
  colorLabel: string;
  urlToRemove: string;
  deleteFromStorage?: boolean;
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

    const { data: variants, error: fetchErr } = await supabase
      .from('variants')
      .select('id, images')
      .eq('family_id', familyId)
      .eq('options->>colorLabel', colorLabel);

    if (fetchErr) throw new Error(fetchErr.message);
    if (!variants || variants.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No variants found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const existing: string[] = (variants[0].images as string[]) || [];
    const updated = existing.filter((u) => u !== urlToRemove);

    const ids = variants.map((v: { id: string }) => v.id);
    const { error: updateErr } = await supabase
      .from('variants')
      .update({ images: updated, updated_at: new Date().toISOString() })
      .in('id', ids);

    if (updateErr) throw new Error(updateErr.message);

    // Try to delete from storage
    if (deleteFromStorage) {
      try {
        const bucketBase = `/storage/v1/object/public/products/`;
        const idx = urlToRemove.indexOf(bucketBase);
        if (idx !== -1) {
          const path = urlToRemove.slice(idx + bucketBase.length);
          await supabase.storage.from('products').remove([decodeURIComponent(path)]);
        }
      } catch {
        // Non-critical: image stays in storage
      }
    }

    return new Response(
      JSON.stringify({ updatedVariantsCount: ids.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
