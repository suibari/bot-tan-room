import { buildUrl } from "@/utils/buildUrl";
import { Html, Head, Main, NextScript } from "next/document";

export default function Document() {
  return (
    <Html lang="ja">
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#856292" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Bot-tan" />
        <link rel="manifest" href={buildUrl("/manifest.json")} />
        <link rel="apple-touch-icon" href={buildUrl("/icons/apple-touch-icon.png")} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin=""
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;800;900&family=Zen+Maru+Gothic:wght@400;500;700;900&display=swap"
          rel="stylesheet"
        />
        <link rel="icon" href={buildUrl("/favicon.png")} type="image/png" />
      </Head>
      <body style={{ background: "linear-gradient(135deg, #3a9bd5 0%, #74bfe8 50%, #9bf6ff 100%)" }}>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
