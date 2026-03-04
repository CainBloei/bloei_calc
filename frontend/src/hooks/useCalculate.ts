import { useState } from 'react';
import axios from 'axios';
import type { RekenInput, RekenOutput } from '../types';

/** User-safe error messages. Never expose backend stack traces or raw validation errors. */
const SAFE_ERROR_MESSAGES: Record<number, string> = {
  400: 'De invoer is ongeldig. Controleer de waarden en probeer het opnieuw.',
  401: 'Uw sessie is verlopen. Vernieuw de pagina.',
  403: 'U heeft geen toegang tot deze actie.',
  404: 'De service is niet bereikbaar.',
  422: 'De invoer is ongeldig. Controleer de waarden en probeer het opnieuw.',
  429: 'Te veel verzoeken. Wacht even en probeer het opnieuw.',
  500: 'Er is een fout opgetreden bij de berekening. Probeer het later opnieuw.',
  502: 'De service is tijdelijk niet beschikbaar. Probeer het later opnieuw.',
  503: 'De service is tijdelijk niet beschikbaar. Probeer het later opnieuw.',
};

function getSafeErrorMessage(err: unknown): string {
  const fallback = 'Er is een fout opgetreden bij de berekening. Probeer het later opnieuw.';
  if (!err || typeof err !== 'object') return fallback;

  const status = 'response' in err && err.response && typeof err.response === 'object'
    ? (err.response as { status?: number }).status
    : undefined;

  if (status && SAFE_ERROR_MESSAGES[status]) {
    return SAFE_ERROR_MESSAGES[status];
  }

  if (status && status >= 500) {
    return SAFE_ERROR_MESSAGES[500];
  }

  if (status && status >= 400) {
    return SAFE_ERROR_MESSAGES[422] ?? fallback;
  }

  if ('message' in err && typeof (err as { message: unknown }).message === 'string') {
    const msg = (err as { message: string }).message;
    if (msg.includes('Network Error') || msg.includes('fetch')) {
      return 'De service is niet bereikbaar. Controleer uw internetverbinding.';
    }
  }

  return fallback;
}

export function useCalculate() {
  const [data, setData] = useState<RekenOutput | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const calculate = async (input: RekenInput) => {
    setIsLoading(true);
    setError(null);
    try {
      const baseURL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000';
      const response = await axios.post<RekenOutput>(`${baseURL}/calculate`, input);
      setData(response.data);
    } catch (err: unknown) {
      setError(getSafeErrorMessage(err));
      if (import.meta.env.DEV) {
        console.error('Calculation Error:', err);
      }
    } finally {
      setIsLoading(false);
    }
  };

  return { calculate, data, isLoading, error };
}
