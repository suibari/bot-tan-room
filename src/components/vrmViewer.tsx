import { useContext, useCallback, useState } from "react";
import { ViewerContext } from "../features/vrmViewer/viewerContext";
import { buildUrl } from "@/utils/buildUrl";

type Props = {
  onClickCharacter?: () => void;
};

export default function VrmViewer({ onClickCharacter }: Props) {
  const { viewer } = useContext(ViewerContext);
  const [isLoaded, setIsLoaded] = useState(false);
  const [pointerStart, setPointerStart] = useState<{ x: number; y: number } | null>(null);

  const canvasRef = useCallback(
    (canvas: HTMLCanvasElement) => {
      if (canvas) {
        viewer.setup(canvas);
        const load = async () => {
          await viewer.loadVrm(buildUrl("/api/vrm"));
          setIsLoaded(true);
        };
        load();
      }
    },
    [viewer]
  );

  // ポインタが押された時の座標を記録（カメラ回転などのドラッグ操作と区別するため）
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    setPointerStart({ x: e.clientX, y: e.clientY });
  };

  // ポインタが離された時にクリック判定を行う
  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!pointerStart) return;

    const dx = e.clientX - pointerStart.x;
    const dy = e.clientY - pointerStart.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    // ポインタの移動距離が 5px 未満であればクリック（タップ）と判定
    if (distance < 5) {
      // Raycast を用いて3D空間上のモデルとの交差を判定
      const isHit = viewer.handleRaycast(e.clientX, e.clientY);
      console.log(`[Raycast] Hit VRM model: ${isHit} (clientX: ${e.clientX}, clientY: ${e.clientY})`);

      if (isHit && onClickCharacter) {
        onClickCharacter();
      }
    }

    setPointerStart(null);
  };

  return (
    <div
      className={`absolute top-0 left-0 w-screen h-[100svh] z-0 transition-opacity duration-1000 ease-in-out ${
        isLoaded ? "opacity-100" : "opacity-0"
      }`}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
    >
      <canvas ref={canvasRef} className={"h-full w-full"}></canvas>
    </div>
  );
}
