const { chatCompletions } = require('./clients/aiClient');

function makeGlobalSystemPrompt(userRole) {
  const role = typeof userRole === 'string' && userRole.trim() ? userRole.trim() : '用户';
  return `你是武汉理工大学教务系统的人工智能助手，负责指导用户使用该系统。对其他无关问题请明确拒绝回答。\n现在你服务的对象是一名${role}。`;
}

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
  const user = typeof prompt === 'string' ? prompt.trim() : '';
  if (!user) return [];
  const sys = typeof system === 'string' && system.trim() ? system.trim() : '';
  return [...(sys ? [{ role: 'system', content: sys }] : []), { role: 'user', content: user }];
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
  userRole,
  model,
  timeoutMs,
  retries,
} = {}) {
  const normalizedMessages = normalizeMessages(messages);
  const coreMessages =
    normalizedMessages.length > 0 ? normalizedMessages : makeMessagesFromPrompt({ prompt, system });
  const finalMessages = [{ role: 'system', content: makeGlobalSystemPrompt(userRole) }, ...coreMessages];

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

