import * as THREE from "three";
import { Model } from "./model";
import { loadVRMAnimation } from "@/lib/VRMAnimation/loadVRMAnimation";
import { buildUrl } from "@/utils/buildUrl";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";

/**
 * three.jsを使った3Dビューワー
 *
 * setup()でcanvasを渡してから使う
 */
export class Viewer {
  public isReady: boolean;
  public model?: Model;

  private _renderer?: THREE.WebGLRenderer;
  private _clock: THREE.Clock;
  private _scene: THREE.Scene;
  private _camera?: THREE.PerspectiveCamera;
  private _cameraControls?: OrbitControls;

  private _baseCameraZ = 1.5;
  private _motionCameraZ = 2.0;
  private _cameraLerpT = 0;
  private _cameraTargetT = 0;
  private _headTrackingPausedUntil = 0;

  // --- パフォーマンス計測 (開発用) ---
  private _perfFrameTimes: number[] = [];
  private _perfLastLogTime = 0;
  private static readonly PERF_LOG_INTERVAL = 5000; // 5秒ごとにログ出力

  constructor() {
    this.isReady = false;

    // scene
    const scene = new THREE.Scene();
    this._scene = scene;

    // light
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.6);
    directionalLight.position.set(1.0, 1.0, 1.0).normalize();
    scene.add(directionalLight);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambientLight);

    // animate
    this._clock = new THREE.Clock();
    this._clock.start();
  }

  public async loadVrm(url: string): Promise<void> {
    if (this.model?.vrm) {
      this.unloadVRM();
    }

    // gltf and vrm
    this.model = new Model(this._camera || new THREE.Object3D());

    const maxRetries = 3;
    let lastError: unknown;
    for (let i = 0; i < maxRetries; i++) {
      try {
        await this.model.loadVRM(url);
        break;
      } catch (e) {
        lastError = e;
        if (i < maxRetries - 1) {
          await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
        }
      }
    }

    if (!this.model?.vrm) {
      console.error("VRM load failed after retries:", lastError);
      return;
    }

    this._scene.add(this.model.vrm.scene);

    const vrma = await loadVRMAnimation(buildUrl("/idle_loop.vrma"));
    if (vrma) this.model.loadAnimation(vrma);

    // 同期的にカメラ位置を調整する
    this.resetCamera();

    // 物理演算（SpringBone）とアニメーションをウォーミングアップして、初期のぶわっとした揺れを収束させる
    // 0.1秒刻みで15回（計1.5秒分）シミュレーションを進める
    for (let i = 0; i < 15; i++) {
      this.model.update(0.1);
    }

    // アニメーションが進んだ後の正しい頭の位置に合わせて再度カメラ位置をリセット
    this.resetCamera();
  }

  public unloadVRM(): void {
    if (this.model?.vrm) {
      this._scene.remove(this.model.vrm.scene);
      this.model?.unLoadVrm();
    }
  }

  /**
   * Reactで管理しているCanvasを後から設定する
   */
  public setup(canvas: HTMLCanvasElement) {
    const parentElement = canvas.parentElement;
    const width = parentElement?.clientWidth || canvas.width;
    const height = parentElement?.clientHeight || canvas.height;
    // renderer
    this._renderer = new THREE.WebGLRenderer({
      canvas: canvas,
      alpha: true,
      antialias: true,
    });
    this._renderer.outputEncoding = THREE.sRGBEncoding;
    this._renderer.setSize(width, height);
    this._renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    // camera
    const isMobile = width < 768;
    const cameraZ = isMobile ? 2.2 : 1.5;
    this._baseCameraZ = cameraZ;
    this._motionCameraZ = cameraZ + 0.5;
    this._camera = new THREE.PerspectiveCamera(20.0, width / height, 0.1, 20.0);
    this._camera.position.set(0, 1.3, cameraZ);
    this._cameraControls?.target.set(0, 1.3, 0);
    this._cameraControls?.update();
    // camera controls
    this._cameraControls = new OrbitControls(
      this._camera,
      this._renderer.domElement
    );
    this._cameraControls.screenSpacePanning = true;
    this._cameraControls.update();

    window.addEventListener("resize", () => {
      this.resize();
    });
    this.isReady = true;
    this.update();
  }

  /**
   * canvasの親要素を参照してサイズを変更する
   */
  public resize() {
    if (!this._renderer) return;

    const parentElement = this._renderer.domElement.parentElement;
    if (!parentElement) return;

    const width = parentElement.clientWidth;
    const height = parentElement.clientHeight;

    this._renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this._renderer.setSize(width, height);

    if (!this._camera) return;
    this._camera.aspect = width / height;
    this._camera.updateProjectionMatrix();

    // デバイス回転時などのリサイズでカメラ距離をスマホサイズに合わせて再調整する
    const isMobile = width < 768;
    const cameraZ = isMobile ? 2.2 : 1.5;
    this._baseCameraZ = cameraZ;
    this._motionCameraZ = cameraZ + 0.5;
    this._camera.position.z = cameraZ;
    this.resetCamera();
  }

  /**
   * headボーンのスクリーン座標を返す（吹き出し追従用）
   */
  public getHeadScreenPosition(): { x: number; y: number } | null {
    if (!this._camera || !this._renderer) return null;
    const headNode = this.model?.vrm?.humanoid.getNormalizedBoneNode('head');
    if (!headNode) return null;
    const headWPos = headNode.getWorldPosition(new THREE.Vector3());
    const projected = headWPos.clone().project(this._camera);
    const canvas = this._renderer.domElement;
    return {
      x: (projected.x + 1) / 2 * canvas.clientWidth,
      y: -(projected.y - 1) / 2 * canvas.clientHeight,
    };
  }

  /**
   * VRMのheadノードを参照してカメラ位置を調整する
   */
  public resetCamera() {
    const headNode = this.model?.vrm?.humanoid.getNormalizedBoneNode("head");

    if (headNode) {
      const headWPos = headNode.getWorldPosition(new THREE.Vector3());
      this._camera?.position.set(
        this._camera.position.x,
        headWPos.y,
        this._camera.position.z
      );
      this._cameraControls?.target.set(headWPos.x, headWPos.y, headWPos.z);
      this._cameraControls?.update();
    }
  }

  /**
   * 指定されたクライアント座標（clientX, clientY）において、
   * VRMモデルがクリックされたかどうかを判定します。
   */
  public pauseHeadTracking(ms: number): void {
    this._headTrackingPausedUntil = Date.now() + ms;
  }

  public setMuted(muted: boolean): void {
    this.model?.setMuted(muted);
  }

  public async playVrmaMotion(url: string): Promise<void> {
    if (!this.model) return;
    const vrma = await loadVRMAnimation(url);
    if (!vrma) return;
    this._cameraTargetT = 1;
    await this.model.playMotionOnce(vrma);
    this._cameraTargetT = 0;
  }

  public handleRaycast(clientX: number, clientY: number): boolean {
    if (!this._renderer || !this._camera || !this.model?.vrm) return false;

    // Canvas要素の矩形情報を取得
    const rect = this._renderer.domElement.getBoundingClientRect();
    
    // 正規化デバイス座標（NDC）を算出 (-1 から +1)
    const x = ((clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((clientY - rect.top) / rect.height) * 2 + 1;

    // Raycasterを設定
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(x, y), this._camera);

    // モデルの全メッシュを対象に交差判定を行う
    const intersects = raycaster.intersectObject(this.model.vrm.scene, true);

    // 交差しているオブジェクトが1つ以上あればクリック成功
    return intersects.length > 0;
  }

  public update = () => {
    const frameStart = performance.now();
    requestAnimationFrame(this.update);
    const delta = this._clock.getDelta();

    // モーション再生中はカメラをなめらかに引き、終わったら戻す
    this._cameraLerpT += (this._cameraTargetT - this._cameraLerpT) * Math.min(delta * 4.0, 1);
    if (this._camera) {
      this._camera.position.z = THREE.MathUtils.lerp(this._baseCameraZ, this._motionCameraZ, this._cameraLerpT);
    }

    if (this.model) {
      this.model.update(delta);
    }

    // 頭ボーン位置に毎フレーム追従してキャラを常に中心に捉える（一時停止中はスキップ）
    if (this.model?.vrm && this._cameraControls && Date.now() >= this._headTrackingPausedUntil) {
      const headNode = this.model.vrm.humanoid.getNormalizedBoneNode('head');
      if (headNode) {
        const headWPos = headNode.getWorldPosition(new THREE.Vector3());
        this._cameraControls.target.set(headWPos.x, headWPos.y, headWPos.z);
        this._cameraControls.update();
      }
    }

    if (this._renderer && this._camera) {
      this._renderer.render(this._scene, this._camera);
    }

    // パフォーマンス統計を5秒ごとにコンソール出力
    const frameTime = performance.now() - frameStart;
    this._perfFrameTimes.push(frameTime);
    const now = performance.now();
    if (now - this._perfLastLogTime >= Viewer.PERF_LOG_INTERVAL) {
      const times = this._perfFrameTimes;
      const avgMs = times.reduce((a, b) => a + b, 0) / times.length;
      const maxMs = Math.max(...times);
      const minMs = Math.min(...times);
      const avgFps = 1000 / avgMs;
      const pixelRatio = this._renderer?.getPixelRatio() ?? 0;
      console.log(
        `[Perf] frames=${times.length} | avg=${avgFps.toFixed(1)}fps (${avgMs.toFixed(2)}ms)` +
        ` | max_ft=${maxMs.toFixed(2)}ms | min_ft=${minMs.toFixed(2)}ms | pixelRatio=${pixelRatio}`
      );
      this._perfFrameTimes = [];
      this._perfLastLogTime = now;
    }
  };
}
