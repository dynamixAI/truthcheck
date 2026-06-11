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
    return res.status(500).json({ error: 'API key not configured on server' });
  }

  // Handle both URL parameters or JSON bodies to make sure it never crashes
  let claim, type;
  try {
    const { searchParams } = new URL(req.url, `http://${req.headers.host}`);
    claim = searchParams.get('claim');
    type = searchParams.get('type') || 'text';

    if (!claim && req.body) {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      claim = body.claim;
      type = body.type || 'text';
    }
  } catch (e) {
    return res.status(400).json({ error: 'Invalid request parsing' });
  }

  if (!claim) {
    return res.status(400).json({ error: 'No claim provided' });
  }

  const prompt = `You are TruthCheck, an expert AI fact-checker. A user has submitted the following ${type} content for fact-checking:
"${claim}"

Analyse this claim carefully using your knowledge of reputable sources, scientific consensus, and verified facts.
Respond ONLY with a valid JSON object matching this structure:
{
  "verdict": "TRUE",
  "confidence": 85,
  "headline": "Verdict summary here",
  "summary": "Explanation sentences here.",
  "sources": [{"name": "Source", "reliability": "High", "note": "Note here"}],
  "tip": "Tip here"
}`;

  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 1024, responseMimeType: "application/json" }
        })
      }
    );

    if (geminiRes.status === 429) return res.status(429).json({ error: 'limit_reached' });
    if (!geminiRes.ok) return res.status(500).json({ error: 'gemini_error' });

    const data = await geminiRes.json();
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    return res.status(200).json(JSON.parse(rawText.trim()));
  } catch (e) {
    return res.status(500).json({ error: 'server_error', detail: e.message });
  }
}
