const { Pinecone } = require('@pinecone-database/pinecone');
const { chunkText } = require('./embeddingService');

const pinecone = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY,
});

function getIndex() {
  return pinecone.index(process.env.PINECONE_INDEX);
}

async function indexCandidate(candidateId, resumeText, githubData) {
  const index = getIndex();

  try {
    await index.deleteMany({ filter: { candidateId: String(candidateId) } });
  } catch {}

  const allChunks = [];

  if (resumeText) {
    const resumeChunks = chunkText(resumeText);
    resumeChunks.forEach((chunk, i) => {
      allChunks.push({
        id: `candidate-${candidateId}-resume-${i}`,
        text: chunk,
        source: 'resume',
      });
    });
  }

  if (githubData) {
    let repos = [];
    try {
      repos = typeof githubData.repos_json === 'string'
        ? JSON.parse(githubData.repos_json)
        : githubData.repos_json || [];
    } catch {}

    repos.forEach((repo, repoIdx) => {
      const repoText = `
        Repository: ${repo.name}
        Language: ${repo.language || 'N/A'}
        Description: ${repo.description || 'No description'}
        README: ${repo.readme || 'No README'}
      `.trim();

      const repoChunks = chunkText(repoText, 300, 50);
      repoChunks.forEach((chunk, i) => {
        allChunks.push({
          id: `candidate-${candidateId}-github-${repoIdx}-${i}`,
          text: chunk,
          source: 'github',
        });
      });
    });
  }

  if (allChunks.length === 0) {
    return;
  }

  const batchSize = 10;
  for (let i = 0; i < allChunks.length; i += batchSize) {
    const batch = allChunks.slice(i, i + batchSize);

    await index.upsertRecords({
      records: batch.map((chunk) => ({
        id: chunk.id,
        text: chunk.text,
        source: chunk.source,
        candidateId: String(candidateId),
      })),
    });
  }

  console.log(`Indexed ${allChunks.length} chunks for candidate ${candidateId}`);
}

async function retrieveContext(candidateId, question, topK = 5) {
  const index = getIndex();

  console.log('[RAG] retrieveContext called:', { candidateId, question, topK });
  const results = await index.searchRecords({
    query: {
      inputs: { text: question },
      topK,
      filter: { candidateId: { $eq: String(candidateId) } },
    },
    fields: ['text', 'source', 'candidateId'],
  });

  console.log('[RAG] searchRecords results:', JSON.stringify(results, null, 2));
  const hits = results?.result?.hits || results?.hits || results?.matches || [];
  console.log('[RAG] hits:', hits);

  const mapped = hits.map((hit) => ({
    chunk_text: hit.fields?.text || hit.metadata?.text || '',
    source: hit.fields?.source || hit.metadata?.source || 'unknown',
    similarity: hit._score || hit.score || 0,
  }));
  console.log('[RAG] mapped chunks:', mapped);
  return mapped;
}

async function deleteIndex(candidateId) {
  const index = getIndex();
  try {
    await index.deleteMany({ filter: { candidateId: String(candidateId) } });
    console.log(`Deleted vectors for candidate ${candidateId}`);
  } catch (err) {
    console.error('Pinecone delete error:', err.message);
  }
}

module.exports = { indexCandidate, retrieveContext, deleteIndex };
