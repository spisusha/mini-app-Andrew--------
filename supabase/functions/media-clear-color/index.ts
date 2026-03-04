import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { verifyAdminToken, unauthorized } from '../_shared/adminAuth.ts';

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

    const { familyId, colorLabel } = (await req.json()) as {
      familyId: string;
      colorLabel: string;
    };

    if (!familyId || !colorLabel) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const { data: variants, error: fetchErr } = await supabase
      .from('variants')
      .select('id')
      .eq('family_id', familyId)
      .eq('options->>colorLabel', colorLabel);

    if (fetchErr) throw new Error(fetchErr.message);

    const ids = (variants || []).map((v: { id: string }) => v.id);
    if (ids.length === 0) {
      return new Response(
        JSON.stringify({ updatedVariantsCount: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const { error: updateErr } = await supabase
      .from('variants')
      .update({ images: [], updated_at: new Date().toISOString() })
      .in('id', ids);

    if (updateErr) throw new Error(updateErr.message);

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
