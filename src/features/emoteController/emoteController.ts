import * as THREE from "three";
import { VRM, VRMExpressionPresetName } from "@pixiv/three-vrm";
import { ExpressionController, AnyExpressionKey } from "./expressionController";

/**
 * 感情表現としてExpressionとMotionを操作する為のクラス
 * デモにはExpressionのみが含まれています
 */
export class EmoteController {
  private _expressionController: ExpressionController;

  constructor(vrm: VRM, camera: THREE.Object3D) {
    this._expressionController = new ExpressionController(vrm, camera);
  }

  /** VRMプリセット名または合成表情キーを受け付ける */
  public playEmotion(preset: AnyExpressionKey) {
    this._expressionController.playEmotion(preset);
  }

  public lipSync(preset: VRMExpressionPresetName, value: number) {
    this._expressionController.lipSync(preset, value);
  }

  public update(delta: number) {
    this._expressionController.update(delta);
  }
}
