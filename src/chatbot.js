const fs = require('node:fs');
const path = require('node:path');

const CHAT_FALLBACK_REPLY = 'I am still learning. Teach me with: “teach me: question | answer”.';

function normalizeText(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(text) {
  return normalizeText(text)
    .split(' ')
    .filter(Boolean);
}

function stableHash(value) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createEmbedding(token, dimension = 8) {
  const vector = new Array(dimension).fill(0);
  const seed = stableHash(token);

  for (let i = 0; i < dimension; i += 1) {
    const sample = (seed >> ((i % 8) * 4)) & 0xf;
    vector[i] = (sample / 15) - 0.5;
  }

  return vector;
}

function dotProduct(a, b) {
  let total = 0;
  for (let i = 0; i < a.length; i += 1) {
    total += a[i] * b[i];
  }
  return total;
}

function vectorNorm(vector) {
  return Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
}

function similarity(a, b) {
  const numerator = dotProduct(a, b);
  const denominator = vectorNorm(a) * vectorNorm(b) + 1e-9;
  return numerator / denominator;
}

function contextEmbedding(tokens, dimension = 8) {
  const vector = new Array(dimension).fill(0);
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    const tokenEmbedding = createEmbedding(token, dimension);
    const positionWeight = 1 / (index + 1);

    for (let i = 0; i < dimension; i += 1) {
      vector[i] += tokenEmbedding[i] * positionWeight;
    }
  }

  if (tokens.length === 0) {
    return vector;
  }

  return vector.map((value) => value / tokens.length);
}

function makeNgrams(tokens, size) {
  const grams = new Set();
  for (let i = 0; i <= tokens.length - size; i += 1) {
    grams.add(tokens.slice(i, i + size).join(' '));
  }
  return Array.from(grams);
}

function scoreExample(inputText, exampleText, example) {
  const inputTokens = tokenize(inputText);
  const exampleTokens = example.tokens || tokenize(exampleText);
  const inputSet = new Set(inputTokens);

  const overlap = exampleTokens.filter((token) => inputSet.has(token));
  const sharedCount = overlap.length;
  const exactMatch = normalizeText(inputText) === example.input ? 18 : 0;

  const inputBigrams = makeNgrams(inputTokens, 2);
  const exampleBigrams = example.bigrams || makeNgrams(exampleTokens, 2);
  const bigramMatches = exampleBigrams.filter((gram) => inputBigrams.includes(gram));

  const tokenScore = sharedCount * 3;
  const bigramScore = bigramMatches.length * 6;
  const coverage = inputTokens.length > 0 ? sharedCount / inputTokens.length : 0;
  const attentionScore = similarity(
    contextEmbedding(inputTokens),
    contextEmbedding(exampleTokens),
  );
  const rareBoost = (example.rareWords || []).reduce((count, word) => {
    return count + (inputSet.has(word) ? 2 : 0);
  }, 0);

  return (
    exactMatch +
    tokenScore +
    bigramScore +
    coverage * 10 +
    attentionScore * 10 +
    rareBoost
  );
}

function buildBotDefaultHelp() {
  return 'I am a local TikClip assistant. I can help with TikTok downloads, YouTube uploads, and custom chatbot replies. Ask me a question or teach me with: “teach me: question | answer”.';
}

function createLocalChatbot({ memoryFile = 'data/chatbot-memory.json' } = {}) {
  const resolvedPath = path.resolve(memoryFile);
  const dir = path.dirname(resolvedPath);

  function ensureMemoryFile() {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    if (!fs.existsSync(resolvedPath)) {
      fs.writeFileSync(
        resolvedPath,
        JSON.stringify({ users: {} }, null, 2),
      );
    }
  }

  function loadMemory() {
    ensureMemoryFile();

    try {
      const raw = fs.readFileSync(resolvedPath, 'utf8');
      const parsed = JSON.parse(raw);
      const users = parsed.users || {};

      return Object.fromEntries(
        Object.entries(users).map(([userId, entries]) => [
          userId,
          Array.isArray(entries)
            ? entries.map(([input, output]) => {
                const tokens = tokenize(input);
                return {
                  input: normalizeText(input),
                  output: String(output || '').trim(),
                  tokens,
                  bigrams: makeNgrams(tokens, 2),
                  rareWords: Array.from(new Set(tokens)).filter(
                    (token) => token.length > 3,
                  ),
                };
              })
            : [],
        ]),
      );
    } catch {
      return {};
    }
  }

  function saveMemory(records) {
    ensureMemoryFile();
    const payload = {
      users: Object.fromEntries(
        Object.entries(records).map(([userId, entries]) => [
          userId,
          entries.map(({ input, output }) => [input, output]),
        ]),
      ),
    };

    fs.writeFileSync(resolvedPath, JSON.stringify(payload, null, 2));
  }

  const memory = loadMemory();

  function getUserMemory(userId = 'default') {
    const userKey = String(userId || 'default');
    if (!memory[userKey]) {
      memory[userKey] = [];
    }
    return memory[userKey];
  }

  function learn(input, output, userId = 'default') {
    const normalizedInput = normalizeText(input);
    const normalizedOutput = String(output || '').trim();

    if (!normalizedInput || !normalizedOutput) {
      return;
    }

    const userMemory = getUserMemory(userId);
    const existingIndex = userMemory.findIndex(
      (entry) => entry.input === normalizedInput,
    );

    const tokens = tokenize(normalizedInput);
    const example = {
      input: normalizedInput,
      output: normalizedOutput,
      tokens,
      bigrams: makeNgrams(tokens, 2),
      rareWords: Array.from(new Set(tokens)).filter((token) => token.length > 3),
    };

    if (existingIndex >= 0) {
      userMemory[existingIndex] = example;
    } else {
      userMemory.push(example);
    }

    saveMemory(memory);
  }

  function findBestReply(input, userId = 'default') {
    const normalizedInput = normalizeText(input);

    if (!normalizedInput) {
      return 'I am here to help. Ask me something simple.';
    }

    const userMemory = getUserMemory(userId);
    let bestMatch = null;
    let bestScore = 0;

    for (const example of userMemory) {
      if (!example || !example.output) continue;

      const score = scoreExample(normalizedInput, example.input, example);
      if (score > bestScore) {
        bestScore = score;
        bestMatch = example.output;
      }
    }

    if (bestMatch && bestScore > 2.5) {
      return bestMatch;
    }

    if (
      normalizedInput.includes('what can you do') ||
      normalizedInput.includes('who are you') ||
      normalizedInput.includes('what do you do')
    ) {
      return buildBotDefaultHelp();
    }

    return CHAT_FALLBACK_REPLY;
  }

  function reply(input, userId = 'default') {
    const commandMatch = String(input || '').match(/^teach me:\s*(.+?)\s*\|\s*(.+)$/i);

    if (commandMatch) {
      const [, question, answer] = commandMatch;
      learn(question, answer, userId);
      return `Thanks! I learned: “${question}” → “${answer}”.`;
    }

    if (String(input || '').toLowerCase().includes('what can you do')) {
      return buildBotDefaultHelp();
    }

    return findBestReply(input, userId);
  }

  function train(examples, userId = 'default') {
    if (!Array.isArray(examples)) {
      return;
    }

    for (const [question, answer] of examples) {
      learn(question, answer, userId);
    }
  }

  async function replyWithModel(input, userId, generateReply) {
    const knownReply = reply(input, userId);
    if (knownReply !== CHAT_FALLBACK_REPLY) return knownReply;

    try {
      const generatedReply = await generateReply(input);
      return String(generatedReply || '').trim() || knownReply;
    } catch {
      return knownReply;
    }
  }

  return {
    learn,
    train,
    reply,
    replyWithModel,
    predict: reply,
    memory,
    clear: () => {
      Object.keys(memory).forEach((userKey) => {
        delete memory[userKey];
      });
      saveMemory(memory);
    },
  };
}

module.exports = {
  createLocalChatbot,
  normalizeText,
  tokenize,
  makeNgrams,
  scoreExample,
  buildBotDefaultHelp,
  createEmbedding,
  contextEmbedding,
};
