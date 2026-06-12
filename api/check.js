export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'no api key' });
  }

  let claim, type;
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    claim = body.claim;
    type = body.type || 'text';
  } catch (e) {
    return res.status(400).json({ error: 'bad body' });
  }

  const claimCleaned = claim
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .substring(0, 800)
    .trim();

  try {
    const geminiRes = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + apiKey,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: 'Fact check this in one sentence: ' + claimCleaned }] }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 200
          }
        })
      }
    );

    const data = await geminiRes.json();
    return res.status(200).json({ status: geminiRes.status, data: data });

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
