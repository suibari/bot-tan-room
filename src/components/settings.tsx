import React from "react";
import { IconButton } from "./iconButton";
import { TextButton } from "./textButton";
import { Message } from "@/features/messages/messages";
import {
  KoeiroParam,
  PRESET_A,
  PRESET_B,
  PRESET_C,
  PRESET_D,
} from "@/features/constants/koeiroParam";
import { Link } from "./link";
import { useRouter } from "next/router";
import { useTranslation } from "next-i18next";

type Props = {
  chatLog: Message[];
  userName: string;
  onClickClose: () => void;
  onChangeChatLog: (index: number, text: string) => void;
  onChangeUserName: (name: string) => void;
  onClickOpenVrmFile: () => void;
  onClickResetChatLog: () => void;
};
export const Settings = ({
  chatLog,
  userName,
  onClickClose,
  onChangeChatLog,
  onChangeUserName,
  onClickOpenVrmFile,
  onClickResetChatLog,
}: Props) => {
  const { t } = useTranslation();
  const router = useRouter();

  return (
    <div className="absolute z-40 w-full h-full bg-white/80 backdrop-blur ">
      <div className="absolute m-24">
        <IconButton
          iconName="24/Close"
          isProcessing={false}
          onClick={onClickClose}
        ></IconButton>
      </div>
      <div className="max-h-full overflow-auto">
        <div className="text-text1 max-w-3xl mx-auto px-24 py-64 ">
          <div className="my-24 typography-32 font-bold">{t("settings.title")}</div>
          <div className="my-24">
            <div className="my-8 font-bold typography-20">{t("settings.language")}</div>
            <div className="flex gap-2">
              <TextButton
                onClick={() => {
                  const { pathname, asPath, query } = router;
                  router.push({ pathname, query }, asPath, { locale: 'ja' });
                }}
                disabled={router.locale === "ja"}
              >
                日本語
              </TextButton>
              <TextButton
                onClick={() => {
                  const { pathname, asPath, query } = router;
                  router.push({ pathname, query }, asPath, { locale: 'en' });
                }}
                disabled={router.locale === "en"}
              >
                English
              </TextButton>
            </div>
          </div>
          <div className="my-24">
            <div className="my-8 font-bold typography-20">{t("settings.userName")}</div>
            <input
              className="text-ellipsis px-16 py-8 w-full bg-surface3 hover:bg-surface3-hover rounded-8"
              type="text"
              placeholder={t("settings.userNamePlaceholder")}
              value={userName}
              onChange={(e) => onChangeUserName(e.target.value)}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
