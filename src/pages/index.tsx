import { useCallback, useContext, useEffect, useRef, useState } from "react";
import Head from "next/head";
import VrmViewer from "@/components/vrmViewer";
import { ViewerContext } from "@/features/vrmViewer/viewerContext";
import {
  Message,
  textsToScreenplay,
} from "@/features/messages/messages";
import { speakCharacter } from "@/features/messages/speakCharacter";
import { SYSTEM_PROMPT } from "@/features/constants/systemPromptConstants";
import { KoeiroParam, DEFAULT_PARAM } from "@/features/constants/koeiroParam";
import { getGeminiResponseStream } from "@/features/chat/geminiChat";
import { ChatView } from "@/components/chatView";
import { GetStaticProps } from "next";
import { useRouter } from "next/router";
import { serverSideTranslations } from "next-i18next/serverSideTranslations";
import { useTranslation } from "next-i18next";
import { BackgroundPosts } from "@/components/backgroundPosts";
import { FortuneCard } from "@/components/fortuneCard";
import { DiagnosisForm } from "@/components/DiagnosisForm";
import { BlueskyPrompt } from "@/components/blueskyPrompt";
import type { DiagnosisResult } from "@/pages/api/fortune";
import { fetchAudio, fetchAudioUrl } from "@/features/messages/speakCharacter";
import { parseLanguageContent, stripEmotionTags } from "@/utils/languageParser";

type AnswerItem = { question: string; answer: string };
type Phase = "landing" | "questions" | "loading" | "fortune" | "chat";

// OAuthSession 型は @atproto/oauth-client の exports 解決問題で直接 import できないため
// BrowserOAuthClient.init() の戻り値から導出する
type BskyOAuthClient = import('@atproto/oauth-client-browser').BrowserOAuthClient;
type BskySession = NonNullable<Awaited<ReturnType<BskyOAuthClient['init']>>>['session'];

export default function Home() {
  const { viewer } = useContext(ViewerContext);
  const { t } = useTranslation();
  const router = useRouter();
  const lang = (router.locale === "ja" ? "ja" : "en") as "ja" | "en";

  const switchLocale = useCallback((l: "ja" | "en") => {
    router.push(router.pathname, router.asPath, { locale: l });
  }, [router]);

  // --- chat state (preserved from original) ---
  const [systemPrompt] = useState(SYSTEM_PROMPT);
  const [userName, setUserName] = useState("");
  const [koeiromapKey] = useState("");
  const [koeiroParam, setKoeiroParam] = useState<KoeiroParam>(DEFAULT_PARAM);
  const [chatProcessing, setChatProcessing] = useState(false);
  const [chatLog, setChatLog] = useState<Message[]>([]);
  const [assistantMessage, setAssistantMessage] = useState("");

  // --- new state ---
  const [phase, setPhase] = useState<Phase>("landing");
  const [nameInput, setNameInput] = useState("");
  const [fortune, setFortune] = useState<DiagnosisResult | null>(null);
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [isAuthChecking, setIsAuthChecking] = useState(true); // OAuth init 解決まで true
  const [isWaitingForVoice, setIsWaitingForVoice] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isLangLocked, setIsLangLocked] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const questionAbortRef = useRef<AbortController | null>(null);
  // OAuth クライアントをマウント時に事前ロードして signInRedirect がすぐ呼べるようにする
  const bskyClientRef = useRef<BskyOAuthClient | null>(null);
  // サインアウト時に session.signOut() を呼ぶため OAuthSession を保持
  const bskySessionRef = useRef<BskySession | null>(null);

  // OGP base URL
  const BASE_URL =
    process.env.NEXT_PUBLIC_BASE_URL ?? "https://guestbook.suibari.com";

  const routerRef = useRef(router);
  useEffect(() => {
    routerRef.current = router;
  }, [router]);

  // Restore persisted settings + OAuth client pre-load
  useEffect(() => {
    const storedName = window.localStorage.getItem("chatVRM_userName");
    if (storedName) setUserName(storedName);

    const storedKoeiro = window.localStorage.getItem("chatVRMParams");
    if (storedKoeiro) {
      const p = JSON.parse(storedKoeiro);
      if (p.koeiroParam) setKoeiroParam(p.koeiroParam);
    }

    // OAuth クライアントを事前ロード + init() を呼ぶ
    import('@/features/auth/bskyOAuth')
      .then(({ getBskyOAuthClient }) => {
        const client = getBskyOAuthClient(); // 同期・シングルトン
        bskyClientRef.current = client;
        return client.init();
      })
      .then((result) => {
        if (result?.session) {
          bskySessionRef.current = result.session;
          const fallback =
            'state' in result && typeof result.state === 'string' && result.state
              ? result.state.replace(/^@/, '')
              : result.session.did;
          setUserName(fallback);
          window.localStorage.setItem('chatVRM_userName', fallback);
          window.localStorage.setItem('bsky_handle', fallback);
          setIsSignedIn(true);
          setPhase('chat'); // 診断をスキップして会話から開始
          setIsAuthChecking(false);

          // サインイン前の言語を復元する
          const storedLang = window.localStorage.getItem('pre_signin_lang');
          if (storedLang) {
            window.localStorage.removeItem('pre_signin_lang');
            const currentLocale = routerRef.current.locale;
            if (storedLang !== currentLocale) {
              routerRef.current.push(
                routerRef.current.pathname,
                routerRef.current.asPath,
                { locale: storedLang }
              );
            }
          }

          // プロフィール名（displayName 優先）を非同期取得して上書き
          result.session
            .fetchHandler(
              `/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(result.session.did)}`
            )
            .then((r: Response) => r.json())
            .then((p: { displayName?: string; handle?: string }) => {
              const name = p.displayName?.trim() || p.handle || fallback;
              setUserName(name);
              window.localStorage.setItem('chatVRM_userName', name);
              window.localStorage.setItem('bsky_handle', name);
            })
            .catch((e: unknown) => console.error('[bsky getProfile]', e));
        } else {
          const h = window.localStorage.getItem("bsky_handle");
          if (h) setIsSignedIn(true);
          setIsAuthChecking(false);
        }
      })
      .catch((e: unknown) => {
        if (e instanceof Error && e.message.includes('Redirecting')) return;
        console.error('[Bluesky OAuth init]', e);
        const h = window.localStorage.getItem("bsky_handle");
        if (h) setIsSignedIn(true);
        setIsAuthChecking(false);
      });
  }, []);

  // 質問専用スピーカー: キューを使わず直接再生。新しい呼び出しで前の音声を中断する
  const speakQuestion = useCallback(async (text: string) => {
    questionAbortRef.current?.abort();
    const controller = new AbortController();
    questionAbortRef.current = controller;

    try {
      const talks = textsToScreenplay([`[neutral]${text}`], koeiroParam);
      const url = await fetchAudioUrl(talks[0].talk, koeiromapKey).catch(() => null);
      if (controller.signal.aborted || !url) return;
      viewer.model?.stopSpeak();
      await viewer.model?.speakStream(url, talks[0]);
    } catch (e) {
      if (!controller.signal.aborted) console.error('Question VoiceVox error:', e);
    }
  }, [koeiroParam, koeiromapKey, viewer]);

  const safeSpeak = useCallback((text: string, onStart?: () => void, onComplete?: () => void) => {
    try {
      const talks = textsToScreenplay([`[neutral]${text}`], koeiroParam);
      const p = speakCharacter(talks[0], viewer, koeiromapKey, onStart, onComplete);
      Promise.resolve(p).catch((e) => {
        console.error('VoiceVox error:', e);
        // onStart はエラー前に呼ばれているが onComplete は呼ばれていないので補完
        onComplete?.();
      });
    } catch (e) {
      console.error('VoiceVox error:', e);
      onStart?.();
      onComplete?.();
    }
  }, [koeiroParam, viewer, koeiromapKey]);

  const handleNameSubmit = useCallback(() => {
    const name = nameInput.trim();
    if (!name) {
      nameInputRef.current?.focus();
      return;
    }
    setUserName(name);
    window.localStorage.setItem("chatVRM_userName", name);
    setPhase("questions");
  }, [nameInput]);

  const handleDiagnose = useCallback(async (answers: AnswerItem[]) => {
    setIsWaitingForVoice(true);
    setPhase("loading");
    setIsLangLocked(true); // 診断開始時に言語をロック

    try {
      const res = await fetch("/api/fortune", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: userName, lang, answers }),
      });
      if (!res.ok) throw new Error("diagnosis failed");
      const data: DiagnosisResult = await res.json();

      const voiceText = data.analysis_ja;

      let hasOpened = false;
      const openResult = () => {
        if (hasOpened) return;
        hasOpened = true;
        setFortune(data);
        setPhase("fortune");
      };

      // 音声の準備が遅れた場合のセーフティ用タイムアウト（最大5.5秒で強制表示）
      const timeoutId = setTimeout(() => {
        console.log("[handleDiagnose] Safety timeout reached, opening fortune card");
        openResult();
      }, 5500);

      safeSpeak(
        voiceText,
        () => {
          clearTimeout(timeoutId);
          setIsWaitingForVoice(false);
          setIsSpeaking(true);
          openResult(); // 音声の再生開始と同時に結果画面を表示！
        },
        () => setIsSpeaking(false),
      );
    } catch (e) {
      console.error(e);
      setIsWaitingForVoice(false);
      setIsLangLocked(false); // 失敗時はロック解除
      setPhase("questions");
    }
  }, [userName, lang, safeSpeak]);

  const handleSignIn = useCallback(async (handle: string) => {
    // サインイン前の言語を退避
    window.localStorage.setItem('pre_signin_lang', lang);
    const { getBskyOAuthClient } = await import('@/features/auth/bskyOAuth');
    const client = bskyClientRef.current ?? getBskyOAuthClient();
    // フルページリダイレクト方式でポップアップ・BroadcastChannel 問題を回避
    // state にハンドルを渡してコールバックで復元できるようにする
    await client.signInRedirect(handle, { state: handle });
  }, [lang]);

  const handleStartChat = useCallback(() => {
    setPhase("chat");
  }, []);

  const handleSignOut = useCallback(async () => {
    try {
      await bskySessionRef.current?.signOut();
    } catch (e) {
      console.error('[Bluesky signOut]', e);
    }
    bskySessionRef.current = null;
    window.localStorage.removeItem('bsky_handle');
    window.localStorage.removeItem('chatVRM_userName');
    setIsSignedIn(false);
    setUserName('');
    setNameInput('');
    setChatLog([]);
    setIsLangLocked(false); // サインアウト時にロック解除
    setPhase('landing');
  }, []);

  // --- chat logic ---
  // ユーザーを待たせない方針:
  //   1. 応答テキストを受信しながら逐次バブルに表示（生成中は送信ボタンがスピナー）
  //   2. 全文受信後、発話準備の中央スピナーを表示
  //   3. VoiceVox の再生開始でスピナーを消して発話
  const handleSendChat = useCallback(
    async (text: string) => {
      if (!text) return;
      setChatProcessing(true);
      setAssistantMessage("");
      const messageLog: Message[] = [
        ...chatLog,
        { role: "user", content: text, userName },
      ];
      setChatLog(messageLog);

      // 初回送信時に言語ロックを確実に行う
      setIsLangLocked(true);

      // システムプロンプトに指定された言語のみを出力する指示を注入
      const langDirective =
        lang === "en"
          ? "\n\n# Response Format Rules (CRITICAL)\n" +
            "You MUST respond ONLY in English.\n" +
            "You MUST start your response with an emotion tag like [happy], [neutral], [sad], [angry], or [relaxed] to represent your feeling.\n" +
            "Format your reply exactly like this:\n" +
            "[emotion]EnglishText\n\n" +
            "Example:\n" +
            "[happy]I'm doing great! How about you?\n\n" +
            "Note: The English response should be cheerful, friendly, and casual. Keep it concise."
          : "\n\n# 返答のフォーマットルール（最重要）\n" +
            "必ず日本語でのみ返答してください。\n" +
            "返答の冒頭には、必ず感情タグ（[happy]、[neutral]、[sad]、[angry]、[relaxed]のいずれか1つ）を付与して感情を表現してください。\n" +
            "フォーマットは必ず以下を厳守してください：\n" +
            "[感情タグ]日本語の返答\n\n" +
            "例：\n" +
            "[happy]元気いっぱいだよ！そっちはどう？\n\n" +
            "注意：日本語の返答は、botたんの特徴（10代の女の子、カジュアルな口調、語尾は「～だよ」「～だね」、敬語禁止）を厳守してください。";

      const messages: Message[] = [
        { role: "system", content: systemPrompt + langDirective },
        ...messageLog,
      ];

      const stream = await getGeminiResponseStream(messages, userName, lang).catch(
        (e) => { console.error(e); return null; }
      );
      if (!stream) { setChatProcessing(false); return; }

      const reader = stream.getReader();
      let fullText = "";
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          fullText += value;
          setAssistantMessage(fullText);
        }
      } catch (e) {
        console.error(e);
      } finally {
        reader.releaseLock();
      }

      setChatLog([...messageLog, { role: "assistant", content: fullText }]);
      setChatProcessing(false);

      // テキスト表示後、発話準備スピナー → 発話（音声合成は日本語のみで有効化する）
      if (lang === "ja") {
        const jaRawText = parseLanguageContent(fullText, "ja");
        const speakText = stripEmotionTags(jaRawText);
        if (speakText) {
          setIsWaitingForVoice(true);
          safeSpeak(
            speakText,
            () => { setIsWaitingForVoice(false); setIsSpeaking(true); },
            () => setIsSpeaking(false),
          );
        }
      }
    },
    [systemPrompt, chatLog, userName, lang, safeSpeak]
  );

  // --- labels ---
  const LABEL = {
    ja: {
      placeholder: "あなたの名前やよびかたを入力",
      button: "お部屋に入る →",
      loading: "botたんが読んでるよ...",
      voiceLoading: "声を準備してるよ...",
      chat: "もっとbotたんと話す 💬",
    },
    en: {
      placeholder: "Enter your name or nickname",
      button: "Enter the Room →",
      loading: "bot-tan is reading...",
      voiceLoading: "Preparing voice...",
      chat: "Keep talking with bot-tan 💬",
    },
  }[lang];

  // Dynamic OGP image URL
  const ogImageUrl =
    phase === "fortune" && fortune
      ? `${BASE_URL}/api/og?${new URLSearchParams({
          name: userName,
          analysis: lang === "ja" ? fortune.analysis_ja : fortune.analysis_en,
          c1: `${lang === "ja" ? fortune.comparisons[0].category_ja : fortune.comparisons[0].category_en}／${lang === "ja" ? fortune.comparisons[0].value_ja : fortune.comparisons[0].value_en}`,
          c2: `${lang === "ja" ? fortune.comparisons[1].category_ja : fortune.comparisons[1].category_en}／${lang === "ja" ? fortune.comparisons[1].value_ja : fortune.comparisons[1].value_en}`,
          c3: `${lang === "ja" ? fortune.comparisons[2].category_ja : fortune.comparisons[2].category_en}／${lang === "ja" ? fortune.comparisons[2].value_ja : fortune.comparisons[2].value_en}`,
          lang,
        }).toString()}`
      : `${BASE_URL}/ogp.png`;

  return (
    <div className="relative w-full h-screen overflow-hidden font-M_PLUS_2">
      <Head>
        <title>{t("meta.title")}</title>
        <meta name="description" content={t("meta.description")} />
        <meta property="og:title" content={t("meta.title")} />
        <meta property="og:description" content={t("meta.description")} />
        <meta property="og:image" content={ogImageUrl} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:image" content={ogImageUrl} />
      </Head>

      {/* background scrolling posts */}
      <BackgroundPosts />

      {/* VRM viewer — always rendered */}
      <VrmViewer />

      {/* トップバー（言語スイッチャー + 名前 + サインアウト）— 常時表示 */}
      <div className="absolute top-4 right-4 z-30 flex items-center gap-2">
        {/* 言語トグル */}
        <div
          className="flex rounded-full overflow-hidden transition-all duration-300"
          style={{
            background: "rgba(20,8,38,0.70)",
            backdropFilter: "blur(10px)",
            border: isLangLocked ? "1px solid rgba(200,140,255,0.12)" : "1px solid rgba(200,140,255,0.30)",
            opacity: isLangLocked ? 0.6 : 1,
          }}
        >
          {isLangLocked && (
            <div className="flex items-center pl-3 text-white/40 select-none">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="mr-1">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </div>
          )}
          {(["en", "ja"] as const).map((l) => (
            <button
              key={l}
              disabled={isLangLocked}
              onClick={() => switchLocale(l)}
              className="px-4 py-2 text-sm font-bold transition-all disabled:cursor-not-allowed"
              style={
                lang === l
                  ? { background: "linear-gradient(135deg, #c471ed, #8c44b5)", color: "#fff" }
                  : { background: "transparent", color: isLangLocked ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.7)" }
              }
            >
              {l === "en" ? "EN" : "日本語"}
            </button>
          ))}
        </div>

        {/* サインイン済み: 名前チップ + サインアウト */}
        {isSignedIn && (
          <>
            <div
              className="px-3 py-2 rounded-full text-sm font-bold max-w-[140px] truncate"
              style={{
                background: "rgba(20,8,38,0.70)",
                backdropFilter: "blur(10px)",
                border: "1px solid rgba(200,140,255,0.30)",
                color: "rgba(230,210,255,0.95)",
              }}
              title={userName}
            >
              👤 {userName}
            </div>
            <button
              onClick={handleSignOut}
              className="px-4 py-2 rounded-full text-sm font-bold transition-opacity hover:opacity-80 active:opacity-60"
              style={{
                background: "rgba(180,80,255,0.25)",
                backdropFilter: "blur(10px)",
                border: "1px solid rgba(200,120,255,0.45)",
                color: "rgba(230,210,255,0.98)",
              }}
            >
              {lang === "ja" ? "サインアウト" : "Sign out"}
            </button>
          </>
        )}
      </div>

      {/* ===== LANDING ===== */}
      {phase === "landing" && !isAuthChecking && (
        <div className="absolute bottom-4 left-4 right-4 z-20 flex justify-center">
          <div
            className="w-full max-w-lg px-4 pb-8 pt-5 space-y-3 rounded-3xl shadow-2xl"
            style={{
              background: "rgba(20,8,38,0.78)",
              backdropFilter: "blur(20px)",
              border: "1px solid rgba(220,160,255,0.18)",
            }}
          >
            <h1 className="text-white text-lg font-bold text-center tracking-wide"
              style={{ textShadow: '0 0 18px rgba(220,140,255,0.45)' }}>
              {lang === "ja" ? "Botたんのお部屋へようこそ" : "Welcome to Bot-tan's Room"}
            </h1>
            <p className="text-xs text-center leading-relaxed" style={{ color: "rgba(255, 255, 255, 0.85)" }}>
              {lang === "ja"
                ? "あなたのこと、botたんに話してみて。どんなことも、ぜんぶ受け止めるよ"
                : "Tell bot-tan about yourself. I will embrace every part of you with warmth"}
            </p>
            <input
              ref={nameInputRef}
              type="text"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleNameSubmit()}
              placeholder={LABEL.placeholder}
              maxLength={30}
              className="w-full px-4 py-3 rounded-xl text-white placeholder-white/35 outline-none text-sm"
              style={{
                background: "rgba(255,255,255,0.08)",
                border: "1px solid rgba(220,160,255,0.22)",
                boxShadow: "0 0 0 0 transparent",
                transition: "box-shadow 0.2s",
              }}
              onFocus={(e) => (e.currentTarget.style.boxShadow = '0 0 0 2px rgba(200,120,255,0.45)')}
              onBlur={(e) => (e.currentTarget.style.boxShadow = '0 0 0 0 transparent')}
            />
            <button
              onClick={handleNameSubmit}
              className="w-full py-3 rounded-xl font-bold text-white text-sm transition-all hover:brightness-110 active:scale-[0.98]"
              style={{ background: "linear-gradient(135deg, #c471ed, #8c44b5, #6a3de8)" }}
            >
              {LABEL.button}
            </button>
          </div>
        </div>
      )}

      {/* ===== QUESTIONS ===== */}
      {phase === "questions" && (
        <div className="absolute bottom-4 left-4 right-4 z-20 flex justify-center">
          <div
            className="w-full max-w-lg px-4 pb-8 pt-5 space-y-3 rounded-3xl shadow-2xl"
            style={{
              background: "rgba(20,8,38,0.78)",
              backdropFilter: "blur(20px)",
              border: "1px solid rgba(220,160,255,0.18)",
            }}
          >
            <h2 className="text-white text-sm font-bold text-center tracking-wide"
              style={{ textShadow: '0 0 12px rgba(220,140,255,0.35)' }}>
              {lang === "ja"
                ? `${userName}さんのこと、聞かせてね`
                : `Tell me about you, ${userName}`}
            </h2>
            <DiagnosisForm
              lang={lang}
              onSubmit={handleDiagnose}
              onQuestionShow={speakQuestion}
            />
          </div>
        </div>
      )}

      {/* ===== スピナー（ボタン押下〜VoiceVox再生開始まで常に表示） ===== */}
      {isWaitingForVoice && (
        <div className="absolute inset-x-0 top-1/3 z-30 flex justify-center pointer-events-none">
          <div
            className="flex flex-col items-center gap-3 px-8 py-5 rounded-2xl"
            style={{
              background: "rgba(20,8,38,0.85)",
              backdropFilter: "blur(16px)",
              border: "1px solid rgba(220,140,255,0.2)",
            }}
          >
            <div className="spinner-ring" />
            <span className="text-white/90 text-sm font-semibold">
              {phase === "loading" ? LABEL.loading : LABEL.voiceLoading}
            </span>
            <style jsx global>{`
              .spinner-ring {
                width: 40px;
                height: 40px;
                border-radius: 50%;
                border: 4px solid rgba(200, 120, 255, 0.25);
                border-top-color: #d88fff;
                animation: spinner-turn 0.75s linear infinite;
                flex-shrink: 0;
              }
              @keyframes spinner-turn {
                to { transform: rotate(360deg); }
              }
            `}</style>
          </div>
        </div>
      )}

      {/* ===== FORTUNE ===== */}
      {phase === "fortune" && fortune && (
        <div className="absolute bottom-4 left-4 right-4 z-20 flex justify-center pointer-events-none">
          <div
            className="w-full max-w-lg px-4 pb-8 pt-4 space-y-3 rounded-3xl shadow-2xl max-h-[58vh] overflow-y-auto pointer-events-auto"
            style={{
              background: "rgba(20,8,38,0.78)",
              backdropFilter: "blur(20px)",
              border: "1px solid rgba(220,160,255,0.18)",
            }}
          >
            {/* ドラッグハンドル */}
            <div className="w-10 h-1 rounded-full mx-auto mb-1"
              style={{ background: "rgba(220,140,255,0.35)" }} />
            <FortuneCard name={userName} fortune={fortune} lang={lang} isSpeaking={isSpeaking} />
            <BlueskyPrompt lang={lang} isSignedIn={isSignedIn} onSignIn={handleSignIn} />
            {isSignedIn && (
              <button
                onClick={handleStartChat}
                className="w-full py-3 rounded-xl font-bold text-white text-sm transition-all hover:brightness-110 active:scale-[0.98]"
                style={{ background: "linear-gradient(135deg, #c471ed, #8c44b5, #6a3de8)" }}
              >
                {LABEL.chat}
              </button>
            )}
          </div>
        </div>
      )}

      {/* ===== CHAT ===== */}
      {phase === "chat" && (
        <ChatView
          lang={lang}
          assistantMessage={assistantMessage}
          isChatProcessing={chatProcessing}
          onSend={handleSendChat}
        />
      )}
    </div>
  );
}

export const getStaticProps: GetStaticProps = async ({ locale }) => ({
  props: {
    ...(await serverSideTranslations(locale ?? "en", ["common"])),
  },
});
