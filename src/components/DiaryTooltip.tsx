import { useState } from "react";

export function DiaryTooltip({ lang }: { lang: "ja" | "en" }) {
  const [show, setShow] = useState(false);
  return (
    <span style={{ position: "relative", display: "inline-flex", alignItems: "center", marginLeft: "4px" }}>
      <button
        onClick={(e) => { e.stopPropagation(); setShow(v => !v); }}
        aria-label="diary info"
        style={{
          width: "18px", height: "18px",
          borderRadius: "9999px",
          background: "rgba(241,245,249,0.9)",
          border: "1.5px solid rgba(148,163,184,0.5)",
          boxShadow: "0 1px 3px rgba(15,32,67,0.08)",
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: 0, cursor: "pointer", flexShrink: 0,
        }}
      >
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none"
          stroke="rgba(71,85,105,0.9)" strokeWidth="2.5"
          strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="16" x2="12" y2="12"/>
          <line x1="12" y1="8" x2="12.01" y2="8"/>
        </svg>
      </button>
      {show && (
        <span style={{
          position: "absolute",
          bottom: "24px",
          left: "0",
          background: "rgba(248,250,252,0.98)",
          backdropFilter: "blur(20px) saturate(140%)",
          border: "1.5px solid rgba(148,163,184,0.4)",
          borderRadius: "0.75rem",
          padding: "0.5rem 0.75rem",
          fontSize: "11px",
          color: "rgba(51,65,85,0.9)",
          fontWeight: 600,
          width: "230px",
          lineHeight: 1.6,
          boxShadow: "0 4px 16px rgba(15,32,67,0.12), 0 1px 4px rgba(15,32,67,0.08)",
          zIndex: 30,
          pointerEvents: "auto",
        }}>
          {lang === "ja"
            ? <>日記機能はDiscordメンバー加入してね。詳しくは<a href="https://github.com/suibari/bsky-affirmative-bot" target="_blank" rel="noopener noreferrer" style={{ color: "#3a9bd5", fontWeight: 700 }}>マニュアル</a></>
            : <>Join the Discord to use the diary feature. See <a href="https://github.com/suibari/bsky-affirmative-bot" target="_blank" rel="noopener noreferrer" style={{ color: "#3a9bd5", fontWeight: 700 }}>manual</a></>
          }
        </span>
      )}
    </span>
  );
}
