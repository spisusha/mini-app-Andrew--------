import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { verifyAdminToken, unauthorized } from '../_shared/adminAuth.ts';

interface RequestBody {
  familyId: string;
  mode: 'append' | 'replace';
  publicUrls: string[];
}

interface FamilyImages {
  cover: string[];
  byColor: Record<string, string[]>;
}

function parseFamilyImages(raw: unknown): FamilyImages {
  if (Array.isArray(raw)) return { cover: raw as string[], byColor: {} };
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const obj = raw as Record<string, unknown>;
    return {
      cover: Array.isArray(obj.cover) ? (obj.cover as string[]) : [],
      byColor: (obj.byColor as Record<string, string[]>) || {},
    };
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

    const { familyId, mode, publicUrls } = (await req.json()) as RequestBody;

    if (!familyId || !publicUrls?.length) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const { data, error: fetchErr } = await supabase
      .from('product_families')
      .select('images')
      .eq('id', familyId)
      .single();
    if (fetchErr) throw new Error(fetchErr.message);

    const fi = parseFamilyImages(data?.images);

    if (mode === 'append') {
      fi.cover = [...new Set([...fi.cover, ...publicUrls])];
    } else {
      fi.cover = publicUrls;
    }

    const { error: updateErr } = await supabase
      .from('product_families')
      .update({ images: fi })
      .eq('id', familyId);

    if (updateErr) throw new Error(updateErr.message);

    return new Response(
      JSON.stringify({ ok: true, images: fi.cover }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
