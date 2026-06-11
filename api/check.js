export const config = {
  runtime: 'edge', 
};

export default async function handler(req) {
  // 1. Handle CORS Preflight Options Request
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  // 2. Read parameters directly from the URL (safest way for Vercel Edge)
  const { searchParams } = new URL(req.url);
  const claim = searchParams.get('claim');
  const type = searchParams.get('type') || 'text';

  if (!claim) {
    return new Response(JSON.stringify({ error: 'No claim provided' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

  // 3. Grab the environment variable safely
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'API key not configured on server' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

  try {
    // 4. Construct the prompt
    const prompt = `You are TruthCheck, an expert AI fact-checker. A user has submitted the following ${type} content for fact-checking:

"${claim}"

Analyse this claim carefully using your knowledge of reputable sources, scientific consensus, and verified facts.

Respond ONLY with a valid JSON object. No markdown, no backticks, no conversational text outside the JSON structure.
Use this exact JSON structure:
{
  "verdict": "TRUE" or "FALSE" or "MISLEADING" or "UNVERIFIED",
  "confidence": 85,
  "headline": "A short verdict summary",
  "summary": "2-3 sentences explaining why this is true/false/misleading.",
  "sources": [
    {"name": "Source name", "reliability": "High", "note": "One sentence note"}
  ],
  "tip": "One practical sentence on how to spot this misinformation."
}`;

    // 5. Contact Gemini
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { 
            temperature: 0.1, 
            maxOutputTokens: 1024,
            responseMimeType: "application/json" 
          }
        })
      }
    );

    if (geminiRes.status === 429) {
      return new Response(JSON.stringify({ error: 'limit_reached' }), {
        status: 429,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      return new Response(JSON.stringify({ error: 'gemini_error', detail: errText }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

    const data = await geminiRes.json();
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const parsedJson = JSON.parse(rawText.trim());

    return new Response(JSON.stringify(parsedJson), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });

  } catch (e) {
    return new Response(JSON.stringify({ error: 'server_error', detail: e.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }
}
