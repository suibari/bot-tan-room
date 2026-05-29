import { useState } from 'react';

type Props = {
  lang: 'ja' | 'en';
  isSignedIn: boolean;
  onSignIn: (handle: string) => Promise<void>;
};

const LABELS = {
  ja: {
    desc: 'Blueskyにサインインして、botたんと会話！',
    placeholder: 'ハンドル（例: user.bsky.social）',
    signIn: 'サインイン',
    signing: '接続中...',
    error: 'サインインに失敗しました。ハンドルを確認してね。',
    popupBlocked: 'ポップアップがブロックされました。許可してから再試行してください。',
    chatReady: 'botたんと会話中！',
    noAccount: 'アカウントを持っていない？ 新規作成（無料） ↗',
  },
  en: {
    desc: 'Sign in to Bluesky to chat with bot-tan!',
    placeholder: 'Handle (e.g. user.bsky.social)',
    signIn: 'Sign In',
    signing: 'Connecting...',
    error: 'Sign-in failed. Please check your handle and try again.',
    popupBlocked: 'Popup was blocked. Please allow popups and try again.',
    chatReady: "You're chatting with bot-tan!",
    noAccount: "Don't have an account? Create one (Free) ↗",
  },
};

export function BlueskyPrompt({ lang, isSignedIn, onSignIn }: Props) {
  const l = LABELS[lang];
  const [handle, setHandle] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  if (isSignedIn) {
    return (
      <div
        className="w-full max-w-lg mx-auto rounded-xl px-4 py-3 text-center text-xs font-bold shadow-md"
        style={{
          background: 'rgba(0, 133, 255, 0.12)',
          border: '1px solid rgba(0, 133, 255, 0.35)',
          color: 'rgba(160, 210, 255, 0.95)',
          backdropFilter: 'blur(8px)',
        }}
      >
        {l.chatReady}
      </div>
    );
  }

  const handleSubmit = async () => {
    const trimmed = handle.trim().replace(/^@/, '');
    if (!trimmed || isLoading) return;
    setErrorMsg('');
    setIsLoading(true);
    try {
      await onSignIn(trimmed);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '';
      if (msg.toLowerCase().includes('popup') || msg.toLowerCase().includes('blocked')) {
        setErrorMsg(l.popupBlocked);
      } else {
        setErrorMsg(l.error);
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      className="w-full max-w-lg mx-auto rounded-2xl px-4 py-4 space-y-3 shadow-lg"
      style={{
        background: 'rgba(0, 100, 255, 0.05)',
        border: '1px solid rgba(0, 150, 255, 0.18)',
        backdropFilter: 'blur(8px)',
      }}
    >
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse shrink-0" />
        <p className="text-white font-bold text-xs leading-relaxed" style={{ color: 'rgba(215, 230, 255, 0.9)' }}>
          {l.desc}
        </p>
      </div>

      <div className="space-y-2.5">
        <div className="flex gap-2">
          <input
            type="text"
            value={handle}
            onChange={(e) => { setHandle(e.target.value); setErrorMsg(''); }}
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
            placeholder={l.placeholder}
            disabled={isLoading}
            className="flex-1 px-3 py-2 rounded-xl text-white placeholder-white/30 outline-none focus:ring-1 focus:ring-blue-400/50 text-xs disabled:opacity-50 transition-all"
            style={{
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
            }}
          />

          <button
            onClick={handleSubmit}
            disabled={!handle.trim() || isLoading}
            className="px-4 py-2 rounded-xl text-xs font-bold transition-all duration-200 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-110 shadow-md whitespace-nowrap"
            style={{
              background: 'linear-gradient(135deg, #0085ff, #00baee)',
              color: '#fff',
            }}
          >
            {isLoading ? l.signing : l.signIn}
          </button>
        </div>

        {errorMsg && (
          <p className="text-[11px] font-medium" style={{ color: 'rgba(255, 130, 130, 0.95)' }}>
            {errorMsg}
          </p>
        )}

        <a
          href="https://bsky.app/"
          target="_blank"
          rel="noopener noreferrer"
          className="block w-full py-2 px-4 rounded-xl text-[11px] font-bold text-center transition-all duration-200 hover:bg-white/10 active:scale-[0.98]"
          style={{
            background: 'rgba(255, 255, 255, 0.08)',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            color: 'rgba(200, 225, 255, 0.95)',
          }}
        >
          {l.noAccount}
        </a>
      </div>
    </div>
  );
}
