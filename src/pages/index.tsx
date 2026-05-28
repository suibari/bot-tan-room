import { useCallback, useContext, useEffect, useRef, useState } from "react";
import Head from "next/head";
import VrmViewer from "@/components/vrmViewer";
import { ViewerContext } from "@/features/vrmViewer/viewerContext";
import {
  Message,
  textsToScreenplay,
  Screenplay,
} from "@/features/messages/messages";
import { speakCharacter } from "@/features/messages/speakCharacter";
import { MessageInputContainer } from "@/components/messageInputContainer";
import { SYSTEM_PROMPT } from "@/features/constants/systemPromptConstants";
import { KoeiroParam, DEFAULT_PARAM } from "@/features/constants/koeiroParam";
import { getGeminiResponseStream } from "@/features/chat/geminiChat";
import { Menu } from "@/components/menu";
import { GetStaticProps } from "next";
import { useRouter } from "next/router";
import { serverSideTranslations } from "next-i18next/serverSideTranslations";
import { useTranslation } from "next-i18next";
import { BackgroundPosts } from "@/components/backgroundPosts";
import { FortuneCard } from "@/components/fortuneCard";
import { DiagnosisForm } from "@/components/DiagnosisForm";
import { BlueskyPrompt } from "@/components/blueskyPrompt";
import type { DiagnosisResult } from "@/pages/api/fortune";
import { fetchAudio } from "@/features/messages/speakCharacter";

type AnswerItem = { question: string; answer: string };
type Phase = "landing" | "questions" | "loading" | "fortune" | "chat";

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
  const [isWaitingForVoice, setIsWaitingForVoice] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const questionAbortRef = useRef<AbortController | null>(null);

  // OGP base URL
  const BASE_URL =
    process.env.NEXT_PUBLIC_BASE_URL ?? "https://guestbook.suibari.com";

  // Restore persisted settings
  useEffect(() => {
    const storedName = window.localStorage.getItem("chatVRM_userName");
    if (storedName) setUserName(storedName);

    const storedKoeiro = window.localStorage.getItem("chatVRMParams");
    if (storedKoeiro) {
      const p = JSON.parse(storedKoeiro);
      if (p.koeiroParam) setKoeiroParam(p.koeiroParam);
    }

    const bskyHandle = window.localStorage.getItem("bsky_handle");
    if (bskyHandle) setIsSignedIn(true);
  }, []);

  // Load chat history when entering chat phase
  useEffect(() => {
    if (phase !== "chat") return;
    fetch(`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/history`)
      .then((r) => r.json())
      .then((data) => Array.isArray(data) && setChatLog(data))
      .catch((e) => console.error(e));
  }, [phase]);

  // 質問専用スピーカー: キューを使わず直接再生。新しい呼び出しで前の音声を中断する
  const speakQuestion = useCallback(async (text: string) => {
    questionAbortRef.current?.abort();
    const controller = new AbortController();
    questionAbortRef.current = controller;

    try {
      const talks = textsToScreenplay([`[neutral]${text}`], koeiroParam);
      const buffer = await fetchAudio(talks[0].talk, koeiromapKey).catch(() => null);
      if (controller.signal.aborted || !buffer) return;
      viewer.model?.stopSpeak();
      await viewer.model?.speak(buffer, talks[0]);
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

    try {
      const res = await fetch("/api/fortune", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: userName, lang, answers }),
      });
      if (!res.ok) throw new Error("diagnosis failed");
      const data: DiagnosisResult = await res.json();
      setFortune(data);
      setPhase("fortune");

      const voiceText = data.analysis_ja ?? data.analysis;
      safeSpeak(
        voiceText,
        () => { setIsWaitingForVoice(false); setIsSpeaking(true); },
        () => setIsSpeaking(false),
      );
    } catch (e) {
      console.error(e);
      setIsWaitingForVoice(false);
      setPhase("questions");
    }
  }, [userName, lang, safeSpeak]);

  const handleSignIn = useCallback(() => {
    alert("Bluesky OAuth - coming soon");
  }, []);

  const handleStartChat = useCallback(() => {
    setPhase("chat");
  }, []);

  // --- chat logic (from original) ---
  const handleSpeakAi = useCallback(
    async (screenplay: Screenplay, onStart?: () => void, onEnd?: () => void) =>
      speakCharacter(screenplay, viewer, koeiromapKey, onStart, onEnd),
    [viewer, koeiromapKey]
  );

  const handleSendChat = useCallback(
    async (text: string) => {
      if (!text) return;
      setChatProcessing(true);
      const messageLog: Message[] = [
        ...chatLog,
        { role: "user", content: text, userName },
      ];
      setChatLog(messageLog);

      const messages: Message[] = [
        { role: "system", content: systemPrompt },
        ...messageLog,
      ];

      const stream = await getGeminiResponseStream(messages, userName).catch(
        (e) => { console.error(e); return null; }
      );
      if (!stream) { setChatProcessing(false); return; }

      const reader = stream.getReader();
      let receivedMessage = "";
      let aiTextLog = "";
      let tag = "";
      const sentences: string[] = [];
      let lastSpeakPromise = Promise.resolve();

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          receivedMessage += value;

          const tagMatch = receivedMessage.match(/^\[(.*?)\]/);
          if (tagMatch?.[0]) {
            tag = tagMatch[0];
            receivedMessage = receivedMessage.slice(tag.length);
          }

          const sentenceMatch = receivedMessage.match(
            /^(.+[。．！？\n]|.{10,}[、,])/
          );
          if (sentenceMatch?.[0]) {
            const sentence = sentenceMatch[0];
            sentences.push(sentence);
            receivedMessage = receivedMessage.slice(sentence.length).trimStart();

            if (!sentence.replace(/^[\s\[\(\{「［（【『〈《〔｛«‹〘〚〛〙›»〕》〉』】）］」\}\)\]]+$/g, "")) continue;

            const aiTalks = textsToScreenplay([`${tag} ${sentence}`], koeiroParam);
            aiTextLog += `${tag} ${sentence}`;

            const currentMsg = sentences.join(" ");
            const p = handleSpeakAi(aiTalks[0], () => setAssistantMessage(currentMsg));
            if (p) lastSpeakPromise = p as unknown as Promise<void>;
          }
        }
      } catch (e) {
        console.error(e);
      } finally {
        reader.releaseLock();
      }

      setChatLog([...messageLog, { role: "assistant", content: aiTextLog }]);
      await lastSpeakPromise;
      setChatProcessing(false);
    },
    [systemPrompt, chatLog, handleSpeakAi, koeiroParam, userName]
  );

  const handleChangeChatLog = useCallback(
    (idx: number, text: string) =>
      setChatLog((prev) => prev.map((v, i) => (i === idx ? { ...v, content: text } : v))),
    []
  );

  // --- labels ---
  const LABEL = {
    ja: {
      placeholder: "あなたの名前を入力",
      button: "次へ →",
      loading: "診断中...",
      voiceLoading: "音声を準備中...",
      chat: "botたんと話す",
    },
    en: {
      placeholder: "Enter your name",
      button: "Next →",
      loading: "Diagnosing...",
      voiceLoading: "Preparing voice...",
      chat: "Chat with bot-tan",
    },
  }[lang];

  // Dynamic OGP image URL
  const ogImageUrl =
    phase === "fortune" && fortune
      ? `${BASE_URL}/api/og?${new URLSearchParams({
          name: userName,
          analysis: fortune.analysis,
          c1: `${fortune.comparisons[0].category}／${fortune.comparisons[0].value}`,
          c2: `${fortune.comparisons[1].category}／${fortune.comparisons[1].value}`,
          c3: `${fortune.comparisons[2].category}／${fortune.comparisons[2].value}`,
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

      {/* 言語スイッチャー — 常時表示 */}
      <div className="absolute top-4 right-4 z-30 flex gap-1">
        {(["en", "ja"] as const).map((l) => (
          <button
            key={l}
            onClick={() => switchLocale(l)}
            className="text-xs font-bold px-3 py-1.5 rounded-full transition-all"
            style={
              lang === l
                ? { background: "rgba(255,255,255,0.9)", color: "#1a1a2e" }
                : { background: "rgba(255,255,255,0.18)", color: "rgba(255,255,255,0.8)" }
            }
          >
            {l === "en" ? "EN" : "JP"}
          </button>
        ))}
      </div>

      {/* ===== LANDING ===== */}
      {phase === "landing" && (
        <div className="absolute bottom-0 left-0 right-0 z-20">
          <div
            className="mx-auto w-full max-w-lg px-4 pb-8 pt-5 space-y-3 rounded-t-3xl shadow-2xl"
            style={{
              background: "rgba(8,16,40,0.70)",
              backdropFilter: "blur(18px)",
              border: "1px solid rgba(120,160,255,0.18)",
              borderBottom: "none",
            }}
          >
            <h1 className="text-white text-lg font-bold text-center tracking-wide">
              {lang === "ja" ? "bot-tan 全肯定診断 ✨" : "bot-tan Personality ✨"}
            </h1>
            <p className="text-white/60 text-xs text-center leading-relaxed">
              {lang === "ja"
                ? "3つの質問に答えてbotたんの性格分析を受けよう"
                : "Answer 3 questions and get your personality analysis from bot-tan"}
            </p>
            <input
              ref={nameInputRef}
              type="text"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleNameSubmit()}
              placeholder={LABEL.placeholder}
              maxLength={30}
              className="w-full px-4 py-3 rounded-xl text-white placeholder-white/40 outline-none focus:ring-2 focus:ring-purple-400 text-sm"
              style={{ background: "rgba(255,255,255,0.10)" }}
            />
            <button
              onClick={handleNameSubmit}
              className="w-full py-3 rounded-xl font-bold text-white text-sm transition-opacity hover:opacity-80 active:opacity-60"
              style={{ background: "linear-gradient(90deg, #667eea, #764ba2)" }}
            >
              {LABEL.button}
            </button>
          </div>
        </div>
      )}

      {/* ===== QUESTIONS ===== */}
      {phase === "questions" && (
        <div className="absolute bottom-0 left-0 right-0 z-20">
          <div
            className="mx-auto w-full max-w-lg px-4 pb-8 pt-5 space-y-3 rounded-t-3xl shadow-2xl"
            style={{
              background: "rgba(8,16,40,0.70)",
              backdropFilter: "blur(18px)",
              border: "1px solid rgba(120,160,255,0.18)",
              borderBottom: "none",
            }}
          >
            <h2 className="text-white text-sm font-bold text-center tracking-wide">
              {lang === "ja" ? `${userName}さんへの質問` : `Questions for ${userName}`}
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
            style={{ background: "rgba(8,16,40,0.80)", backdropFilter: "blur(14px)" }}
          >
            <div className="spinner-ring" />
            <span className="text-white text-sm font-semibold">
              {phase === "loading" ? LABEL.loading : LABEL.voiceLoading}
            </span>
            <style jsx global>{`
              .spinner-ring {
                width: 40px;
                height: 40px;
                border-radius: 50%;
                border: 4px solid rgba(255, 255, 255, 0.2);
                border-top-color: #ffffff;
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
        <div className="absolute bottom-0 left-0 right-0 z-20 max-h-[58vh] overflow-y-auto">
          <div
            className="mx-auto w-full max-w-lg px-4 pb-8 pt-4 space-y-3 rounded-t-3xl"
            style={{
              background: "rgba(8,16,40,0.70)",
              backdropFilter: "blur(18px)",
              border: "1px solid rgba(120,160,255,0.18)",
              borderBottom: "none",
            }}
          >
            {/* ドラッグハンドル */}
            <div className="w-10 h-1 bg-white/30 rounded-full mx-auto mb-1" />
            <FortuneCard name={userName} fortune={fortune} lang={lang} isSpeaking={isSpeaking} />
            <BlueskyPrompt lang={lang} isSignedIn={isSignedIn} onSignIn={handleSignIn} />
            {isSignedIn && (
              <button
                onClick={handleStartChat}
                className="w-full py-3 rounded-xl font-bold text-white text-sm transition-opacity hover:opacity-80 active:opacity-60"
                style={{ background: "linear-gradient(90deg, #667eea, #764ba2)" }}
              >
                {LABEL.chat}
              </button>
            )}
          </div>
        </div>
      )}

      {/* ===== CHAT ===== */}
      {phase === "chat" && (
        <>
          <MessageInputContainer
            isChatProcessing={chatProcessing}
            onChatProcessStart={handleSendChat}
          />
          <Menu
            chatLog={chatLog}
            koeiroParam={koeiroParam}
            assistantMessage={assistantMessage}
            koeiromapKey={koeiromapKey}
            userName={userName}
            onChangeChatLog={handleChangeChatLog}
            onChangeKoeiromapParam={setKoeiroParam}
            onChangeUserName={setUserName}
            handleClickResetChatLog={() => setChatLog([])}
            onChangeKoeiromapKey={() => {}}
          />
        </>
      )}
    </div>
  );
}

export const getStaticProps: GetStaticProps = async ({ locale }) => ({
  props: {
    ...(await serverSideTranslations(locale ?? "en", ["common"])),
  },
});
