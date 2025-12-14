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

type Props = {
  systemPrompt: string;
  chatLog: Message[];
  userName: string;
  onClickClose: () => void;
  onChangeSystemPrompt: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onChangeChatLog: (index: number, text: string) => void;
  onChangeUserName: (name: string) => void;
  onClickOpenVrmFile: () => void;
  onClickResetChatLog: () => void;
  onClickResetSystemPrompt: () => void;
};
export const Settings = ({
  chatLog,
  systemPrompt,
  userName,
  onClickClose,
  onChangeSystemPrompt,
  onChangeChatLog,
  onChangeUserName,
  onClickOpenVrmFile,
  onClickResetChatLog,
  onClickResetSystemPrompt,
}: Props) => {
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
          <div className="my-24 typography-32 font-bold">設定</div>
          <div className="my-24">
            <div className="my-8 font-bold typography-20">お名前</div>
            <input
              className="text-ellipsis px-16 py-8 w-full bg-surface3 hover:bg-surface3-hover rounded-8"
              type="text"
              placeholder="お名前を入力してください"
              value={userName}
              onChange={(e) => onChangeUserName(e.target.value)}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
