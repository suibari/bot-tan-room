import { useState, useCallback } from "react";
import { Link } from "./link";

type Props = {
  koeiroMapKey: string;
  onChangeKoeiromapKey: (koeiromapKey: string) => void;
};
export const Introduction = ({
  koeiroMapKey,
  onChangeKoeiromapKey,
}: Props) => {
  const [opened, setOpened] = useState(true);



  const handleKoeiromapKeyChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      onChangeKoeiromapKey(event.target.value);
    },
    [onChangeKoeiromapKey]
  );

  return opened ? (
    <div className="absolute z-40 w-full h-full px-24 py-40  bg-black/30 font-M_PLUS_2">
      <div className="mx-auto my-auto max-w-3xl max-h-full p-24 overflow-auto bg-white rounded-16">
        <div className="my-24">
          <div className="my-8 font-bold typography-20 text-secondary ">
            全肯定botたんゲストブック
          </div>
          <div>
            全肯定botたんとおしゃべりできるゲストブックです。あいさつを残していってもらえると嬉しいです。
          </div>
        </div>
        <div className="my-24">
          <div className="my-8 font-bold typography-20 text-secondary">
            技術紹介
          </div>
          <div>
            3Dモデルの表示や操作には
            <Link
              url={"https://github.com/pixiv/three-vrm"}
              label={"@pixiv/three-vrm"}
            />
            、 会話文生成には
            <Link
              url={
                "https://ai.google.dev/gemini-api/docs"
              }
              label={"Gemini API"}
            />
            、 音声合成には
            <Link
              url={
                "https://voicevox.su-shiki.com/su-shikiapis/"
              }
              label={"VoiceVox API"}
            />
            を使用しています。
          </div>
        </div>

        <div className="my-24">
          <div className="my-8 font-bold typography-20 text-secondary">
            利用上の注意
          </div>
          <div>
            差別的または暴力的な発言、特定の人物を貶めるような発言を、意図的に誘導しないでください。
            会話履歴はサーバーに保存され、全ユーザーに共有されるので、パスワードなどの情報は入力しないでください。
          </div>
        </div>

        <div className="my-24">
          <button
            onClick={() => {
              setOpened(false);
            }}
            className="font-bold bg-secondary hover:bg-secondary-hover active:bg-secondary-press disabled:bg-secondary-disabled text-white px-24 py-8 rounded-oval"
          >
            はじめる
          </button>
        </div>
      </div>
    </div>
  ) : null;
};
