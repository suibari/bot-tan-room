import { useCallback, useContext, useEffect, useRef, useState } from "react";
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
import { ConvHistoryPanel } from "@/components/ConvHistoryPanel";
import { MOTION_URLS, getRandomClickMotion } from "@/features/vrmViewer/motionConfig";

type AnswerItem = { question: string; answer: string };
type Phase = "landing" | "questions" | "loading" | "fortune" | "chat";

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
  const [nameInput, setNameInput] = useState("");
  const [fortune, setFortune] = useState<DiagnosisResult | null>(null);
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [isAuthChecking, setIsAuthChecking] = useState(true); // OAuth init 解決まで true
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isWaitingForVoice, setIsWaitingForVoice] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [pendingInvite, setPendingInvite] = useState<{ textJa: string; textEn: string } | null>(null);
  const [inviteTexts, setInviteTexts] = useState<{ textJa: string; textEn: string } | null>(null);
  const [isFetchingMood, setIsFetchingMood] = useState(false);
  const [prefetchedMood, setPrefetchedMood] = useState<{ mood: string; mood_en: string; status: string } | null>(null);
  const [displayedMoodContext, setDisplayedMoodContext] = useState<{ moodJa: string; moodEn: string; emotionTag: string } | null>(null);
  const [isGiftMode, setIsGiftMode] = useState(false);
  const [isGiftProcessing, setIsGiftProcessing] = useState(false);
  const prefetchedMoodAudioRef = useRef<Promise<ArrayBuffer | null>>(Promise.resolve(null));
  const pendingAudioRef = useRef<Promise<ArrayBuffer | null>>(Promise.resolve(null));
  const nameInputRef = useRef<HTMLInputElement>(null);
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
    if (phase !== 'landing' && phase !== 'questions') return;
    const interval = setInterval(() => {
      if (viewer.isReady) {
        clearInterval(interval);
        const expr = getTimeBasedExpression();
        console.log(`[TimeExpression] Applying ${expr} (hour: ${new Date().getHours()})`);
        viewer.model?.emoteController?.playEmotion(expr);
      }
    }, 200);
    return () => clearInterval(interval);
    // viewer オブジェクトは参照が安定しているので phase の変化のみ監視
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

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
        setPrefetchedMood({ mood: data.mood, mood_en: data.mood_en ?? '', status: data.status });
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
          setPhase('chat'); // 診断をスキップして会話から開始
          setIsAuthChecking(false);

          // データベース同期処理
          const did = result.session.did;
          (async () => {
            try {
              const tokenSet = await (result.session as any).getTokenSet();
              const token = tokenSet?.access_token;

              // 1. 来訪記録の更新 (visit API呼び出し)
              fetch('/api/visit/', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
                },
                body: JSON.stringify({ did }),
              }).catch(err => console.error('[visit API error]:', err));

              // 2. お迎えメッセージの取得
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
                    setIsInvitationMode(true);
                    setInviteTexts({ textJa: inviteData.textJa, textEn: inviteData.textEn });
                    setPendingInvite(inviteData);
                  }
                })
                .catch(err => console.error('[get-invite API error]:', err));

              const historyRes = await fetch(`/api/history?did=${encodeURIComponent(did)}`, {
                headers: token ? { 'Authorization': `Bearer ${token}` } : {}
              });
              if (!historyRes.ok) {
                const errBody = await historyRes.json().catch(() => ({}));
                console.error('[history API error status]:', historyRes.status, 'Reason:', errBody.reason || errBody.message || 'Unknown');
                throw new Error(`Failed to fetch history API: ${errBody.reason || errBody.message || 'Unknown'}`);
              }
              const historyData = await historyRes.json();

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

                // デバッグ用に最新10件の会話履歴をブラウザコンソールに出力
                console.log(`[History Log] Latest 10 messages from DB for ${did}:`);
                currentHistory.slice(-10).forEach((msg: any, idx: number) => {
                  console.log(`  [${idx + 1}] [${msg.role === 'model' ? 'botたん' : 'ユーザー'}] ${msg.parts?.[0]?.text}`);
                });
              }
            } catch (err) {
              console.error('[History synchronization error]:', err);
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
    const { textJa } = pendingInvite;

    const closeDialog = () => {
      setPendingInvite(null);
      setIsInvitationMode(false);
    };

    try {
      viewer.playVrmaMotion(MOTION_URLS.invitation);
      setIsSpeaking(true);
      const talks = textsToScreenplay([`[neutral]${textJa}`], koeiroParam);
      // ダイアログ表示中に先読みしておいた音声を待つ（完了済みなら即返る）
      const audioBuffer = await pendingAudioRef.current;
      if (!audioBuffer) throw new Error('Audio not available');
      viewer.model?.stopSpeak();
      // onStart: 再生開始と同時にダイアログを閉じる
      await viewer.model?.speak(audioBuffer, talks[0], closeDialog);
    } catch (err) {
      console.error('[Welcome audio playback error]:', err);
      closeDialog();
    } finally {
      setIsSpeaking(false);
    }
  }, [pendingInvite, viewer, koeiroParam]);

  const handleNameSubmit = useCallback(() => {
    const name = nameInput.trim();
    if (!name) {
      nameInputRef.current?.focus();
      return;
    }
    setUserName(name);
    window.localStorage.setItem("chatVRM_userName", name);
    setPhase("questions");
    setDisplayedMoodContext(null);
    setAssistantMessage("");
  }, [nameInput]);

  const handleDiagnose = useCallback(async (answers: AnswerItem[]) => {
    setIsWaitingForVoice(true);
    setPhase("loading");

    try {
      const res = await fetch("/api/fortune", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: userName, lang, answers }),
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
      // openResult は必ず isWaitingForVoice=false も行う。
      // これにより、タイムアウト経由でも onStart 経由でも
      // カードが開いた瞬間に「声を準備してるよ...」スピナーが絶対に消える。
      const openResult = () => {
        if (hasOpened) return;
        hasOpened = true;
        setIsWaitingForVoice(false);
        setFortune(data);
        setPhase("fortune");
        // 診断結果表示時に表情を excited (驚き＋喜び) に切り替え、Vサインモーションを再生
        viewer.playVrmaMotion(MOTION_URLS.diagnosis);
        viewer.model?.emoteController?.playEmotion("excited");
      };

      // VoiceVox API + MP3ダウンロード + デコードが全て完了するまで待つため
      // タイムアウトを20秒に設定
      const timeoutId = setTimeout(() => {
        console.log("[handleDiagnose] Safety timeout reached, opening fortune card");
        openResult();
      }, 20000);

      safeSpeak(
        data.analysis_ja,
        () => {
          clearTimeout(timeoutId);
          setIsSpeaking(true);
          openResult(); // 音声の再生開始と同時に結果画面を表示
        },
        () => {
          setIsSpeaking(false);
          // 診断結果の読み上げ完了時に表情を gentle (穏やか) に切り替える
          viewer.model?.emoteController?.playEmotion("gentle");
        },
        () => {
          console.warn("[handleDiagnose] VoiceVox request rejected or failed. Opening card immediately.");
          clearTimeout(timeoutId);
          setIsSpeaking(false);
          openResult(); // 即座に診断結果を表示して、voicevoxはあきらめる
          // 音声再生に失敗した際も表情を gentle (穏やか) に切り替える
          viewer.model?.emoteController?.playEmotion("gentle");
        }
      );
    } catch (e) {
      console.error(e);
      setIsWaitingForVoice(false);
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

  const handleStartChat = useCallback(async () => {
    setPhase("chat");
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
    setNameInput('');
    setChatLog([]);
    setPhase('landing');
    setDisplayedMoodContext(null);
    setAssistantMessage("");
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

    // プリフェッチ済みのデータがない場合は、フォールバックとして通常取得を試みる（通常はマウント時に完了しているはず）
    if (!prefetchedMood) {
      setIsFetchingMood(true);
      try {
        const res = await fetch("/api/mood");
        if (!res.ok) throw new Error("Failed to fetch mood");
        const data = await res.json();
        setPrefetchedMood({ mood: data.mood, mood_en: data.mood_en ?? '', status: data.status });
      } catch (err) {
        console.error("[Mood Fallback Error]:", err);
      } finally {
        setIsFetchingMood(false);
      }
      return;
    }

    const { mood: moodText, mood_en: moodEnText, status: statusText } = prefetchedMood;

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
      });
    } catch (err) {
      console.error("[Mood playback error]:", err);
      // エラー時でも吹き出しテキストは表示してあげる
      setDisplayedMoodContext({ moodJa: moodText, moodEn: moodEnText || '', emotionTag });
      setAssistantMessage(fullMessage);
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
  const handleSendChat = useCallback(
    async (text: string) => {
      if (!text) return;
      setChatProcessing(true);
      setDisplayedMoodContext(null);
      setAssistantMessage("");
      setInviteTexts(null); // チャット開始時に招待テキストの追従を解除
      const messageLog: Message[] = [
        ...chatLog,
        { role: "user", content: text, userName },
      ];
      setChatLog(messageLog);
      // 統合型システム指示: 常に [ja]日本語 [en]英語 の両方を同時に出力させる。
      // 表示は lang で切り替え、発話は常に [ja] ブロックを使う。
      const langDirective =
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

      const messages: Message[] = [
        { role: "system", content: systemPrompt + langDirective },
        ...messageLog,
      ];

      const stream = await getGeminiResponseStream(messages, userName, lang).catch(
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

      setChatLog([...messageLog, { role: "assistant", content: fullText }]);
      setChatProcessing(false);

      // サインイン済みのフォロワーであれば、会話履歴をデータベースに保存
      const did = bskySessionRef.current?.did;
      if (did) {
        (async () => {
          try {
            const tokenSet = await (bskySessionRef.current as any)?.getTokenSet();
            const token = tokenSet?.access_token;
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
      if (speakText) {
        setIsWaitingForVoice(true);
        safeSpeak(
          jaRawText,
          () => {
            setIsWaitingForVoice(false);
            setIsSpeaking(true);
            // 音声が再生された瞬間にテキストを一括で表示する！
            setAssistantMessage(fullText);
          },
          () => setIsSpeaking(false),
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
    [systemPrompt, chatLog, userName, lang, safeSpeak]
  );

  const handleGiftSend = useCallback(
    async (text: string) => {
      if (!text) return;
      setIsGiftProcessing(true);
      setIsGiftMode(false);
      setAssistantMessage("");

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
          // 会話履歴にギフトエントリを追加
          const giftEntry = lang === 'ja' ? `🎁 プレゼント：「${text}」を渡した` : `🎁 Gift: "${text}"`;
          setChatLog(prev => [
            ...prev,
            { role: "user" as const, content: giftEntry, userName },
            { role: "assistant" as const, content: thankYou },
          ]);

          const jaRawText = parseLanguageContent(thankYou, 'ja');
          viewer.playVrmaMotion(MOTION_URLS.gift);
          setIsWaitingForVoice(true);
          safeSpeak(
            jaRawText,
            () => {
              setIsWaitingForVoice(false);
              setIsSpeaking(true);
              setAssistantMessage(thankYou);
            },
            () => setIsSpeaking(false),
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
        setIsGiftProcessing(false);
      }
    },
    [lang, userName, safeSpeak, viewer]
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
    <div className="relative w-full h-[100dvh] overflow-hidden font-M_PLUS_2">
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

      {/* トップバー — 常時表示。justify-between で左右グループが重ならない設計 */}
      <div
        className="absolute z-30 flex items-center justify-between animate-fadeIn"
        style={{
          top: "calc(max(1.5rem, env(safe-area-inset-top)))",
          left: "1.5rem",
          right: "1.5rem",
        }}
      >
        {/* 左グループ: りれき（サインイン時のみ） */}
        <div style={{ display: "flex", gap: "10px" }}>
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

        {/* 右グループ: ポリシー + 言語トグル + サインアウト（サインイン時） */}
        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          {/* ポリシーボタン */}
          <button
            onClick={() => setShowPolicy(true)}
            title={t("policy.link")}
            className="rounded-full flex items-center justify-center transition-all hover:scale-105 active:scale-95 shrink-0"
            style={{
              width: "48px",
              height: "48px",
              background: "rgba(255, 255, 255, 0.65)",
              backdropFilter: "blur(20px)",
              border: "1px solid rgba(255, 255, 255, 0.45)",
              color: "rgba(15, 32, 67, 0.8)",
              boxShadow: "0 4px 12px rgba(15, 32, 67, 0.04)",
            }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="16" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
          </button>
          {/* 言語トグル */}
          <div
            className="transition-all duration-300 shrink-0"
            style={{
              padding: "5px",
              gap: "4px",
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
                className={`text-[14px] font-black transition-all duration-300 rounded-full select-none ${lang === l
                  ? "bg-theme-gradient text-white shadow-md shadow-theme-blue/15 scale-100"
                  : "text-slate-600 hover:text-slate-800 hover:bg-white/40 active:scale-95"
                  }`}
                style={{
                  borderRadius: "9999px",
                  padding: "9px 16px",
                }}
              >
                {l === "en" ? "EN" : "日本語"}
              </button>
            ))}
          </div>

          {/* サインアウト（アイコンのみ） */}
          {isSignedIn && (
            <button
              onClick={handleSignOut}
              title={lang === "ja" ? "サインアウト" : "Sign out"}
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
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* ===== LANDING ===== */}
      {phase === "landing" && !isAuthChecking && !quotaExceeded && (
        <div className="absolute z-20 flex flex-col justify-end" style={{ left: "1.5rem", right: "1.5rem", bottom: "calc(max(1.5rem, env(safe-area-inset-bottom)))", top: 'auto', gap: "0.75rem" }}>
          {/* botたんのメッセージはカードの外・上に表示 */}
          <div className="w-full max-w-xl self-center">
            <AssistantBubble message={assistantMessage} lang={lang} />
          </div>
          <div
            className="w-full max-w-xl self-center shadow-2xl relative overflow-hidden transition-all duration-300"
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
            }}
          >

            <h1 className="text-slate-800 text-2xl font-black text-center tracking-wide"
              style={{ textShadow: '0 2px 10px rgba(58, 155, 213, 0.15)' }}>
              {lang === "ja" ? "Botたんのお部屋へようこそ" : "Welcome to Bot-tan's Room"}
            </h1>
            <p className="text-sm font-semibold text-slate-600 text-center leading-relaxed">
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
              className="w-full text-slate-800 placeholder-slate-400 outline-none text-base font-semibold shadow-inner transition-all duration-200"
              style={{
                background: "rgba(255, 255, 255, 0.55)",
                border: "1.5px solid rgba(58, 155, 213, 0.25)",
                borderRadius: "9999px",
                padding: "13px 24px",
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
            <button
              onClick={handleNameSubmit}
              className="w-full font-black text-white text-base shadow-md tracking-wider transition-all duration-300 hover:shadow-lg hover:brightness-105 active:scale-[0.97] bg-theme-gradient"
              style={{
                borderRadius: "9999px",
                padding: "13px 24px",
              }}
            >
              {LABEL.button}
            </button>
            <p className="text-[11px] font-bold text-slate-400 text-center leading-normal max-w-sm mx-auto">
              {t("introduction.disclaimer")}
            </p>
            <div className="text-center">
              <button
                onClick={() => setShowPolicy(true)}
                className="text-xs transition-colors underline text-slate-400 hover:text-slate-600 font-semibold"
              >
                {t("policy.link")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== QUESTIONS ===== */}
      {phase === "questions" && !quotaExceeded && (
        <div className="absolute z-20 flex justify-center" style={{ left: "1.5rem", right: "1.5rem", bottom: "calc(max(1.5rem, env(safe-area-inset-bottom)))", top: 'auto' }}>
          <div
            className="w-full max-w-xl shadow-2xl relative overflow-hidden transition-all duration-300"
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
            }}
          >
            <h2 className="text-slate-800 text-lg font-black text-center tracking-wide"
              style={{ textShadow: '0 2px 10px rgba(58, 155, 213, 0.12)' }}>
              {lang === "ja"
                ? `${userName}さんのこと、聞かせてね`
                : `Tell me about you, ${userName}`}
            </h2>
            <DiagnosisForm
              lang={lang}
              onSubmit={handleDiagnose}
              onQuestionShow={speakQuestion}
              onExpressionChange={handleQuestionExpression}
            />
          </div>
        </div>
      )}

      {/* ===== スピナー（ボタン押下〜VoiceVox再生開始まで常に表示） ===== */}
      {((isWaitingForVoice && phase !== "chat") || (phase === "chat" && (chatProcessing || isWaitingForVoice))) && (
        <div className="absolute inset-x-0 top-1/3 z-30 flex justify-center pointer-events-none">
          <div
            className="flex flex-col items-center gap-4 px-10 py-7 rounded-3xl"
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
              {phase === "chat"
                ? (lang === "ja" ? "考え中..." : "Thinking...")
                : (phase === "loading" ? LABEL.loading : LABEL.voiceLoading)}
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

      {/* ===== FORTUNE ===== */}
      {phase === "fortune" && fortune && !quotaExceeded && (
        <div className="absolute z-20 flex justify-center pointer-events-none" style={{ left: "1.5rem", right: "1.5rem", bottom: "calc(max(1.5rem, env(safe-area-inset-bottom)))", top: 'auto' }}>
          <div
            className="w-full max-w-xl shadow-2xl max-h-[72vh] overflow-y-auto pointer-events-auto scrollbar-thin"
            style={{
              background: "rgba(255, 255, 255, 0.72)",
              backdropFilter: "blur(30px) saturate(140%)",
              border: "1.5px solid rgba(255, 255, 255, 0.55)",
              borderRadius: "2.5rem",
              padding: "1.5rem clamp(1rem, 4vw, 2.25rem)",
              display: "flex",
              flexDirection: "column",
              gap: "1.15rem",
              boxShadow: "0 24px 64px -16px rgba(15, 32, 67, 0.12)",
            }}
          >
            {/* ドラッグハンドル */}
            <div className="w-12 h-1.5 rounded-full mx-auto mb-2"
              style={{ background: "rgba(58, 155, 213, 0.25)" }} />
            <FortuneCard name={userName} fortune={fortune} lang={lang} isSpeaking={isSpeaking} flat={true} />
            <BlueskyPrompt lang={lang} isSignedIn={isSignedIn} onSignIn={handleSignIn} />
            {isSignedIn && (
              <button
                onClick={handleStartChat}
                className="w-full font-black text-white text-base shadow-md tracking-wider transition-all duration-300 hover:shadow-lg hover:brightness-105 active:scale-[0.97] bg-theme-gradient"
                style={{
                  borderRadius: "9999px",
                  padding: "13px 24px",
                }}
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
          quotaExceeded={quotaExceeded}
          isInvitationMode={isInvitationMode}
          isSignedIn={isSignedIn}
          isGiftMode={isGiftMode}
          onGiftModeToggle={() => setIsGiftMode(prev => !prev)}
          onGiftSend={handleGiftSend}
          isGiftProcessing={isGiftProcessing}
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


