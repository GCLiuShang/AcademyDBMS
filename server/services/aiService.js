const { chatCompletions } = require('./clients/aiClient');

function normalizeMessages(input) {
  if (Array.isArray(input)) {
    return input
      .filter((m) => m && typeof m === 'object')
      .map((m) => ({
        role: String(m.role || '').trim(),
        content: typeof m.content === 'string' ? m.content : String(m.content || ''),
      }))
      .filter((m) => (m.role === 'system' || m.role === 'user' || m.role === 'assistant') && m.content.trim());
  }
  return [];
}

function makeMessagesFromPrompt({ prompt, system }) {
  const sys = typeof system === 'string' && system.trim() ? system.trim() : 'You are a helpful assistant.';
  const user = typeof prompt === 'string' ? prompt.trim() : '';
  if (!user) return [];
  return [
    { role: 'system', content: sys },
    { role: 'user', content: user },
  ];
}

function pickAssistantContent(upstreamJson) {
  const content = upstreamJson?.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content;
  return '';
}

async function chat({
  prompt,
  system,
  messages,
  model,
  timeoutMs,
  retries,
} = {}) {
  const normalizedMessages = normalizeMessages(messages);
  const finalMessages =
    normalizedMessages.length > 0 ? normalizedMessages : makeMessagesFromPrompt({ prompt, system });

  if (finalMessages.length === 0) {
    const err = new Error('Missing prompt or messages');
    err.code = 'AI_BAD_REQUEST';
    throw err;
  }

  const upstream = await chatCompletions({
    messages: finalMessages,
    model,
    timeoutMs,
    retries,
  });

  const content = pickAssistantContent(upstream.json) || '';
  return {
    content,
    model: upstream.model,
    upstream,
  };
}

module.exports = {
  chat,
};

