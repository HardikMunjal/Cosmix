import Head from 'next/head';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { CosmixLoader } from '../lib/CosmixLoader';
import { InstallAppPrompt } from '../lib/InstallAppPrompt';
import { registerPwaServiceWorker } from '../lib/pwa';
import '../lib/CosmixLoader.css';
import '../lib/CoachBotCard.css';

function RouteLoader({ active }) {
  return (
    <>
      <div
        style={{
          position: 'fixed',
          inset: 0,
          pointerEvents: 'none',
          opacity: active ? 1 : 0,
          visibility: active ? 'visible' : 'hidden',
          transition: 'opacity 180ms ease',
          zIndex: 9999,
        }}
        aria-hidden={!active}
      >
        {active ? (
          <CosmixLoader
            variant="overlay"
            label="Loading workspace"
            sublabel="Pulling your next cockpit into view..."
          />
        ) : null}
      </div>
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          height: '4px',
          zIndex: 10000,
          transform: active ? 'scaleX(1)' : 'scaleX(0)',
          transformOrigin: 'left center',
          transition: active ? 'transform 1.2s cubic-bezier(0.22, 1, 0.36, 1)' : 'transform 160ms ease-out',
          background: 'linear-gradient(90deg, #34d399 0%, #38bdf8 45%, #a78bfa 100%)',
          boxShadow: '0 0 18px rgba(56,189,248,0.45)',
        }}
      />
    </>
  );
}

export default function App({ Component, pageProps }) {
  const router = useRouter();
  const [routeLoading, setRouteLoading] = useState(false);

  useEffect(() => {
    void registerPwaServiceWorker();
  }, []);

  useEffect(() => {
    let loaderTimeout = null;
    let safetyTimeout = null;

    const handleStart = () => {
      if (loaderTimeout) clearTimeout(loaderTimeout);
      if (safetyTimeout) clearTimeout(safetyTimeout);
      setRouteLoading(true);
      safetyTimeout = setTimeout(() => setRouteLoading(false), 12000);
    };

    const handleStop = () => {
      if (safetyTimeout) clearTimeout(safetyTimeout);
      safetyTimeout = null;
      loaderTimeout = setTimeout(() => setRouteLoading(false), 180);
    };

    router.events.on('routeChangeStart', handleStart);
    router.events.on('routeChangeComplete', handleStop);
    router.events.on('routeChangeError', handleStop);

    return () => {
      if (loaderTimeout) clearTimeout(loaderTimeout);
      if (safetyTimeout) clearTimeout(safetyTimeout);
      router.events.off('routeChangeStart', handleStart);
      router.events.off('routeChangeComplete', handleStop);
      router.events.off('routeChangeError', handleStop);
    };
  }, [router.events]);

  return (
    <>
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <link rel="manifest" href="/manifest.webmanifest" />
        <link rel="icon" href="/icons/cosmix-universe-logo.png" type="image/png" />
        <link rel="apple-touch-icon" href="/icons/cosmix-universe-logo.png" sizes="192x192" />
        <meta name="theme-color" content="#0f172a" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Cosmix" />
        <meta name="application-name" content="Cosmix" />
      </Head>
      <style jsx global>{`
        *, *::before, *::after { box-sizing: border-box; }
        html, body, #__next { max-width: 100%; overflow-x: hidden; }
        body { margin: 0; }
        @media (max-width: 640px) {
          button, input, select, textarea {
            font-size: 14px;
          }
        }
        .cosmix-mobile-nav-spacer { height: 72px; }
        .cosmix-mobile-nav {
          display: none;
          position: fixed;
          left: 0;
          right: 0;
          bottom: 0;
          z-index: 900;
          padding: 8px 10px calc(8px + env(safe-area-inset-bottom, 0px));
          background: linear-gradient(180deg, transparent, rgba(2,6,23,0.35) 12%, rgba(2,6,23,0.92) 40%);
          backdrop-filter: blur(14px);
          -webkit-backdrop-filter: blur(14px);
        }
        .cosmix-mobile-nav-inner {
          display: grid;
          grid-auto-flow: column;
          grid-auto-columns: 1fr;
          gap: 6px;
          max-width: 520px;
          margin: 0 auto;
          padding: 6px;
          border-radius: 18px;
          border: 1px solid rgba(148,163,184,0.22);
          background: rgba(15,23,42,0.94);
          box-shadow: 0 -8px 32px rgba(0,0,0,0.35);
        }
        .cosmix-mobile-nav-btn {
          appearance: none;
          border: none;
          background: transparent;
          color: var(--cosmix-nav-muted, #94a3b8);
          font-family: inherit;
          display: grid;
          gap: 3px;
          justify-items: center;
          padding: 8px 4px;
          border-radius: 12px;
          cursor: pointer;
          min-height: 48px;
          width: 100%;
          touch-action: manipulation;
          -webkit-tap-highlight-color: transparent;
          transition: background 0.15s ease, color 0.15s ease;
          text-decoration: none;
        }
        .cosmix-mobile-nav-btn.is-active,
        .cosmix-mobile-nav-btn[aria-current="page"] {
          background: rgba(59,130,246,0.18);
          color: var(--cosmix-nav-active, #38bdf8);
        }
        .cosmix-mobile-nav-icon { font-size: 18px; line-height: 1; }
        .cosmix-mobile-nav-label {
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          line-height: 1.1;
        }
        @media (max-width: 720px) {
          .cosmix-mobile-nav { display: block; }
        }
        .cosmix-mobile-nav--always { display: block; }
      `}</style>
      <RouteLoader active={routeLoading} />
      <InstallAppPrompt />
      <Component {...pageProps} />
    </>
  );
}