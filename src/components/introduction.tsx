import { useState, useCallback } from "react";
import { Link } from "./link";
import { useTranslation } from "next-i18next";
import { useRouter } from "next/router";

type Props = {
  koeiroMapKey: string;
  onChangeKoeiromapKey: (koeiromapKey: string) => void;
  // User Name
  userName: string;
  onChangeUserName: (userName: string) => void;
};
export const Introduction = ({
  koeiroMapKey,
  onChangeKoeiromapKey,
  userName,
  onChangeUserName,
}: Props) => {
  const { t } = useTranslation();
  const router = useRouter();
  const [opened, setOpened] = useState(true);

  const handleKoeiromapKeyChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      onChangeKoeiromapKey(event.target.value);
    },
    [onChangeKoeiromapKey]
  );

  const handleUserNameChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      onChangeUserName(event.target.value);
    },
    [onChangeUserName]
  );

  return opened ? (
    <div className="absolute z-40 w-full h-full px-24 py-40  bg-black/30 font-M_PLUS_2">
      <div className="mx-auto my-auto max-w-3xl max-h-full p-24 overflow-auto bg-white rounded-16">
        <div className="my-24">
          <div className="flex justify-between items-center my-8">
            <div className="font-bold typography-20 text-secondary ">
              {t("introduction.title")}
            </div>
            <div className="flex gap-2">
              <button
                className={`${router.locale === "ja"
                  ? "bg-secondary text-white"
                  : "bg-surface3 text-text1 hover:bg-surface3-hover"
                  } px-24 py-8 rounded-oval font-bold`}
                onClick={() => {
                  const { pathname, asPath, query } = router;
                  router.push({ pathname, query }, asPath, { locale: 'ja' });
                }}
              >
                日本語
              </button>
              <button
                className={`${router.locale === "en"
                  ? "bg-secondary text-white"
                  : "bg-surface3 text-text1 hover:bg-surface3-hover"
                  } px-24 py-8 rounded-oval font-bold`}
                onClick={() => {
                  const { pathname, asPath, query } = router;
                  router.push({ pathname, query }, asPath, { locale: 'en' });
                }}
              >
                English
              </button>
            </div>
          </div>
          <div>
            {t("introduction.description")}
          </div>
        </div>
        <div className="my-24">
          <div className="my-8 font-bold typography-20 text-secondary">
            {t("introduction.userNameLabel")}
          </div>
          <input
            type="text"
            placeholder={t("introduction.userNamePlaceholder")}
            value={userName}
            onChange={handleUserNameChange}
            className="text-ellipsis px-16 py-8 w-col-span-2 bg-surface3 hover:bg-surface3-hover rounded-8"
          />
        </div>
        <div className="my-24">
          <div className="my-8 font-bold typography-20 text-secondary">
            {t("introduction.techIntroTitle")}
          </div>
          <div>
            {t("introduction.techIntroText_1")}
            <Link
              url={"https://github.com/pixiv/three-vrm"}
              label={"@pixiv/three-vrm"}
            />
            {t("introduction.techIntroText_2")}
            <Link
              url={
                "https://ai.google.dev/gemini-api/docs"
              }
              label={"Gemini API"}
            />
            {t("introduction.techIntroText_3")}
            <Link
              url={
                "https://voicevox.su-shiki.com/su-shikiapis/"
              }
              label={"VoiceVox API"}
            />
            {t("introduction.techIntroText_4")}
          </div>
        </div>

        <div className="my-24">
          <div className="my-8 font-bold typography-20 text-secondary">
            {t("introduction.notesTitle")}
          </div>
          <div>
            {t("introduction.notesText")}
          </div>
        </div>

        <div className="my-24">
          <button
            onClick={() => {
              setOpened(false);
            }}
            className="font-bold bg-secondary hover:bg-secondary-hover active:bg-secondary-press disabled:bg-secondary-disabled text-white px-24 py-8 rounded-oval"
          >
            {t("introduction.startButton")}
          </button>
        </div>
      </div>
    </div>
  ) : null;
};
