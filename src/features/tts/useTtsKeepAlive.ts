import { useEffect } from "react";

const KEEPALIVE_INTERVAL_MS = 4 * 60 * 1000; // 接続状態を定期確認。モデルの読み込み・常駐維持はしない

export function useTtsKeepAlive(enabled = true) {
  useEffect(() => {
    if (!enabled) return;

    const ping = async () => {
      try {
        const res = await fetch("/api/tts-health");
        if (!res.ok) return;
        const data: { primary: boolean; responseTimeMs: number; error?: string } = await res.json();
        if (data.primary) {
          console.log(`[TtsKeepAlive] primary ok (${data.responseTimeMs}ms)`);
        } else {
          console.warn(`[TtsKeepAlive] primary not reachable: ${data.error ?? "unknown"}`);
        }
      } catch (e) {
        console.error("[TtsKeepAlive] health check failed:", e);
      }
    };

    ping(); // ページを開いた直後の接続確認
    const id = setInterval(ping, KEEPALIVE_INTERVAL_MS);
    return () => clearInterval(id);
  }, [enabled]);
}
