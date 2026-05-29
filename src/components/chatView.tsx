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
      <div className="absolute bottom-0 left-0 right-0 z-20">
        <div
          className="mx-auto w-full max-w-lg px-4 pb-6 pt-4 space-y-3 rounded-t-3xl shadow-2xl"
          style={{
            background: "rgba(8,16,40,0.70)",
            backdropFilter: "blur(18px)",
            border: "1px solid rgba(120,160,255,0.18)",
            borderBottom: "none",
          }}
        >
          {/* アシスタント発言 */}
          {cleanMessage && (
            <div
              className="w-full rounded-2xl overflow-hidden"
              style={{
                background: "rgba(10,20,50,0.6)",
                border: "1px solid rgba(120,160,255,0.25)",
              }}
            >
              <div
                className="px-4 py-2 text-xs font-bold tracking-widest"
                style={{
                  background: "linear-gradient(90deg, #667eea, #764ba2)",
                  color: "#fff",
                }}
              >
                {l.name}
              </div>
              <div className="px-4 py-3 max-h-[28vh] overflow-y-auto">
                <p className="text-white text-sm leading-relaxed">
                  {cleanMessage}
                </p>
              </div>
            </div>
          )}

          {/* 入力バー */}
          <div className="flex items-center gap-2">
            {/* マイク */}
            <button
              onClick={handleClickMic}
              disabled={isChatProcessing}
              aria-label="mic"
              className="shrink-0 w-11 h-11 rounded-full flex items-center justify-center transition-opacity hover:opacity-80 active:opacity-60 disabled:opacity-40"
              style={{
                background: isMicRecording
                  ? "linear-gradient(90deg, #667eea, #764ba2)"
                  : "rgba(255,255,255,0.10)",
                border: "1px solid rgba(120,160,255,0.3)",
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="23" />
              </svg>
            </button>

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
              className="flex-1 px-4 py-3 rounded-xl text-white placeholder-white/40 outline-none focus:ring-2 focus:ring-purple-400 text-sm disabled:opacity-50"
              style={{ background: "rgba(255,255,255,0.10)" }}
            />

            {/* 送信 */}
            <button
              onClick={handleSend}
              disabled={isChatProcessing || !userMessage.trim()}
              aria-label="send"
              className="shrink-0 w-11 h-11 rounded-full flex items-center justify-center transition-opacity hover:opacity-80 active:opacity-60 disabled:opacity-30 disabled:cursor-not-allowed"
              style={{ background: "linear-gradient(90deg, #667eea, #764ba2)" }}
            >
              {isChatProcessing ? (
                <span
                  className="block w-4 h-4 rounded-full"
                  style={{
                    border: "2px solid rgba(255,255,255,0.3)",
                    borderTopColor: "#fff",
                    animation: "chat-spin 0.75s linear infinite",
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
