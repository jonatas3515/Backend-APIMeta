export function chunkText(text, maxLength = 1000, overlap = 100) {
  if (!text) return [];
  const chunks = [];
  let start = 0;

  while (start < text.length) {
    let end = Math.min(start + maxLength, text.length);

    if (end < text.length) {
      const lastBreak = Math.max(
        text.lastIndexOf('\n\n', end),
        text.lastIndexOf('. ', end),
        text.lastIndexOf('\n', end)
      );
      if (lastBreak > start) end = lastBreak + 1;
    }

    chunks.push(text.slice(start, end).trim());
    start = Math.max(end - overlap, start + 1);

    if (end === text.length) break;
  }

  return chunks.filter(c => c.length > 50);
}
