const express = require('express');
const VoiceResponse = require('twilio').twiml.VoiceResponse;
const axios = require('axios');
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const PORT = process.env.PORT || 3000;
const PHONE = process.env.TWILIO_PHONE_NUMBER;
const ELEVEN_KEY = process.env.ELEVENLABS_API_KEY;
const VOICE_ID = 'iP95p4xoKVk53GoZ742B';
const cache = new Map();

console.log('EL v11 Starting...');
console.log('Phone:', PHONE);
console.log('ElevenLabs:', ELEVEN_KEY ? 'YES' : 'NO');

async function getVoice(text) {
  if (!ELEVEN_KEY) return null;
  try {
    const r = await axios.post(
      `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`,
      { text, model_id: 'eleven_v3', voice_settings: { stability: 0.5, similarity_boost: 0.75 } },
      { headers: { 'xi-api-key': ELEVEN_KEY }, responseType: 'arraybuffer', timeout: 15000 }
    );
    const k = Date.now().toString();
    cache.set(k, r.data);
    return k;
  } catch (e) {
    console.error('Voice error:', e.message);
    return null;
  }
}

app.get('/audio/:key', (req, res) => {
  const d = cache.get(req.params.key);
  if (d) { res.set('Content-Type', 'audio/mpeg'); res.send(d); }
  else res.status(404).send('Not found');
});

app.post('/voice/inbound', async (req, res) => {
  const host = req.headers.host;
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const msg = "Hey Elijah! This is EL with Chris voice. What's up?";
  const key = await getVoice(msg);
  const twiml = new VoiceResponse();
  if (key) twiml.play(`${proto}://${host}/audio/${key}`);
  else twiml.say({ voice: 'Polly.Matthew' }, msg);
  twiml.gather({ input: 'speech', action: '/voice/respond', method: 'POST', speechTimeout: 'auto' });
  res.type('text/xml');
  res.send(twiml.toString());
});

app.post('/voice/respond', async (req, res) => {
  const speech = req.body.SpeechResult || '';
  const host = req.headers.host;
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const reply = speech ? `You said: ${speech}` : "Didn't catch that";
  const key = await getVoice(reply);
  const twiml = new VoiceResponse();
  if (key) twiml.play(`${proto}://${host}/audio/${key}`);
  else twiml.say({ voice: 'Polly.Matthew' }, reply);
  twiml.gather({ input: 'speech', action: '/voice/respond', method: 'POST', speechTimeout: 'auto' });
  res.type('text/xml');
  res.send(twiml.toString());
});

app.get('/health', (req, res) => res.json({ status: 'OK', version: '11', phone: PHONE, key: ELEVEN_KEY ? 'YES' : 'NO' }));
app.listen(PORT, () => console.log(`EL v11 on ${PORT}`));