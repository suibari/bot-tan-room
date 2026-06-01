import { parseLanguageContent, stripEmotionTags } from "@/utils/languageParser";
import { useState, useEffect, useRef } from "react";

type Props = {
  message: string;
  lang: "ja" | "en";
  isSpeaking?: boolean;
  showTrigger?: number;
  className?: string;
};

const DISMISS_DELAY_MS = 3500;
const FADE_DURATION_MS = 600;

export function AssistantBubble({ message, lang, isSpeaking = false, showTrigger = 0, className = "" }: Props) {
  const localizedRaw = parseLanguageContent(message, lang);
  const cleanMessage = stripEmotionTags(localizedRaw);

  const [visible, setVisible] = useState(false);
  const [fading, setFading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  // 新しいメッセージ or トリガー更新で吹き出しを表示
  useEffect(() => {
    if (!cleanMessage) {
      setVisible(false);
      setFading(false);
      clearTimer();
      return;
    }
    setVisible(true);
    setFading(false);
    clearTimer();
  }, [message, showTrigger]); // eslint-disable-line react-hooks/exhaustive-deps

  // 表示中かつ喋り終わったら自動消去タイマーを開始
  useEffect(() => {
    clearTimer();
    if (!visible) return;
    if (isSpeaking) return;

    timerRef.current = setTimeout(() => {
      setFading(true);
      setTimeout(() => setVisible(false), FADE_DURATION_MS);
    }, DISMISS_DELAY_MS);

    return clearTimer;
  }, [visible, isSpeaking]);

  const title = lang === "ja" ? "botたん" : "bot-tan";

  if (!cleanMessage || !visible) return null;

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
        opacity: fading ? 0 : 1,
        transition: `opacity ${FADE_DURATION_MS}ms ease`,
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
