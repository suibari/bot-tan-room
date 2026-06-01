import { useState, useEffect, useCallback } from "react";
import { AssistantBubble } from "./assistantBubble";

type Props = {
  lang: "ja" | "en";
  assistantMessage: string;
  isChatProcessing: boolean;
  onSend: (text: string) => void;
  quotaExceeded?: boolean;
  isInvitationMode?: boolean;
  isSignedIn?: boolean;
  isGiftMode?: boolean;
  onGiftModeToggle?: () => void;
  onGiftSend?: (text: string) => void;
  isGiftProcessing?: boolean;
};

const LABELS = {
  ja: { placeholder: "メッセージを入力...", name: "botたん", welcome: "✨ botたんからのお迎えメッセージ..." },
  en: { placeholder: "Type a message...", name: "bot-tan", welcome: "✨ Special Welcome from bot-tan..." },
};

/**
 * 性格診断 UI と統一したグラス調のチャット画面。
 * 上部に botたんの発言バブル、下部にテキスト＋音声入力バーを表示する。
 */
const GIFT_MAX_CHARS = 30;

export function ChatView({ lang, assistantMessage, isChatProcessing, onSend, quotaExceeded = false, isInvitationMode = false, isSignedIn = false, isGiftMode = false, onGiftModeToggle, onGiftSend, isGiftProcessing = false }: Props) {
  const l = LABELS[lang];
  const [userMessage, setUserMessage] = useState("");
  const [giftMessage, setGiftMessage] = useState("");
  const [showGiftInfo, setShowGiftInfo] = useState(false);
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

  const handleGiftSend = useCallback(() => {
    const text = giftMessage.trim();
    if (!text || isGiftProcessing) return;
    onGiftSend?.(text);
    setGiftMessage("");
  }, [giftMessage, isGiftProcessing, onGiftSend]);

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

  return (
    <>
      {/* 下部パネル: botたんメッセージはカードの外・上に、入力バーはカード内 */}
      <div className="absolute z-20 flex flex-col justify-end" style={{ left: '1.5rem', right: '1.5rem', bottom: 'calc(max(1.5rem, env(safe-area-inset-bottom)))', top: 'auto', gap: '0.75rem' }}>
        {/* アシスタント発言: カードの外・上 */}
        <div className="w-full max-w-xl self-center">
          <AssistantBubble message={assistantMessage} lang={lang} />
        </div>
        <div
          className="w-full max-w-xl self-center shadow-2xl relative overflow-hidden transition-all duration-300"
          style={{
            background: isGiftMode ? "rgba(255, 210, 220, 0.82)" : "rgba(255, 255, 255, 0.72)",
            backdropFilter: "blur(30px) saturate(140%)",
            border: isGiftMode ? "1.5px solid rgba(255, 150, 180, 0.5)" : "1.5px solid rgba(255, 255, 255, 0.55)",
            borderRadius: "2.5rem",
            padding: "1.5rem 2.25rem",
            display: "flex",
            flexDirection: "column",
            gap: "1.15rem",
            boxShadow: "0 24px 64px -16px rgba(15, 32, 67, 0.12)",
          }}
        >

          {/* ギフトモード インフォアイコン */}
          {isGiftMode && (
            <div style={{ position: 'absolute', top: '1rem', right: '1.25rem', zIndex: 10 }}>
              <button
                onClick={() => setShowGiftInfo(v => !v)}
                aria-label="gift info"
                style={{
                  width: '22px',
                  height: '22px',
                  borderRadius: '9999px',
                  background: 'rgba(255, 150, 180, 0.2)',
                  border: '1.5px solid rgba(255, 150, 180, 0.5)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                  stroke="rgba(200, 60, 100, 0.85)" strokeWidth="2.5"
                  strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="16" x2="12" y2="12" />
                  <line x1="12" y1="8" x2="12.01" y2="8" />
                </svg>
              </button>
              {showGiftInfo && (
                <div style={{
                  position: 'absolute',
                  top: '26px',
                  right: 0,
                  background: 'rgba(255, 255, 255, 0.97)',
                  border: '1.5px solid rgba(255, 150, 180, 0.5)',
                  borderRadius: '0.75rem',
                  padding: '0.5rem 0.75rem',
                  fontSize: '11px',
                  color: 'rgba(200, 60, 100, 0.9)',
                  fontWeight: 600,
                  width: '200px',
                  lineHeight: 1.6,
                  boxShadow: '0 4px 16px rgba(200, 60, 100, 0.15)',
                  zIndex: 20,
                }}>
                  botたんに1日1回プレゼントをあげよう！<br/>Blueskyで見せてくれるかも？
                </div>
              )}
            </div>
          )}

          {/* 入力バー もしくは リミット到達メッセージ もしくは お迎え演出メッセージ */}
          {isInvitationMode ? (
            <div 
              className="flex items-center gap-3 py-3 px-5 text-center animate-pulse justify-center shrink-0"
              style={{
                background: "linear-gradient(135deg, rgba(0, 205, 172, 0.1), rgba(0, 133, 255, 0.1))",
                border: "1.5px solid rgba(0, 205, 172, 0.3)",
                borderRadius: "9999px",
                height: "48px",
              }}
            >
              <span className="text-[15px] font-black text-theme-blue select-none tracking-wide">
                {l.welcome}
              </span>
            </div>
          ) : quotaExceeded ? (
            <div 
              className="flex flex-col items-center gap-2 py-3 text-center animate-fadeIn"
              style={{
                background: "rgba(254, 242, 242, 0.4)",
                border: "1.5px dashed rgba(239, 68, 68, 0.3)",
                borderRadius: "1.5rem",
                padding: "1rem",
              }}
            >
              <div className="flex items-center gap-2 text-red-500 font-black justify-center">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <span className="text-sm">
                  {lang === "ja" ? "お部屋が満員になりました" : "Room is full"}
                </span>
              </div>
              <p className="text-xs font-semibold text-slate-500 leading-relaxed" style={{ margin: 0 }}>
                {lang === "ja" ? "今日はbotたんのお部屋は満員になっちゃった！　また明日ね！" : "The room is full today! See you tomorrow!"}
              </p>
            </div>
          ) : isGiftMode ? (
            /* ギフトカード入力エリア */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {/* モードラベル（絵文字なし） */}
              <span style={{ fontSize: '13px', fontWeight: 700, color: 'rgba(200, 60, 100, 0.85)' }}>
                {lang === 'ja' ? 'プレゼント' : 'Gift'}
              </span>
              {/* テキスト入力（全幅） */}
              <input
                type="text"
                value={giftMessage}
                onChange={(e) => setGiftMessage(e.target.value.slice(0, GIFT_MAX_CHARS))}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.nativeEvent.isComposing && !e.shiftKey) {
                    e.preventDefault();
                    handleGiftSend();
                  }
                }}
                placeholder={lang === "ja" ? "プレゼントの名前をいれてね" : "What's the gift?"}
                disabled={isGiftProcessing}
                className="w-full text-slate-800 placeholder-slate-400 outline-none text-base font-semibold shadow-inner transition-all duration-200"
                style={{
                  height: "48px",
                  background: "rgba(255, 255, 255, 0.65)",
                  border: "1.5px solid rgba(255, 150, 180, 0.5)",
                  borderRadius: "9999px",
                  padding: "0 20px",
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(255, 100, 150, 0.7)';
                  e.currentTarget.style.boxShadow = '0 0 0 4px rgba(255, 150, 180, 0.2)';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(255, 150, 180, 0.5)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              />
              {/* ボタン行：💬トグル（左）+ 送信（右） */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <button
                  onClick={onGiftModeToggle}
                  aria-label="back to chat"
                  className="shrink-0 flex items-center justify-center transition-all duration-300 hover:scale-105 active:scale-95"
                  style={{
                    width: "48px",
                    height: "48px",
                    borderRadius: "9999px",
                    background: "rgba(220, 235, 255, 0.6)",
                    border: "1.5px solid rgba(80, 130, 220, 0.3)",
                    fontSize: "20px",
                  }}
                >
                  💬
                </button>
                <button
                  onClick={handleGiftSend}
                  disabled={isGiftProcessing || !giftMessage.trim()}
                  aria-label="send gift"
                  className="shrink-0 flex items-center justify-center transition-all duration-300 hover:scale-105 active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed shadow-md"
                  style={{
                    width: "48px",
                    height: "48px",
                    borderRadius: "9999px",
                    background: "linear-gradient(135deg, #ff8fab, #ff6b9d)",
                  }}
                >
                  {isGiftProcessing ? (
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
            </div>
          ) : (
            /* チャット入力エリア */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {/* モードラベル（絵文字なし） */}
              <span style={{ fontSize: '13px', fontWeight: 700, color: 'rgba(58, 155, 213, 0.85)' }}>
                {lang === 'ja' ? 'チャット' : 'Chat'}
              </span>
              {/* テキスト入力（全幅） */}
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
                className="w-full text-slate-800 placeholder-slate-400 outline-none text-base font-semibold shadow-inner transition-all duration-200"
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
              {/* ボタン行：🎁トグル（左）+ 送信（右） */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <button
                  onClick={onGiftModeToggle}
                  aria-label="gift mode"
                  className="shrink-0 flex items-center justify-center transition-all duration-300 hover:scale-105 active:scale-95"
                  style={{
                    width: "48px",
                    height: "48px",
                    borderRadius: "9999px",
                    background: "rgba(255, 210, 220, 0.5)",
                    border: "1.5px solid rgba(255, 150, 180, 0.4)",
                    fontSize: "20px",
                  }}
                >
                  🎁
                </button>
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
            </div>
          )}
          <style jsx global>{`
            @keyframes chat-spin { to { transform: rotate(360deg); } }
          `}</style>
        </div>
      </div>
    </>
  );
}
