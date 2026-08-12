import { buildAdvancedCoachPayload, localAdvancedReply } from '../../../lib/advancedCoachEngine';

async function callGroq({ system, user }) {
  const key = String(process.env.GROQ_API_KEY || '').trim();
  if (!key) return null;
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.GROQ_MODEL || 'llama-3.1-8b-instant',
      temperature: 0.4,
      max_tokens: 1200,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  return text ? { text, provider: 'groq' } : null;
}

async function callGemini({ system, user }) {
  const key = String(process.env.GEMINI_API_KEY || '').trim();
  if (!key) return null;
  const model = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: `${system}\n\n${user}` }] }],
        generationConfig: { temperature: 0.4, maxOutputTokens: 1200 },
      }),
    },
  );
  if (!res.ok) return null;
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('\n');
  return text ? { text, provider: 'gemini' } : null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const runRows = Array.isArray(body.runRows) ? body.runRows : [];
    const ask = String(body.ask || '').trim() || 'How was my last run and how can I improve?';
    const tip = body.tip || null;

    const payload = buildAdvancedCoachPayload({ runRows, ask, tip });
    const system = [
      'You are Cosmix Advanced Running Coach — precise, practical, and data-driven.',
      'Use ONLY the athlete JSON context. Do not invent workouts they never did.',
      'If userAsk is about their last run: deeply analyze lastRun vs recentRuns — when to slow down, when pace was OK, HR zones, km-by-km if splits exist.',
      'Cover: morning fuel timed to their typical run hour, speed via 1km splits, HR / fat-burning vs aerobic, what to do on HR spikes, and next session.',
      'Keep answer under 450 words. Use short markdown sections with headings.',
      'No medical diagnosis. If symptoms sound urgent, say stop and seek care.',
    ].join(' ');

    const user = `User question: ${ask}\n\nAthlete context JSON:\n${JSON.stringify(payload.contextForLlm, null, 2)}\n\nStructured local briefing:\n${localAdvancedReply(payload)}`;

    let llm = await callGroq({ system, user });
    if (!llm) llm = await callGemini({ system, user });

    // Always serve structured engine sections (readable cards). LLM reply is optional polish only.
    return res.status(200).json({
      ok: true,
      provider: llm?.provider || 'local',
      headline: payload.headline,
      summary: payload.summary,
      sections: payload.sections,
      reply: llm?.text || localAdvancedReply(payload),
      free: true,
    });
  } catch (error) {
    console.error('advanced coach failed', error);
    return res.status(500).json({ error: 'Advanced coach failed.' });
  }
}
