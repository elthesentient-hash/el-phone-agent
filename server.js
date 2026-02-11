/**
 * EL Phone Agent - Direct ElevenLabs (No Proxy)
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
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY || 'sk_e8710430f9222d0b0053af60c9aba3c29a6de9754d05fe44';
const ELEVENLABS_VOICE_ID = 'iP95p4xoKVk53GoZ742B';

const audioCache = new Map();

console.log('EL Phone Agent - Direct ElevenLabs');
console.log('Phone:', TWILIO_PHONE_NUMBER);

// ============================================
// ELEVENLABS DIRECT
// ============================================

async function getChrisVoice(text) {
    try {
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
        
        const key = Date.now().toString();
        audioCache.set(key, response.data);
        return key;
    } catch (e) {
        console.error('Voice error:', e.message);
        return null;
    }
}

app.get('/audio/:key', (req, res) => {
    const data = audioCache.get(req.params.key);
    if (data) {
        res.set('Content-Type', 'audio/mpeg');
        res.send(data);
    } else {
        res.status(404).send('Not found');
    }
});

// ============================================
// TWILIO
// ============================================

app.post('/voice/inbound', async (req, res) => {
    const host = req.headers.host;
    const protocol = req.headers['x-forwarded-proto'] || 'https';
    const greeting = "Hey Elijah! This is EL with Chris voice. What's up?";
    
    const key = await getChrisVoice(greeting);
    
    const twiml = new VoiceResponse();
    
    if (key) {
        twiml.play(`${protocol}://${host}/audio/${key}`);
    } else {
        twiml.say({ voice: 'Polly.Matthew' }, greeting);
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

app.post('/voice/respond', async (req, res) => {
    const speech = req.body.SpeechResult || '';
    const host = req.headers.host;
    const protocol = req.headers['x-forwarded-proto'] || 'https';
    
    const responseText = speech 
        ? `You said: ${speech}. I'm EL with Chris voice!` 
        : "Didn't catch that. Could you repeat?";
    
    const key = await getChrisVoice(responseText);
    
    const twiml = new VoiceResponse();
    
    if (key) {
        twiml.play(`${protocol}://${host}/audio/${key}`);
    } else {
        twiml.say({ voice: 'Polly.Matthew' }, responseText);
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
    res.json({ status: 'OK', version: '10.0 - Direct ElevenLabs', phone: TWILIO_PHONE_NUMBER });
});

app.listen(PORT, () => {
    console.log(`EL v10.0 on port ${PORT}`);
});