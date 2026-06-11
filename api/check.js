export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  let claim, type;

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    claim = body.claim;
    type = body.type || 'text';
  } catch (e) {
    return res.status(400).json({ error: 'Invalid request body' });
  }

  if (!claim) {
    return res.status(400).json({ error: 'No claim provided' });
  }

  const prompt = "You are TruthCheck, an expert AI fact-checker. A user has submitted the following " + type + " content for fact-checking: \"" + claim + "\". Analyse this claim carefully. Respond ONLY with a valid JSON object, no markdown, no backticks, no extra text before or after. Use this exact structure: {\"verdict\": \"TRUE or FALSE or MISLEADING or UNVERIFIED\", \"confidence\": 85, \"headline\": \"Short 8-10 word summary\", \"summary\": \"2-3 sentences explaining the verdict and actual facts.\", \"sources\": [{\"name\": \"Source name\", \"reliability\": \"High\", \"note\": \"One sentence note\"}, {\"name\": \"Source name\", \"reliability\": \"Medium\", \"note\": \"One sentence note\"}, {\"name\": \"Source name\", \"reliability\": \"High\", \"note\": \"One sentence note\"}], \"tip\": \"One practical sentence on spotting this misinformation.\"}";

  try {
    const geminiRes = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + apiKey,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 2048,
            responseMimeType: 'application/json'
          }
        })
      }
    );

    if (geminiRes.status === 429) {
      return res.status(429).json({ error: 'limit_reached' });
    }

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      return res.status(500).json({ error: 'gemini_error', detail: errText });
    }

    const data = await geminiRes.json();

    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!raw) {
      return res.status(500).json({ error: 'no_response', detail: JSON.stringify(data) });
    }

    const clean = raw
      .replace(/```json/gi, '')
      .replace(/```/g, '')
      .replace(/[\u0000-\u001F\u007F]/g, ' ')
      .trim();

    const firstBrace = clean.indexOf('{');
    const lastBrace = clean.lastIndexOf('}');

    if (firstBrace === -1 || lastBrace === -1) {
      return res.status(500).json({ error: 'no_json_found', raw: clean });
    }

    const jsonOnly = clean.substring(firstBrace, lastBrace + 1);
    const parsed = JSON.parse(jsonOnly);
    return res.status(200).json(parsed);

  } catch (e) {
    return res.status(500).json({ error: 'server_error', detail: e.message });
  }
}
