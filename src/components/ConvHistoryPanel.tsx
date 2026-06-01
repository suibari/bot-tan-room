import { Message } from "@/features/messages/messages";
import { parseLanguageContent, stripEmotionTags } from "@/utils/languageParser";

type Props = {
  chatLog: Message[];
  lang: "ja" | "en";
  onClose: () => void;
};

export function ConvHistoryPanel({ chatLog, lang, onClose }: Props) {
  return (
    <>
      {/* Backdrop */}
      <div
        className="absolute inset-0"
        style={{ zIndex: 40, background: "rgba(15, 32, 67, 0.18)" }}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className="absolute animate-slideInLeft flex flex-col"
        style={{
          zIndex: 41,
          top: 0,
          left: 0,
          bottom: 0,
          width: "min(400px, 90vw)",
          background: "rgba(255, 255, 255, 0.80)",
          backdropFilter: "blur(30px) saturate(140%)",
          border: "1.5px solid var(--theme-border-glow)",
          borderLeft: "none",
          borderRadius: "0 2.5rem 2.5rem 0",
          boxShadow: "8px 0 40px -8px rgba(15, 32, 67, 0.16)",
        }}
        onKeyDown={(e) => e.key === "Escape" && onClose()}
        tabIndex={-1}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between shrink-0"
          style={{
            padding: "calc(max(1.5rem, env(safe-area-inset-top))) 1.5rem 0.75rem",
          }}
        >
          <div>
            <h2
              style={{
                fontSize: "20px",
                fontWeight: 900,
                color: "#0f172a",
                margin: 0,
                letterSpacing: "-0.01em",
              }}
            >
              {lang === "ja" ? "りれき" : "History"}
            </h2>
            <p
              style={{
                fontSize: "12px",
                fontWeight: 700,
                color: "#94a3b8",
                margin: "2px 0 0",
              }}
            >
              {chatLog.length}
              {lang === "ja" ? " 件" : " messages"}
            </p>
          </div>

          {/* Close button */}
          <button
            onClick={onClose}
            className="rounded-full flex items-center justify-center transition-all hover:scale-105 active:scale-95 shrink-0"
            style={{
              width: "40px",
              height: "40px",
              background: "var(--theme-bg-dark)",
              border: "1.5px solid var(--theme-border-glow)",
              color: "#64748b",
            }}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Divider */}
        <div
          className="shrink-0"
          style={{
            height: "1px",
            margin: "0 1.5rem 0.75rem",
            background: "var(--theme-border-glow)",
          }}
        />

        {/* Scrollable list */}
        <div
          className="flex-1 overflow-y-auto"
          style={{
            padding: "0 1rem",
            display: "flex",
            flexDirection: "column",
            gap: "0.625rem",
          }}
        >
          {chatLog.length === 0 ? (
            <div
              className="flex flex-col items-center justify-center flex-1"
              style={{ color: "#94a3b8", fontSize: "14px", fontWeight: 700, paddingTop: "3rem" }}
            >
              <svg
                width="40"
                height="40"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ marginBottom: "0.75rem", opacity: 0.4 }}
              >
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              {lang === "ja" ? "まだ会話がないよ" : "No conversations yet"}
            </div>
          ) : (
            chatLog.map((msg, i) => (
              <HistoryCard key={i} msg={msg} lang={lang} />
            ))
          )}
          {/* Bottom spacer so last card clears the gradient */}
          <div style={{ height: "5rem", flexShrink: 0 }} />
        </div>

        {/* Bottom gradient fade */}
        <div
          className="pointer-events-none shrink-0"
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            height: "5rem",
            background:
              "linear-gradient(to bottom, rgba(255,255,255,0) 0%, rgba(255,255,255,0.92) 100%)",
            borderRadius: "0 0 2.5rem 0",
          }}
        />
      </div>
    </>
  );
}

function HistoryCard({ msg, lang }: { msg: Message; lang: "ja" | "en" }) {
  const isUser = msg.role === "user";
  const displayContent = isUser
    ? msg.content
    : stripEmotionTags(parseLanguageContent(msg.content, lang));

  return (
    <div
      style={{
        background: isUser
          ? "rgba(58, 155, 213, 0.07)"
          : "var(--theme-bg-dark)",
        border: isUser
          ? "1.5px solid var(--theme-border-glow-strong)"
          : "1.5px solid var(--theme-border-glow)",
        borderRadius: "1.25rem",
        padding: "0.625rem 0.875rem",
        boxShadow: "0 2px 8px rgba(15, 32, 67, 0.04)",
      }}
    >
      {/* Role row */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "0.3rem",
        }}
      >
        <span
          className={isUser ? "text-theme-blue" : "text-theme-mint"}
          style={{ fontSize: "11px", fontWeight: 800 }}
        >
          {isUser
            ? msg.userName || (lang === "ja" ? "あなた" : "You")
            : "Botたん"}
        </span>
        {msg.timestamp != null && (
          <span style={{ fontSize: "10px", color: "#94a3b8", fontWeight: 600 }}>
            {new Date(msg.timestamp).toLocaleString(
              lang === "ja" ? "ja-JP" : "en-US",
              {
                month: "2-digit",
                day: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
              }
            )}
          </span>
        )}
      </div>

      {/* Content */}
      <p
        style={{
          fontSize: "13px",
          color: "#1e293b",
          fontWeight: 500,
          lineHeight: 1.6,
          margin: 0,
          wordBreak: "break-word",
        }}
      >
        {displayContent}
      </p>
    </div>
  );
}
