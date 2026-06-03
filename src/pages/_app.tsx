import "@/styles/globals.css";
import type { AppProps } from "next/app";
import "@charcoal-ui/icons";
import { appWithTranslation } from 'next-i18next';
import { GoogleAnalytics } from "@next/third-parties/google";

function App({ Component, pageProps }: AppProps) {
  return (
    <>
      <Component {...pageProps} />
      <GoogleAnalytics gaId={process.env.NEXT_PUBLIC_GA_ID!} />
    </>
  );
}

export default appWithTranslation(App);
