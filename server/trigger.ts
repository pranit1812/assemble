// Wake a Grok bot the moment the backend has a job for it, instead of waiting for someone to message it.
// Set BOT_TRIGGER_URL (or BOT_TRIGGER_URL_VISION / _BRIEF / _RECIPE for one bot each) to the bot's
// webhook or routine trigger. Fire-and-forget: the website never waits on a bot.
export function triggerBot(event: 'vision' | 'brief' | 'recipe', text: string, data: Record<string, unknown> = {}) {
  const url = process.env[`BOT_TRIGGER_URL_${event.toUpperCase()}`] || process.env.BOT_TRIGGER_URL;
  if (!url) return;
  const token = process.env.BOT_TRIGGER_TOKEN;
  fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ event, text, message: text, ...data }),
    signal: AbortSignal.timeout(5000),
  }).catch((e) => console.warn('[trigger]', event, e?.message));
}
