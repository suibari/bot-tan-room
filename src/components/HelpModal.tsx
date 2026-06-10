import { useEffect } from "react";

type Props = {
  lang: "ja" | "en";
  onClose: () => void;
};

const LABELS = {
  ja: {
    title: "ヘルプ",
    soundWarning: "botたんがしゃべる際に音が出ます！",
    greetingTitle: "👋 あいさつ機能",
    greetingDesc: "サインイン後、ページを開いたときに時間帯などに応じてbotたんが特別なあいさつをしてくれます。",
    bioTitle: "💖 バイオリズム機能",
    bioDesc: "クリックなどのさまざまなアクションでBlueskyのbotたんを元気づけられます。元気になると、たくさんポストするかも！",
    giftTitle: "🎁 プレゼント機能",
    giftDesc: "サインイン後、画面右上の 🎁 ボタンからbotたんにプレゼントを贈れます。1日1回まで。Bluesky上のbotたんが反応してくれるかも？",
    historyTitle: "📋 会話りれき",
    historyDesc: "Blueskyのbotたんをフォローしているユーザーは、チャットの履歴が記録されます。左上の時計アイコンからいつでも振り返れます。",
    diagTitle: "✨ 全肯定診断",
    diagDesc: "右上の「診断」ボタンから、botたんがあなたの性格を分析します。結果はBlueskyでシェアできます。",
    inviteTitle: "💌 あなたへの特別なメッセージ",
    inviteDesc: "数日後、Bluesky上のbotたんがあなただけへの特別なメッセージを用意してお部屋に招待します。お誘いが届いたら、またお部屋に来てね。",
    analytics: "このアプリはサービス改善のため Google Analytics を使用しています。",
    close: "とじる",
  },
  en: {
    title: "Help",
    soundWarning: "Sound plays when bot-tan speaks!",
    greetingTitle: "👋 Greeting",
    greetingDesc: "After signing in, bot-tan greets you with a special message based on the time of day and other factors when you open the page.",
    bioTitle: "💖 Biorhythm",
    bioDesc: "Various actions like clicking can cheer up bot-tan on Bluesky. When bot-tan gets energized, they might post more!",
    giftTitle: "🎁 Gift Feature",
    giftDesc: "After signing in, tap the 🎁 button (top-right) to send bot-tan a gift. Once per day. Bot-tan might react on Bluesky!",
    historyTitle: "📋 Chat History",
    historyDesc: "Users who follow bot-tan on Bluesky have their chat history saved. Tap the clock icon (top-left) to review past conversations.",
    diagTitle: "✨ Personality Diagnosis",
    diagDesc: "Tap the \"Diagnosis\" button (top-right) to have bot-tan analyze your personality. You can share the result on Bluesky.",
    inviteTitle: "💌 A special message just for you",
    inviteDesc: "A few days after your visit, bot-tan will prepare a special personal message and invite you back to the room on Bluesky. Come back when the invitation arrives!",
    analytics: "This app uses Google Analytics for service improvement.",
    close: "Close",
  },
};

export function HelpModal({ lang, onClose }: Props) {
  const l = LABELS[lang];
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-md cursor-pointer"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl rounded-[2.5rem] shadow-2xl flex flex-col max-h-[85vh] overflow-hidden animate-fadeIn cursor-default"
        style={{
          padding: "1.5rem 2.25rem",
          background: "rgba(255, 255, 255, 0.72)",
          backdropFilter: "blur(30px) saturate(140%)",
          border: "1.5px solid rgba(255, 255, 255, 0.55)",
          boxShadow: "0 24px 64px -16px rgba(15, 32, 67, 0.12)",
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3.5">
          <h2 className="text-slate-800 text-xl font-black tracking-wide flex items-center gap-2" style={{ color: "#0f172a" }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#00cdac" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            {l.title}
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all"
            style={{ borderRadius: "9999px" }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Content (Scrollable) */}
        <div className="flex-1 overflow-y-auto py-4 pr-1 text-slate-700 space-y-4 scrollbar-thin text-sm leading-relaxed font-medium">

          {/* アプリ概要 */}
          <p className="text-slate-600 text-xs">
            {lang === "ja" ? (
              <>
                このアプリは{" "}
                <a
                  href="https://bsky.app/profile/bot-tan.suibari.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:underline font-extrabold"
                  style={{ color: "#0085ff" }}
                >
                  3Dモデルの全肯定botたん
                </a>
                {" "}と会話などの遊びを楽しむアプリです。
              </>
            ) : (
              <>
                This app lets you enjoy conversations and activities with{" "}
                <a
                  href="https://bsky.app/profile/bot-tan.suibari.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:underline font-extrabold"
                  style={{ color: "#0085ff" }}
                >
                  3D model Zenkoitei bot-tan
                </a>
                {" "}on Bluesky.
              </>
            )}
          </p>

          {/* 音声注意 */}
          <div className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold"
            style={{ background: "rgba(251, 191, 36, 0.15)", border: "1.5px solid rgba(251, 191, 36, 0.5)", color: "#92400e" }}>
            <span style={{ fontSize: "1rem" }}>⚠️</span>
            <span>
              {l.soundWarning}
            </span>
          </div>

          {/* あいさつ機能 */}
          <div className="space-y-1">
            <h3 className="font-extrabold text-base flex items-center gap-1.5" style={{ color: "#0085ff" }}>
              {l.greetingTitle}
            </h3>
            <p className="text-slate-600 text-xs pl-0">
              {l.greetingDesc}
            </p>
          </div>

          {/* バイオリズム機能 */}
          <div className="space-y-1">
            <h3 className="font-extrabold text-base flex items-center gap-1.5" style={{ color: "#0085ff" }}>
              {l.bioTitle}
            </h3>
            <p className="text-slate-600 text-xs pl-0">
              {l.bioDesc}
            </p>
          </div>

          {/* プレゼント機能 */}
          <div className="space-y-1">
            <h3 className="font-extrabold text-base flex items-center gap-1.5" style={{ color: "#0085ff" }}>
              {l.giftTitle}
            </h3>
            <p className="text-slate-600 text-xs pl-0">
              {l.giftDesc}
            </p>
          </div>

          {/* りれき */}
          <div className="space-y-1">
            <h3 className="font-extrabold text-base flex items-center gap-1.5" style={{ color: "#0085ff" }}>
              {l.historyTitle}
            </h3>
            <p className="text-slate-600 text-xs pl-0">
              {l.historyDesc}
            </p>
          </div>

          {/* 全肯定診断 */}
          <div className="space-y-1">
            <h3 className="font-extrabold text-base flex items-center gap-1.5" style={{ color: "#0085ff" }}>
              {l.diagTitle}
            </h3>
            <p className="text-slate-600 text-xs pl-0">
              {l.diagDesc}
            </p>
          </div>

          {/* 特別なメッセージ */}
          <div className="space-y-1">
            <h3 className="font-extrabold text-base flex items-center gap-1.5" style={{ color: "#0085ff" }}>
              {l.inviteTitle}
            </h3>
            <p className="text-slate-600 text-xs pl-0">
              {l.inviteDesc}
            </p>
          </div>

          {/* アナリティクス */}
          <p className="text-slate-400 text-xs pt-1">
            {l.analytics}
          </p>

        </div>

        {/* Footer */}
        <div className="pt-3.5 flex justify-end">
          <button
            onClick={onClose}
            className="font-black text-white text-sm shadow-md transition-all duration-300 hover:brightness-105 active:scale-95 bg-theme-gradient"
            style={{
              height: "40px",
              padding: "0 28px",
              borderRadius: "9999px",
            }}
          >
            {l.close}
          </button>
        </div>
      </div>
    </div>
  );
}
