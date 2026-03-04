import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { verifyAdminToken, unauthorized } from '../_shared/adminAuth.ts';

interface RequestBody {
  variantId: string;
  mode: 'append' | 'replace';
  publicUrls: string[];
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

    const { variantId, mode, publicUrls } = (await req.json()) as RequestBody;

    if (!variantId || !publicUrls?.length) {
      return new Response(
        JSON.stringify({ error: 'Missing variantId or publicUrls' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const { data: variant, error: fetchErr } = await supabase
      .from('variants')
      .select('id, images')
      .eq('id', variantId)
      .single();

    if (fetchErr || !variant) {
      return new Response(
        JSON.stringify({ error: 'Variant not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    let savedUrls: string[];
    if (mode === 'replace') {
      savedUrls = publicUrls;
    } else {
      const existing: string[] = (variant.images as string[]) || [];
      savedUrls = [...new Set([...existing, ...publicUrls])];
    }

    const { error: updateErr } = await supabase
      .from('variants')
      .update({ images: savedUrls, updated_at: new Date().toISOString() })
      .eq('id', variantId);

    if (updateErr) throw new Error(updateErr.message);

    return new Response(
      JSON.stringify({ ok: true, savedUrls, finalCount: savedUrls.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
