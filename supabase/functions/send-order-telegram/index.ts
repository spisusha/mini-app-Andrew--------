import { corsHeaders } from '../_shared/cors.ts';

interface CartItem {
  titleSnapshot: string;
  priceSnapshot: number;
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
  paymentMethod: 'cash' | 'online';
  tgUser?: TgUser | null;
  guestId?: string;
  createdAt: string;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
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
    const lineTotal = item.priceSnapshot * item.qty;
    lines.push(
      `  • ${escapeHtml(item.titleSnapshot)} ×${item.qty} — ${formatPrice(lineTotal)} ₽`,
    );
  }

  lines.push('');
  lines.push(`💰 <b>Итого:</b> ${formatPrice(p.totals)} ₽`);

  const deliveryLabel = p.deliveryMethod === 'pickup' ? 'Самовывоз' : 'Доставка';
  lines.push(`🚚 <b>Получение:</b> ${deliveryLabel}`);

  if (p.deliveryMethod === 'delivery' && p.address) {
    lines.push(`📍 <b>Адрес:</b> ${escapeHtml(p.address)}`);
  }

  const paymentLabel = p.paymentMethod === 'cash' ? 'Наличными' : 'Перевод / Карта';
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

  try {
    const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
    const chatIdsRaw = Deno.env.get('TELEGRAM_ADMIN_CHAT_IDS') || '';

    if (!botToken) {
      return new Response(
        JSON.stringify({ error: 'TELEGRAM_BOT_TOKEN not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const chatIds = chatIdsRaw.split(',').map((s) => s.trim()).filter(Boolean);

    if (chatIds.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No TELEGRAM_ADMIN_CHAT_IDS configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const { orderId, payload } = (await req.json()) as {
      orderId: string;
      payload: OrderPayload;
    };

    if (!orderId || !payload) {
      return new Response(
        JSON.stringify({ error: 'orderId and payload are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const text = buildMessage(orderId, payload);

    const userId = payload.tgUser?.id;
    const replyMarkup = userId
      ? {
          inline_keyboard: [
            [{ text: '✉️ Написать клиенту', url: `tg://user?id=${userId}` }],
          ],
        }
      : undefined;

    let sentCount = 0;
    let failedCount = 0;
    const failedDetails: { chatId: string; error: string }[] = [];

    for (const chatId of chatIds) {
      try {
        const body: Record<string, unknown> = {
          chat_id: chatId,
          text,
          parse_mode: 'HTML',
          disable_web_page_preview: true,
        };
        if (replyMarkup) {
          body.reply_markup = replyMarkup;
        }

        const resp = await fetch(
          `https://api.telegram.org/bot${botToken}/sendMessage`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          },
        );

        const result = await resp.json();
        if (result.ok) {
          sentCount++;
        } else {
          console.error(`Telegram send failed for ${chatId}:`, result);
          failedCount++;
          failedDetails.push({ chatId, error: result.description || JSON.stringify(result) });
        }
      } catch (err) {
        console.error(`Telegram send error for ${chatId}:`, err);
        failedCount++;
        failedDetails.push({ chatId, error: (err as Error).message });
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        sentCount,
        failedCount,
        failedIds: failedDetails.map((d) => d.chatId),
        failedDetails,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
