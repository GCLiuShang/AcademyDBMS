const express = require('express');
const { chat } = require('../services/aiService');
const { requireAuth } = require('../services/sessionService');

const router = express.Router();

router.use(requireAuth);

router.post('/ai/chat', async (req, res) => {
  const {
    prompt,
    system,
    messages,
    userRole,
    urole,
    model,
    timeoutMs,
    retries,
    includeRaw,
  } = req.body || {};

  try {
    const result = await chat({
      prompt,
      system,
      messages,
      userRole: userRole || urole,
      model,
      timeoutMs,
      retries,
    });

    const data = { content: result.content, model: result.model };
    if (includeRaw === true) data.raw = result.upstream?.json || result.upstream?.text || null;

    return res.json({ success: true, data });
  } catch (error) {
    const code = error && error.code ? String(error.code) : '';
    if (code === 'AI_BAD_REQUEST' || code === 'AI_INVALID_MESSAGES') {
      return res.status(400).json({ success: false, message: error.message || 'Invalid request' });
    }
    if (code === 'AI_MISSING_ENV') {
      return res.status(500).json({ success: false, message: 'AI config missing' });
    }
    if (code === 'ETIMEDOUT') {
      return res.status(504).json({ success: false, message: 'AI request timeout' });
    }
    if (code === 'AI_UPSTREAM_ERROR') {
      return res.status(502).json({ success: false, message: 'AI upstream error' });
    }

    console.error('Error in /ai/chat:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

module.exports = router;

