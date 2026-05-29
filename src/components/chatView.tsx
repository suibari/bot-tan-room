import { useState, useEffect, useCallback } from "react";
import { parseLanguageContent, stripEmotionTags } from "@/utils/languageParser";

type Props = {
  lang: "ja" | "en";
  assistantMessage: string;
  isChatProcessing: boolean;
  onSend: (text: string) => void;
};

const LABELS = {
  ja: { placeholder: "メッセージを入力...", name: "botたん" },
  en: { placeholder: "Type a message...", name: "bot-tan" },
};

/**
 * 性格診断 UI と統一したグラス調のチャット画面。
 * 上部に botたんの発言バブル、下部にテキスト＋音声入力バーを表示する。
 */
export function ChatView({ lang, assistantMessage, isChatProcessing, onSend }: Props) {
  const l = LABELS[lang];
  const [userMessage, setUserMessage] = useState("");
  const [speechRecognition, setSpeechRecognition] = useState<SpeechRecognition>();
  const [isMicRecording, setIsMicRecording] = useState(false);

  // 音声認識の結果を処理
  const handleRecognitionResult = useCallback(
    (event: SpeechRecognitionEvent) => {
      const text = event.results[0][0].transcript;
      setUserMessage(text);
      if (event.results[0].isFinal) {
        onSend(text);
      }
    },
    [onSend]
  );

  const handleRecognitionEnd = useCallback(() => setIsMicRecording(false), []);

  const handleClickMic = useCallback(() => {
    if (isMicRecording) {
      speechRecognition?.abort();
      setIsMicRecording(false);
      return;
    }
    speechRecognition?.start();
    setIsMicRecording(true);
  }, [isMicRecording, speechRecognition]);

  const handleSend = useCallback(() => {
    const text = userMessage.trim();
    if (!text || isChatProcessing) return;
    onSend(text);
  }, [userMessage, isChatProcessing, onSend]);

  useEffect(() => {
    const SpeechRecognition =
      window.webkitSpeechRecognition || window.SpeechRecognition;
    if (!SpeechRecognition) return;
    const recognition = new SpeechRecognition();
    recognition.lang = lang === "ja" ? "ja-JP" : "en-US";
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.addEventListener("result", handleRecognitionResult);
    recognition.addEventListener("end", handleRecognitionEnd);
    setSpeechRecognition(recognition);
    return () => {
      recognition.removeEventListener("result", handleRecognitionResult);
      recognition.removeEventListener("end", handleRecognitionEnd);
    };
  }, [lang, handleRecognitionResult, handleRecognitionEnd]);

  // 返答生成が終わったら入力欄をクリア
  useEffect(() => {
    if (!isChatProcessing) setUserMessage("");
  }, [isChatProcessing]);

  const localizedRaw = parseLanguageContent(assistantMessage, lang);
  const cleanMessage = stripEmotionTags(localizedRaw);

  return (
    <>
      {/* 下部パネル: 回答 + 入力バーを1つにまとめる（診断結果と同じ位置） */}
      <div className="absolute z-20 flex justify-center" style={{ left: '1.5rem', right: '1.5rem', bottom: '1.5rem', top: 'auto' }}>
        <div 
          className="w-full max-w-xl shadow-2xl relative overflow-hidden transition-all duration-300"
          style={{
            background: "rgba(255, 255, 255, 0.72)",
            backdropFilter: "blur(30px) saturate(140%)",
            border: "1.5px solid rgba(255, 255, 255, 0.55)",
            borderRadius: "2.5rem",
            padding: "1.5rem 2.25rem",
            display: "flex",
            flexDirection: "column",
            gap: "1.15rem",
            boxShadow: "0 24px 64px -16px rgba(15, 32, 67, 0.12)",
          }}
        >
          {/* アシスタント発言 */}
          {cleanMessage && (
            <div className="w-full flex flex-col" style={{ gap: '0.5rem' }}>
              <div className="text-[13px] font-black tracking-widest px-1" style={{ color: 'rgba(15, 32, 67, 0.6)' }}>
                💬 {l.name}
              </div>
              <div 
                className="w-full max-h-[28vh] overflow-y-auto scrollbar-thin"
                style={{
                  background: "rgba(255, 255, 255, 0.55)",
                  border: "1.5px solid rgba(58, 155, 213, 0.25)",
                  borderRadius: "1.5rem",
                  padding: "1rem 1.25rem",
                }}
              >
                <p className="text-slate-800 text-base leading-relaxed font-semibold" style={{ color: '#1e293b' }}>
                  {cleanMessage}
                </p>
              </div>
            </div>
          )}

          {/* 入力バー */}
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            {/* テキスト入力 */}
            <input
              type="text"
              value={userMessage}
              onChange={(e) => setUserMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder={l.placeholder}
              disabled={isChatProcessing}
              className="flex-1 text-slate-800 placeholder-slate-400 outline-none text-base font-semibold shadow-inner transition-all duration-200"
              style={{
                height: "48px",
                background: "rgba(255, 255, 255, 0.55)",
                border: "1.5px solid rgba(58, 155, 213, 0.25)",
                borderRadius: "9999px",
                padding: "0 20px",
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = 'var(--theme-blue)';
                e.currentTarget.style.boxShadow = '0 0 0 4px rgba(58, 155, 213, 0.15)';
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = 'rgba(58, 155, 213, 0.25)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            />

            {/* 送信 */}
            <button
              onClick={handleSend}
              disabled={isChatProcessing || !userMessage.trim()}
              aria-label="send"
              className="shrink-0 flex items-center justify-center transition-all duration-300 hover:scale-105 active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed bg-theme-gradient shadow-md"
              style={{
                width: "48px",
                height: "48px",
                borderRadius: "9999px",
              }}
            >
              {isChatProcessing ? (
                <span
                  className="block w-4 h-4"
                  style={{
                    border: "2px solid rgba(255,255,255,0.3)",
                    borderTopColor: "#fff",
                    animation: "chat-spin 0.75s linear infinite",
                    borderRadius: "50%",
                  }}
                />
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="#fff">
                  <path d="M2 21l21-9L2 3v7l15 2-15 2z" />
                </svg>
              )}
            </button>
          </div>
          <style jsx global>{`
            @keyframes chat-spin { to { transform: rotate(360deg); } }
          `}</style>
        </div>
      </div>
    </>
  );
}
