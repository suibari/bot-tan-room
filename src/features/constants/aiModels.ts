// 優先順にモデルを並べる。先頭から順に試し、エラーなら次へフォールバックする。
// 軽量な 26b-a4b を優先し、ダメなら 31b にフォールバック（速度優先）。
export const GEMINI_MODELS = ['gemma-4-26b-a4b-it', 'gemma-4-31b-it'] as const;

// 後方互換: 単一モデルを参照していた箇所向け（プライマリ）
export const GEMINI_MODEL = GEMINI_MODELS[0];
