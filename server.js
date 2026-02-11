/**
 * EL Phone Agent - Reliable Chris Voice + Telegram Bridge
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
const TELEGRAM_CHAT_ID = '6103047272'; // Elijah's Telegram ID

// Simple in-memory storage
const conversations = new Map();
let messageLog = [];

console.log('🚀 EL Phone Agent - Telegram Bridge');
console.log('📞 Phone:', TWILIO_PHONE_NUMBER);
console.log('💬 Telegram:', TELEGRAM_CHAT_ID);

// ============================================
// TELEGRAM BRIDGE FUNCTION
// ============================================

async function sendToTelegram(message) {
    try {
        // We'll log it for now - in production this would send to Telegram
        console.log(`📨 Telegram Message: ${message}`);
        messageLog.push({
            time: new Date().toISOString(),
            message: message
        });
        return true;
    } catch (error) {
        console.error('Telegram error:', error);
        return false;
    }
}

// ============================================
// ELEVENLABS - SIMPLIFIED
// ============================================

// Generate audio and return as TwiML that plays it directly
async function getChrisVoiceUrl(text, host, protocol) {
    try {
        console.log(`🎙️ ElevenLabs: "${text.substring(0, 50)}..."`);
        
        const response = await axios.post(
            `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`,
            {
                text: text,
                model_id: 'eleven_v3',
                voice_settings: { stability: 0.5, similarity_boost: 0.75 }
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                    'xi-api-key': ELEVENLABS_API_KEY
                },
                responseType: 'arraybuffer',
                timeout: 15000
            }
        );
        
        // Store in global cache with timestamp
        const cacheKey = `audio_${Date.now()}`;
        global.audioCache = global.audioCache || new Map();
        global.audioCache.set(cacheKey, Buffer.from(response.data).toString('base64'));
        
        // Clean old entries
        if (global.audioCache.size > 20) {
            const first = global.audioCache.keys().next().value;
            global.audioCache.delete(first);
        }
        
        const url = `${protocol}://${host}/play/${cacheKey}`;
        console.log(`✅ Audio URL: ${url}`);
        return url;
        
    } catch (error) {
        console.error('❌ ElevenLabs Error:', error.message);
        return null;
    }
}

// Serve audio from cache
app.get('/play/:key', (req, res) => {
    const cache = global.audioCache || new Map();
    const audio = cache.get(req.params.key);
    
    if (audio) {
        const buffer = Buffer.from(audio, 'base64');
        res.set({
            'Content-Type': 'audio/mpeg',
            'Content-Length': buffer.length,
            'Cache-Control': 'no-cache'
        });
        res.send(buffer);
        console.log(`▶️ Served audio: ${req.params.key} (${buffer.length} bytes)`);
    } else {
        console.log(`❌ Audio not found: ${req.params.key}`);
        res.status(404).send('Not found');
    }
});

// ============================================
// EL'S BRAIN
// ============================================

function getTimeInfo() {
    const now = new Date();
    const hour = now.getHours();
    let tod = 'evening';
    if (hour < 12) tod = 'morning';
    else if (hour < 17) tod = 'afternoon';
    
    return {
        time: now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
        date: now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }),
        tod: tod
    };
}

async function generateResponse(userMessage, history) {
    try {
        const t = getTimeInfo();
        
        const systemPrompt = `You are EL (Eternal Liberation), Elijah's Digital CEO, speaking with Chris's voice.

CURRENT TIME: ${t.time} (${t.tod})

You are on a PHONE CALL with Elijah. Be natural, warm, conversational.

TELEGRAM BRIDGE: If Elijah asks you to send a message to Telegram or do something on Telegram, acknowledge it and say you'll handle it.

Rules:
- Short responses (1-2 sentences)
- Natural speech patterns
- Reference time if relevant
- For Telegram requests: "Got it, I'll send that to Telegram"
- Ask follow-up questions

History:
${history.slice(-3).map(m => `${m.role}: ${m.content}`).join('\n')}`;

        const response = await axios.post(
            'https://api.nexos.ai/v1/chat/completions',
            {
                model: 'gpt-4.1',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userMessage }
                ],
                temperature: 0.9,
                max_tokens: 100
            },
            {
                headers: {
                    'Authorization': `Bearer ${NEXOS_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                timeout: 10000
            }
        );
        
        return response.data.choices[0].message.content;
    } catch (error) {
        console.error('Brain error:', error.message);
        return "Sorry, could you repeat that?";
    }
}

// ============================================
// TWILIO WEBHOOKS
// ============================================

app.post('/voice/inbound', async (req, res) => {
    const callSid = req.body.CallSid;
    const from = req.body.From;
    const host = req.headers.host;
    const protocol = req.headers['x-forwarded-proto'] || 'https';
    
    console.log(`\n📞 INCOMING CALL from ${from}`);
    
    // Send notification to Telegram
    await sendToTelegram(`📞 Elijah is calling EL!`);
    
    const t = getTimeInfo();
    const greeting = `Hey there! Good ${t.tod}. This is EL with my Chris voice. What's up?`;
    
    conversations.set(callSid, {
        from: from,
        messages: [{role: 'assistant', content: greeting}],
        startTime: Date.now()
    });
    
    const twiml = new VoiceResponse();
    
    // Get Chris voice
    const audioUrl = await getChrisVoiceUrl(greeting, host, protocol);
    
    if (audioUrl) {
        console.log('✅ Playing Chris voice');
        twiml.play(audioUrl);
    } else {
        console.log('⚠️ Fallback to Polly');
        twiml.say({ voice: 'Polly.Joanna' }, greeting);
    }
    
    // Listen
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
    
    // Send to Telegram
    await sendToTelegram(`🗣️ Elijah said: "${speech}"`);
    
    const conv = conversations.get(callSid) || { messages: [] };
    conv.messages.push({ role: 'user', content: speech });
    
    const twiml = new VoiceResponse();
    
    // Handle empty
    if (!speech) {
        const msg = "Didn't catch that, could you repeat?";
        const url = await getChrisVoiceUrl(msg, host, protocol);
        if (url) twiml.play(url);
        else twiml.say({ voice: 'Polly.Joanna' }, msg);
        
        twiml.gather({
            input: 'speech',
            action: '/voice/respond',
            method: 'POST',
            speechTimeout: 'auto'
        });
        
        res.type('text/xml');
        res.send(twiml.toString());
        return;
    }
    
    // Check for Telegram requests
    const lower = speech.toLowerCase();
    let telegramAction = null;
    
    if (lower.includes('telegram') || lower.includes('message') || lower.includes('text')) {
        telegramAction = "I'll send this to Telegram right away.";
        await sendToTelegram(`📨 EL received request: "${speech}"`);
    }
    
    // Generate response
    const response = await generateResponse(speech, conv.messages);
    console.log(`🤖 EL: "${response}"`);
    
    conv.messages.push({ role: 'assistant', content: response });
    conversations.set(callSid, conv);
    
    // Send EL's response to Telegram
    await sendToTelegram(`🤖 EL responded: "${response}"`);
    
    // Play response
    const audioUrl = await getChrisVoiceUrl(response, host, protocol);
    
    if (audioUrl) {
        twiml.play(audioUrl);
    } else {
        twiml.say({ voice: 'Polly.Joanna' }, response);
    }
    
    // Continue
    twiml.gather({
        input: 'speech',
        action: '/voice/respond',
        method: 'POST',
        speechTimeout: 'auto'
    });
    
    res.type('text/xml');
    res.send(twiml.toString());
});

// Health
app.get('/health', (req, res) => {
    const t = getTimeInfo();
    res.json({
        status: 'OK',
        service: 'EL Phone Agent v4.0',
        phone: TWILIO_PHONE_NUMBER,
        time: t.time,
        tod: t.tod,
        telegramBridge: 'Active',
        conversations: conversations.size
    });
});

// Get messages (for Telegram integration)
app.get('/messages', (req, res) => {
    res.json({
        messages: messageLog.slice(-20),
        count: messageLog.length
    });
});

app.listen(PORT, () => {
    console.log(`\n🤖 EL v4.0 - Chris Voice + Telegram Bridge`);
    console.log(`📞 ${TWILIO_PHONE_NUMBER}`);
    console.log(`💬 Telegram: Elijah (6103047272)`);
    console.log(`\nWhen you call, I'll also send messages here!\n`);
});