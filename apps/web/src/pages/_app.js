import Head from 'next/head';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';

function RouteLoader({ active }) {
  return (
    <>
      <div
        style={{
          position: 'fixed',
          inset: 0,
          pointerEvents: 'none',
          opacity: active ? 1 : 0,
          transition: 'opacity 180ms ease',
          zIndex: 9999,
          display: 'grid',
          placeItems: 'center',
          background: 'radial-gradient(circle at top, rgba(34,197,94,0.15), transparent 24%), radial-gradient(circle at 80% 20%, rgba(14,165,233,0.18), transparent 20%), rgba(2,6,23,0.42)',
          backdropFilter: 'blur(10px)',
        }}
        aria-hidden={!active}
      >
        <div style={{ display: 'grid', gap: '14px', justifyItems: 'center' }}>
          <div style={{ position: 'relative', width: '110px', height: '110px' }}>
            <div className="cosmix-loader-orbit cosmix-loader-orbit-a" />
            <div className="cosmix-loader-orbit cosmix-loader-orbit-b" />
            <div className="cosmix-loader-core">CMX</div>
          </div>
          <div style={{ display: 'grid', gap: '6px', justifyItems: 'center' }}>
            <div style={{ fontSize: '12px', letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(226,232,240,0.72)', fontWeight: 800 }}>Loading workspace</div>
            <div style={{ fontSize: '14px', color: '#f8fafc', fontWeight: 700 }}>Pulling your next cockpit into view...</div>
          </div>
        </div>
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
          background: 'linear-gradient(90deg, #22c55e 0%, #06b6d4 45%, #f59e0b 100%)',
          boxShadow: '0 0 18px rgba(6,182,212,0.45)',
        }}
      />
    </>
  );
}

export default function App({ Component, pageProps }) {
  const router = useRouter();
  const [routeLoading, setRouteLoading] = useState(false);

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
        <meta name="theme-color" content="#0f172a" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
      </Head>
      <style jsx global>{`
        *, *::before, *::after { box-sizing: border-box; }
        html, body, #__next { max-width: 100%; overflow-x: hidden; }
        body { margin: 0; }
        .cosmix-loader-orbit {
          position: absolute;
          inset: 0;
          border-radius: 999px;
          border: 2px solid transparent;
        }
        .cosmix-loader-orbit-a {
          border-top-color: rgba(34, 197, 94, 0.95);
          border-right-color: rgba(6, 182, 212, 0.9);
          animation: cosmixSpin 1.15s linear infinite;
        }
        .cosmix-loader-orbit-b {
          inset: 12px;
          border-bottom-color: rgba(245, 158, 11, 0.95);
          border-left-color: rgba(59, 130, 246, 0.9);
          animation: cosmixSpinReverse 1.4s linear infinite;
        }
        .cosmix-loader-core {
          position: absolute;
          inset: 28px;
          display: grid;
          place-items: center;
          border-radius: 999px;
          background: linear-gradient(135deg, rgba(15,23,42,0.96), rgba(30,41,59,0.94));
          color: #f8fafc;
          font-size: 18px;
          font-weight: 900;
          letter-spacing: 0.14em;
          box-shadow: 0 0 0 1px rgba(148,163,184,0.16), 0 18px 40px rgba(15,23,42,0.28);
        }
        @keyframes cosmixSpin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes cosmixSpinReverse {
          from { transform: rotate(360deg); }
          to { transform: rotate(0deg); }
        }
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
      `}</style>
      <RouteLoader active={routeLoading} />
      <Component {...pageProps} />
    </>
  );
}