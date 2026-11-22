const MODEL_CANDIDATES = [
  'gemini-3.5-flash-lite',
  'gemini-3.8-flash',
  'gemini-flash-latest',
];

export default async function handler(req, res) {
  // Allow both the Vercel web app and the Capacitor Android WebView
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const apiKey = (process.env.GEMINI_API_KEY || '').trim();

  // Safe health check (never exposes the key)
  if (req.method === 'GET') {
    return res.status(200).json({
      configured: apiKey.length >= 15,
      model: MODEL_CANDIDATES[0],
    });
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', ['GET', 'POST', 'OPTIONS']);
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  if (!apiKey) {
    return res.status(503).json({
      error: 'Cloud vision not configured on server.',
      configured: false,
    });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const { imageBase64, mimeType = 'image/jpeg', prompt } = body;

    if (!imageBase64 || typeof imageBase64 !== 'string' || !prompt || typeof prompt !== 'string') {
      return res.status(400).json({ error: 'Missing imageBase64 or prompt.' });
    }

    // Basic size guard (~2.5 MB base64 max)
    if (imageBase64.length > 3_500_000) {
      return res.status(413).json({ error: 'Image payload too large.' });
    }

    let lastStatus = 502;
    let lastDetail = '';

    for (const model of MODEL_CANDIDATES) {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
      const upstream = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [
                {
                  inlineData: {
                    mimeType,
                    data: imageBase64,
                  },
                },
                { text: prompt },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 260,
          },
        }),
      });

      if (!upstream.ok) {
        lastStatus = upstream.status;
        lastDetail = (await upstream.text().catch(() => '')).slice(0, 180);
        // Only try next candidate if model not found or unavailable
        if (upstream.status === 404 || upstream.status === 503) {
          continue;
        }
        return res.status(upstream.status).json({
          error: `Upstream Gemini error (${upstream.status})`,
          detail: lastDetail,
        });
      }

      const payload = await upstream.json();
      const text =
        payload?.candidates?.[0]?.content?.parts
          ?.map((p) => p.text || '')
          .join(' ')
          .trim() || '';

      if (text) {
        return res.status(200).json({ text, model });
      }
    }

    return res.status(lastStatus).json({
      error: 'No Gemini vision model succeeded.',
      detail: lastDetail,
    });
  } catch (err) {
    return res.status(500).json({
      error: 'Internal proxy error',
      detail: err instanceof Error ? err.message : 'Unknown error',
    });
  }
}
