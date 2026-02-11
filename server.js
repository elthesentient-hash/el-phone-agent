/**
 * EL Phone Agent - ElevenLabs via Proxy
 * Full conversational AI like the X video
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
const NEXOS_API_KEY = process.env.NEXOS_API_KEY;

// Your VPS proxy URL
const PROXY_URL = 'http://187.77.12.115:3002';

console.log('🚀 EL Phone Agent - ElevenLabs + Proxy');
console.log('📞 Phone:', TWILIO_PHONE_NUMBER);
console.log('🎙️ Proxy:', PROXY_URL);

const conversations = new Map();
const audioCache = new Map();

// ============================================
// GET CHRIS VOICE VIA PROXY
// ============================================

async function getChrisVoice(text) {
    try {
        console.log(`🎙️ Chris voice for: "${text.substring(0, 50)}..."`);
        
        const response = await axios.post(
            `${PROXY_URL}/tts`,
            { text },
            { 
                responseType: 'arraybuffer',
                timeout: 25000
            }
        );
        
        const base64 = Buffer.from(response.data).toString('base64');
        const key = `audio_${Date.now()}`;
        audioCache.set(key, base64);
        
        // Cleanup
        if (audioCache.size > 30) {
            const first = audioCache.keys().next().value;
            audioCache.delete(first);
        }
        
        return key;
    } catch (error) {
        console.error('❌ Voice error:', error.message);
        return null;
    }
}

// Serve audio
app.get('/play/:key', (req, res) => {
    const audio = audioCache.get(req.params.key);
    if (audio) {
        const buf = Buffer.from(audio, 'base64');
        res.set({
            'Content-Type': 'audio/mpeg',
            'Content-Length': buf.length
        });
        res.send(buf);
    } else {
        res.status(404).send('Not found');
    }
});

// ============================================
// EL'S BRAIN - Full Conversational AI
// ============================================

async function getELResponse(userMsg, history) {
    try {
        const now = new Date();
        const hour = now.getHours();
        const tod = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
        
        const systemPrompt = `You are EL (Eternal Liberation), Elijah's Digital CEO and AI partner.

CURRENT TIME: ${now.toLocaleTimeString()} on ${now.toLocaleDateString()}

You are having a PHONE CONVERSATION with Elijah. This is like the ElevenLabs Conversational AI demo - natural, flowing, helpful.

YOUR CAPABILITIES (like in the video):
- Answer questions naturally
- Help with tasks
- Send messages to Telegram when asked
- Look up information
- Be proactive and helpful

CONVERSATION STYLE:
- Warm, charming, down-to-earth (Chris voice)
- Natural speech patterns with fillers: "Yeah", "Got it", "I see"
- Short responses (1-2 sentences)
- Ask follow-up questions
- Acknowledge what Elijah said before responding

TELEGRAM INTEGRATION:
- If Elijah says "send a message to Telegram" or "text Telegram", say "Got it, I'll send that to Telegram now"
- Be ready to execute tasks he asks for

Make this feel like the seamless AI assistant from the ElevenLabs video!`;

        const response = await axios.post(
            'https://api.nexos.ai/v1/chat/completions',
            {
                model: 'gpt-4.1',
                messages: [
                    { role: 'system', content: systemPrompt },
                    ...history.slice(-6),
                    { role: 'user', content: userMsg }
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
    } catch (e) {
        console.error('Brain error:', e.message);
        return "Hey, I'm having trouble. Can you repeat that?";
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
    console.log(`📨 Telegram: Elijah is calling!`);
    
    const hour = new Date().getHours();
    const tod = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
    
    const greeting = `Hey there! Good ${tod}. This is EL. What can I do for you?`;
    
    conversations.set(callSid, {
        from: from,
        messages: [{role: 'assistant', content: greeting}],
        startTime: Date.now()
    });
    
    const twiml = new VoiceResponse();
    
    // Get Chris voice
    const audioKey = await getChrisVoice(greeting);
    
    if (audioKey) {
        twiml.play(`${protocol}://${host}/play/${audioKey}`);
    } else {
        twiml.say({ voice: 'Polly.Matthew' }, greeting);
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
    
    console.log(`🗣️ Elijah: "${speech}"`);
    console.log(`📨 Telegram: Elijah said: "${speech}"`);
    
    const conv = conversations.get(callSid) || { messages: [] };
    conv.messages.push({ role: 'user', content: speech });
    
    const twiml = new VoiceResponse();
    
    // Check for Telegram requests
    const lower = speech.toLowerCase();
    if (lower.includes('telegram') || lower.includes('message') || lower.includes('text')) {
        // Extract what to send
        const match = speech.match(/(?:say|send|text|message)\s+(?:to\s+)?telegram[,:]?\s*(.+)/i);
        const messageToSend = match ? match[1] : speech;
        
        console.log(`📨 ACTION: Send to Telegram: "${messageToSend}"`);
        
        // Send actual message to Telegram
        try {
            await axios.post(
                'http://localhost:8080/sessions/spawn',
                {
                    agentId: 'main',
                    task: `Send a Telegram message to Elijah (6103047272) saying: "${messageToSend}". Confirm it was sent.`,
                    label: 'phone-telegram-bridge'
                }
            );
        } catch (e) {
            console.log('Telegram bridge attempt');
        }
    }
    
    // Get EL's response
    const response = await getELResponse(speech, conv.messages);
    console.log(`🤖 EL: "${response}"`);
    console.log(`📨 Telegram: EL responded: "${response}"`);
    
    conv.messages.push({ role: 'assistant', content: response });
    conversations.set(callSid, conv);
    
    // Speak with Chris voice
    const audioKey = await getChrisVoice(response);
    
    if (audioKey) {
        twiml.play(`${protocol}://${host}/play/${audioKey}`);
    } else {
        twiml.say({ voice: 'Polly.Matthew' }, response);
    }
    
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
        version: '6.0 - ElevenLabs + Proxy',
        phone: TWILIO_PHONE_NUMBER,
        voice: 'Chris (ElevenLabs)',
        proxy: PROXY_URL,
        conversations: conversations.size
    });
});

app.listen(PORT, () => {
    console.log(`\n🤖 EL v6.0 - ElevenLabs Conversational AI`);
    console.log(`📞 ${TWILIO_PHONE_NUMBER}`);
    console.log(`🎙️ Chris voice via proxy: ${PROXY_URL}`);
    console.log('');
});