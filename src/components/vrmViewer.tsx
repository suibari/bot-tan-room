import { useContext, useCallback } from "react";
import { ViewerContext } from "../features/vrmViewer/viewerContext";
import { buildUrl } from "@/utils/buildUrl";

export default function VrmViewer() {
  const { viewer } = useContext(ViewerContext);

  const canvasRef = useCallback(
    (canvas: HTMLCanvasElement) => {
      if (canvas) {
        viewer.setup(canvas);
        viewer.loadVrm(buildUrl("/api/vrm"));


      }
    },
    [viewer]
  );

  return (
    <div className={"absolute top-0 left-0 w-screen h-[100svh] z-0"}>
      <canvas ref={canvasRef} className={"h-full w-full"}></canvas>
    </div>
  );
}
