import type { TgUser } from '../domain/types';

interface TelegramWebApp {
  initData: string;
  initDataUnsafe: {
    user?: TgUser;
  };
  ready: () => void;
  expand: () => void;
  close: () => void;
  MainButton: {
    setText: (t: string) => void;
    show: () => void;
    hide: () => void;
    onClick: (cb: () => void) => void;
  };
  themeParams: Record<string, string>;
}

declare global {
  interface Window {
    Telegram?: {
      WebApp?: TelegramWebApp;
    };
  }
}

function getWebApp(): TelegramWebApp | null {
  return window.Telegram?.WebApp ?? null;
}

export function initTelegram(): void {
  const wa = getWebApp();
  if (wa) {
    wa.ready();
    wa.expand();
  }
}

export function getTgUser(): TgUser | null {
  return getWebApp()?.initDataUnsafe?.user ?? null;
}

export function isTelegramEnv(): boolean {
  return !!getWebApp()?.initData;
}

let _guestId: string | null = null;
export function getGuestId(): string {
  if (!_guestId) {
    _guestId = localStorage.getItem('guest_id');
    if (!_guestId) {
      _guestId = crypto.randomUUID();
      localStorage.setItem('guest_id', _guestId);
    }
  }
  return _guestId;
}
