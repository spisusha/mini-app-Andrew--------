import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { verifyAdminToken, unauthorized } from '../_shared/adminAuth.ts';

interface RequestBody {
  familyId: string;
  colorLabel: string;
  mode: 'append' | 'replace';
  publicUrls: string[];
  setAsCover?: boolean;
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

    const { familyId, colorLabel, mode, publicUrls, setAsCover } =
      (await req.json()) as RequestBody;

    if (!familyId || !colorLabel || !publicUrls?.length) {
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
        JSON.stringify({ error: 'No variants found for this color' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    let savedUrls: string[];
    if (mode === 'replace') {
      savedUrls = publicUrls;
    } else {
      const existing: string[] = (variants[0].images as string[]) || [];
      savedUrls = [...new Set([...existing, ...publicUrls])];
    }

    const ids = variants.map((v: { id: string }) => v.id);
    const { error: updateErr } = await supabase
      .from('variants')
      .update({ images: savedUrls, updated_at: new Date().toISOString() })
      .in('id', ids);

    if (updateErr) throw new Error(updateErr.message);

    if (setAsCover) {
      const { error: coverErr } = await supabase
        .from('product_families')
        .update({ images: savedUrls })
        .eq('id', familyId);
      if (coverErr) throw new Error(coverErr.message);
    }

    return new Response(
      JSON.stringify({ updatedVariantsCount: ids.length, savedUrls }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
