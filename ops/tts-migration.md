# お部屋の Irodori 移行（2026-09-27）

## 反映状況

- 本番 https://room.bot-tan.com にデプロイ済み。デプロイURL: https://8a6dd36a.chatvrm-bot-tan.pages.dev
- `tts.suibari.com` のCNAMEを既存トンネルに登録し、ユーザーが既存VOICEVOX用Accessアプリの保護対象に追加済み。
- `/etc/cloudflared/config.yml`（`~/.cloudflared/config.yml`へのリンク）は `ops/cloudflared-tts.yml` と一致。cloudflaredの再起動完了。
- `tts.suibari.com/health` と `/synthesize` を `127.0.0.1:10110` に転送。`/unload` などは公開しない。
- `voicevox.suibari.com` の転送ルールは削除済み。旧ホストは末尾の404ルールに一致する。
- 旧 `voicevox.suibari.com` のDNSレコードはユーザーが削除済み。名前解決できなくなったこと、および `tts.suibari.com` の名前解決と本番ヘルスチェックの成功を確認済み。
- VOICEVOXコンテナは下記の既存依存があるため、停止も再起動ポリシー変更もしていない。

## アプリの動作

ブラウザ → POST /api/tts {text} → https://tts.suibari.com/synthesize → bot-tan-tts。
声はサーバ既定の tsumugi。300文字を超える文は分割し、24kHz/mono/16bit PCM WAVを結合する。
初回読み込みを含めて各合成を90秒まで待つ。GPU不足などで503なら既存の画面のエラー処理へ戻り、外部VOICEVOXへは送らない。
/api/tts-health は /health を呼ぶだけで、GPUモデルをロードしない。
旧 /api/voicevox と /api/voicevox-health はキャッシュ済みクライアント向けの互換入口で、処理はIrodoriへ委譲する。

Pages本番では既存の `CF_ACCESS_CLIENT_ID_VOICEVOX` と `CF_ACCESS_CLIENT_SECRET_VOICEVOX` を引き続き使用。
新しい `CF_ACCESS_CLIENT_ID_TTS` / `CF_ACCESS_CLIENT_SECRET_TTS` を設定した場合はそちらを優先する。
接続先は `TTS_DOMAIN`、未設定なら `tts.suibari.com`。旧 `VOICEVOX_DOMAIN` は使用しない。
previewには認証情報を自動複製していない。previewを使う場合は `.env.example` の設定が必要。
トークンはブラウザへ渡さない。クレジットはIrodori-TTSと参照音声VOICEVOX:春日部つむぎを記載する。

Cloudflare Workersではfetchの `redirect: "error"` が使用できないため、`manual` とHTTPステータス確認でリダイレクトを拒否する。

## 検証結果

- `node --test tests/tts.test.cjs`: 8件成功。文字分割、PCM結合、入力検証、認証必須、合成、失敗時処理、ヘルスチェック、旧API互換。
- `npx tsc --noEmit`、`npm run build`、`npm run pages:build`: 成功。既存のNext設定・React Hooksなどの警告あり。
- `wrangler pages dev` でWorkers実行環境からAccessへ接続できることを確認。
- 本番 `/api/tts-health/`: primary=true。
- 本番 `/api/tts/`: HTTP 200、約1.1秒、24kHz/mono/16bitのWAV（3.56秒）を取得。
- 認証なしの `tts.suibari.com/health`: Accessの403。
- cloudflared ingress validate成功。旧ホストおよび `/unload` は404ルールに一致。

## VOICEVOX停止を保留した根拠

| 利用元 | 確認した依存 |
| --- | --- |
| tenori-sts.service（稼働中） | tenori-bot-tan/.env の VOICEVOX_URL=http://127.0.0.1:10101、services.py が audio_query/synthesis を呼ぶ |
| bot-tan-youtuber（有効な定期実行） | .env の VOICEVOX_URL=http://localhost:10101、common/voice.py。pipeline、quiz、liveタイマーが存在 |
| calendar-server.service（稼働中） | TTS_ENGINE=irodoriだが、未ロード/GPU不足/合成失敗時はVOICEVOXへフォールバック |
| bot-tan-tts.service（稼働中） | server.py の voicevox_speech_seconds が10101のaudio_queryで時間補正。TTS_VOICEVOX_URLを空にすれば無効化可能だが品質が変わる |

他にも旧ChatVRMやアーカイブに参照コードがあるが、稼働依存とは区別した。
VOICEVOXコンテナの直近ログでもaudio_queryの利用を確認したため、「他アプリが使わない」という停止条件は未成立。
上記依存を移行して確認後、`docker update --restart=no voicevox` と `docker stop voicevox` で停止できる。
Compose再作成で常駐が復活しないよう、bot-tan-youtuber/setup/voicevox-compose.ymlも併せて見直す。

## 復旧用情報

- トンネル設定のバックアップ: `/home/suibari/.cloudflared/config.before-tts-20260927-162620.yml`
- 移行前のPagesデプロイID: `a3cecd9d-5b83-404d-acae-b03a215858fa`
- 戻す場合は旧DNSとAccess保護を確保し、トンネル設定をバックアップから戻してcloudflaredを再起動後、Pagesを移行前へロールバックする。
- 他ホスト（feed、latestfromfollows、skyputter-api）の転送設定は維持している。
