export default function normalizeWord (word: string): string {
  if (word.length > 1 && word.match(/^[A-Z0-9]$/)) {
    return word.trim()
  } else {
    return word.trim().toLowerCase()
  }
}