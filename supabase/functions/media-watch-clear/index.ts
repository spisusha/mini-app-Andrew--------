import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { verifyAdminToken, unauthorized } from '../_shared/adminAuth.ts';

interface RequestBody {
  variantId: string;
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

    const { variantId } = (await req.json()) as RequestBody;

    if (!variantId) {
      return new Response(
        JSON.stringify({ error: 'Missing variantId' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const { error: updateErr } = await supabase
      .from('variants')
      .update({ images: [], updated_at: new Date().toISOString() })
      .eq('id', variantId);

    if (updateErr) throw new Error(updateErr.message);

    return new Response(
      JSON.stringify({ ok: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
