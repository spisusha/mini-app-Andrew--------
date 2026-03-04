import { corsHeaders } from '../_shared/cors.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

interface CartItem {
  titleSnapshot: string;
  optionsSnapshot: Record<string, string>;
  priceSnapshot: number;
  image: string;
  qty: number;
}

interface TgUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
}

interface OrderPayload {
  items: CartItem[];
  totals: number;
  deliveryMethod: 'pickup' | 'delivery';
  address?: string;
  phone?: string;
  paymentMethod: 'cash' | 'online';
  tgUser?: TgUser | null;
  guestId?: string;
  createdAt: string;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function formatPrice(n: number): string {
  return n.toLocaleString('ru-RU');
}

function buildMessage(orderId: string, p: OrderPayload): string {
  const lines: string[] = [];
  lines.push(`🧾 <b>Заказ:</b> <code>${escapeHtml(orderId)}</code>`);

  const tg = p.tgUser;
  if (tg) {
    const name = [tg.first_name, tg.last_name].filter(Boolean).join(' ');
    const usernameStr = tg.username ? ` (@${escapeHtml(tg.username)})` : '';
    lines.push(`👤 <b>Клиент:</b> ${escapeHtml(name)}${usernameStr}`);
    lines.push(`🆔 <b>Telegram ID:</b> <code>${tg.id}</code>`);
  } else if (p.guestId) {
    lines.push(`👤 <b>Клиент:</b> Гость`);
    lines.push(`🆔 <b>Guest ID:</b> <code>${escapeHtml(p.guestId)}</code>`);
  }

  lines.push('');
  lines.push('📦 <b>Позиции:</b>');
  for (const item of p.items) {
    const opts = Object.values(item.optionsSnapshot || {}).filter(Boolean).join(' · ');
    const lineTotal = item.priceSnapshot * item.qty;
    const optStr = opts ? ` (${escapeHtml(opts)})` : '';
    lines.push(
      `  • ${escapeHtml(item.titleSnapshot)}${optStr} ×${item.qty} — ${formatPrice(lineTotal)} ₽`,
    );
  }

  lines.push('');
  lines.push(`💰 <b>Итого:</b> ${formatPrice(p.totals)} ₽`);

  const deliveryLabel = p.deliveryMethod === 'pickup' ? 'Самовывоз' : 'Доставка';
  lines.push(`🚚 <b>Получение:</b> ${deliveryLabel}`);

  if (p.deliveryMethod === 'delivery' && p.address) {
    lines.push(`📍 <b>Адрес:</b> ${escapeHtml(p.address)}`);
  }

  if (p.phone) {
    lines.push(`📱 <b>Телефон:</b> ${escapeHtml(p.phone)}`);
  }

  const paymentLabel = p.paymentMethod === 'cash' ? 'Наличными' : 'Перевод';
  lines.push(`💳 <b>Оплата:</b> ${paymentLabel}`);

  if (p.createdAt) {
    const d = new Date(p.createdAt);
    const dateStr = d.toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });
    lines.push(`🕒 <b>Время:</b> ${dateStr}`);
  }

  return lines.join('\n');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const json = (d: unknown, status = 200) =>
    new Response(JSON.stringify(d), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  try {
    const payload = (await req.json()) as OrderPayload;

    if (!payload?.items?.length) {
      return json({ error: 'Empty order' }, 400);
    }

    const orderId = crypto.randomUUID();

    /* ── try to save order to DB ── */
    let dbSaved = false;
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const sb = createClient(supabaseUrl, serviceRoleKey);

      const { error: insertErr } = await sb
        .from('orders')
        .insert({ id: orderId, payload, created_at: payload.createdAt });

      if (insertErr) {
        console.error('Insert order error (non-fatal):', insertErr.message);
      } else {
        dbSaved = true;
      }
    } catch (dbErr) {
      console.error('DB save failed (non-fatal):', dbErr);
    }

    /* ── send telegram ── */
    const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
    const chatIdsRaw = Deno.env.get('TELEGRAM_ADMIN_CHAT_IDS') || '';
    const chatIds = chatIdsRaw.split(',').map((s) => s.trim()).filter(Boolean);

    let tgSent = 0;
    let tgFailed = 0;

    if (botToken && chatIds.length > 0) {
      const text = buildMessage(orderId, payload);
      const userId = payload.tgUser?.id;
      const replyMarkup = userId
        ? { inline_keyboard: [[{ text: '✉️ Написать клиенту', url: `tg://user?id=${userId}` }]] }
        : undefined;

      for (const chatId of chatIds) {
        try {
          const body: Record<string, unknown> = {
            chat_id: chatId,
            text,
            parse_mode: 'HTML',
            disable_web_page_preview: true,
          };
          if (replyMarkup) body.reply_markup = replyMarkup;

          const resp = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });
          const result = await resp.json();
          if (result.ok) tgSent++;
          else {
            console.error(`TG fail ${chatId}:`, result);
            tgFailed++;
          }
        } catch (err) {
          console.error(`TG error ${chatId}:`, err);
          tgFailed++;
        }
      }
    }

    return json({ ok: true, orderId, dbSaved, tgSent, tgFailed });
  } catch (err) {
    console.error('create-order error:', err);
    return json({ error: (err as Error).message }, 500);
  }
});
