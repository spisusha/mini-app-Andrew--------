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

    const results: string[] = [];

    // 1. Ensure bucket
    const { data: buckets } = await supabase.storage.listBuckets();
    const exists = buckets?.some((b: { name: string }) => b.name === 'products');
    if (exists) results.push('Bucket "products" exists');
    else {
      const { error } = await supabase.storage.createBucket('products', { public: true, fileSizeLimit: 10485760 });
      results.push(error ? `Bucket error: ${error.message}` : 'Bucket "products" created');
    }

    // 2. Fix storage RLS + variants.images via direct DB
    const dbUrl = Deno.env.get('SUPABASE_DB_URL');
    if (!dbUrl) {
      results.push('SUPABASE_DB_URL not available');
    } else {
      const { Client } = await import('https://deno.land/x/postgres@v0.19.3/mod.ts');
      const client = new Client(dbUrl);
      await client.connect();

      const sqls = [
        // Ensure variants.images column
        `ALTER TABLE public.variants ADD COLUMN IF NOT EXISTS images JSONB DEFAULT '[]'::jsonb`,
        // Drop old granular policies if they exist
        `DROP POLICY IF EXISTS "products_public_select" ON storage.objects`,
        `DROP POLICY IF EXISTS "products_public_insert" ON storage.objects`,
        `DROP POLICY IF EXISTS "products_public_update" ON storage.objects`,
        `DROP POLICY IF EXISTS "products_public_delete" ON storage.objects`,
        `DROP POLICY IF EXISTS "products_allow_all" ON storage.objects`,
        // Single universal policy: allow all ops on 'products' bucket for any role
        `CREATE POLICY "products_allow_all" ON storage.objects
           FOR ALL
           TO public
           USING (bucket_id = 'products')
           WITH CHECK (bucket_id = 'products')`,
      ];

      for (const sql of sqls) {
        try {
          await client.queryArray(sql);
          const label = sql.replace(/\s+/g, ' ').slice(0, 70);
          results.push(`OK: ${label}...`);
        } catch (e) {
          results.push(`SQL err: ${(e as Error).message}`);
        }
      }

      await client.end();
    }

    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
