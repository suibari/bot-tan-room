import { VRMExpressionPresetName } from "@pixiv/three-vrm";
import { AnyExpressionKey } from "../emoteController/expressionController";
import { KoeiroParam } from "../constants/koeiroParam";

// ChatGPT API
export type Message = {
  role: "assistant" | "system" | "user";
  content: string;
  userName?: string;
  timestamp?: number;
};

const talkStyles = [
  "talk",
  "happy",
  "sad",
  "angry",
  "fear",
  "surprised",
] as const;
export type TalkStyle = (typeof talkStyles)[number];

export type Talk = {
  style: TalkStyle;
  speakerX: number;
  speakerY: number;
  message: string;
};

/**
 * AIのテキストタグから抽出できる感情識別子の一覧。
 *
 * --- VRMプリセット（モデル内で定義）---
 * "neutral"   : 標準の無表情。会話中のデフォルト。
 * "happy"     : 喜び100%。顔が崩れやすいため基本は halfHappy を優先。
 *               100%が必要な特別なシーンのみ使用可。
 * "angry"     : 怒り。強い否定や真剣な場面。
 * "sad"       : 悲しみ。共感・寄り添いシーン。
 * "relaxed"   : リラックス。ゆったりした返答や締めの言葉。
 * "surprised" : 驚き100%。サプライズ系のシーン。
 *
 * --- アプリ定義の合成表情（expressionController.ts で定義）---
 * "halfHappy"     : happy 50%。顔崩れせず笑う標準の「嬉しい」表情。
 *                   会話中の明るい返答・質問フェーズで頻用する。
 * "thinking"      : relaxed 30%。考え中・回答を考えているシーン。
 *                   質問待機中やAIが生成中のローディング時に使う。
 * "excited"       : surprised 60% + happy 35%。
 *                   診断結果表示など、テンションが上がるシーン。
 * "gentle"        : relaxed 40% + happy 15%。
 *                   診断の締め・優しい言葉・全肯定返答など。
 * "morningFace"   : relaxed 15%。朝の落ち着いた表情。TOP 05:00〜10:59。
 * "afternoonFace" : happy 45%。昼の元気な表情。TOP 11:00〜16:59。
 * "eveningFace"   : relaxed 55% + happy 10%。夕方のほっとした表情。TOP 17:00〜20:59。
 * "nightFace"     : relaxed 70%。夜の眠そうな表情。TOP 21:00〜04:59。
 */
export const ALL_EMOTIONS = [
  // VRMプリセット
  "neutral",
  "happy",
  "angry",
  "sad",
  "relaxed",
  "surprised",
  // アプリ合成表情
  "halfHappy",
  "thinking",
  "excited",
  "gentle",
  "morningFace",
  "afternoonFace",
  "eveningFace",
  "nightFace",
] as const;

export type EmotionKey = (typeof ALL_EMOTIONS)[number];

/**
 * AIのタグとして会話文中で使える感情タグ（AIに渡すプロンプトにも記載する）。
 * 時間帯表情（morningFace 等）はプログラム側で制御するためタグには含めない。
 */
export const CHAT_EMOTIONS = [
  "neutral",
  "halfHappy",  // 標準の「嬉しい」（AIはhappyタグ代わりにこちらを使う）
  "angry",
  "sad",
  "relaxed",
  "surprised",
  "thinking",   // 考え中
  "excited",    // テンションアップ
  "gentle",     // 穏やか・全肯定
] as const;
export type ChatEmotionKey = (typeof CHAT_EMOTIONS)[number];

/**
 * 発話文と音声の感情と、モデルの感情表現がセットになった物
 */
export type Screenplay = {
  expression: AnyExpressionKey;
  talk: Talk;
};

export const splitSentence = (text: string): string[] => {
  const splitMessages = text.split(/(?<=[。．！？\n])/g);
  return splitMessages.filter((msg) => msg !== "");
};

export const textsToScreenplay = (
  texts: string[],
  koeiroParam: KoeiroParam
): Screenplay[] => {
  const screenplays: Screenplay[] = [];
  let prevExpression: AnyExpressionKey = "neutral";
  for (let i = 0; i < texts.length; i++) {
    const text = texts[i];

    const match = text.match(/\[(.*?)\]/);

    const tag = (match && match[1]) || prevExpression;

    const message = text.replace(/\[(.*?)\]/g, "");

    let expression: AnyExpressionKey = prevExpression;
    if ((ALL_EMOTIONS as readonly string[]).includes(tag)) {
      // happy(100%) は顔崩れするため halfHappy に自動リマップ
      expression = (tag === "happy" ? "halfHappy" : tag) as AnyExpressionKey;
      prevExpression = expression;
    }

    screenplays.push({
      expression,
      talk: {
        style: emotionToTalkStyle(expression),
        speakerX: koeiroParam.speakerX,
        speakerY: koeiroParam.speakerY,
        message: message,
      },
    });
  }

  return screenplays;
};

/** 表情キーを音声スタイルにマッピング */
const emotionToTalkStyle = (emotion: AnyExpressionKey): TalkStyle => {
  switch (emotion) {
    case "angry":
      return "angry";
    case "happy":
    case "halfHappy":
    case "excited":
    case "afternoonFace":
      return "happy";
    case "sad":
      return "sad";
    default:
      return "talk";
  }
};
