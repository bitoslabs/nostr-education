// Curated emoji for the note composer. Bitcoin and study glyphs are the point:
// a generic emoji keyboard hides the ones this audience reaches for.
export const EMOJI_GROUPS = Object.freeze([
  {
    id: 'crypto',
    labelKey: 'home.composer.emojiCrypto',
    emojis: ['⚡', '₿', '🪙', '🧡', '🚀', '📈', '💎', '⛓️', '🔑', '🛡️', '🔥', '🤝'],
  },
  {
    id: 'study',
    labelKey: 'home.composer.emojiStudy',
    emojis: ['🎓', '📚', '✏️', '🧠', '💡', '📝', '🔬', '🧪', '🏫', '🌍', '✅', '📌'],
  },
  {
    id: 'smileys',
    labelKey: 'home.composer.emojiSmileys',
    emojis: ['😀', '😂', '🥹', '😍', '😎', '🙌', '👏', '👍', '🙏', '🤔', '😅', '🤯'],
  },
  {
    id: 'nature',
    labelKey: 'home.composer.emojiNature',
    emojis: ['🐝', '🌱', '🌞', '🌈', '⭐', '🍀', '🌸', '🌊', '🐦', '🍎', '🌙', '❄️'],
  },
]);
