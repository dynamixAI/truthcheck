```js
export const config = {
  api: {
    bodyParser: true,
  },
};

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
    return res.status(500).json({
      error: 'API key not configured'
    });
  }

  let claim;
  let type;

  try {
    const body =
      typeof req.body === 'string'
        ? JSON.parse(req.body)
        : req.body;

    claim = body.claim;
    type = body.type || 'text';
  } catch (e) {
    return res.status(400).json({
      error: 'Invalid request body'
    });
  }

  if (!claim) {
    return res.status(400).json({
      error: 'No claim provided'
    });
  }

  const prompt = `You are TruthCheck, an expert AI fact-checker.

A user has submitted the following ${type} content:

"${claim}"

Analyse the claim carefully.

Respond ONLY with valid JSON in exactly this format:

{
  "verdict": "TRUE",
  "confidence": 85,
  "headline": "Short summary",
  "summary": "2-3 sentence explanation.",
  "sources": [
    {
      "name": "Source name",
      "reliability": "High",
      "note": "One sentence note"
    }
  ],
  "tip": "One practical sentence."
}

Allowed verdicts:
TRUE
FALSE
MISLEADING
UNVERIFIED`;

  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: prompt,
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 1024,
            responseMimeType: 'application/json',
          },
        }),
      }
    );

    if (geminiRes.status === 429) {
      return res.status(429).json({
        error: 'limit_reached',
      });
    }

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();

      return res.status(500).json({
        error: 'gemini_error',
        detail: errText,
      });
    }

    const data = await geminiRes.json();

    const raw =
      data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!raw) {
      return res.status(500).json({
        error: 'no_response_from_gemini',
        detail: data,
      });
    }

    try {
      const parsed = JSON.parse(raw);

      return res.status(200).json(parsed);
    } catch (parseError) {
      return res.status(500).json({
        error: 'invalid_json_from_gemini',
        raw,
        detail: parseError.message,
      });
    }
  } catch (e) {
    return res.status(500).json({
      error: 'server_error',
      detail: e.message,
    });
  }
}
```
