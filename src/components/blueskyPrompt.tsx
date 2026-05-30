import { useState } from 'react';

type Props = {
  lang: 'ja' | 'en';
  isSignedIn: boolean;
  onSignIn: (handle: string) => Promise<void>;
};

const LABELS = {
  ja: {
    desc: 'Blueskyにサインインして、botたんのお部屋で話そう！',
    placeholder: 'ハンドル（例: user.bsky.social）',
    signIn: 'サインイン',
    signing: '接続中...',
    error: 'サインインに失敗しました。ハンドルを確認してね。',
    popupBlocked: 'ポップアップがブロックされました。許可してから再試行してください。',
    chatReady: 'botたんのお部屋へようこそ。たくさん話してね 🌸',
    noAccount: 'アカウントを持っていない？ 新規作成（無料） ↗',
  },
  en: {
    desc: 'Sign in to Bluesky to enter Bot-tan\'s Room!',
    placeholder: 'Handle (e.g. user.bsky.social)',
    signIn: 'Sign In',
    signing: 'Connecting...',
    error: 'Sign-in failed. Please check your handle and try again.',
    popupBlocked: 'Popup was blocked. Please allow popups and try again.',
    chatReady: "Welcome to Bot-tan's Room. Let's talk a lot 🌸",
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
        className="w-full max-w-xl mx-auto rounded-full px-6 py-4 text-center text-sm font-black shadow-sm"
        style={{
          background: 'rgba(0, 205, 172, 0.1)',
          border: '1.5px solid rgba(0, 205, 172, 0.25)',
          color: '#0d9488',
          backdropFilter: 'blur(16px)',
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
      className="w-full max-w-xl mx-auto shadow-sm"
      style={{
        background: 'rgba(255, 255, 255, 0.55)',
        border: '1.5px solid rgba(255, 255, 255, 0.45)',
        backdropFilter: 'blur(20px)',
        borderRadius: '1.8rem',
        padding: '0.85rem 1.25rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem',
      }}
    >
      <div className="flex items-center gap-2">
        <span className="w-2.5 h-2.5 rounded-full bg-sky-400 animate-pulse shrink-0" />
        <p className="text-slate-800 font-extrabold text-sm leading-relaxed">
          {l.desc}
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <input
            type="text"
            value={handle}
            onChange={(e) => { setHandle(e.target.value); setErrorMsg(''); }}
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
            placeholder={l.placeholder}
            disabled={isLoading}
            className="flex-1 text-slate-800 placeholder-slate-400 outline-none text-xs font-semibold shadow-inner transition-all duration-200"
            style={{
              background: 'rgba(255, 255, 255, 0.52)',
              border: '1.5px solid rgba(58, 155, 213, 0.25)',
              borderRadius: '9999px',
              padding: '10px 18px',
              minWidth: '0',
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = 'var(--theme-blue)';
              e.currentTarget.style.boxShadow = '0 0 0 3px rgba(58, 155, 213, 0.15)';
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = 'rgba(58, 155, 213, 0.25)';
              e.currentTarget.style.boxShadow = 'none';
            }}
          />

          <button
            onClick={handleSubmit}
            disabled={!handle.trim() || isLoading}
            className="text-xs font-black text-white shadow-sm tracking-wider transition-all duration-300 hover:brightness-105 active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap bg-theme-gradient"
            style={{
              borderRadius: '9999px',
              padding: '10px 20px',
            }}
          >
            {isLoading ? l.signing : l.signIn}
          </button>
        </div>

        {errorMsg && (
          <p className="text-[11px] font-bold pl-2" style={{ color: 'rgba(220, 50, 50, 0.95)' }}>
            {errorMsg}
          </p>
        )}

        <a
          href="https://bsky.app/"
          target="_blank"
          rel="noopener noreferrer"
          className="block w-full text-xs font-black text-center transition-all duration-300 hover:brightness-105 active:scale-[0.98] shadow-sm"
          style={{
            background: 'rgba(255, 255, 255, 0.65)',
            border: '1.5px solid rgba(58, 155, 213, 0.25)',
            color: '#0085ff',
            borderRadius: '9999px',
            padding: '10px 16px',
          }}
        >
          {l.noAccount}
        </a>
      </div>
    </div>
  );
}
