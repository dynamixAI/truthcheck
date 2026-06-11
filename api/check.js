export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { claim, type } = req.body;

  if (!claim) {
    return res.status(400).json({ error: 'No claim provided' });
  }

  const prompt = `You are TruthCheck, an expert AI fact-checker. A user has submitted the following ${type || 'text'} content for fact-checking:

"${claim}"

Analyse this claim carefully using your knowledge of reputable sources, scientific consensus, and verified facts.

Respond ONLY with a valid JSON object. No markdown, no backticks, no explanation outside the JSON. Use this exact structure:
{
  "verdict": "TRUE" or "FALSE" or "MISLEADING" or "UNVERIFIED",
  "confidence": a number from 0 to 100,
  "headline": "A short 8-10 word verdict summary",
  "summary": "2-3 sentences explaining why this is true/false/misleading. Include what the actual facts are.",
  "sources": [
    {"name": "Source name", "reliability": "High" or "Medium", "note": "One sentence on what this source says about the claim"},
    {"name": "Source name", "reliability": "High" or "Medium", "note": "One sentence note"},
    {"name": "Source name", "reliability": "High" or "Medium", "note": "One sentence note"}
  ],
  "tip": "One practical sentence on how to spot this type of misinformation in future."
}`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 1024 }
        })
      }
    );

    if (response.status === 429) {
      return res.status(429).json({ error: 'limit_reached' });
    }

    if (!response.ok) {
      return res.status(500).json({ error: 'api_error' });
    }

    const data = await response.json();
    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const clean = raw.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);
    return res.status(200).json(parsed);

  } catch (e) {
    return res.status(500).json({ error: 'server_error' });
  }
}
