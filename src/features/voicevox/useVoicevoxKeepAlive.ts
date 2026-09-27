import { useEffect } from "react";

const KEEPALIVE_INTERVAL_MS = 4 * 60 * 1000; // Cloudflare Tunnelのアイドルタイムアウト(約5分)より短く設定

export function useVoicevoxKeepAlive(enabled = true) {
  useEffect(() => {
    if (!enabled) return;

    const ping = async () => {
      try {
        const res = await fetch("/api/voicevox-health");
        if (!res.ok) return;
        const data: { primary: boolean; responseTimeMs: number; error?: string } = await res.json();
        if (data.primary) {
          console.log(`[VoicevoxKeepAlive] primary ok (${data.responseTimeMs}ms)`);
        } else {
          console.warn(`[VoicevoxKeepAlive] primary not reachable: ${data.error ?? "unknown"}`);
        }
      } catch (e) {
        console.error("[VoicevoxKeepAlive] health check failed:", e);
      }
    };

    ping(); // ページ開いた直後のコールドスタートを防ぐための即時ウォームアップ
    const id = setInterval(ping, KEEPALIVE_INTERVAL_MS);
    return () => clearInterval(id);
  }, [enabled]);
}
