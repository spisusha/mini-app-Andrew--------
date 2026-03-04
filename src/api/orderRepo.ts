import { supabase } from './supabaseClient';
import type { OrderPayload } from '../domain/types';

interface CreateOrderResult {
  ok: boolean;
  orderId: string;
  tgSent: number;
  tgFailed: number;
  error?: string;
}

export async function createOrder(payload: OrderPayload): Promise<string | null> {
  if (!supabase) {
    console.log('[mock] Order created:', payload);
    return crypto.randomUUID();
  }

  try {
    const { data, error } = await supabase.functions.invoke<CreateOrderResult>('create-order', {
      body: payload,
    });

    if (error) {
      console.error('createOrder invoke error:', error);
      return null;
    }

    if (!data?.ok) {
      console.error('createOrder server error:', data?.error);
      return null;
    }

    console.log(`Order created: ${data.orderId}, TG sent: ${data.tgSent}, failed: ${data.tgFailed}`);
    return data.orderId;
  } catch (err) {
    console.error('createOrder failed:', err);
    return null;
  }
}
