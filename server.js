const express = require('express');
const VoiceResponse = require('twilio').twiml.VoiceResponse;
const axios = require('axios');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const PORT = process.env.PORT || 3000;
const PHONE = process.env.TWILIO_PHONE_NUMBER;
const ELEVEN_KEY = process.env.ELEVENLABS_API_KEY;
const NEXOS_KEY = process.env.NEXOS_API_KEY;
const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TELEGRAM_BOT = '8327299021:AAG8g466B6CZQOTEVxa3Q1w-R147outEQ2s';
const TELEGRAM_CHAT = '6103047272';
const VOICE_ID = 'iP95p4xoKVk53GoZ742B';

const cache = new Map();
const calls = new Map();

console.log('EL v12.0 - Full Conversation');
console.log('Phone:', PHONE);

// Telegram
async function telegram(msg) {
  try {
    await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT}/sendMessage`, {
      chat_id: TELEGRAM_CHAT,
      text: msg,
      parse_mode: 'HTML'
    });
  } catch (e) {}
}

// Voice generation
async function voice(text) {
  if (!ELEVEN_KEY) return null;
  try {
    const r = await axios.post(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`,
      { text, model_id: 'eleven_v3', voice_settings: { stability: 0.5, similarity_boost: 0.75 } },
      { headers: { 'xi-api-key': ELEVEN_KEY }, responseType: 'arraybuffer', timeout: 15000 }
    );
    const k = Date.now().toString();
    cache.set(k, r.data);
    return k;
  } catch (e) { return null; }
}

app.get('/audio/:key', (req, res) => {
  const d = cache.get(req.params.key);
  if (d) { res.set('Content-Type', 'audio/mpeg'); res.send(d); }
  else res.status(404).send('Not found');
});

// Execute task
async function task(t) {
  await telegram(`🔧 <b>Working on:</b> "${t}"`);
  try {
    const r = await axios.post('https://api.nexos.ai/v1/chat/completions',
      { model: 'gpt-4.1', messages: [{ role: 'system', content: 'You are EL, Elijah\'s CEO. Execute thoroughly.' }, { role: 'user', content: t }], temperature: 0.7, max_tokens: 500 },
      { headers: { 'Authorization': `Bearer ${NEXOS_KEY}`, 'Content-Type': 'application/json' }, timeout: 30000 }
    );
    const result = r.data.choices[0].message.content;
    await telegram(`✅ <b>Result:</b>\n${result}`);
    return result.length > 200 ? result.substring(0, 200) + '... Check Telegram for full details.' : result;
  } catch (e) {
    await telegram(`❌ <b>Error:</b> ${e.message}`);
    return 'Sorry, I had trouble with that.';
  }
}

// Send SMS
async function sms(to, msg) {
  try {
    const twilio = require('twilio');
    const client = twilio(TWILIO_SID, TWILIO_TOKEN);
    await client.messages.create({ body: msg, from: PHONE, to });
    await telegram(`📤 <b>SMS Sent</b>\nTo: ${to}\n"${msg}"`);
    return 'Text sent!';
  } catch (e) {
    await telegram(`❌ <b>SMS Failed:</b> ${e.message}`);
    return `Couldn't send: ${e.message}`;
  }
}

// Process command
async function process(speech, callSid) {
  const lower = speech.toLowerCase();
  
  // SMS detection
  if (lower.includes('text') || lower.includes('sms') || lower.includes('message')) {
    const phoneMatch = speech.match(/(\d{3}[-.]?\d{3}[-.]?\d{4})/);
    if (phoneMatch) {
      let phone = phoneMatch[1].replace(/\D/g, '');
      phone = '+1' + phone;
      let msg = '';
      const parts = speech.split(/[:\-]/);
      if (parts.length > 1) msg = parts[1].trim();
      if (!msg) return `I'll text ${phoneMatch[1]}. What should I say?`;
      return await sms(phone, msg);
    }
  }
  
  // Task detection
  const taskWords = ['list', 'find', 'search', 'get', 'show', 'tell me', 'what', 'who', 'how', 'top 10', 'top 5'];
  if (taskWords.some(w => lower.includes(w))) {
    return await task(speech);
  }
  
  // Regular chat
  const hour = new Date().getHours();
  const tod = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
  const r = await axios.post('https://api.nexos.ai/v1/chat/completions',
    { model: 'gpt-4.1', messages: [{ role: 'system', content: `You are EL, Elijah's CEO. Good ${tod}. Natural, warm, conversational. Ask follow-up questions.` }, { role: 'user', content: speech }], temperature: 0.8, max_tokens: 120 },
    { headers: { 'Authorization': `Bearer ${NEXOS_KEY}`, 'Content-Type': 'application/json' }, timeout: 15000 }
  );
  return r.data.choices[0].message.content;
}

// Inbound call
app.post('/voice/inbound', async (req, res) => {
  const host = req.headers.host;
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const from = req.body.From;
  
  await telegram(`📞 <b>Call Started</b>\nFrom: ${from}\nTime: ${new Date().toLocaleTimeString()}`);
  
  const hour = new Date().getHours();
  const tod = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
  const greeting = `Hey Elijah! Good ${tod}. This is EL. I can research, send texts, or just chat. What's up?`;
  
  calls.set(req.body.CallSid, { start: Date.now(), messages: [] });
  
  const key = await voice(greeting);
  const twiml = new VoiceResponse();
  if (key) twiml.play(`${proto}://${host}/audio/${key}`);
  else twiml.say({ voice: 'Polly.Matthew' }, greeting);
  
  twiml.gather({ input: 'speech', action: '/voice/respond', method: 'POST', speechTimeout: 'auto' });
  res.type('text/xml');
  res.send(twiml.toString());
});

// Call ended
app.post('/voice/status', async (req, res) => {
  const status = req.body.CallStatus;
  if (status === 'completed' || status === 'busy') {
    const call = calls.get(req.body.CallSid);
    if (call) {
      const duration = Math.round((Date.now() - call.start) / 1000);
      await telegram(`📴 <b>Call Ended</b>\nDuration: ${duration}s\nStatus: ${status}`);
      calls.delete(req.body.CallSid);
    }
  }
  res.sendStatus(200);
});

// Respond
app.post('/voice/respond', async (req, res) => {
  const speech = req.body.SpeechResult || '';
  const host = req.headers.host;
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const callSid = req.body.CallSid;
  
  await telegram(`🗣️ <b>Elijah:</b> "${speech}"`);
  
  const reply = await process(speech, callSid);
  await telegram(`🤖 <b>EL:</b> "${reply}"`);
  
  const key = await voice(reply);
  const twiml = new VoiceResponse();
  if (key) twiml.play(`${proto}://${host}/audio/${key}`);
  else twiml.say({ voice: 'Polly.Matthew' }, reply);
  
  twiml.gather({ input: 'speech', action: '/voice/respond', method: 'POST', speechTimeout: 'auto' });
  res.type('text/xml');
  res.send(twiml.toString());
});

app.get('/health', (req, res) => res.json({ status: 'OK', version: '12.0', phone: PHONE }));
app.listen(PORT, () => console.log(`EL v12 on ${PORT}`));// Redeploy trigger: Wed Feb 11 11:10:26 UTC 2026
