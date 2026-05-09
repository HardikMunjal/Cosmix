import Head from 'next/head';

export default function App({ Component, pageProps }) {
  return (
    <>
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      </Head>
      <style jsx global>{`
        *, *::before, *::after { box-sizing: border-box; }
        html, body, #__next { max-width: 100%; overflow-x: hidden; }
        @media (max-width: 640px) {
          button, input, select, textarea {
            font-size: 14px;
          }
        }
      `}</style>
      <Component {...pageProps} />
    </>
  );
}