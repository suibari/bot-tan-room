import { useContext, useCallback, useState } from "react";
import { ViewerContext } from "../features/vrmViewer/viewerContext";
import { buildUrl } from "@/utils/buildUrl";

export default function VrmViewer() {
  const { viewer } = useContext(ViewerContext);
  const [isLoaded, setIsLoaded] = useState(false);

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

  return (
    <div
      className={`absolute top-0 left-0 w-screen h-[100svh] z-0 transition-opacity duration-1000 ease-in-out ${
        isLoaded ? "opacity-100" : "opacity-0"
      }`}
    >
      <canvas ref={canvasRef} className={"h-full w-full"}></canvas>
    </div>
  );
}
