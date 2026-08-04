// お部屋で起きたできごとを affirmative_bot.room_events に残す。
//
// biorhythm_server がこれを読んで「いま何をしているか」の生成材料にする（お部屋に来てくれた
// 人の名前やプレゼントが botたんの行動描写に現れる）。エネルギー加算は従来どおり
// followers.room_interaction_count が担当していて、こちらとは別経路。
//
// 記録に失敗してもお部屋の応答は止めない。あくまで「残ればうれしい」情報として扱う。

export type RoomEventType = 'gift' | 'chat' | 'greeting';

/**
 * 同じ人の同じ種別を何度も残さないための間隔。
 *
 * chat は1往復ごとに history POST が飛ぶので、素通しすると1セッションで数十行たまり
 * biorhythm のプロンプトが会話ログで埋まる。gift は1日1回制限が別にあるので影響しない。
 */
const THROTTLE_MS = 30 * 60 * 1000;

/** できごとの説明はここで頭打ちにする（biorhythm 側でも80文字に切るが、DBに長文を溜めない）。 */
const DETAIL_MAX_CHARS = 80;

function dbHeaders(): HeadersInit | null {
  const CF_ID = process.env.CF_ACCESS_CLIENT_ID_DB;
  const CF_SECRET = process.env.CF_ACCESS_CLIENT_SECRET_DB;
  if (!CF_ID || !CF_SECRET) return null;

  return {
    'Accept-Profile': 'affirmative_bot',
    'Content-Profile': 'affirmative_bot',
    'cf-access-client-id': CF_ID,
    'cf-access-client-secret': CF_SECRET,
    'Content-Type': 'application/json',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  };
}

/**
 * できごとを1件残す。呼び出し側は await せず fire-and-forget でよい。
 *
 * @param detail プレゼント内容・会話の話題など。ユーザー入力なので、読む側は必ずデータとして扱う。
 */
export async function recordRoomEvent(
  did: string,
  type: RoomEventType,
  detail?: string | null,
): Promise<void> {
  const DB_URL = process.env.DB_URL ?? 'https://db.suibari.com';
  const headers = dbHeaders();
  if (!headers) {
    console.warn('[roomEvents] Cloudflare Access credentials not configured, skipping.');
    return;
  }

  try {
    if (type !== 'gift') {
      const since = new Date(Date.now() - THROTTLE_MS).toISOString();
      const recentRes = await fetch(
        `${DB_URL}/room_events?did=eq.${encodeURIComponent(did)}&type=eq.${type}` +
          `&created_at=gte.${encodeURIComponent(since)}&select=id&limit=1`,
        // 呼び出し元は await しないので、edge ランタイムで応答返却後に打ち切られないよう keepalive。
        { headers, keepalive: true },
      );
      if (recentRes.ok) {
        const rows = await recentRes.json();
        if (Array.isArray(rows) && rows.length > 0) return;
      }
      // 取得に失敗したときは抑制せず記録する。取りこぼすより重複するほうがまし。
    }

    const trimmed = detail?.trim();
    const res = await fetch(`${DB_URL}/room_events`, {
      method: 'POST',
      headers: { ...headers, Prefer: 'return=minimal' },
      body: JSON.stringify({
        did,
        type,
        detail: trimmed ? trimmed.slice(0, DETAIL_MAX_CHARS) : null,
      }),
      keepalive: true,
    });
    if (!res.ok) {
      // 404 はスキーマキャッシュ未更新（NOTIFY pgrst, 'reload schema'）、401 は GRANT 漏れ。
      throw new Error(`insert failed: ${res.status}`);
    }
  } catch (e) {
    console.warn('[roomEvents] failed to record room event:', e);
  }
}
