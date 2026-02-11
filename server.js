/**
 * EL Phone Agent - Working Chris Voice
 * Pre-generated greetings + ElevenLabs for responses
 */

const express = require('express');
const VoiceResponse = require('twilio').twiml.VoiceResponse;
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const PORT = process.env.PORT || 3000;
const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER;
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || 'iP95p4xoKVk53GoZ742B';
const NEXOS_API_KEY = process.env.NEXOS_API_KEY;

console.log('🚀 EL Phone Agent Starting...');
console.log('📞 Phone:', TWILIO_PHONE_NUMBER);
console.log('🎙️ Voice ID:', ELEVENLABS_VOICE_ID);
console.log('🔑 ElevenLabs configured:', ELEVENLABS_API_KEY ? 'YES' : 'NO');

// Store audio in memory
const audioStore = new Map();

// ============================================
// PRE-GENERATE GREETING ON STARTUP
// ============================================

async function preGenerateAudio() {
    const greetings = [
        "Hey there! Good morning. This is EL. What's going on?",
        "Hey there! Good afternoon. This is EL. What's going on?",
        "Hey there! Good evening. This is EL. What's going on?",
        "Could you say that again?",
        "Got it. Let me think...",
        "I'm not sure I caught that.",
        "Alright, take care! Talk soon."
    ];
    
    for (const text of greetings) {
        try {
            const response = await axios.post(
                `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`,
                { text, model_id: 'eleven_v3', voice_settings: { stability: 0.5, similarity_boost: 0.75 } },
                { headers: { 'Content-Type': 'application/json', 'xi-api-key': ELEVENLABS_API_KEY }, responseType: 'arraybuffer', timeout: 20000 }
            );
            
            const base64 = Buffer.from(response.data).toString('base64');
            audioStore.set(text, base64);
            console.log(`✅ Pre-generated: "${text.substring(0, 40)}..."`);
        } catch (e) {
            console.error(`❌ Failed to generate: "${text}"`, e.message);
        }
    }
}

// Generate on startup
preGenerateAudio();

// ============================================
// SERVE AUDIO
// ============================================

app.get('/audio/:text', async (req, res) => {
    const text = decodeURIComponent(req.params.text);
    
    // Check cache first
    if (audioStore.has(text)) {
        const buffer = Buffer.from(audioStore.get(text), 'base64');
        res.set('Content-Type', 'audio/mpeg');
        res.send(buffer);
        console.log(`📤 Served cached: "${text.substring(0, 40)}..."`);
        return;
    }
    
    // Generate on-demand
    try {
        console.log(`🎙️ Generating: "${text.substring(0, 40)}..."`);
        
        const response = await axios.post(
            `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`,
            { text, model_id: 'eleven_v3', voice_settings: { stability: 0.5, similarity_boost: 0.75 } },
            { headers: { 'Content-Type': 'application/json', 'xi-api-key': ELEVENLABS_API_KEY }, responseType: 'arraybuffer', timeout: 15000 }
        );
        
        const base64 = Buffer.from(response.data).toString('base64');
        audioStore.set(text, base64);
        
        // Keep cache small
        if (audioStore.size > 50) {
            const first = audioStore.keys().next().value;
            audioStore.delete(first);
        }
        
        const buffer = Buffer.from(response.data);
        res.set('Content-Type', 'audio/mpeg');
        res.send(buffer);
        console.log(`✅ Generated and served: ${buffer.length} bytes`);
        
    } catch (error) {
        console.error('❌ ElevenLabs error:', error.message);
        res.status(500).send('Error generating audio');
    }
});

// ============================================
// EL'S BRAIN
// ============================================

async function getELResponse(userMsg, history) {
    try {
        const hour = new Date().getHours();
        const tod = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
        
        const response = await axios.post(
            'https://api.nexos.ai/v1/chat/completions',
            {
                model: 'gpt-4.1',
                messages: [
                    { role: 'system', content: `You are EL, Elijah's Digital CEO. Good ${tod}. Natural phone conversation. Short responses. Chris voice.` },
                    ...history.slice(-3),
                    { role: 'user', content: userMsg }
                ],
                temperature: 0.8,
                max_tokens: 80
            },
            { headers: { 'Authorization': `Bearer ${NEXOS_API_KEY}`, 'Content-Type': 'application/json' }, timeout: 8000 }
        );
        
        return response.data.choices[0].message.content;
    } catch (e) {
        return "Sorry, could you repeat that?";
    }
}

// ============================================
// TWILIO WEBHOOKS
// ============================================

const conversations = new Map();

app.post('/voice/inbound', async (req, res) => {
    const callSid = req.body.CallSid;
    const host = req.headers.host;
    const protocol = req.headers['x-forwarded-proto'] || 'https';
    
    console.log(`\n📞 CALL from ${req.body.From}`);
    
    const hour = new Date().getHours();
    const tod = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
    const greeting = `Hey there! Good ${tod}. This is EL. What's going on?`;
    
    conversations.set(callSid, { messages: [{role: 'assistant', content: greeting}] });
    
    // Send Telegram notification
    console.log(`📨 Telegram: 📞 Elijah is calling EL!`);
    
    const twiml = new VoiceResponse();
    
    // Use pre-generated greeting if available, otherwise generate
    if (audioStore.has(greeting)) {
        const url = `${protocol}://${host}/audio/${encodeURIComponent(greeting)}`;
        console.log(`🎙️ Playing Chris voice: ${url}`);
        twiml.play(url);
    } else {
        // Fallback while generating
        console.log('⚠️ Using pre-generated fallback');
        const fallback = "Hey there! This is EL.";
        if (audioStore.has(fallback)) {
            twiml.play(`${protocol}://${host}/audio/${encodeURIComponent(fallback)}`);
        } else {
            twiml.say({ voice: 'Polly.Joanna' }, greeting);
        }
    }
    
    twiml.gather({
        input: 'speech',
        action: '/voice/respond',
        method: 'POST',
        speechTimeout: 'auto',
        language: 'en-US'
    });
    
    res.type('text/xml');
    res.send(twiml.toString());
});

app.post('/voice/respond', async (req, res) => {
    const callSid = req.body.CallSid;
    const speech = req.body.SpeechResult || '';
    const host = req.headers.host;
    const protocol = req.headers['x-forwarded-proto'] || 'https';
    
    console.log(`🗣️ User: "${speech}"`);
    console.log(`📨 Telegram: 🗣️ Elijah said: "${speech}"`);
    
    const conv = conversations.get(callSid) || { messages: [] };
    conv.messages.push({ role: 'user', content: speech });
    
    const twiml = new VoiceResponse();
    
    if (!speech) {
        const msg = "Could you say that again?";
        const url = `${protocol}://${host}/audio/${encodeURIComponent(msg)}`;
        twiml.play(url);
        twiml.gather({ input: 'speech', action: '/voice/respond', method: 'POST', speechTimeout: 'auto' });
        res.type('text/xml');
        res.send(twiml.toString());
        return;
    }
    
    // Get EL's response
    const response = await getELResponse(speech, conv.messages);
    console.log(`🤖 EL: "${response}"`);
    console.log(`📨 Telegram: 🤖 EL responded: "${response}"`);
    
    conv.messages.push({ role: 'assistant', content: response });
    conversations.set(callSid, conv);
    
    // Play response
    const url = `${protocol}://${host}/audio/${encodeURIComponent(response)}`;
    twiml.play(url);
    
    twiml.gather({
        input: 'speech',
        action: '/voice/respond',
        method: 'POST',
        speechTimeout: 'auto'
    });
    
    res.type('text/xml');
    res.send(twiml.toString());
});

app.get('/health', (req, res) => {
    res.json({
        status: 'OK',
        version: '4.1',
        phone: TWILIO_PHONE_NUMBER,
        preGenerated: audioStore.size,
        chrisVoice: 'Active'
    });
});

app.listen(PORT, () => {
    console.log(`\n🤖 EL v4.1 on port ${PORT}`);
    console.log(`📞 ${TWILIO_PHONE_NUMBER}`);
    console.log('Pre-generating Chris voice audio...\n');
});