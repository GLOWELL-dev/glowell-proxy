export const config = {
  api: {
    bodyParser: true
  }
};

const SHEETS_URL = 'https://script.google.com/macros/s/AKfycbwWMSOLPYmoHBlckXiB8I58maqBqoWgcwDLIkwDOtFtr-qYDsLv2IMApEchVj9z5fmn/exec';

async function logToSheets(pregunta, respuesta, url) {
  try {
    const now = new Date();
    const fecha = now.toLocaleDateString('es-CO', { timeZone: 'America/Bogota' });
    const hora = now.toLocaleTimeString('es-CO', { timeZone: 'America/Bogota' });
    await fetch(SHEETS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fecha, hora, pregunta, respuesta, url: url || '' })
    });
  } catch (err) {
    console.error('Sheets log error:', err.message);
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'API key not configured' });
    return;
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch(e) {}
  }

  // Extraer pageUrl y eliminarlo antes de enviar a Anthropic
  const pageUrl = body.pageUrl || '';
  const { pageUrl: _, ...anthropicBody } = body;

  // Obtener última pregunta del usuario para el log
  const messages = anthropicBody.messages || [];
  const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
  const pregunta = lastUserMsg ? lastUserMsg.content : '';

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(anthropicBody)
    });

    const text = await response.text();
    let data;
    try { data = JSON.parse(text); } catch(e) { data = { raw: text }; }

    const respuesta = data.content && data.content[0] ? data.content[0].text : '';

    // Guardar en Sheets de forma asíncrona sin bloquear la respuesta
    if (pregunta && respuesta) {
      logToSheets(pregunta, respuesta, pageUrl);
    }

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(response.status).json(data);
  } catch (err) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(500).json({ error: err.message });
  }
}
