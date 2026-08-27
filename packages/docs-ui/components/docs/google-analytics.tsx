'use client';

import { useEffect, useRef, useState } from 'react';
import type { AnalyticsConfig } from './site-config-provider';
import {
  analyticsAllowed,
  CONSENT_CHANGED,
  CONSENT_REOPEN,
  consentRequired,
  isAnalyticsHost,
  openConsentSettings,
  readConsent,
  type ConsentChoice,
  type ConsentState,
  writeConsent,
} from '@/lib/analytics-consent';

const COOKIE_LIFETIME_SECONDS = 400 * 24 * 60 * 60;
const SCRIPT_ID = 'cortex-google-analytics';

type AnalyticsWindow = Window & {
  dataLayer?: unknown[];
  gtag?: (...args: unknown[]) => void;
  __cortexAnalyticsInitialized?: boolean;
};

function useConsent(config: AnalyticsConfig): ConsentState {
  const [state, setState] = useState<ConsentState>({
    choice: null,
    required: true,
    enabled: false,
    ready: false,
  });

  useEffect(() => {
    if (!isAnalyticsHost(window.location.hostname, config.enabledHosts)) return;
    let active = true;

    consentRequired().then((required) => {
      if (active) {
        setState({ choice: readConsent(), required, enabled: true, ready: true });
      }
    });

    const handleChange = (event: Event) => {
      setState((previous) => ({
        ...previous,
        choice: (event as CustomEvent<ConsentChoice>).detail,
      }));
    };

    window.addEventListener(CONSENT_CHANGED, handleChange);
    return () => {
      active = false;
      window.removeEventListener(CONSENT_CHANGED, handleChange);
    };
  }, [config.enabledHosts]);

  return state;
}

function clearAnalyticsCookies(): void {
  const host = window.location.hostname;
  const registrableDomain = host.split('.').slice(-2).join('.');
  const domains = ['', `; domain=${host}`, `; domain=.${host}`, `; domain=.${registrableDomain}`];

  for (const entry of document.cookie.split(';')) {
    const name = entry.split('=')[0]?.trim();
    if (!name || (name !== '_ga' && name !== '_gid' && !name.startsWith('_ga_'))) continue;

    for (const domain of domains) {
      document.cookie = `${name}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT${domain}`;
    }
  }
}

function initializeAnalytics(measurementId: string): void {
  const analyticsWindow = window as AnalyticsWindow;
  if (analyticsWindow.__cortexAnalyticsInitialized) return;

  const dataLayer = (analyticsWindow.dataLayer ??= []);
  analyticsWindow.gtag ??= function () {
    // gtag.js requires the Arguments object. It ignores a rest-parameter array.
    // eslint-disable-next-line prefer-rest-params
    dataLayer.push(arguments);
  };
  analyticsWindow.__cortexAnalyticsInitialized = true;

  analyticsWindow.gtag('js', new Date());
  analyticsWindow.gtag('consent', 'default', {
    analytics_storage: 'granted',
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
  });
  analyticsWindow.gtag('config', measurementId, {
    cookie_expires: COOKIE_LIFETIME_SECONDS,
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
  });

  if (!document.getElementById(SCRIPT_ID)) {
    const script = document.createElement('script');
    script.id = SCRIPT_ID;
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
    document.head.appendChild(script);
  }
}

function AnalyticsLoader({ config }: { config: AnalyticsConfig }) {
  const consent = useConsent(config);
  const withdrawn = useRef(false);
  const allowed = analyticsAllowed(consent);

  useEffect(() => {
    if (!consent.enabled || !consent.ready) return;

    const analyticsWindow = window as AnalyticsWindow;
    const killSwitch = `ga-disable-${config.googleAnalyticsId}`;
    const switches = window as unknown as Record<string, unknown>;

    if (consent.choice === 'denied') {
      switches[killSwitch] = true;
      withdrawn.current = true;
      analyticsWindow.gtag?.('consent', 'update', {
        analytics_storage: 'denied',
        ad_storage: 'denied',
        ad_user_data: 'denied',
        ad_personalization: 'denied',
      });
      clearAnalyticsCookies();
      return;
    }

    if (!allowed) return;

    switches[killSwitch] = false;
    const wasInitialized = analyticsWindow.__cortexAnalyticsInitialized;
    initializeAnalytics(config.googleAnalyticsId);

    if (wasInitialized && withdrawn.current) {
      withdrawn.current = false;
      analyticsWindow.gtag?.('consent', 'update', {
        analytics_storage: 'granted',
        ad_storage: 'denied',
        ad_user_data: 'denied',
        ad_personalization: 'denied',
      });
      analyticsWindow.gtag?.('event', 'page_view');
    }
  }, [allowed, config.googleAnalyticsId, consent.choice, consent.enabled, consent.ready]);

  return null;
}

function CookieBanner({ config }: { config: AnalyticsConfig }) {
  const consent = useConsent(config);
  const [reopened, setReopened] = useState(false);

  useEffect(() => {
    const reopen = () => setReopened(true);
    window.addEventListener(CONSENT_REOPEN, reopen);
    return () => window.removeEventListener(CONSENT_REOPEN, reopen);
  }, []);

  const asking = consent.ready && consent.required && consent.choice === null;
  const open = consent.enabled && consent.ready && (asking || reopened);

  useEffect(() => {
    if (!open || asking) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setReopened(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [asking, open]);

  if (!consent.enabled || !consent.ready) return null;

  if (!open) {
    return (
      <button type="button" className="cortex-cookie-settings-button" onClick={openConsentSettings}>
        Cookie settings
      </button>
    );
  }

  const choose = (choice: ConsentChoice) => {
    writeConsent(choice);
    setReopened(false);
  };
  const running = analyticsAllowed(consent);

  return (
    <section className="cortex-cookie-banner" aria-label="Cookie consent" aria-live="polite">
      <div className="cortex-cookie-banner-panel">
        <div className="cortex-cookie-banner-copy">
          <span>{asking ? 'Cookies' : 'Cookie settings'}</span>
          <p>
            {asking
              ? 'We use optional analytics cookies to understand how this site is used. Analytics stays off until you choose.'
              : 'Analytics measures how this site is used. Turning it off removes the cookies it stored.'}{' '}
            <a href={config.privacyUrl}>What we store</a>.
          </p>
        </div>
        <div className="cortex-cookie-banner-actions">
          <button
            type="button"
            className={!asking && !running ? 'active' : undefined}
            aria-pressed={asking ? undefined : !running}
            onClick={() => choose('denied')}
          >
            {asking ? 'Reject' : 'Off'}
          </button>
          <button
            type="button"
            className={asking || running ? 'primary active' : 'primary'}
            aria-pressed={asking ? undefined : running}
            onClick={() => choose('granted')}
          >
            {asking ? 'Accept' : 'On'}
          </button>
          {!asking && (
            <button
              type="button"
              className="close"
              aria-label="Close cookie settings"
              onClick={() => setReopened(false)}
            >
              ×
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

export function GoogleAnalytics({ config }: { config?: AnalyticsConfig }) {
  if (!config) return null;
  return (
    <>
      <CookieBanner config={config} />
      <AnalyticsLoader config={config} />
    </>
  );
}
