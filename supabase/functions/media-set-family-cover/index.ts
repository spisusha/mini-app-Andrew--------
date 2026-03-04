import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { verifyAdminToken, unauthorized } from '../_shared/adminAuth.ts';

interface RequestBody {
  familyId: string;
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

    const { familyId, mode, publicUrls } = (await req.json()) as RequestBody;

    if (!familyId || !publicUrls?.length) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    let finalUrls: string[];
    if (mode === 'append') {
      const { data, error: fetchErr } = await supabase
        .from('product_families')
        .select('images')
        .eq('id', familyId)
        .single();
      if (fetchErr) throw new Error(fetchErr.message);
      const existing: string[] = (data?.images as string[]) || [];
      finalUrls = [...new Set([...existing, ...publicUrls])];
    } else {
      finalUrls = publicUrls;
    }

    const { error: updateErr } = await supabase
      .from('product_families')
      .update({ images: finalUrls })
      .eq('id', familyId);

    if (updateErr) throw new Error(updateErr.message);

    return new Response(
      JSON.stringify({ ok: true, images: finalUrls }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
