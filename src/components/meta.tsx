import { buildUrl } from "@/utils/buildUrl";
import Head from "next/head";
import { useTranslation } from "next-i18next";

export const Meta = () => {
  const { t } = useTranslation();
  const base = process.env.NEXT_PUBLIC_BASE_URL ?? "https://room.bot-tan.com";
  const imageUrl = `${base}/ogp.png`;
  return (
    <Head>
      <title>{t("meta.title")}</title>
      <meta name="description" content={t("meta.description")} />
      <meta property="og:title" content={t("meta.title")} />
      <meta property="og:description" content={t("meta.description")} />
      <meta property="og:image" content={imageUrl} />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={t("meta.title")} />
      <meta name="twitter:description" content={t("meta.description")} />
      <meta name="twitter:image" content={imageUrl} />
    </Head>
  );
};
