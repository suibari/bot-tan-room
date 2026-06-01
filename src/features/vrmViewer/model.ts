import * as THREE from "three";
import { VRM, VRMLoaderPlugin, VRMUtils } from "@pixiv/three-vrm";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import { VRMAnimation } from "../../lib/VRMAnimation/VRMAnimation";
import { VRMLookAtSmootherLoaderPlugin } from "@/lib/VRMLookAtSmootherLoaderPlugin/VRMLookAtSmootherLoaderPlugin";
import { LipSync } from "../lipSync/lipSync";
import { EmoteController } from "../emoteController/emoteController";
import { Screenplay } from "../messages/messages";

/**
 * 3Dキャラクターを管理するクラス
 */
export class Model {
  public vrm?: VRM | null;
  public mixer?: THREE.AnimationMixer;
  public emoteController?: EmoteController;

  private _lookAtTargetParent: THREE.Object3D;
  private _lipSync?: LipSync;
  private _currentIdleAction?: THREE.AnimationAction;
  private _isPlayingMotion = false;

  constructor(lookAtTargetParent: THREE.Object3D) {
    this._lookAtTargetParent = lookAtTargetParent;
    this._lipSync = new LipSync(new AudioContext());
  }

  public async loadVRM(url: string): Promise<void> {
    const loader = new GLTFLoader();
    loader.register(
      (parser) =>
        new VRMLoaderPlugin(parser, {
          lookAtPlugin: new VRMLookAtSmootherLoaderPlugin(parser),
        })
    );

    const gltf = await loader.loadAsync(url);

    const vrm = (this.vrm = gltf.userData.vrm);
    vrm.scene.name = "VRMRoot";

    VRMUtils.rotateVRM0(vrm);
    this.mixer = new THREE.AnimationMixer(vrm.scene);

    this.emoteController = new EmoteController(vrm, this._lookAtTargetParent);
  }

  public unLoadVrm() {
    if (this.vrm) {
      VRMUtils.deepDispose(this.vrm.scene);
      this.vrm = null;
    }
  }

  /**
   * VRMアニメーションを読み込む
   *
   * https://github.com/vrm-c/vrm-specification/blob/master/specification/VRMC_vrm_animation-1.0/README.ja.md
   */
  public async loadAnimation(vrmAnimation: VRMAnimation): Promise<void> {
    const { vrm, mixer } = this;
    if (vrm == null || mixer == null) {
      throw new Error("You have to load VRM first");
    }

    const clip = vrmAnimation.createAnimationClip(vrm);
    const action = mixer.clipAction(clip);
    action.play();
    this._currentIdleAction = action;
  }

  public async playMotionOnce(vrmAnimation: VRMAnimation): Promise<void> {
    const { vrm, mixer } = this;
    if (vrm == null || mixer == null || this._isPlayingMotion) return;
    this._isPlayingMotion = true;

    const clip = vrmAnimation.createAnimationClip(vrm);
    const motionAction = mixer.clipAction(clip);
    motionAction.setLoop(THREE.LoopOnce, 1);
    motionAction.clampWhenFinished = true;
    motionAction.reset();

    if (this._currentIdleAction) {
      motionAction.play();
      this._currentIdleAction.crossFadeTo(motionAction, 0.3, false);
    } else {
      motionAction.play();
    }

    await new Promise<void>((resolve) => {
      const onFinish = (event: THREE.Event) => {
        const action = (event as THREE.Event & { action: THREE.AnimationAction }).action;
        if (action !== motionAction) return;
        mixer.removeEventListener("finished", onFinish);
        if (this._currentIdleAction) {
          this._currentIdleAction.reset();
          motionAction.crossFadeTo(this._currentIdleAction, 0.5, false);
        }
        this._isPlayingMotion = false;
        resolve();
      };
      mixer.addEventListener("finished", onFinish);
    });
  }

  /**
   * 音声を再生し、リップシンクを行う
   */
  public stopSpeak() {
    this._lipSync?.stop();
  }

  public async speak(buffer: ArrayBuffer, screenplay: Screenplay, onPlayStart?: () => void) {
    this.emoteController?.playEmotion(screenplay.expression);
    await new Promise((resolve) => {
      this._lipSync?.playFromArrayBuffer(buffer, () => {
        resolve(true);
      }, onPlayStart);
    });
  }

  public async speakStream(url: string, screenplay: Screenplay, onPlayStart?: () => void) {
    this.emoteController?.playEmotion(screenplay.expression);
    await new Promise((resolve) => {
      this._lipSync?.playFromStream(url, () => {
        resolve(true);
      }, onPlayStart);
    });
  }

  public update(delta: number): void {
    if (this._lipSync) {
      const { volume } = this._lipSync.update();
      this.emoteController?.lipSync("aa", volume);
    }

    this.emoteController?.update(delta);
    this.mixer?.update(delta);
    this.vrm?.update(delta);
  }
}
