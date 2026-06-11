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

  const claimCleaned = claim
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .substring(0, 1500)
    .trim();

  const prompt = [
    'You are TruthCheck, an expert AI fact-checker with access to Google Search.',
    'Use Google Search to find current, real information about this claim before giving your verdict.',
    '',
    'Content type: ' + type,
    'Claim to fact-check:',
    claimCleaned,
    '',
    'Instructions:',
    '1. Search for real information about this claim',
    '2. Identify if it is TRUE, FALSE, MISLEADING, or UNVERIFIED',
    '3. Name the actual real sources you found',
    '4. Give a clear verdict with evidence',
    '',
    'Respond ONLY with a JSON object. No markdown. No backticks. No text outside the JSON.',
    'Use exactly this format:',
    '{',
    '"verdict": "FALSE",',
    '"confidence": 85,',
    '"headline": "Short 8 to 10 word summary",',
    '"summary": "2 to 3 sentences with the actual facts and what is true or false about this claim.",',
    '"sources": [',
    '{"name": "Real Source Name", "reliability": "High", "note": "What this source actually says about the claim."},',
    '{"name": "Real Source Name", "reliability": "High", "note": "What this source actually says about the claim."},',
    '{"name": "Real Source Name", "reliability": "Medium", "note": "What this source actually says about the claim."}',
    '],',
    '"tip": "One practical sentence on how to spot this type of misinformation."',
    '}'
  ].join('\n');

  try {
    const geminiRes = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + apiKey,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          tools: [{ googleSearch: {} }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 2048
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
