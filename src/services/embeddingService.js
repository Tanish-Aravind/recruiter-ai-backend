function chunkText(text, chunkSize = 200, overlap = 40) {
  const words = text.split(/\s+/);
  const chunks = [];

  for (let i = 0; i < words.length; i += chunkSize - overlap) {
    const chunk = words.slice(i, i + chunkSize).join(' ');
    if (chunk.trim().length > 20) {
      chunks.push(chunk);
    }
  }

  return chunks;
}

module.exports = { chunkText };