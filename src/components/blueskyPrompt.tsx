import { useState } from 'react';

type Props = {
  lang: 'ja' | 'en';
  isSignedIn: boolean;
  onSignIn: (handle: string) => Promise<void>;
};

const LABELS = {
  ja: {
    heading: 'Blueskyでもっと楽しもう！',
    desc: 'ハンドルでサインインすると、botたんと会話できるよ！',
    placeholder: 'ハンドル（例: user.bsky.social）',
    signIn: 'Blueskyでサインイン',
    signing: '接続中...',
    error: 'サインインに失敗しました。もう一度試してね。',
    popupBlocked: 'ポップアップがブロックされました。許可してから再試行してください。',
    chatReady: 'botたんと会話中！',
  },
  en: {
    heading: 'Want more? Join Bluesky!',
    desc: 'Sign in with your handle to chat with bot-tan directly!',
    placeholder: 'Handle (e.g. user.bsky.social)',
    signIn: 'Sign in with Bluesky',
    signing: 'Connecting...',
    error: 'Sign-in failed. Please try again.',
    popupBlocked: 'Popup was blocked. Please allow popups and try again.',
    chatReady: "You're chatting with bot-tan!",
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
        className="w-full max-w-lg mx-auto rounded-2xl px-6 py-4 text-center text-sm font-bold"
        style={{
          background: 'rgba(0,133,255,0.15)',
          border: '1px solid rgba(0,133,255,0.4)',
          color: 'rgba(150,200,255,0.9)',
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
      className="w-full max-w-lg mx-auto rounded-2xl px-6 py-5 space-y-3"
      style={{
        background: 'rgba(0,133,255,0.1)',
        border: '1px solid rgba(0,133,255,0.3)',
      }}
    >
      <p className="text-white font-bold text-base">{l.heading}</p>
      <p className="text-sm" style={{ color: 'rgba(200,220,255,0.8)' }}>
        {l.desc}
      </p>
      <input
        type="text"
        value={handle}
        onChange={(e) => { setHandle(e.target.value); setErrorMsg(''); }}
        onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
        placeholder={l.placeholder}
        disabled={isLoading}
        className="w-full px-3 py-2 rounded-xl text-white placeholder-white/40 outline-none focus:ring-2 focus:ring-blue-400 text-sm disabled:opacity-50"
        style={{ background: 'rgba(0,133,255,0.12)' }}
      />
      {errorMsg && (
        <p className="text-xs" style={{ color: 'rgba(255,160,160,0.9)' }}>
          {errorMsg}
        </p>
      )}
      <button
        onClick={handleSubmit}
        disabled={!handle.trim() || isLoading}
        className="w-full py-2 px-4 rounded-full text-sm font-bold transition-opacity hover:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed"
        style={{ background: '#0085ff', color: '#fff' }}
      >
        {isLoading ? l.signing : l.signIn}
      </button>
    </div>
  );
}
