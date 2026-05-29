// 優先順にモデルを並べる。先頭から順に試し、エラーなら次へフォールバックする。
// 診断・会話ともに gemini-2.5-flash-lite に統一。
export const GEMINI_MODELS = ['gemini-2.5-flash-lite'] as const;

// 後方互換: 単一モデルを参照していた箇所向け（プライマリ）
export const GEMINI_MODEL = GEMINI_MODELS[0];

