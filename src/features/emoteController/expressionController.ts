import * as THREE from "three";
import {
  VRM,
  VRMExpressionManager,
  VRMExpressionPresetName,
} from "@pixiv/three-vrm";
import { AutoLookAt } from "./autoLookAt";
import { AutoBlink } from "./autoBlink";

/**
 * Expressionを管理するクラス
 *
 * 主に前の表情を保持しておいて次の表情を適用する際に0に戻す作業や、
 * 前の表情が終わるまで待ってから表情適用する役割を持っている。
 *
 * 合成表情の定義もここで管理する。
 * 合成表情とは、複数のVRMプリセットに異なるウェイトを指定して
 * アプリ側で合成したオリジナルの表情。VRMモデル編集不要で作成可能。
 */

/** VRMプリセットへのウェイト指定 */
type ExpressionBlend = {
  preset: VRMExpressionPresetName;
  weight: number; // 0.0 〜 1.0
};

/**
 * アプリ独自の「合成表情」の定義テーブル。
 *
 * キー名はアプリ内で使う識別子（AIタグ・時間帯キーなど）。
 * VRMの標準プリセット名（neutral/happy等）は直接 playEmotion に渡せるので
 * ここには「合成が必要なもの」だけを定義する。
 *
 * --- 用途一覧 ---
 * "halfHappy"    : happyを50%でマイルドに。質問フェーズ・会話の明るい返答など。
 *                  happy100%は顔が崩れやすいため、こちらを標準の「喜び」として使う。
 * "thinking"     : relaxedとneutralのブレンド。考えたり思案したりするシーン。
 *                  質問回答待ち・診断計算中などに使う。
 * "morningFace"  : 朝のデフォルト表情。neutralより少しrelaxed寄り。
 *                  TOPページ 05:00〜10:59 の時間帯に使用。
 * "afternoonFace": 昼の元気な表情。half-happyくらいの明るさ。
 *                  TOPページ 11:00〜16:59 の時間帯に使用。
 * "eveningFace"  : 夕方のリラックス表情。relaxedを主体にhappyを少し混ぜる。
 *                  TOPページ 17:00〜20:59 の時間帯に使用。
 * "nightFace"    : 夜の眠そうな表情。relaxedを高め、surprisedを微量で眠い雰囲気。
 *                  TOPページ 21:00〜04:59 の時間帯に使用。
 * "excited"      : surprisedとhappyを合わせた驚き＋喜び。診断結果表示時など。
 * "gentle"       : relaxedを低めに乗せた穏やか表情。診断の締めや優しい返答に。
 */
export const EXPRESSION_BLENDS: Record<string, ExpressionBlend[]> = {
  // --- 基本感情（happyをマイルドに） ---
  halfHappy: [
    { preset: "happy", weight: 0.5 }, // 50%でマイルドに笑う（happy100%は顔崩れしやすいため）
  ],

  // --- 思案中 ---
  thinking: [
    { preset: "relaxed", weight: 0.3 }, // 少しぼんやり
    // neutral は setValue しなければデフォルト0なので混ぜる必要なし
  ],

  // --- 時間帯別 TOPページ表情 ---
  morningFace: [
    // 朝：落ち着いた普通の表情。neutral寄りでrelaxedをほんの少し
    { preset: "relaxed", weight: 0.15 },
  ],
  afternoonFace: [
    // 昼：元気でポジティブ。halfHappyと同等の明るさ
    { preset: "happy", weight: 0.45 },
  ],
  eveningFace: [
    // 夕方：ゆったりリラックス。仕事終わりのほっとした雰囲気
    { preset: "relaxed", weight: 0.55 },
    { preset: "happy",   weight: 0.1  },
  ],
  nightFace: [
    // 夜〜深夜：眠そうでうとうとした雰囲気
    { preset: "relaxed", weight: 0.7  },
  ],

  // --- 質問・診断フェーズ ---
  excited: [
    // 驚き＋喜び：診断結果表示や嬉しいニュースなど、テンションが上がるシーン
    { preset: "surprised", weight: 0.6 },
    { preset: "happy",     weight: 0.35 },
  ],
  gentle: [
    // 穏やか：診断の締めや「大丈夫だよ」系の優しい返答
    { preset: "relaxed", weight: 0.4 },
    { preset: "happy",   weight: 0.15 },
  ],
};

/** 合成表情のキー型（型安全のため） */
export type BlendExpressionKey = keyof typeof EXPRESSION_BLENDS;

/** playEmotion に渡せる表情識別子。VRMプリセット or 合成表情キー */
export type AnyExpressionKey = VRMExpressionPresetName | BlendExpressionKey;

/** ---------- ExpressionController ---------- */

export class ExpressionController {
  private _autoLookAt: AutoLookAt;
  private _autoBlink?: AutoBlink;
  private _expressionManager?: VRMExpressionManager;
  private _currentEmotion: AnyExpressionKey;
  private _currentLipSync: {
    preset: VRMExpressionPresetName;
    value: number;
  } | null;

  constructor(vrm: VRM, camera: THREE.Object3D) {
    this._autoLookAt = new AutoLookAt(vrm, camera);
    this._currentEmotion = "neutral";
    this._currentLipSync = null;
    if (vrm.expressionManager) {
      this._expressionManager = vrm.expressionManager;
      this._autoBlink = new AutoBlink(vrm.expressionManager);
    }
  }

  /**
   * 現在の表情をリセット（全ウェイトを0に戻す）する。
   * 合成表情（EXPRESSION_BLENDS）にも対応。
   */
  private _resetCurrentEmotion() {
    const current = this._currentEmotion;
    if (current === "neutral") return;

    if (current in EXPRESSION_BLENDS) {
      // 合成表情：使用していたプリセットをすべて0に戻す
      for (const { preset } of EXPRESSION_BLENDS[current as BlendExpressionKey]) {
        this._expressionManager?.setValue(preset, 0);
      }
    } else {
      // 標準プリセット
      this._expressionManager?.setValue(current as VRMExpressionPresetName, 0);
    }
  }

  /**
   * 表情を再生する。
   * VRMプリセット名（"happy" 等）も合成表情キー（"halfHappy" 等）も受け付ける。
   */
  public playEmotion(preset: AnyExpressionKey) {
    this._resetCurrentEmotion();

    if (preset === "neutral") {
      this._autoBlink?.setEnable(true);
      this._currentEmotion = preset;
      return;
    }

    const t = this._autoBlink?.setEnable(false) || 0;
    this._currentEmotion = preset;

    setTimeout(() => {
      if (preset in EXPRESSION_BLENDS) {
        // 合成表情：各プリセットに指定ウェイトをセット
        for (const { preset: p, weight } of EXPRESSION_BLENDS[preset as BlendExpressionKey]) {
          this._expressionManager?.setValue(p, weight);
        }
      } else {
        // 標準プリセット：100%で適用
        this._expressionManager?.setValue(preset as VRMExpressionPresetName, 1);
      }
    }, t * 1000);
  }

  public lipSync(preset: VRMExpressionPresetName, value: number) {
    if (this._currentLipSync) {
      this._expressionManager?.setValue(this._currentLipSync.preset, 0);
    }
    this._currentLipSync = {
      preset,
      value,
    };
  }

  public update(delta: number) {
    if (this._autoBlink) {
      this._autoBlink.update(delta);
    }

    if (this._currentLipSync) {
      const weight =
        this._currentEmotion === "neutral"
          ? this._currentLipSync.value * 0.5
          : this._currentLipSync.value * 0.25;
      this._expressionManager?.setValue(this._currentLipSync.preset, weight);
    }
  }
}
