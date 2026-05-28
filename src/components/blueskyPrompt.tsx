type Props = {
  lang: 'ja' | 'en';
  isSignedIn: boolean;
  onSignIn: () => void;
};

const LABELS = {
  ja: {
    heading: 'Blueskyでもっと楽しもう！',
    desc: 'サインインすると、botたんと会話できるよ！',
    signIn: 'Blueskyでサインイン / 登録',
    chatReady: 'botたんと会話中！',
  },
  en: {
    heading: 'Want more? Join Bluesky!',
    desc: 'Sign in to chat with bot-tan directly!',
    signIn: 'Sign in / Join Bluesky',
    chatReady: "You're chatting with bot-tan!",
  },
};

export function BlueskyPrompt({ lang, isSignedIn, onSignIn }: Props) {
  const l = LABELS[lang];

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
      <button
        onClick={onSignIn}
        className="w-full py-2 px-4 rounded-full text-sm font-bold transition-opacity hover:opacity-80"
        style={{ background: '#0085ff', color: '#fff' }}
      >
        {l.signIn}
      </button>
    </div>
  );
}
