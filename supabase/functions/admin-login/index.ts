import { corsHeaders } from '../_shared/cors.ts';
import { signAdminToken } from '../_shared/adminAuth.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = (await req.json()) as { pin?: string; password?: string };
    const input = body.password ?? body.pin ?? '';

    const secret = Deno.env.get('ADMIN_PASSWORD') ?? Deno.env.get('ADMIN_PIN');
    if (!secret) {
      return new Response(
        JSON.stringify({ error: 'ADMIN_PASSWORD not set' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (!input || input !== secret) {
      return new Response(
        JSON.stringify({ error: 'Invalid password' }),
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
