import { supabase } from './supabaseClient';
import type { OrderPayload } from '../domain/types';

export async function saveOrder(payload: OrderPayload): Promise<string | null> {
  if (!supabase) {
    console.log('[mock] Order saved:', payload);
    return crypto.randomUUID();
  }

  const { data, error } = await supabase
    .from('orders')
    .insert({ payload, created_at: payload.createdAt })
    .select('id')
    .single();

  if (error) {
    console.error('saveOrder error', error);
    return null;
  }
  return data.id;
}

export async function notifyTelegram(orderId: string, payload: OrderPayload): Promise<void> {
  if (!supabase) {
    console.log('[mock] Telegram notify:', orderId);
    return;
  }

  try {
    const { error } = await supabase.functions.invoke('send-order-telegram', {
      body: { orderId, payload },
    });
    if (error) console.error('notifyTelegram error:', error);
  } catch (err) {
    console.error('notifyTelegram failed:', err);
  }
}
