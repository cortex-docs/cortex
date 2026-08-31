export type ConsentChoice = 'granted' | 'denied';

export interface ConsentState {
  choice: ConsentChoice | null;
  required: boolean;
  enabled: boolean;
  ready: boolean;
}

export const CONSENT_CHANGED = 'cortex:consent-changed';
export const CONSENT_REOPEN = 'cortex:consent-reopen';
export const CONSENT_STORAGE_KEY = 'cortex.cookie-consent.v1';
const COUNTRY_STORAGE_KEY = 'cortex.country';

const CONSENT_REQUIRED = new Set([
  'AT',
  'BE',
  'BG',
  'CY',
  'CZ',
  'DE',
  'DK',
  'EE',
  'ES',
  'FI',
  'FR',
  'GR',
  'HR',
  'HU',
  'IE',
  'IT',
  'LT',
  'LU',
  'LV',
  'MT',
  'NL',
  'PL',
  'PT',
  'RO',
  'SE',
  'SI',
  'SK',
  'IS',
  'LI',
  'NO',
  'GB',
  'CH',
]);

export function isAnalyticsHost(hostname: string, enabledHosts: string[]): boolean {
  const normalizedHostname = hostname.toLowerCase();
  return enabledHosts.some((host) => host.toLowerCase() === normalizedHostname);
}

export function analyticsAllowed(state: ConsentState): boolean {
  if (!state.ready || !state.enabled) return false;
  return state.choice === 'granted' || (state.choice === null && !state.required);
}

export function readConsent(): ConsentChoice | null {
  try {
    const stored = window.localStorage.getItem(CONSENT_STORAGE_KEY);
    return stored === 'granted' || stored === 'denied' ? stored : null;
  } catch {
    return null;
  }
}

export function writeConsent(choice: ConsentChoice): void {
  try {
    window.localStorage.setItem(CONSENT_STORAGE_KEY, choice);
  } catch {
    // The choice still applies to the current page when storage is unavailable.
  }

  window.dispatchEvent(new CustomEvent<ConsentChoice>(CONSENT_CHANGED, { detail: choice }));
}

export function openConsentSettings(): void {
  window.dispatchEvent(new Event(CONSENT_REOPEN));
}

async function visitorCountry(): Promise<string | null> {
  try {
    const cached = window.sessionStorage.getItem(COUNTRY_STORAGE_KEY);
    if (cached) return cached === '?' ? null : cached;
  } catch {
    // Continue without storage. Unknown locations require consent.
  }

  let code: string | null = null;

  try {
    const response = await fetch('/cdn-cgi/trace', { cache: 'no-store' });
    if (response.ok) {
      const match = /^loc=([A-Z]{2})$/m.exec(await response.text());
      if (match && match[1] !== 'XX' && match[1] !== 'T1') code = match[1];
    }
  } catch {
    // Fail closed when the visitor location is unknown.
  }

  try {
    window.sessionStorage.setItem(COUNTRY_STORAGE_KEY, code ?? '?');
  } catch {
    // The location is checked again during the next browser session.
  }

  return code;
}

export async function consentRequired(): Promise<boolean> {
  const code = await visitorCountry();
  return code === null || CONSENT_REQUIRED.has(code);
}
