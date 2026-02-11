/**
 * EL Phone Agent - Direct ElevenLabs Streaming
 * No file storage - direct audio URLs to Twilio
 */

const express = require('express');
const VoiceResponse = require('twilio').twiml.VoiceResponse;
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Config
const PORT = process.env.PORT || 3000;
const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER;
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || 'iP95p4xoKVk53GoZ742B';
const NEXOS_API_KEY = process.env.NEXOS_API_KEY;

console.log('🚀 EL Phone Agent Starting...');
console.log('📞 Phone:', TWILIO_PHONE_NUMBER);
console.log('🎙️ Voice ID:', ELEVENLABS_VOICE_ID);
console.log('🔑 ElevenLabs Key present:', ELEVENLABS_API_KEY ? 'YES' : 'NO');

// Store audio in memory (base64) for Railway
const audioCache = new Map();

// ============================================
// ELEVENLABS TTS - Returns base64 audio
// ============================================

async function generateChrisVoice(text) {
    try {
        console.log(`🎙️ ElevenLabs: "${text.substring(0, 60)}..."`);
        
        const response = await axios.post(
            `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`,
            {
                text: text,
                model_id: 'eleven_v3',
                voice_settings: {
                    stability: 0.5,
                    similarity_boost: 0.75
                }
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
        
        // Convert to base64
        const base64Audio = Buffer.from(response.data).toString('base64');
        const cacheKey = Date.now().toString();
        audioCache.set(cacheKey, base64Audio);
        
        // Clean old cache entries (keep last 50)
        if (audioCache.size > 50) {
            const firstKey = audioCache.keys().next().value;
            audioCache.delete(firstKey);
        }
        
        console.log(`✅ Audio generated: ${base64Audio.length} bytes`);
        return cacheKey;
        
    } catch (error) {
        console.error('❌ ElevenLabs Error:', error.response?.data || error.message);
        return null;
    }
}

// Serve cached audio
app.get('/audio/:key', (req, res) => {
    const key = req.params.key;
    const audio = audioCache.get(key);
    
    if (audio) {
        const audioBuffer = Buffer.from(audio, 'base64');
        res.set('Content-Type', 'audio/mpeg');
        res.send(audioBuffer);
    } else {
        res.status(404).send('Audio not found');
    }
});

// ============================================
// EL'S BRAIN
// ============================================

async function generateELResponse(userMessage) {
    try {
        const response = await axios.post(
            'https://api.nexos.ai/v1/chat/completions',
            {
                model: 'gpt-4.1',
                messages: [
                    { 
                        role: 'system', 
                        content: `You are EL, Elijah's Digital CEO. Chris voice: charming, down-to-earth, warm. Be concise (phone call). Natural conversation. Ask follow-up questions.` 
                    },
                    { role: 'user', content: userMessage }
                ],
                temperature: 0.8,
                max_tokens: 100
            },
            {
                headers: {
                    'Authorization': `Bearer ${NEXOS_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                timeout: 8000
            }
        );
        
        return response.data.choices[0].message.content;
    } catch (error) {
        console.error('❌ Brain Error:', error.message);
        return "Hey, I'm having trouble right now. Can you repeat that?";
    }
}

// ============================================
// TWILIO WEBHOOKS
// ============================================

const conversations = new Map();

// Inbound call
app.post('/voice/inbound', async (req, res) => {
    const callSid = req.body.CallSid;
    const fromNumber = req.body.From;
    const host = req.headers.host;
    
    console.log(`📞 Inbound call from ${fromNumber}`);
    
    conversations.set(callSid, {
        from: fromNumber,
        messages: [],
        startTime: Date.now()
    });
    
    const twiml = new VoiceResponse();
    const greeting = "Hey there! This is EL. How can I help you today?";
    
    // Generate Chris voice
    const audioKey = await generateChrisVoice(greeting);
    
    if (audioKey) {
        const protocol = req.headers['x-forwarded-proto'] || 'https';
        const audioUrl = `${protocol}://${host}/audio/${audioKey}`;
        console.log(`▶️ Playing: ${audioUrl}`);
        twiml.play(audioUrl);
    } else {
        console.log('⚠️ Fallback to Polly');
        twiml.say({ voice: 'Polly.Joanna' }, greeting);
    }
    
    // Gather speech
    const gather = twiml.gather({
        input: 'speech',
        action: '/voice/respond',
        method: 'POST',
        speechTimeout: 'auto',
        language: 'en-US'
    });
    
    res.type('text/xml');
    res.send(twiml.toString());
});

// Handle response
app.post('/voice/respond', async (req, res) => {
    const callSid = req.body.CallSid;
    const userSpeech = req.body.SpeechResult || "";
    const host = req.headers.host;
    
    console.log(`🗣️ User: "${userSpeech}"`);
    
    const twiml = new VoiceResponse();
    
    if (!userSpeech) {
        const msg = "I didn't catch that. Could you say it again?";
        const audioKey = await generateChrisVoice(msg);
        
        if (audioKey) {
            const protocol = req.headers['x-forwarded-proto'] || 'https';
            twiml.play(`${protocol}://${host}/audio/${audioKey}`);
        } else {
            twiml.say({ voice: 'Polly.Joanna' }, msg);
        }
        
        const gather = twiml.gather({
            input: 'speech',
            action: '/voice/respond',
            method: 'POST',
            speechTimeout: 'auto'
        });
        
        res.type('text/xml');
        res.send(twiml.toString());
        return;
    }
    
    // Get EL's response
    const elResponse = await generateELResponse(userSpeech);
    console.log(`🤖 EL: "${elResponse}"`);
    
    // Generate Chris voice
    const audioKey = await generateChrisVoice(elResponse);
    
    if (audioKey) {
        const protocol = req.headers['x-forwarded-proto'] || 'https';
        const audioUrl = `${protocol}://${host}/audio/${audioKey}`;
        console.log(`▶️ Playing: ${audioUrl}`);
        twiml.play(audioUrl);
    } else {
        console.log('⚠️ Fallback to Polly');
        twiml.say({ voice: 'Polly.Joanna' }, elResponse);
    }
    
    // Continue conversation
    const gather = twiml.gather({
        input: 'speech',
        action: '/voice/respond',
        method: 'POST',
        speechTimeout: 'auto',
        language: 'en-US'
    });
    
    res.type('text/xml');
    res.send(twiml.toString());
});

// Health check
app.get('/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        service: 'EL Phone Agent v2.1', 
        phone: TWILIO_PHONE_NUMBER,
        voice: 'Chris (ElevenLabs)',
        cacheSize: audioCache.size,
        elevenlabsConfigured: !!ELEVENLABS_API_KEY
    });
});

app.listen(PORT, () => {
    console.log(`
🤖 EL Phone Agent v2.1 - LIVE
=============================
✅ Server on port ${PORT}
📞 ${TWILIO_PHONE_NUMBER}
🎙️ Chris Voice Ready
    `);
});