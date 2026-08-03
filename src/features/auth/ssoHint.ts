// Nagi など姉妹アプリから ?did=... を付けて送られてきたときに、ハンドル入力を
// 飛ばして OAuth を開始するための「ヒント」処理。
//
// ここで受け取る did はあくまでヒントであって認証ではない。詐称されても
// 「他人の DID で OAuth 認可画面が開く」だけで、そのアカウントとしてサインイン
// できるわけではない（認証は OAuth 自身が担保する）。したがってこの値を
// そのまま身元として保存してはならない。

const ATTEMPT_KEY = 'sso_hint_attempted';

// did:plc:... / did:web:... を想定した緩めの検証。ここを通っても信頼はしない。
const DID_PATTERN = /^did:[a-z]+:[A-Za-z0-9._%:-]+$/;

/**
 * URL から ?did= を取り出し、同時に URL から取り除く。
 *
 * 取り除くのは、OAuth が失敗して戻ってきたときに同じヒントで再試行し続ける
 * ループを防ぐため。加えてタブ単位の試行済みフラグでも二重に止める。
 */
export function consumeDidHint(): string | null {
  if (typeof window === 'undefined') return null;

  const url = new URL(window.location.href);
  const raw = url.searchParams.get('did');
  if (!raw) return null;

  // 値の妥当性に関わらず、まず URL から消す。
  url.searchParams.delete('did');
  window.history.replaceState(null, '', url.toString());

  if (!DID_PATTERN.test(raw)) {
    console.warn('[ssoHint] ignoring malformed did hint');
    return null;
  }
  return raw;
}

/**
 * ヒントを使って自動サインインしてよいか。
 *
 * - 明示的にサインアウトした直後は尊重する（勝手に入り直させない）
 * - 同一タブで一度試したら繰り返さない
 */
export function shouldAutoSignIn(did: string): boolean {
  if (typeof window === 'undefined') return false;
  if (window.sessionStorage.getItem('justSignedOut')) return false;
  if (window.sessionStorage.getItem(ATTEMPT_KEY) === did) return false;
  return true;
}

export function markAutoSignInAttempted(did: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(ATTEMPT_KEY, did);
  } catch {
    // sessionStorage が使えなくても URL からヒントは消えているのでループはしない。
  }
}
