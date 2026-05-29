/**
 * Parses raw AI response which contains both [ja] and [en] blocks,
 * and extracts the block for the requested language.
 * If no tags are found, returns the original text as fallback.
 */
export function parseLanguageContent(text: string, lang: 'ja' | 'en'): string {
  // We use regex to find the [ja] block and [en] block.
  // The block starts with [ja] or [en] and ends before the next tag or at the end of string.
  const jaMatch = text.match(/\[ja\]([\s\S]*?)(?=\[ja\]|\[en\]|$)/);
  const enMatch = text.match(/\[en\]([\s\S]*?)(?=\[ja\]|\[en\]|$)/);

  const jaBlock = jaMatch ? jaMatch[1] : null;
  const enBlock = enMatch ? enMatch[1] : null;

  // Fallback if neither tag is present in the text at all:
  if (jaBlock === null && enBlock === null) {
    return text;
  }

  if (lang === 'ja') {
    return jaBlock ?? '';
  } else {
    return enBlock ?? '';
  }
}

/**
 * Removes emotion tags like [neutral], [happy], [angry], [sad], [relaxed]
 * from the text, while keeping other content.
 */
export function stripEmotionTags(text: string): string {
  return text.replace(/\[(neutral|happy|angry|sad|relaxed)\]/g, '').trim();
}

/**
 * Extracts any emotion tags from the text to determine the current emotion.
 * Returns the first emotion tag found, or 'neutral' if none is found.
 */
export function extractEmotion(text: string): string {
  const match = text.match(/\[(neutral|happy|angry|sad|relaxed)\]/);
  return match ? match[1] : 'neutral';
}
