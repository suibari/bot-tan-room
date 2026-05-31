import { parseLanguageContent, stripEmotionTags } from "@/utils/languageParser";

type Props = {
  message: string;
  lang: "ja" | "en";
  className?: string;
};

/**
 * サインイン前後で一貫して使用する、botたんのグラス調の発言吹き出しコンポーネント。
 */
export function AssistantBubble({ message, lang, className = "" }: Props) {
  // 表示中の言語に合わせてメッセージをパース
  const localizedRaw = parseLanguageContent(message, lang);
  
  // 感情タグ（例: [happy], [neutral]）を除去したクリーンなセリフを取得
  const cleanMessage = stripEmotionTags(localizedRaw);
  
  const title = lang === "ja" ? "botたん" : "bot-tan";

  // セリフがない場合は何も描画しない
  if (!cleanMessage) return null;

  return (
    <div
      className={`w-full max-h-[28vh] overflow-y-auto scrollbar-thin ${className}`}
      style={{
        background: "rgba(255, 255, 255, 0.72)",
        backdropFilter: "blur(30px) saturate(140%)",
        border: "1.5px solid rgba(255, 255, 255, 0.55)",
        borderRadius: "2.5rem",
        padding: "1.25rem 2.25rem",
        boxShadow: "0 24px 64px -16px rgba(15, 32, 67, 0.12)",
      }}
    >
      <div className="text-[12px] font-black tracking-widest mb-1" style={{ color: "rgba(15, 32, 67, 0.5)" }}>
        💬 {title}
      </div>
      <p className="text-slate-800 text-base leading-relaxed font-semibold" style={{ color: "#1e293b" }}>
        {cleanMessage}
      </p>
    </div>
  );
}
