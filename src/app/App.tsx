import { useEffect } from 'react';
import AppRouter from './Router';
import { initTelegram } from '../telegram/telegramWebApp';
import '../styles/globals.css';

export default function App() {
  useEffect(() => {
    initTelegram();
  }, []);

  return <AppRouter />;
}
