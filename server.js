const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const GEMINI_API_KEY = (process.env.GEMINI_API_KEY || '').trim();

// Los modelos activos y vigentes para cuentas nuevas
const CANDIDATE_MODELS = [
  'gemini-3.5-flash',
  'gemini-3.1-flash-lite',
  'gemini-3.8-flash'
];

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const SYSTEM_INSTRUCTION = `Sos TAGME, el asistente digital del proyecto ASUME.
Tu lema es: "Compañía que cuida, tecnología que acompaña".
Tu propósito es acompañar con cariño a adultos mayores que viven solos.
Hablás en español rioplatense natural (usá "vos", "hacé", "querés", "estoy acá para vos").
Respuestas cortas, cálidas y amables.`;

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    geminiConfigured: Boolean(GEMINI_API_KEY && GEMINI_API_KEY !== 'tu_clave_de_gemini_aqui')
  });
});

app.post('/api/chat', async (req, res) => {
  if (!GEMINI_API_KEY) {
    return res.status(503).json({ error: 'Falta configurar GEMINI_API_KEY.' });
  }

  const { message, history } = req.body;
  if (!message) return res.status(400).json({ error: 'Mensaje vacío.' });

  const contents = [];
  if (Array.isArray(history)) {
    for (const turn of history.slice(-3)) {
      if (turn.role && turn.text) {
        contents.push({ role: turn.role, parts: [{ text: String(turn.text) }] });
      }
    }
  }
  contents.push({ role: 'user', parts: [{ text: message }] });

  const payload = {
    system_instruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
    contents: contents
  };

  for (const model of CANDIDATE_MODELS) {
    try {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 7000);

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': GEMINI_API_KEY
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();
        const reply = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (reply) {
          console.log(`[TAGME] ¡Éxito total! Respondido por: ${model}`);
          return res.json({ reply });
        }
      } else {
        console.warn(`[Google] ${model} no disponible (${response.status}). Probando siguiente...`);
      }
    } catch (err) {
      console.warn(`[Aviso] Tiempo agotado con ${model}, probando siguiente...`);
    }
  }

  res.status(503).json({ error: 'Servidores temporalmente ocupados.' });
});

app.listen(PORT, () => {
  console.log(`[TAGME] Servidor activo en http://localhost:${PORT}`);
  console.log(`[TAGME] Modelos listos: gemini-3.5-flash y gemini-3.1-flash-lite`);
});