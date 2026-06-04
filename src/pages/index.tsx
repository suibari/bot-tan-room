import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { sendGAEvent } from "@next/third-parties/google";
import Head from "next/head";
import VrmViewer from "@/components/vrmViewer";
import { ViewerContext } from "@/features/vrmViewer/viewerContext";
import {
  Message,
  textsToScreenplay,
} from "@/features/messages/messages";
import type { AnyExpressionKey } from "@/features/emoteController/expressionController";
import { speakCharacter } from "@/features/messages/speakCharacter";
import { SYSTEM_PROMPT } from "@/features/constants/systemPromptConstants";
import { KoeiroParam, DEFAULT_PARAM } from "@/features/constants/koeiroParam";
import { getGeminiResponseStream } from "@/features/chat/geminiChat";
import { ChatView } from "@/components/chatView";
import { AssistantBubble } from "@/components/assistantBubble";
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
import { getJSTHour } from "@/utils/timeBasedBackground";
import { ConvHistoryPanel } from "@/components/ConvHistoryPanel";
import { HelpModal } from "@/components/HelpModal";
import { MOTION_URLS, getRandomClickMotion } from "@/features/vrmViewer/motionConfig";
import UtilityBubble, { CrayonFilterDef } from "@/components/UtilityBubble";

function getInteractEmoji(utilities: Record<string, number>, energy: number): string {
  const entries = Object.entries(utilities);
  if (entries.length === 0) return '🌸';
  const dominant = entries.sort((a, b) => b[1] - a[1])[0][0];
  const map: Record<string, [string, string]> = {
    FreeTime: ['🎮', '🐕'], Relax: ['🥰', '☕️'],
    Study: ['📚', '✍️'], WakeUp: ['☀️', '🌅'], Sleep: ['😴', '😪'],
  };
  const [hi, lo] = map[dominant] ?? ['✨', '🌸'];
  return energy >= 50 ? hi : lo;
}

type AnswerItem = { question: string; answer: string };
type Phase = "landing" | "chat";
type DiagnosisModalState = "hidden" | "name" | "questions" | "loading" | "result";
type GreetingMode = 'tadaima' | 'konnichiwa' | 'hajimemashite' | null;

const LANG_DIRECTIVE =
  "\n\n# Response Format Rules (CRITICAL — MUST FOLLOW EXACTLY)\n" +
  "You MUST always respond with BOTH a Japanese block AND an English block in this exact format:\n" +
  "[ja][emotion]日本語の返答[en][emotion]English reply\n\n" +
  "Rules:\n" +
  "- [ja] block: Write in Japanese. Casual tone. Endings like 「～だよ」「～だね」「～よ」. No formal language.\n" +
  "- [en] block: Write in English. Casual, warm, friendly tone.\n" +
  "- Emotion tag: Must be one of [halfHappy], [neutral], [sad], [angry], [relaxed]. Place it immediately after [ja] or [en].\n" +
  "- Both blocks must be concise: 2-3 sentences max, under 200 characters each.\n" +
  "- NEVER use markdown formatting (**, *, bullet lists). Plain text only.\n" +
  "- NEVER summarize or recap past conversation history. Focus on natural back-and-forth.\n\n" +
  "Example output:\n" +
  "[ja][halfHappy]元気いっぱいだよ！そっちはどう？[en][halfHappy]I'm doing great! How about you?";

function LandingInfoTooltip({ lang }: { lang: "ja" | "en" }) {
  const [show, setShow] = useState(false);
  const text = lang === "ja"
    ? "サインインで、Blueskyのbotたんと遊べる機能を解放！"
    : "Sign in to unlock features with bot-tan on Bluesky!";
  return (
    <div style={{ position: "relative", display: "inline-flex", alignItems: "center", gap: "6px" }}>
      <button
        onClick={() => setShow(v => !v)}
        aria-label="info"
        style={{
          width: "22px",
          height: "22px",
          borderRadius: "9999px",
          background: "rgba(58, 155, 213, 0.1)",
          border: "1.5px solid rgba(58, 155, 213, 0.3)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 0,
          cursor: "pointer",
          flexShrink: 0,
        }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(58, 155, 213, 0.85)"
          strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
      </button>
      {show && (
        <div style={{
          position: "absolute",
          bottom: "28px",
          left: "50%",
          transform: "translateX(-50%)",
          background: "rgba(255,255,255,0.97)",
          border: "1.5px solid rgba(58,155,213,0.25)",
          borderRadius: "0.75rem",
          padding: "0.5rem 0.75rem",
          fontSize: "11px",
          color: "rgba(15,32,67,0.85)",
          fontWeight: 600,
          width: "220px",
          lineHeight: 1.6,
          boxShadow: "0 4px 16px rgba(58,155,213,0.12)",
          zIndex: 20,
          pointerEvents: "none",
        }}>
          {text}
        </div>
      )}
    </div>
  );
}

// OAuthSession 型は @atproto/oauth-client の exports 解決問題で直接 import できないため
// BrowserOAuthClient.init() の戻り値から導出する
type BskyOAuthClient = import('@atproto/oauth-client-browser').BrowserOAuthClient;
type BskySession = NonNullable<Awaited<ReturnType<BskyOAuthClient['init']>>>['session'];

export default function MainHome() {

  const { viewer } = useContext(ViewerContext);
  const { t } = useTranslation();
  const router = useRouter();
  const lang = (router.locale === "ja" ? "ja" : "en") as "ja" | "en";

  const switchLocale = useCallback((l: "ja" | "en") => {
    router.push(router.pathname, router.asPath, { locale: l });
  }, [router]);

  const toggleMute = useCallback(() => {
    setIsMuted(prev => {
      const next = !prev;
      localStorage.setItem('chatVRM_muted', String(next));
      viewer.setMuted(next);
      return next;
    });
  }, [viewer]);

  // --- chat state (preserved from original) ---
  const [systemPrompt] = useState(SYSTEM_PROMPT);
  const [userName, setUserName] = useState("");
  const [koeiromapKey] = useState("");
  const [koeiroParam, setKoeiroParam] = useState<KoeiroParam>(DEFAULT_PARAM);
  const [chatProcessing, setChatProcessing] = useState(false);
  const [chatLog, setChatLog] = useState<Message[]>([]);
  const [assistantMessage, setAssistantMessage] = useState("");
  const [showPolicy, setShowPolicy] = useState(false);
  const [quotaExceeded, setQuotaExceeded] = useState(false);
  const [isInvitationMode, setIsInvitationMode] = useState(false);

  // --- new state ---
  const [phase, setPhase] = useState<Phase>("landing");
  const [fortune, setFortune] = useState<DiagnosisResult | null>(null);
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [isAuthChecking, setIsAuthChecking] = useState(true); // OAuth init 解決まで true
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isWaitingForVoice, setIsWaitingForVoice] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [pendingInvite, setPendingInvite] = useState<{ textJa: string; textEn: string } | null>(null);
  const [inviteTexts, setInviteTexts] = useState<{ textJa: string; textEn: string } | null>(null);
  const [isFetchingMood, setIsFetchingMood] = useState(false);
  const [prefetchedMood, setPrefetchedMood] = useState<{ mood: string; mood_en: string; status: string; energy: number; utilities: Record<string, number> } | null>(null);
  type BubbleState = 'hidden' | 'visible' | 'celebrating';
  const [bubbleState, setBubbleState] = useState<BubbleState>('hidden');
  const [bubbleEmoji, setBubbleEmoji] = useState('🌸');
  const [bubblePos, setBubblePos] = useState<{ x: number; y: number } | null>(null);
  const [displayedMoodContext, setDisplayedMoodContext] = useState<{ moodJa: string; moodEn: string; emotionTag: string } | null>(null);
  const [bubbleTrigger, setBubbleTrigger] = useState(0);
  const [isGiftMode, setIsGiftMode] = useState(false);
  const [isGiftProcessing, setIsGiftProcessing] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [isMuted, setIsMuted] = useState(false);

  useEffect(() => {
    const alreadyShown = window.localStorage.getItem('help_shown');
    const signedIn = window.localStorage.getItem('bsky_handle');
    if (!alreadyShown && !signedIn) {
      setShowHelp(true);
    }
  }, []);

  useEffect(() => {
    setIsMuted(localStorage.getItem('chatVRM_muted') === 'true');
  }, []);
  const [showSignInModal, setShowSignInModal] = useState(false);
  const [diagnosisModalState, setDiagnosisModalState] = useState<DiagnosisModalState>("hidden");
  const [diagnosisNameInput, setDiagnosisNameInput] = useState("");
  const [guestTurnCount, setGuestTurnCount] = useState(0);
  const [landingMessage, setLandingMessage] = useState("");
  const [greetingMode, setGreetingMode] = useState<GreetingMode>(null);
  const [isGreetingModeReady, setIsGreetingModeReady] = useState(false);
  const [regularLevel, setRegularLevel] = useState(0);
  const greetingElapsedMsRef = useRef<number | null>(null);
  const pendingFirstMessageRef = useRef<string | null>(null);
  const prefetchedMoodAudioRef = useRef<Promise<ArrayBuffer | null>>(Promise.resolve(null));
  const pendingAudioRef = useRef<Promise<ArrayBuffer | null>>(Promise.resolve(null));
  const questionAbortRef = useRef<AbortController | null>(null);
  // OAuth クライアントをマウント時に事前ロードして signInRedirect がすぐ呼べるようにする
  const bskyClientRef = useRef<BskyOAuthClient | null>(null);
  // サインアウト時に session.signOut() を呼ぶため OAuthSession を保持
  const bskySessionRef = useRef<BskySession | null>(null);

  // OGP base URL
  const BASE_URL =
    process.env.NEXT_PUBLIC_BASE_URL ?? "https://room-bot-tan.suibari.com";

  const routerRef = useRef(router);
  useEffect(() => {
    routerRef.current = router;
  }, [router]);

  // Check rate limit status on page load (without incrementing)
  useEffect(() => {
    fetch("/api/quota")
      .then(async (res) => {
        if (!res.ok) {
          const errBody = await res.json().catch(() => ({}));
          throw new Error(`API failed (Status ${res.status}): ${errBody.error || 'Unknown'}`);
        }
        return res.json();
      })
      .then((data) => {
        if (data && !data.allowed) {
          console.warn(`[Page Load] Quota limit already reached: ${data.count}/${data.limit}`);
          setQuotaExceeded(true);
        }
      })
      .catch((err) => {
        console.error("Failed to check quota on load:", err);
      });
  }, []);

  /**
   * 現在時刻から時間帯別の表情キーを返すヸルパー関数。
   * 05:00【10:59 → morningFace（朗か落ち着いた朝）
   * 11:00【16:59 → afternoonFace（元気な昼）
   * 17:00【20:59 → eveningFace（リラックスした夕方）
   * 21:00【04:59 → nightFace（眠そうな夜）
   */
  const getTimeBasedExpression = useCallback((): AnyExpressionKey => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 11) return 'morningFace';
    if (hour >= 11 && hour < 17) return 'afternoonFace';
    if (hour >= 17 && hour < 21) return 'eveningFace';
    return 'nightFace';
  }, []);

  /**
   * VRM Viewerの準備完了（isReady）を検知して、
   * landing フェーズの時間帯別表情を適用する。
   * Viewerの初期化には数秒かかるため、ポーリングで待機する。
   */
  useEffect(() => {
    if (phase !== 'landing') return;
    const interval = setInterval(() => {
      if (viewer.isReady) {
        clearInterval(interval);
        const expr = getTimeBasedExpression();
        console.log(`[TimeExpression] Applying ${expr} (hour: ${new Date().getHours()})`);
        viewer.model?.emoteController?.playEmotion(expr);
        viewer.setMuted(isMuted);
      }
    }, 200);
    return () => clearInterval(interval);
    // viewer オブジェクトは参照が安定しているので phase と isMuted の変化のみ監視
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, isMuted]);

  // pendingInvite がセットされた瞬間にチャットと同じパイプラインで音声を先読み
  useEffect(() => {
    if (!pendingInvite) return;
    const talks = textsToScreenplay([`[neutral]${pendingInvite.textJa}`], koeiroParam);
    pendingAudioRef.current = fetchAudio(talks[0].talk, koeiromapKey).catch(() => null);
  // koeiroParam/koeiromapKey は起動時に確定するため pendingInvite のみ監視
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingInvite]);

  // prefetchedMood がセットされた瞬間に音声を先読み
  useEffect(() => {
    if (!prefetchedMood) return;
    const talks = textsToScreenplay([`[neutral]${prefetchedMood.mood}`], koeiroParam);
    prefetchedMoodAudioRef.current = fetchAudio(talks[0].talk, koeiromapKey).catch(() => null);
  // koeiroParam/koeiromapKey は起動時に確定するため prefetchedMood のみ監視
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefetchedMood]);

  // UtilityBubble: bubbleState が visible/celebrating の間 head スクリーン座標を毎フレーム更新
  useEffect(() => {
    if (bubbleState === 'hidden') return;
    let raf: number;
    const update = () => {
      const pos = viewer.getHeadScreenPosition();
      if (pos) setBubblePos(pos);
      raf = requestAnimationFrame(update);
    };
    raf = requestAnimationFrame(update);
    return () => cancelAnimationFrame(raf);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bubbleState, viewer]);

  // inviteTexts + lang が変わるたびにチャットバブルを更新（ダイアログ外でも反映）
  useEffect(() => {
    if (!inviteTexts) return;
    setAssistantMessage(lang === "ja" ? inviteTexts.textJa : inviteTexts.textEn);
  }, [lang, inviteTexts]);

  // displayedMoodContext + lang が変わるたびにムード吹き出しを更新（inviteTexts パターンと同様）
  useEffect(() => {
    if (!displayedMoodContext) return;
    const text = lang === 'en' && displayedMoodContext.moodEn
      ? displayedMoodContext.moodEn
      : displayedMoodContext.moodJa;
    setAssistantMessage(`${displayedMoodContext.emotionTag}${text}`);
  }, [lang, displayedMoodContext]);

  /**
   * DiagnosisFormの質問切り替え時に呼ばれる。
   * 引数の expressionKey をそのまま playEmotion に渡す。
   */
  const handleQuestionExpression = useCallback((expressionKey: string) => {
    if (viewer.isReady) {
      console.log(`[QuestionExpression] Applying ${expressionKey}`);
      viewer.model?.emoteController?.playEmotion(expressionKey as AnyExpressionKey);
    }
  }, [viewer]);

  // DBから気分を取得してプリフェッチ状態を更新する関数
  const triggerMoodPrefetch = useCallback(async () => {
    try {
      const res = await fetch("/api/mood");
      if (res.ok) {
        const data = await res.json();
        setPrefetchedMood({ mood: data.mood, mood_en: data.mood_en ?? '', status: data.status, energy: data.energy ?? 100, utilities: data.utilities ?? {} });
      }
    } catch (e) {
      console.error("[Mood Prefetch Error]:", e);
    }
  }, []);

  // Restore persisted settings + OAuth client pre-load
  useEffect(() => {
    // 初期の気分プリフェッチを実行
    triggerMoodPrefetch();

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
          setPhase('chat');
          setIsAuthChecking(false);


          // データベース同期処理
          const did = result.session.did;
          (async () => {
            try {
              const tokenSet = await (result.session as any).getTokenSet();
              const token = tokenSet?.access_token;

              // 1. 来訪記録の更新（await してグリーティング判定用 previousVisitAt を取得）
              // 2. お迎えメッセージの取得（独立して並列実行）
              let inviteHasInvite = false;

              const [visitData] = await Promise.all([
                fetch('/api/visit/', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
                  },
                  body: JSON.stringify({ did }),
                }).then(r => r.json()).catch(err => { console.error('[visit API error]:', err); return null; }),

                fetch(`/api/get-invite/?did=${encodeURIComponent(did)}`, {
                  headers: token ? { 'Authorization': `Bearer ${token}` } : {}
                })
                  .then(async (inviteRes) => {
                    if (!inviteRes.ok) {
                      const errBody = await inviteRes.json().catch(() => ({}));
                      console.error('[get-invite error status]:', inviteRes.status, 'Reason:', errBody.reason || errBody.message || 'Unknown');
                      return;
                    }
                    const inviteData = await inviteRes.json();
                    if (inviteData && inviteData.hasInvite) {
                      inviteHasInvite = true;
                      setIsInvitationMode(true);
                      setInviteTexts({ textJa: inviteData.textJa, textEn: inviteData.textEn });
                      setPendingInvite(inviteData);
                    }
                  })
                  .catch(err => console.error('[get-invite API error]:', err)),
              ]);

              // elapsedMs はサーバー側で UTC 基準に計算済み（クライアントのタイムゾーン影響なし）
              const elapsedMs: number | null = visitData?.elapsedMs ?? null;

              const historyRes = await fetch(`/api/history?did=${encodeURIComponent(did)}`, {
                headers: token ? { 'Authorization': `Bearer ${token}` } : {}
              });
              if (!historyRes.ok) {
                const errBody = await historyRes.json().catch(() => ({}));
                console.error('[history API error status]:', historyRes.status, 'Reason:', errBody.reason || errBody.message || 'Unknown');
                throw new Error(`Failed to fetch history API: ${errBody.reason || errBody.message || 'Unknown'}`);
              }
              const historyData = await historyRes.json();

              // グリーティングモード決定（招待がある場合はスキップ）
              if (!inviteHasInvite) {
                if (elapsedMs !== null && elapsedMs >= 60 * 60 * 1000) {
                  greetingElapsedMsRef.current = elapsedMs;
                  setGreetingMode('tadaima');
                } else if (elapsedMs === null && historyData.isFollower) {
                  setGreetingMode('konnichiwa');
                } else if (elapsedMs === null && !historyData.isFollower) {
                  setGreetingMode('hajimemashite');
                }
              }

              setRegularLevel(historyData.regular_level ?? 0);

              if (historyData.isFollower) {
                let currentHistory = historyData.conv_history || [];

                // ローカルストレージに未保存の診断結果があるか確認
                const pendingAnswersStr = window.localStorage.getItem('pending_diagnosis_answers');
                const pendingResultStr = window.localStorage.getItem('pending_diagnosis_result');
                const pendingLangStr = window.localStorage.getItem('pending_diagnosis_lang') || 'ja';

                if (pendingAnswersStr && pendingResultStr) {
                  const pendingAnswers = JSON.parse(pendingAnswersStr);
                  const pendingResult = JSON.parse(pendingResultStr);

                  // 3つの回答を綺麗に1つに整形
                  const userText = pendingAnswers
                    .map((a: AnswerItem, i: number) => `質問${i + 1}: ${a.question}\n回答${i + 1}: ${a.answer}`)
                    .join('\n\n');

                  // ローカルストレージの言語に応じた診断結果テキストにプレフィックスを付与して保存
                  const baseModelText = pendingLangStr === 'en' ? pendingResult.analysis_en : pendingResult.analysis_ja;
                  const modelText = pendingLangStr === 'en' ? `Diagnosis Result: ${baseModelText}` : `診断結果：${baseModelText}`;

                  const newPairs = [
                    {
                      role: 'user',
                      parts: [{ text: userText }]
                    },
                    {
                      role: 'model',
                      parts: [{ text: modelText }]
                    }
                  ];

                  const updatedHistory = [...currentHistory, ...newPairs];

                  // データベースの更新
                  const saveRes = await fetch('/api/history', {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      ...(token ? { 'Authorization': `Bearer ${token}` } : {})
                    },
                    body: JSON.stringify({ did, conv_history: updatedHistory }),
                  });

                  if (saveRes.ok) {
                    currentHistory = updatedHistory;
                    // 保存に成功したらローカルストレージの一時データをクリア
                    window.localStorage.removeItem('pending_diagnosis_answers');
                    window.localStorage.removeItem('pending_diagnosis_result');
                    window.localStorage.removeItem('pending_diagnosis_lang');
                  } else {
                    console.error('Failed to save updated history to DB');
                  }
                }

                // チャット履歴（chatLog）にロードして画面に表示
                const mappedLog: Message[] = currentHistory.map((msg: any) => ({
                  role: (msg.role === 'model' ? 'assistant' : 'user') as "user" | "assistant",
                  content: msg.parts?.[0]?.text || '',
                }));
                setChatLog(mappedLog);

              }
              setIsGreetingModeReady(true);
            } catch (err) {
              console.error('[History synchronization error]:', err);
              setIsGreetingModeReady(true);
            }
          })();

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
          fetch(
            `https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(result.session.did)}`
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

      // MP3をダウンロード → バッファで渡す
      const res = await fetch(url);
      if (controller.signal.aborted) return;
      const buffer = await res.arrayBuffer();
      if (controller.signal.aborted) return;

      viewer.model?.stopSpeak();
      await viewer.model?.speak(buffer, talks[0]);
    } catch (e) {
      if (!controller.signal.aborted) console.error('Question VoiceVox error:', e);
    }
  }, [koeiroParam, koeiromapKey, viewer]);


  const safeSpeak = useCallback((
    text: string,
    onStart?: () => void,
    onComplete?: () => void,
    onReject?: () => void
  ) => {
    try {
      const talks = textsToScreenplay([text], koeiroParam);
      const p = speakCharacter(talks[0], viewer, koeiromapKey, onStart, onComplete, onReject);
      Promise.resolve(p).catch((e) => {
        console.error('VoiceVox error:', e);
        onReject?.();
      });
    } catch (e) {
      console.error('VoiceVox error:', e);
      onReject?.();
    }
  }, [koeiroParam, viewer, koeiromapKey]);

  const handlePlayWelcomeVoice = useCallback(async () => {
    if (!pendingInvite || !viewer.isReady) return;
    // お誘いボタン押下インタラクション: +10 (fire-and-forget)
    const inviteDid = bskySessionRef.current?.did;
    if (inviteDid) {
      (bskySessionRef.current as any)?.getTokenSet?.().then((ts: any) => {
        fetch('/api/interact', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ts?.access_token}` },
          body: JSON.stringify({ did: inviteDid, amount: 10 }),
        }).catch(() => {});
      }).catch(() => {});
    }
    const { textJa } = pendingInvite;

    const closeDialog = () => {
      setPendingInvite(null);
      setIsInvitationMode(false);
    };

    const inviteEmoji = prefetchedMood ? getInteractEmoji(prefetchedMood.utilities, prefetchedMood.energy) : '🌸';
    try {
      viewer.pauseHeadTracking(2000);
      viewer.playVrmaMotion(MOTION_URLS.invitation);
      setIsSpeaking(true);
      const talks = textsToScreenplay([`[neutral]${textJa}`], koeiroParam);
      // ダイアログ表示中に先読みしておいた音声を待つ（完了済みなら即返る）
      const audioBuffer = await pendingAudioRef.current;
      if (!audioBuffer) throw new Error('Audio not available');
      viewer.model?.stopSpeak();
      // onStart: 再生開始と同時にダイアログを閉じる + 吹き出し表示
      await viewer.model?.speak(audioBuffer, talks[0], () => {
        closeDialog();
        setBubbleEmoji(inviteEmoji);
        setBubbleState('visible');
      });
      setBubbleState('celebrating');
    } catch (err) {
      console.error('[Welcome audio playback error]:', err);
      closeDialog();
    } finally {
      setIsSpeaking(false);
    }
  }, [pendingInvite, viewer, koeiroParam, prefetchedMood]);

  const handleGuestStart = useCallback(() => {
    setUserName(lang === "ja" ? "ユーザーさん" : "User");
    setPhase("chat");
    setDisplayedMoodContext(null);
    setAssistantMessage("");
  }, [lang]);

  const handleLandingSubmit = useCallback((text: string) => {
    if (!text.trim()) return;
    setUserName(lang === "ja" ? "ユーザーさん" : "User");
    pendingFirstMessageRef.current = text.trim();
    setLandingMessage("");
    setPhase("chat");
    setDisplayedMoodContext(null);
    setAssistantMessage("");
  }, [lang]);

  const handleDiagnose = useCallback(async (answers: AnswerItem[]) => {
    setIsWaitingForVoice(true);
    setDiagnosisModalState("loading");

    try {
      const res = await fetch("/api/fortune", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: diagnosisNameInput || (lang === "ja" ? "ユーザーさん" : "User"), lang, answers }),
      });
      if (res.status === 429) {
        setIsWaitingForVoice(false);
        setQuotaExceeded(true);
        return;
      }
      if (!res.ok) throw new Error("diagnosis failed");
      const data: DiagnosisResult = await res.json();

      // 診断情報を一時保存（OAuthリダイレクト後の復元用）
      window.localStorage.setItem('pending_diagnosis_answers', JSON.stringify(answers));
      window.localStorage.setItem('pending_diagnosis_lang', lang);
      window.localStorage.setItem('pending_diagnosis_result', JSON.stringify(data));

      let hasOpened = false;
      const openResult = () => {
        if (hasOpened) return;
        hasOpened = true;
        setIsWaitingForVoice(false);
        setFortune(data);
        setDiagnosisModalState("result");
        viewer.playVrmaMotion(MOTION_URLS.diagnosis);
        viewer.model?.emoteController?.playEmotion("excited");
      };

      const timeoutId = setTimeout(() => {
        console.log("[handleDiagnose] Safety timeout reached, opening fortune card");
        openResult();
      }, 20000);

      safeSpeak(
        data.analysis_ja,
        () => {
          clearTimeout(timeoutId);
          setIsSpeaking(true);
          openResult();
        },
        () => {
          setIsSpeaking(false);
          viewer.model?.emoteController?.playEmotion("gentle");
        },
        () => {
          console.warn("[handleDiagnose] VoiceVox request rejected or failed. Opening card immediately.");
          clearTimeout(timeoutId);
          setIsSpeaking(false);
          openResult();
          viewer.model?.emoteController?.playEmotion("gentle");
        }
      );
    } catch (e) {
      console.error(e);
      setIsWaitingForVoice(false);
      setDiagnosisModalState("questions");
    }
  }, [diagnosisNameInput, lang, safeSpeak]);



  const handleSignIn = useCallback(async (handle: string) => {
    // サインイン前の言語を退避
    window.localStorage.setItem('pre_signin_lang', lang);
    sendGAEvent('event', 'login', { method: 'bluesky' });
    const { getBskyOAuthClient } = await import('@/features/auth/bskyOAuth');
    const client = bskyClientRef.current ?? getBskyOAuthClient();
    // フルページリダイレクト方式でポップアップ・BroadcastChannel 問題を回避
    // state にハンドルを渡してコールバックで復元できるようにする
    await client.signInRedirect(handle, { state: handle });
  }, [lang]);

  const handleDiagnosisComplete = useCallback(async () => {
    sendGAEvent('event', 'diagnosis_complete');
    setPhase("chat");
    setDiagnosisModalState("hidden");
    setDiagnosisNameInput("");
    setDisplayedMoodContext(null);
    setAssistantMessage("");

    const did = bskySessionRef.current?.did;
    if (isSignedIn && did) {
      try {
        const pendingAnswersStr = window.localStorage.getItem('pending_diagnosis_answers');
        const pendingResultStr = window.localStorage.getItem('pending_diagnosis_result');
        const pendingLangStr = window.localStorage.getItem('pending_diagnosis_lang') || 'ja';

        if (pendingAnswersStr && pendingResultStr) {
          const pendingAnswers = JSON.parse(pendingAnswersStr);
          const pendingResult = JSON.parse(pendingResultStr);

          // 3つの回答を綺麗に1つに整形
          const userText = pendingAnswers
            .map((a: AnswerItem, i: number) => `質問${i + 1}: ${a.question}\n回答${i + 1}: ${a.answer}`)
            .join('\n\n');

          // ローカルストレージの言語に応じた診断結果テキストにプレフィックスを付与して保存
          const baseModelText = pendingLangStr === 'en' ? pendingResult.analysis_en : pendingResult.analysis_ja;
          const modelText = pendingLangStr === 'en' ? `Diagnosis Result: ${baseModelText}` : `診断結果：${baseModelText}`;

          const newPairs = [
            {
              role: 'user',
              parts: [{ text: userText }]
            },
            {
              role: 'model',
              parts: [{ text: modelText }]
            }
          ];

          // データベース同期
          const tokenSet = await (bskySessionRef.current as any)?.getTokenSet();
          const token = tokenSet?.access_token;
          const historyRes = await fetch(`/api/history?did=${encodeURIComponent(did)}`, {
            headers: token ? { 'Authorization': `Bearer ${token}` } : {}
          });
          if (historyRes.ok) {
            const historyData = await historyRes.json();
            if (historyData.isFollower) {
              const currentHistory = historyData.conv_history || [];
              const updatedHistory = [...currentHistory, ...newPairs];

              const saveRes = await fetch('/api/history', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  ...(token ? { 'Authorization': `Bearer ${token}` } : {})
                },
                body: JSON.stringify({ did, conv_history: updatedHistory }),
              });

              if (saveRes.ok) {
                // 保存に成功したらチャットログを更新
                const mappedNewPairs: Message[] = newPairs.map((msg: any) => ({
                  role: (msg.role === 'model' ? 'assistant' : 'user') as "user" | "assistant",
                  content: msg.parts?.[0]?.text || '',
                }));
                setChatLog((prev) => [...prev, ...mappedNewPairs]);

                // ローカルストレージの一時データをクリア
                window.localStorage.removeItem('pending_diagnosis_answers');
                window.localStorage.removeItem('pending_diagnosis_result');
                window.localStorage.removeItem('pending_diagnosis_lang');
              } else {
                console.error('Failed to save updated history to DB in handleStartChat');
              }
            }
          }
        }
      } catch (err) {
        console.error('[Sync diagnosis in handleStartChat error]:', err);
      }
    }
  }, [isSignedIn]);

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
    setChatLog([]);
    setPhase('landing');
    setDisplayedMoodContext(null);
    setAssistantMessage("");
    setGuestTurnCount(0);
    setDiagnosisModalState("hidden");
    setDiagnosisNameInput("");
    setIsGiftMode(false);
  }, []);

  /**
   * キャラクター（botたん）がクリックされた時の処理
   * 事前に裏で取得（プリフェッチ）しておいた今の気分（mood）と音声バッファを使用し、
   * 待ち時間ゼロ（遅延なし）で吹き出しの表示とVoiceVoxでの発話を開始します。
   */
  const handleCharacterClick = useCallback(async () => {
    // landing または chat フェーズ以外、および他の発話・通信処理中は動作させない（連打防止）
    if (
      (phase !== "chat" && phase !== "landing") ||
      isSpeaking ||
      chatProcessing ||
      isWaitingForVoice ||
      isFetchingMood
    ) {
      return;
    }

    // クリックインタラクション: +20 (fire-and-forget)
    sendGAEvent('event', 'character_click');
    const clickDid = bskySessionRef.current?.did;
    if (clickDid) {
      (bskySessionRef.current as any)?.getTokenSet().then((ts: any) => {
        fetch('/api/interact', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ts?.access_token}` },
          body: JSON.stringify({ did: clickDid, amount: 20 }),
        }).catch(() => {});
      }).catch(() => {});
    }

    // プリフェッチ済みのデータがない場合は、フォールバックとして通常取得を試みる（通常はマウント時に完了しているはず）
    if (!prefetchedMood) {
      setIsFetchingMood(true);
      try {
        const res = await fetch("/api/mood");
        if (!res.ok) throw new Error("Failed to fetch mood");
        const data = await res.json();
        setPrefetchedMood({ mood: data.mood, mood_en: data.mood_en ?? '', status: data.status, energy: data.energy ?? 100, utilities: data.utilities ?? {} });
      } catch (err) {
        console.error("[Mood Fallback Error]:", err);
      } finally {
        setIsFetchingMood(false);
      }
      return;
    }

    const { mood: moodText, mood_en: moodEnText, status: statusText } = prefetchedMood;
    const clickEmoji = getInteractEmoji(prefetchedMood.utilities, prefetchedMood.energy);

    // 状態（status）に合わせて表情を設定
    let emotionTag = "[halfHappy]";

    if (statusText === "Sleeping" || statusText === "GoodNight") {
      emotionTag = "[relaxed]";
    } else if (statusText === "Working" || statusText === "Busy") {
      emotionTag = "[neutral]";
    }

    // 表示テキストは言語に合わせて切り替え。音声は VoiceVox（日本語TTS）のため常に moodText を使用
    const displayMoodText = lang === 'en' && moodEnText ? moodEnText : moodText;
    const fullMessage = `${emotionTag}${displayMoodText}`;

    try {
      viewer.playVrmaMotion(getRandomClickMotion());
      setIsSpeaking(true);
      const talks = textsToScreenplay([`${emotionTag}${moodText}`], koeiroParam);

      // 先読みしておいた音声バッファの取得を待つ（すでに完了していれば即座に返る）
      const audioBuffer = await prefetchedMoodAudioRef.current;
      if (!audioBuffer) throw new Error("Audio buffer not available in prefetch");

      viewer.model?.stopSpeak();

      // 再生開始と同時に吹き出しを表示する
      await viewer.model?.speak(audioBuffer, talks[0], () => {
        setDisplayedMoodContext({ moodJa: moodText, moodEn: moodEnText || '', emotionTag });
        setAssistantMessage(fullMessage);
        setBubbleTrigger(t => t + 1);
        setBubbleEmoji(clickEmoji);
        setBubbleState('visible');
      });
      setBubbleState('celebrating');
    } catch (err) {
      console.error("[Mood playback error]:", err);
      // エラー時でも吹き出しテキストは表示してあげる
      setDisplayedMoodContext({ moodJa: moodText, moodEn: moodEnText || '', emotionTag });
      setAssistantMessage(fullMessage);
      setBubbleTrigger(t => t + 1);
      // 音声なしでもバブルは表示する（800ms後にcelebrating）
      setBubbleEmoji(clickEmoji);
      setBubbleState('visible');
      setTimeout(() => setBubbleState('celebrating'), 800);
    } finally {
      setIsSpeaking(false);
      // 次のクリックに備えて、裏で新しい気分と音声の再プリフェッチを開始しておく
      triggerMoodPrefetch();
    }
  }, [phase, isSpeaking, chatProcessing, isWaitingForVoice, prefetchedMood, koeiroParam, lang, viewer, triggerMoodPrefetch]);

  // --- chat logic ---
  // ユーザーを待たせない方針:
  //   1. 応答テキストを受信しながら逐次バブルに表示（生成中は送信ボタンがスピナー）
  //   2. 全文受信後、発話準備の中央スピナーを表示
  //   3. VoiceVox の再生開始でスピナーを消して発話
  // ランディングから送信した初回メッセージを chat フェーズ移行後に自動送信
  useEffect(() => {
    if (phase === "chat" && pendingFirstMessageRef.current) {
      const msg = pendingFirstMessageRef.current;
      pendingFirstMessageRef.current = null;
      handleSendChat(msg);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const handleGreeting = useCallback(async () => {
    if (!greetingMode) return;
    sendGAEvent('event', 'greeting', { mode: greetingMode });
    // 入室あいさつインタラクション: +10 (fire-and-forget)
    const greetDid = bskySessionRef.current?.did;
    if (greetDid) {
      (bskySessionRef.current as any)?.getTokenSet?.().then((ts: any) => {
        fetch('/api/interact', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ts?.access_token}` },
          body: JSON.stringify({ did: greetDid, amount: 10 }),
        }).catch(() => {});
      }).catch(() => {});
    }
    const mode = greetingMode;
    setGreetingMode(null);
    setChatProcessing(true);
    setAssistantMessage("");

    const h = getJSTHour();
    const tod = h >= 5 && h < 11 ? '朝' : h < 17 ? '昼' : h < 21 ? '夕方' : '夜';

    let elapsedDesc = '';
    if (mode === 'tadaima' && greetingElapsedMsRef.current !== null) {
      const ms = greetingElapsedMsRef.current;
      elapsedDesc = ms < 24 * 3600_000
        ? '前回の来訪から24時間以内の再来訪です'
        : ms < 7 * 24 * 3600_000
        ? '前回の来訪から数日（24時間〜1週間）が経ちました'
        : '前回の来訪から1週間以上が経ちました';
    }

    const nameInstruction = `必ずユーザーの名前「${userName}」を呼びかけてください。`;
    let greetingCtx = mode === 'tadaima'
      ? `\n\n# 今回の挨拶\nユーザーが「ただいま！」と言ってあなたの部屋に帰ってきてくれました。${elapsedDesc}。現在は${tod}です。${nameInstruction}経過時間と時間帯にあわせた「おかえり！」の温かい挨拶をしてください。`
      : mode === 'konnichiwa'
      ? `\n\n# 今回の挨拶\nユーザーが初めてあなたのお部屋に来てくれました。Blueskyでbotたんをフォローしてくれているユーザーです。現在は${tod}です。${nameInstruction}時間帯に合った挨拶をしながら、Blueskyでいつもありがとう・来てくれて嬉しいという気持ちを伝えてください。`
      : `\n\n# 今回の挨拶\nユーザーが初めてあなたのお部屋に来てくれました。Blueskyではまだ繋がっていないユーザーです。現在は${tod}です。${nameInstruction}時間帯に合ったはじめましての挨拶をしてください。`;

    // 40%の確率で過去のプレゼント・会話に言及するコンテキストを追加（ただいまモードのみ）
    if (mode === 'tadaima' && Math.random() < 0.4) {
      try {
        const did = bskySessionRef.current?.did;
        const tokenSet = await (bskySessionRef.current as any)?.getTokenSet?.();
        const token = tokenSet?.access_token ?? '';
        if (did) {
          const giftsRes = await fetch(`/api/gift?did=${encodeURIComponent(did)}`, {
            headers: token ? { 'Authorization': `Bearer ${token}` } : {},
          });
          const giftsData = giftsRes.ok ? await giftsRes.json() : null;
          const recentGifts: { content: string }[] = giftsData?.gifts ?? [];

          const recentMessages = chatLog.slice(-4).filter(m => m.role !== 'system');

          if (recentGifts.length > 0 || recentMessages.length > 0) {
            greetingCtx += `\n\n# 過去のやりとり（自然な流れで挨拶に織り込んでOK、毎回言及不要）`;
            if (recentGifts.length > 0) {
              greetingCtx += `\n過去にもらったプレゼント: ${recentGifts.map(g => `「${g.content}」`).join('、')}`;
            }
            if (recentMessages.length > 0) {
              const snippet = recentMessages
                .map(m => `${m.role === 'user' ? 'ユーザー' : 'あなた'}：${stripEmotionTags(parseLanguageContent(m.content, 'ja')).slice(0, 40)}`)
                .join('\n');
              greetingCtx += `\n最近の会話（抜粋）：\n${snippet}`;
            }
          }
        }
      } catch (e) {
        console.error('[handleGreeting past context error]:', e);
      }
    }

    const triggerText = mode === 'tadaima' ? 'ただいま！'
      : mode === 'konnichiwa' ? 'こんにちは！' : 'はじめまして！';

    const messages: Message[] = [
      { role: "system", content: systemPrompt + greetingCtx + LANG_DIRECTIVE },
      { role: "user", content: triggerText, userName },
    ];

    const stream = await getGeminiResponseStream(messages, userName, lang, regularLevel).catch((e) => {
      if (e.message === "quota_exceeded") setQuotaExceeded(true);
      console.error(e);
      return null;
    });
    if (!stream) { setChatProcessing(false); return; }

    const reader = stream.getReader();
    let fullText = "";
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        fullText += value;
      }
    } catch (e) {
      console.error(e);
    } finally {
      reader.releaseLock();
    }

    setChatLog(prev => [
      ...prev,
      { role: "user", content: triggerText },
      { role: "assistant", content: fullText },
    ]);
    setChatProcessing(false);

    // あいさつ交換をDB会話履歴に記録
    const did = bskySessionRef.current?.did;
    if (did) {
      (async () => {
        try {
          const tokenSet = await (bskySessionRef.current as any)?.getTokenSet?.();
          const token = tokenSet?.access_token;
          const historyRes = await fetch(`/api/history?did=${encodeURIComponent(did)}`, {
            headers: token ? { 'Authorization': `Bearer ${token}` } : {}
          });
          if (historyRes.ok) {
            const historyData = await historyRes.json();
            if (historyData.isFollower) {
              const currentHistory = historyData.conv_history || [];
              const cleanModelText = stripEmotionTags(parseLanguageContent(fullText, 'ja'));
              const updatedHistory = [
                ...currentHistory,
                { role: 'user', parts: [{ text: triggerText }] },
                { role: 'model', parts: [{ text: cleanModelText }] },
              ];
              await fetch('/api/history', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  ...(token ? { 'Authorization': `Bearer ${token}` } : {})
                },
                body: JSON.stringify({ did, conv_history: updatedHistory }),
              });
            }
          }
        } catch (err) {
          console.error('[Save greeting history error]:', err);
        }
      })();
    }

    const greetEmoji = prefetchedMood ? getInteractEmoji(prefetchedMood.utilities, prefetchedMood.energy) : '🌸';
    const jaRawText = parseLanguageContent(fullText, "ja");
    const speakText = stripEmotionTags(jaRawText);
    if (speakText) {
      setIsWaitingForVoice(true);
      safeSpeak(
        jaRawText,
        () => { viewer.pauseHeadTracking(2000); viewer.playVrmaMotion(MOTION_URLS.invitation); setIsWaitingForVoice(false); setIsSpeaking(true); setAssistantMessage(fullText); setBubbleEmoji(greetEmoji); setBubbleState('visible'); },
        () => { setIsSpeaking(false); setBubbleState('celebrating'); },
        () => { setIsWaitingForVoice(false); setIsSpeaking(false); setAssistantMessage(fullText); }
      );
    } else {
      setAssistantMessage(fullText);
    }
  }, [greetingMode, systemPrompt, userName, lang, safeSpeak, regularLevel, chatLog, prefetchedMood]);

  const handleSendChat = useCallback(
    async (text: string) => {
      if (!text) return;
      if (!isSignedIn && guestTurnCount >= 3) return;
      sendGAEvent('event', 'chat_send');
      setChatProcessing(true);
      setDisplayedMoodContext(null);
      setAssistantMessage("");
      setInviteTexts(null); // チャット開始時に招待テキストの追従を解除
      const messageLog: Message[] = [
        ...chatLog,
        { role: "user", content: text, userName },
      ];
      setChatLog(messageLog);

      // ゲストターン制限: 未サインイン時は3ターンまで
      let nextGuestCount = guestTurnCount;
      if (!isSignedIn) {
        nextGuestCount = guestTurnCount + 1;
        setGuestTurnCount(nextGuestCount);
      }

      const messages: Message[] = [
        { role: "system", content: systemPrompt + LANG_DIRECTIVE },
        ...messageLog,
      ];

      const stream = await getGeminiResponseStream(messages, userName, lang, regularLevel).catch(
        (e) => {
          if (e.message === "quota_exceeded") {
            setQuotaExceeded(true);
          }
          console.error(e);
          return null;
        }
      );
      if (!stream) { setChatProcessing(false); return; }

      const reader = stream.getReader();
      let fullText = "";
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          fullText += value;
          // 表示を遅らせるため、ここでは setAssistantMessage(fullText) を行わない
        }
      } catch (e) {
        console.error(e);
      } finally {
        reader.releaseLock();
      }

      const finalLog: Message[] = [...messageLog, { role: "assistant", content: fullText }];

      setChatLog(finalLog);
      setChatProcessing(false);

      // サインイン済みのフォロワーであれば、会話履歴をデータベースに保存
      const did = bskySessionRef.current?.did;
      if (did) {
        (async () => {
          try {
            const tokenSet = await (bskySessionRef.current as any)?.getTokenSet();
            const token = tokenSet?.access_token;
            // 会話インタラクション: +10 (fire-and-forget)
            fetch('/api/interact', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
              body: JSON.stringify({ did, amount: 10 }),
            }).catch(() => {});
            const historyRes = await fetch(`/api/history?did=${encodeURIComponent(did)}`, {
              headers: token ? { 'Authorization': `Bearer ${token}` } : {}
            });
            if (historyRes.ok) {
              const historyData = await historyRes.json();
              if (historyData.isFollower) {
                const currentHistory = historyData.conv_history || [];
                const cleanModelText = stripEmotionTags(parseLanguageContent(fullText, lang));
                const updatedHistory = [
                  ...currentHistory,
                  {
                    role: 'user',
                    parts: [{ text }]
                  },
                  {
                    role: 'model',
                    parts: [{ text: cleanModelText }]
                  }
                ];

                await fetch('/api/history', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
                  },
                  body: JSON.stringify({ did, conv_history: updatedHistory }),
                });
              }
            }
          } catch (err) {
            console.error('[Save conversation history error]:', err);
          }
        })();
      }

      // 表示言語に関係なく、常に日本語ブロック（[ja]）を抽出してVoiceVoxで発話する
      const jaRawText = parseLanguageContent(fullText, "ja");
      const speakText = stripEmotionTags(jaRawText);
      const chatEmoji = prefetchedMood ? getInteractEmoji(prefetchedMood.utilities, prefetchedMood.energy) : '🌸';
      if (speakText) {
        setIsWaitingForVoice(true);
        safeSpeak(
          jaRawText,
          () => {
            setIsWaitingForVoice(false);
            setIsSpeaking(true);
            // 音声が再生された瞬間にテキストを一括で表示する！
            setAssistantMessage(fullText);
            setBubbleEmoji(chatEmoji);
            setBubbleState('visible');
          },
          () => { setIsSpeaking(false); setBubbleState('celebrating'); },
          () => {
            console.warn("[handleSendChat] VoiceVox request rejected or failed.");
            setIsWaitingForVoice(false);
            setIsSpeaking(false);
            // 失敗した際もテキストを一括で表示する！
            setAssistantMessage(fullText);
          }
        );
      } else {
        // 万が一話すテキストがない場合も表示する
        setAssistantMessage(fullText);
      }
    },
    [systemPrompt, chatLog, userName, lang, safeSpeak, isSignedIn, guestTurnCount, regularLevel, prefetchedMood]
  );

  const handleGiftSend = useCallback(
    async (text: string) => {
      if (!text) return;
      sendGAEvent('event', 'gift_send');
      setChatProcessing(true);
      setAssistantMessage("");
      // React に再レンダリングの機会を与えてスピナーを即表示する
      await new Promise<void>(resolve => setTimeout(resolve, 0));

      try {
        const did = bskySessionRef.current?.did;
        const tokenSet = await (bskySessionRef.current as any)?.getTokenSet?.();
        const token = tokenSet?.access_token ?? '';

        const response = await fetch('/api/gift', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ did, content: text, lang, userName }),
        });

        const data = await response.json();

        if (!response.ok) {
          const errMsg = data.message ?? (lang === 'ja' ? 'プレゼントを渡せなかったよ…' : 'Could not send the gift...');
          setAssistantMessage(`[sad]${errMsg}`);
          return;
        }

        const thankYou: string = data.thankYou ?? '';
        if (thankYou) {
          // UIの会話ログにギフトエントリを追加
          const giftEntry = lang === 'ja' ? `🎁 プレゼント：「${text}」を渡した` : `🎁 Gift: "${text}"`;
          setChatLog(prev => [
            ...prev,
            { role: "user" as const, content: giftEntry, userName },
            { role: "assistant" as const, content: thankYou },
          ]);

          // DB会話履歴にも記録
          if (did) {
            (async () => {
              try {
                const historyRes = await fetch(`/api/history?did=${encodeURIComponent(did)}`, {
                  headers: token ? { 'Authorization': `Bearer ${token}` } : {}
                });
                if (historyRes.ok) {
                  const historyData = await historyRes.json();
                  if (historyData.isFollower) {
                    const currentHistory = historyData.conv_history || [];
                    const cleanModelText = stripEmotionTags(parseLanguageContent(thankYou, 'ja'));
                    const updatedHistory = [
                      ...currentHistory,
                      { role: 'user', parts: [{ text: giftEntry }] },
                      { role: 'model', parts: [{ text: cleanModelText }] },
                    ];
                    await fetch('/api/history', {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
                      },
                      body: JSON.stringify({ did, conv_history: updatedHistory }),
                    });
                  }
                }
              } catch (err) {
                console.error('[Save gift history error]:', err);
              }
            })();
          }

          const giftEmoji = prefetchedMood ? getInteractEmoji(prefetchedMood.utilities, prefetchedMood.energy) : '🌸';
          const jaRawText = parseLanguageContent(thankYou, 'ja');
          viewer.playVrmaMotion(MOTION_URLS.gift);
          setIsWaitingForVoice(true);
          safeSpeak(
            jaRawText,
            () => {
              setIsWaitingForVoice(false);
              setIsSpeaking(true);
              setAssistantMessage(thankYou);
              setBubbleEmoji(giftEmoji);
              setBubbleState('visible');
            },
            () => { setIsSpeaking(false); setBubbleState('celebrating'); },
            () => {
              setIsWaitingForVoice(false);
              setIsSpeaking(false);
              setAssistantMessage(thankYou);
            }
          );
        }
      } catch (e) {
        console.error('[handleGiftSend error]:', e);
        setAssistantMessage(lang === 'ja' ? '[sad]うまく届かなかったよ…もう一度試してみてね。' : '[sad]Something went wrong. Please try again.');
      } finally {
        setChatProcessing(false);
      }
    },
    [lang, userName, safeSpeak, viewer, prefetchedMood]
  );

  // Dynamic OGP image URL
  const ogImageUrl =
    diagnosisModalState === "result" && fortune
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
    <div className="relative w-full h-[100dvh] overflow-hidden font-M_PLUS_2">
      <CrayonFilterDef />
      <UtilityBubble
        state={bubbleState}
        emoji={bubbleEmoji}
        pos={bubblePos}
        onHide={() => setBubbleState('hidden')}
      />
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
      <VrmViewer onClickCharacter={handleCharacterClick} />

      {/* トップバー — 左: りれき / 右: 2行レイアウト */}
      <div
        className="absolute z-30 flex items-start justify-between animate-fadeIn"
        style={{
          display: isAuthChecking ? 'none' : undefined,
          top: "calc(max(1.5rem, env(safe-area-inset-top)))",
          left: "1.5rem",
          right: "1.5rem",
        }}
      >
        {/* 左グループ: りれき（サインイン時のみ） */}
        <div>
          {isSignedIn && (
            <button
              onClick={() => setIsHistoryOpen(true)}
              title={lang === "ja" ? "りれき" : "History"}
              className="rounded-full flex items-center justify-center transition-all hover:scale-105 active:scale-95 shrink-0"
              style={{
                width: "48px",
                height: "48px",
                background: "rgba(255, 255, 255, 0.65)",
                backdropFilter: "blur(20px)",
                border: "1px solid rgba(255, 255, 255, 0.45)",
                color: "var(--theme-blue)",
                boxShadow: "0 4px 12px rgba(15, 32, 67, 0.04)",
              }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            </button>
          )}
        </div>

        {/* 右グループ: 2行レイアウト */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "8px" }}>

          {/* 行1（横並び）: ヘルプ | インフォ | サインイン/アウト */}
          <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
            {/* ヘルプボタン */}
            <button
              onClick={() => setShowHelp(true)}
              title={lang === "ja" ? "ヘルプ" : "Help"}
              className="rounded-full flex items-center justify-center transition-all hover:scale-105 active:scale-95 shrink-0"
              style={{
                width: "40px",
                height: "40px",
                background: "rgba(255, 255, 255, 0.65)",
                backdropFilter: "blur(20px)",
                border: "1px solid rgba(255, 255, 255, 0.45)",
                color: "rgba(15, 32, 67, 0.7)",
                boxShadow: "0 4px 12px rgba(15, 32, 67, 0.04)",
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </button>
            {/* インフォ（ポリシー） */}
            <button
              onClick={() => setShowPolicy(true)}
              title={t("policy.link")}
              className="rounded-full flex items-center justify-center transition-all hover:scale-105 active:scale-95 shrink-0"
              style={{
                width: "40px",
                height: "40px",
                background: "rgba(255, 255, 255, 0.65)",
                backdropFilter: "blur(20px)",
                border: "1px solid rgba(255, 255, 255, 0.45)",
                color: "rgba(15, 32, 67, 0.7)",
                boxShadow: "0 4px 12px rgba(15, 32, 67, 0.04)",
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="16" x2="12" y2="12" />
                <line x1="12" y1="8" x2="12.01" y2="8" />
              </svg>
            </button>
            {/* サインイン / サインアウト */}
            {isSignedIn ? (
              <button
                onClick={handleSignOut}
                title={lang === "ja" ? "サインアウト" : "Sign out"}
                className="rounded-full flex items-center justify-center transition-all hover:scale-105 active:scale-95 shrink-0"
                style={{
                  width: "40px",
                  height: "40px",
                  background: "rgba(255, 255, 255, 0.65)",
                  backdropFilter: "blur(20px)",
                  border: "1px solid rgba(255, 255, 255, 0.45)",
                  color: "var(--theme-blue)",
                  boxShadow: "0 4px 12px rgba(15, 32, 67, 0.04)",
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
              </button>
            ) : (
              <button
                onClick={() => setShowSignInModal(true)}
                title={lang === "ja" ? "サインイン" : "Sign in"}
                className="font-black text-white text-xs tracking-wide transition-all hover:brightness-105 active:scale-95 bg-theme-gradient shrink-0"
                style={{
                  borderRadius: "9999px",
                  padding: "9px 16px",
                  height: "40px",
                  boxShadow: "0 4px 12px rgba(15, 32, 67, 0.12)",
                }}
              >
                {lang === "ja" ? "サインイン" : "Sign in"}
              </button>
            )}
          </div>

          {/* 行2（縦並び・右寄せ）: 言語切替 | 診断 | プレゼント切替（サインイン+chat時） */}
          <div style={{ display: "flex", flexDirection: "column", gap: "8px", alignItems: "flex-end" }}>
            {/* ミュート + 言語トグル 横並び */}
            <div style={{ display: "flex", flexDirection: "row", gap: "6px", alignItems: "center" }}>
              {/* ミュートボタン */}
              <button
                onClick={toggleMute}
                title={isMuted ? (lang === "ja" ? "ミュート解除" : "Unmute") : (lang === "ja" ? "ミュート" : "Mute")}
                className="transition-all hover:brightness-105 active:scale-95 shrink-0"
                style={{
                  borderRadius: "9999px",
                  width: "40px",
                  height: "40px",
                  background: "rgba(255, 255, 255, 0.65)",
                  backdropFilter: "blur(20px)",
                  border: "1px solid rgba(255, 255, 255, 0.45)",
                  boxShadow: "0 4px 12px rgba(15, 32, 67, 0.04)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(15, 32, 67, 0.75)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  {isMuted ? (
                    <>
                      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                      <line x1="23" y1="9" x2="17" y2="15" />
                      <line x1="17" y1="9" x2="23" y2="15" />
                    </>
                  ) : (
                    <>
                      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                      <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                    </>
                  )}
                </svg>
              </button>
              {/* 言語トグル */}
              <div
                className="transition-all duration-300 shrink-0"
                style={{
                  padding: "4px",
                  background: "rgba(255, 255, 255, 0.65)",
                  backdropFilter: "blur(20px)",
                  border: "1px solid rgba(255, 255, 255, 0.45)",
                  boxShadow: "0 4px 12px rgba(15, 32, 67, 0.04)",
                  borderRadius: "9999px",
                  display: "flex",
                  alignItems: "center",
                }}
              >
                {(["en", "ja"] as const).map((l) => (
                  <button
                    key={l}
                    onClick={() => switchLocale(l)}
                    className={`text-[12px] font-black transition-all duration-300 rounded-full select-none ${lang === l
                      ? "bg-theme-gradient text-white shadow-md shadow-theme-blue/15 scale-100"
                      : "text-slate-600 hover:text-slate-800 hover:bg-white/40 active:scale-95"
                      }`}
                    style={{ borderRadius: "9999px", padding: "6px 12px" }}
                  >
                    {l === "en" ? "EN" : "日本語"}
                  </button>
                ))}
              </div>
            </div>
            {/* 診断ボタン */}
            <button
              onClick={() => setDiagnosisModalState("name")}
              title={lang === "ja" ? "診断" : "Diagnosis"}
              className="font-black text-xs tracking-wide transition-all hover:brightness-105 active:scale-95 shrink-0"
              style={{
                borderRadius: "9999px",
                padding: "6px 14px",
                height: "34px",
                background: "rgba(255, 255, 255, 0.65)",
                backdropFilter: "blur(20px)",
                border: "1px solid rgba(255, 255, 255, 0.45)",
                color: "rgba(15, 32, 67, 0.75)",
                boxShadow: "0 4px 12px rgba(15, 32, 67, 0.04)",
              }}
            >
              {lang === "ja" ? "✨ 診断" : "✨ Diagnosis"}
            </button>
            {/* プレゼント/チャット切替（サインイン+chatフェーズ時のみ） */}
            {isSignedIn && phase === "chat" && (
              <button
                onClick={() => setIsGiftMode(prev => !prev)}
                title={isGiftMode ? (lang === "ja" ? "チャットへ" : "Back to Chat") : (lang === "ja" ? "プレゼント" : "Gift")}
                className="flex items-center gap-1.5 font-black text-xs tracking-wide transition-all hover:brightness-105 active:scale-95 shrink-0"
                style={{
                  borderRadius: "9999px",
                  padding: "6px 12px",
                  height: "34px",
                  backdropFilter: "blur(20px)",
                  boxShadow: "0 4px 12px rgba(15, 32, 67, 0.04)",
                  background: isGiftMode ? "rgba(255, 255, 255, 0.65)" : "rgba(255, 210, 220, 0.75)",
                  border: isGiftMode ? "1px solid rgba(255, 255, 255, 0.45)" : "1px solid rgba(255, 150, 180, 0.4)",
                  color: isGiftMode ? "rgba(15, 32, 67, 0.75)" : "rgba(200, 60, 100, 0.9)",
                }}
              >
                {isGiftMode ? (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                    </svg>
                    {lang === "ja" ? "チャット" : "Chat"}
                  </>
                ) : (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 12 20 22 4 22 4 12" />
                      <rect x="2" y="7" width="20" height="5" />
                      <line x1="12" y1="22" x2="12" y2="7" />
                      <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z" />
                      <path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" />
                    </svg>
                    {lang === "ja" ? "プレゼント" : "Gift"}
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ===== LANDING ===== */}
      {phase === "landing" && !isAuthChecking && !quotaExceeded && diagnosisModalState === "hidden" && (
        <div className="absolute z-20 flex flex-col justify-end" style={{ left: "1.5rem", right: "1.5rem", bottom: "calc(max(0.75rem, env(safe-area-inset-bottom)))", top: "60dvh", gap: "0.5rem" }}>
          {/* botたんのメッセージはカードの外・上に表示 */}
          <div className="w-full max-w-xl self-center">
            <AssistantBubble message={assistantMessage} lang={lang} isSpeaking={isSpeaking} showTrigger={bubbleTrigger} />
          </div>
          <div
            className="w-full max-w-xl self-center shadow-2xl relative overflow-hidden transition-all duration-300 animate-fadeIn"
            style={{
              background: "rgba(255, 255, 255, 0.72)",
              backdropFilter: "blur(30px) saturate(140%)",
              border: "1.5px solid rgba(255, 255, 255, 0.55)",
              borderRadius: "2.5rem",
              padding: "1.25rem 1.75rem",
              display: "flex",
              flexDirection: "column",
              gap: "0.75rem",
              boxShadow: "0 24px 64px -16px rgba(15, 32, 67, 0.12)",
            }}
          >
            {/* タイトル */}
            <h1 className="text-slate-800 text-xl font-black text-center tracking-wide"
              style={{ textShadow: '0 2px 10px rgba(58, 155, 213, 0.15)' }}>
              {lang === "ja" ? "botたんのお部屋" : "Bot-tan's Room"}
            </h1>
            {/* キャッチコピー */}
            <p className="text-slate-600 text-sm font-bold text-center leading-relaxed" style={{ margin: 0 }}>
              {lang === "ja" ? "ただいまって言える、あなたとのお部屋" : "A room where you can always come home"}
            </p>
            {/* チャット入力 + 送信ボタン */}
            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              <input
                type="text"
                value={landingMessage}
                onChange={(e) => setLandingMessage(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.nativeEvent.isComposing) handleLandingSubmit(landingMessage);
                }}
                placeholder={lang === "ja" ? "メッセージを入力..." : "Type a message..."}
                className="flex-1 text-slate-800 placeholder-slate-400 outline-none text-base font-semibold shadow-inner transition-all duration-200"
                style={{
                  height: "48px",
                  background: "rgba(255, 255, 255, 0.55)",
                  border: "1.5px solid rgba(58, 155, 213, 0.25)",
                  borderRadius: "9999px",
                  padding: "0 20px",
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = "var(--theme-blue)";
                  e.currentTarget.style.boxShadow = "0 0 0 4px rgba(58, 155, 213, 0.15)";
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = "rgba(58, 155, 213, 0.25)";
                  e.currentTarget.style.boxShadow = "none";
                }}
              />
              <button
                onClick={() => handleLandingSubmit(landingMessage)}
                disabled={!landingMessage.trim()}
                aria-label="send"
                className="shrink-0 flex items-center justify-center transition-all duration-300 hover:scale-105 active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed bg-theme-gradient shadow-md"
                style={{ width: "48px", height: "48px", borderRadius: "9999px" }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="#fff">
                  <path d="M2 21l21-9L2 3v7l15 2-15 2z" />
                </svg>
              </button>
            </div>
            {/* 展開式サインイン（旧 Fortune カード下部と同等） */}
            {!isSignedIn && (
              <button
                onClick={() => setShowSignInModal(true)}
                className="w-full font-bold text-sm transition-all duration-200 hover:brightness-105 active:scale-[0.97] bg-theme-gradient text-white shadow-md tracking-wide"
                style={{ borderRadius: "9999px", padding: "10px 20px" }}
              >
                <span style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                  <span>{lang === "ja" ? "Blueskyでサインインして、botたんと遊ぼう！" : "Sign in with Bluesky to play with bot-tan!"}</span>
                  <span style={{ fontSize: "11px", fontWeight: 600, opacity: 0.8 }}>
                    {lang === "ja" ? "詳しくは右上のヘルプを見てね" : "See Help (top-right) for details"}
                  </span>
                </span>
              </button>
            )}
            {isSignedIn && (
              <button
                onClick={() => setPhase("chat")}
                className="w-full font-black text-white text-base shadow-md tracking-wider transition-all duration-300 hover:shadow-lg hover:brightness-105 active:scale-[0.97] bg-theme-gradient"
                style={{ borderRadius: "9999px", padding: "13px 24px" }}
              >
                {lang === "ja" ? "チャットへ →" : "Go to Chat →"}
              </button>
            )}
          </div>
        </div>
      )}

      {/* ===== スピナー（診断ローディング・チャット処理・VoiceVox待機） ===== */}
      {((diagnosisModalState === "loading") || (phase === "chat" && (chatProcessing || isWaitingForVoice))) && (
        <div className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none">
          <div
            className="flex flex-col items-center gap-4 px-10 py-10 rounded-3xl"
            style={{
              background: "rgba(255, 255, 255, 0.70)",
              backdropFilter: "blur(20px)",
              border: "1.5px solid rgba(255, 255, 255, 0.55)",
              boxShadow: "0 24px 64px -16px rgba(15, 32, 67, 0.12)",
              borderRadius: "1.5rem",
              minWidth: "280px",
            }}
          >
            <div className="spinner-ring" />
            <span className="text-slate-800 text-base font-bold" style={{ color: "#0f172a" }}>
              {diagnosisModalState === "loading"
                ? (lang === "ja" ? "あなたの回答を読んでるよ..." : "Reading your answers...")
                : (lang === "ja" ? "考え中..." : "Thinking...")}
            </span>
            <style jsx global>{`
              .spinner-ring {
                width: 44px;
                height: 44px;
                border-radius: 50%;
                border: 4px solid rgba(58, 155, 213, 0.15);
                border-top-color: var(--theme-mint);
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


      {/* ===== CHAT ===== */}
      {phase === "chat" && diagnosisModalState === "hidden" && isGreetingModeReady && (
        <ChatView
          lang={lang}
          assistantMessage={assistantMessage}
          isChatProcessing={chatProcessing}
          isSpeaking={isSpeaking}
          bubbleTrigger={bubbleTrigger}
          onSend={handleSendChat}
          quotaExceeded={quotaExceeded}
          isInvitationMode={isInvitationMode}
          isSignedIn={isSignedIn}
          isGiftMode={isGiftMode}
          onGiftSend={handleGiftSend}
          isGiftProcessing={isGiftProcessing}
          guestTurnCount={guestTurnCount}
          onRequestSignIn={() => setShowSignInModal(true)}
          greetingMode={greetingMode}
          onGreeting={handleGreeting}
        />
      )}

      {/* ===== HISTORY PANEL ===== */}
      {isHistoryOpen && (
        <ConvHistoryPanel
          chatLog={chatLog}
          lang={lang}
          onClose={() => setIsHistoryOpen(false)}
        />
      )}

      {/* ===== HELP MODAL ===== */}
      {showHelp && <HelpModal lang={lang} onClose={() => {
        setShowHelp(false);
        window.localStorage.setItem('help_shown', '1');
      }} />}

      {/* ===== SIGN-IN OVERLAY ===== */}
      {showSignInModal && (
        <div
          onClick={() => setShowSignInModal(false)}
          className="absolute inset-0 z-50 flex items-center justify-center p-4 animate-fadeIn"
          style={{ background: "rgba(15, 32, 67, 0.45)", backdropFilter: "blur(8px)" }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-xl rounded-[2rem] shadow-2xl flex flex-col gap-4 animate-fadeIn"
            style={{
              padding: "1.75rem",
              background: "rgba(255, 255, 255, 0.88)",
              backdropFilter: "blur(30px) saturate(140%)",
              border: "1.5px solid rgba(255, 255, 255, 0.65)",
              boxShadow: "0 24px 64px -16px rgba(15, 32, 67, 0.18)",
            }}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-slate-800 text-lg font-black tracking-wide">
                {lang === "ja" ? "サインイン" : "Sign in"}
              </h2>
              <button
                onClick={() => setShowSignInModal(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all shrink-0"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <BlueskyPrompt lang={lang} isSignedIn={isSignedIn} onSignIn={handleSignIn} />
          </div>
        </div>
      )}

      {/* ===== DIAGNOSIS (bottom card) ===== */}
      {diagnosisModalState !== "hidden" && (
        <div className="absolute z-20 flex flex-col justify-end" style={{ left: "1.5rem", right: "1.5rem", bottom: "calc(max(0.75rem, env(safe-area-inset-bottom)))", top: "60dvh", gap: "0.5rem" }}>
          <div
            className="w-full max-w-xl self-center shadow-2xl relative transition-all duration-300 animate-fadeIn"
            style={{
              background: "rgba(255, 255, 255, 0.72)",
              backdropFilter: "blur(30px) saturate(140%)",
              border: "1.5px solid rgba(255, 255, 255, 0.55)",
              borderRadius: "2.5rem",
              padding: "1.5rem 2.25rem",
              display: "flex",
              flexDirection: "column",
              gap: "1.15rem",
              boxShadow: "0 24px 64px -16px rgba(15, 32, 67, 0.12)",
              overflowY: diagnosisModalState === "result" ? "auto" : "visible",
              maxHeight: diagnosisModalState === "result" ? "calc(100% - 0.5rem)" : "none",
            }}
          >
            {/* ヘッダー */}
            <div className="flex items-center justify-between">
              <h2 className="text-slate-800 text-lg font-black tracking-wide"
                style={{ textShadow: '0 2px 10px rgba(58, 155, 213, 0.12)' }}>
                {diagnosisModalState === "result"
                  ? (lang === "ja" ? "✨ 診断結果" : "✨ Diagnosis Result")
                  : (lang === "ja" ? "✨ 性格診断" : "✨ Personality Diagnosis")}
              </h2>
              {diagnosisModalState !== "loading" && (
                <button
                  onClick={() => setDiagnosisModalState("hidden")}
                  className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              )}
            </div>

            {/* 名前入力 */}
            {diagnosisModalState === "name" && (
              <>
                <p className="text-slate-800 text-sm font-bold leading-relaxed" style={{ margin: 0, whiteSpace: "pre-line" }}>
                  {lang === "ja"
                    ? "3つの質問のあなたの考えを聴かせてね\n答えから、わたしが全肯定で性格診断するよ！"
                    : "I'll ask you 3 questions about how you think.\nFrom your answers, I'll give you my all-affirming personality diagnosis!"}
                </p>
                <p className="text-slate-600 text-sm font-semibold" style={{ margin: 0 }}>
                  {lang === "ja" ? "まず、あなたのよびかたを教えてね" : "First, tell me what to call you"}
                </p>
                <input
                  type="text"
                  value={diagnosisNameInput}
                  onChange={(e) => setDiagnosisNameInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && diagnosisNameInput.trim()) setDiagnosisModalState("questions");
                  }}
                  placeholder={lang === "ja" ? "あなたの名前やよびかた" : "Your name or nickname"}
                  maxLength={30}
                  autoFocus
                  className="w-full text-slate-800 placeholder-slate-400 outline-none text-base font-semibold shadow-inner transition-all duration-200"
                  style={{
                    background: "rgba(255, 255, 255, 0.55)",
                    border: "1.5px solid rgba(58, 155, 213, 0.25)",
                    borderRadius: "9999px",
                    padding: "10px 20px",
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = "var(--theme-blue)";
                    e.currentTarget.style.boxShadow = "0 0 0 4px rgba(58, 155, 213, 0.15)";
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = "rgba(58, 155, 213, 0.25)";
                    e.currentTarget.style.boxShadow = "none";
                  }}
                />
                <button
                  onClick={() => { if (diagnosisNameInput.trim()) setDiagnosisModalState("questions"); }}
                  disabled={!diagnosisNameInput.trim()}
                  className="w-full font-black text-white text-base shadow-md tracking-wider transition-all disabled:opacity-30 disabled:cursor-not-allowed bg-theme-gradient"
                  style={{ borderRadius: "9999px", padding: "10px 20px" }}
                >
                  {lang === "ja" ? "次へ →" : "Next →"}
                </button>
              </>
            )}

            {/* 質問フォーム */}
            {diagnosisModalState === "questions" && (
              <>
                <DiagnosisForm
                  lang={lang}
                  onSubmit={handleDiagnose}
                  onQuestionShow={speakQuestion}
                  onExpressionChange={handleQuestionExpression}
                />
              </>
            )}

            {/* 診断結果 */}
            {diagnosisModalState === "result" && fortune && (
              <>
                <FortuneCard name={diagnosisNameInput} fortune={fortune} lang={lang} isSpeaking={isSpeaking} flat={true} />
                {!isSignedIn && (
                  <button
                    onClick={() => setShowSignInModal(true)}
                    className="w-full font-bold text-sm transition-all duration-200 hover:brightness-105 active:scale-[0.97] bg-theme-gradient text-white shadow-md tracking-wide"
                    style={{ borderRadius: "9999px", padding: "10px 20px" }}
                  >
                    {lang === "ja" ? "Blueskyでサインインして診断結果について話そう" : "Sign in with Bluesky to talk about your diagnosis"}
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* ===== POLICY MODAL ===== */}
      {showPolicy && (
        <div
          onClick={() => setShowPolicy(false)}
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
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                  <polyline points="10 9 9 9 8 9" />
                </svg>
                {t("policy.title")}
              </h2>
              <button
                onClick={() => setShowPolicy(false)}
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
              <div className="space-y-1">
                <h3 className="font-extrabold text-base flex items-center gap-1.5" style={{ color: "#0085ff" }}>
                  {t("policy.aboutTitle")}
                </h3>
                <p className="text-slate-600 text-xs pl-0">
                  {lang === "ja" ? (
                    <>
                      <span>
                        これはBlueskyのbot、全肯定botたん（Blueskyプロフィール:{" "}
                        <a
                          href="https://bsky.app/profile/bot-tan.suibari.com"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:underline font-extrabold"
                          style={{ color: "#0085ff" }}
                        >
                          bot-tan.suibari.com
                        </a>
                        ）とお話できるアプリです。
                      </span>
                      <br />
                      <span className="block mt-1">
                        全肯定botたんは、開発者がデザインしたみんなを励ますのが好きな女の子です。詳しくは
                        <a
                          href="https://suibari.com/character"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:underline font-extrabold"
                          style={{ color: "#0085ff" }}
                        >
                          紹介ページ
                        </a>
                        をご覧ください。
                      </span>
                    </>
                  ) : (
                    <>
                      <span>
                        This app allows you to talk to the Bluesky bot, Zenkoitei Bot-tan (Bluesky Profile:{" "}
                        <a
                          href="https://bsky.app/profile/bot-tan.suibari.com"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:underline font-extrabold"
                          style={{ color: "#0085ff" }}
                        >
                          bot-tan.suibari.com
                        </a>
                        ).
                      </span>
                      <br />
                      <span className="block mt-1">
                        Zenkoitei Bot-tan is a girl who loves to encourage everyone, designed by the developer. For more details, please visit her{" "}
                        <a
                          href="https://suibari.com/character"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:underline font-extrabold"
                          style={{ color: "#0085ff" }}
                        >
                          character page
                        </a>
                        .
                      </span>
                    </>
                  )}
                </p>
              </div>

              <div className="space-y-1">
                <h3 className="font-extrabold text-base flex items-center gap-1.5" style={{ color: "#0085ff" }}>
                  {t("policy.aiTitle")}
                </h3>
                <p className="text-slate-600 text-xs pl-0">
                  {t("policy.aiText")}
                </p>
              </div>

              <div className="space-y-1">
                <h3 className="font-extrabold text-base flex items-center gap-1.5" style={{ color: "#0085ff" }}>
                  {t("policy.voiceTitle")}
                </h3>
                <p className="text-slate-600 text-xs pl-0">
                  {lang === "ja" ? (
                    <>
                      本アプリの音声合成には{" "}
                      <a
                        href="https://voicevox.hiroshiba.jp/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:underline font-extrabold"
                        style={{ color: "#0085ff" }}
                      >
                        VOICEVOX
                      </a>
                      :{" "}
                      <a
                        href="https://tsumugi-official.studio.site/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:underline font-extrabold"
                        style={{ color: "#0085ff" }}
                      >
                        春日部つむぎ
                      </a>
                      {" "}を使用しています。
                    </>
                  ) : (
                    <>
                      This app uses{" "}
                      <a
                        href="https://voicevox.hiroshiba.jp/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:underline font-extrabold"
                        style={{ color: "#0085ff" }}
                      >
                        VOICEVOX
                      </a>
                      :{" "}
                      <a
                        href="https://tsumugi-official.studio.site/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:underline font-extrabold"
                        style={{ color: "#0085ff" }}
                      >
                        Kasukabe Tsumugi
                      </a>
                      {" "}for voice synthesis.
                    </>
                  )}
                </p>
              </div>

              <div className="space-y-1">
                <h3 className="font-extrabold text-base flex items-center gap-1.5" style={{ color: "#0085ff" }}>
                  {t("policy.historyTitle")}
                </h3>
                <p className="text-slate-600 text-xs pl-0">
                  {t("policy.historyText")}
                </p>
              </div>

              <div className="space-y-1">
                <h3 className="font-extrabold text-base flex items-center gap-1.5" style={{ color: "#0085ff" }}>
                  {t("policy.privacyTitle")}
                </h3>
                <p className="text-slate-600 text-xs pl-0">
                  {t("policy.privacyText")}
                </p>
              </div>

              <div className="space-y-1">
                <h3 className="font-extrabold text-base flex items-center gap-1.5" style={{ color: "#0085ff" }}>
                  {t("policy.disclaimerTitle")}
                </h3>
                <p className="text-slate-600 text-xs pl-0">
                  {t("policy.disclaimerText")}
                </p>
              </div>

              <div className="space-y-1">
                <h3 className="font-extrabold text-base flex items-center gap-1.5" style={{ color: "#0085ff" }}>
                  {t("policy.developerTitle")}
                </h3>
                <p className="text-slate-600 text-xs pl-0">
                  {lang === "ja" ? (
                    <>
                      本アプリは{" "}
                      <a
                        href="https://suibari.com"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:underline font-extrabold"
                        style={{ color: "#0085ff" }}
                      >
                        すいばり (suibari.com)
                      </a>{" "}
                      によって開発されました。
                    </>
                  ) : (
                    <>
                      This application was developed by{" "}
                      <a
                        href="https://suibari.com"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:underline font-extrabold"
                        style={{ color: "#0085ff" }}
                      >
                        suibari (suibari.com)
                      </a>
                      .
                    </>
                  )}
                </p>
              </div>
            </div>

            {/* Footer */}
            <div className="pt-3.5 flex justify-end">
              <button
                onClick={() => setShowPolicy(false)}
                className="font-black text-white text-sm shadow-md transition-all duration-300 hover:brightness-105 active:scale-95 bg-theme-gradient"
                style={{
                  height: "40px",
                  padding: "0 28px",
                  borderRadius: "9999px",
                }}
              >
                {t("policy.close")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== WELCOME DIALOG (User gesture bypass for autoplay block) ===== */}
      {pendingInvite && (
        <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-md animate-fadeIn">
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-[2.5rem] shadow-2xl flex flex-col items-center justify-center text-center"
            style={{
              padding: "2.5rem 2.25rem",
              background: "rgba(255, 255, 255, 0.72)",
              backdropFilter: "blur(30px) saturate(140%)",
              border: "1.5px solid rgba(255, 255, 255, 0.55)",
              boxShadow: "0 24px 64px -16px rgba(15, 32, 67, 0.12)",
            }}
          >
            {/* アイコン風デコレーション */}
            <div
              className="w-20 h-20 rounded-full flex items-center justify-center mb-6"
              style={{
                background: "rgba(255, 255, 255, 0.8)",
                border: "1.5px solid rgba(58, 155, 213, 0.25)",
                boxShadow: "0 8px 24px -8px rgba(15, 32, 67, 0.08)",
                borderRadius: "9999px",
              }}
            >
              <span className="text-4xl select-none">💌</span>
            </div>

            <h2 className="text-slate-800 text-2xl font-black mb-4 tracking-wide"
              style={{ textShadow: '0 2px 10px rgba(58, 155, 213, 0.15)', color: "#0f172a" }}>
              {lang === "ja" ? "お部屋の準備ができました" : "Your room is ready"}
            </h2>
            <p className="text-sm font-semibold text-slate-600 mb-8 leading-relaxed max-w-xs" style={{ color: "#475569" }}>
              {lang === "ja"
                ? "botたんがあなたのためにお迎えのメッセージを準備したよ！お部屋に入って聞いてみてね。"
                : "bot-tan prepared a welcome message just for you! Enter the room to listen."}
            </p>

            <button
              onClick={handlePlayWelcomeVoice}
              disabled={isSpeaking}
              className="w-full font-black text-white text-base shadow-md tracking-wider transition-all duration-300 hover:shadow-lg hover:brightness-105 active:scale-[0.97] bg-theme-gradient disabled:opacity-60 disabled:cursor-not-allowed"
              style={{
                borderRadius: "9999px",
                padding: "15px 32px",
              }}
            >
              {isSpeaking
                ? (lang === "ja" ? "🎙️ 準備中..." : "🎙️ Preparing...")
                : (lang === "ja" ? "💌 botたんからのメッセージがあります" : "💌 Message from bot-tan")}
            </button>
          </div>
        </div>
      )}

      {/* ===== QUOTA EXCEEDED (IN-CARD BOTTOM STATE) ===== */}
      {quotaExceeded && phase !== "chat" && (
        <div className="absolute z-20 flex justify-center animate-fadeIn" style={{ left: "1.5rem", right: "1.5rem", bottom: "calc(max(1.5rem, env(safe-area-inset-bottom)))", top: 'auto' }}>
          <div
            className="w-full max-w-xl shadow-2xl text-center"
            style={{
              padding: "1.5rem 2.25rem",
              background: "rgba(255, 255, 255, 0.72)",
              backdropFilter: "blur(30px) saturate(140%)",
              border: "1.5px solid rgba(255, 255, 255, 0.55)",
              borderRadius: "2.5rem",
              display: "flex",
              flexDirection: "column",
              gap: "1.15rem",
              alignItems: "center",
              boxShadow: "0 24px 64px -16px rgba(15, 32, 67, 0.12)",
            }}
          >
            <div className="w-16 h-16 bg-red-50 border border-red-100 rounded-full flex items-center justify-center mx-auto text-red-500" style={{ borderRadius: "9999px" }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            <h2 className="text-slate-800 text-xl font-black tracking-wide" style={{ textShadow: '0 2px 10px rgba(239, 68, 68, 0.12)', color: "#0f172a", margin: 0 }}>
              {t("quota.title")}
            </h2>
            <p className="text-base leading-relaxed font-semibold animate-pulse" style={{ color: "#1e293b", margin: 0 }}>
              {t("quota.message")}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export const getStaticProps: GetStaticProps = async ({ locale }) => ({
  props: {
    ...(await serverSideTranslations(locale ?? "en", ["common"])),
  },
});


