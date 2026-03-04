import { corsHeaders } from '../_shared/cors.ts';
import { signAdminToken } from '../_shared/adminAuth.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { pin } = (await req.json()) as { pin?: string };

    const correctPin = Deno.env.get('ADMIN_PIN');
    if (!correctPin) {
      return new Response(
        JSON.stringify({ error: 'ADMIN_PIN not configured on server' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (!pin || pin !== correctPin) {
      return new Response(
        JSON.stringify({ error: 'Invalid PIN' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const { token, expiresAt } = await signAdminToken();

    return new Response(
      JSON.stringify({ token, expiresAt }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
