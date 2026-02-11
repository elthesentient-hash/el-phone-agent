/**
 * EL Phone Agent - Simplified Stable Version
 */

const express = require('express');
const VoiceResponse = require('twilio').twiml.VoiceResponse;
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const PORT = process.env.PORT || 3000;
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER;
const NEXOS_API_KEY = process.env.NEXOS_API_KEY;
const PROXY_URL = process.env.PROXY_URL || 'http://187.77.12.115:3002';

console.log('EL Phone Agent Starting...');
console.log('Phone:', TWILIO_PHONE_NUMBER);
console.log('Proxy:', PROXY_URL);

// Simple audio cache
const audioCache = new Map();

// ============================================
// VOICE GENERATION
// ============================================

async function generateVoice(text) {
    try {
        const response = await axios.post(
            `${PROXY_URL}/tts`,
            { text },
            { responseType: 'arraybuffer', timeout: 20000 }
        );
        
        const key = Date.now().toString();
        audioCache.set(key, response.data);
        return key;
    } catch (e) {
        console.error('Voice generation failed:', e.message);
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
// TWILIO HANDLERS
// ============================================

app.post('/voice/inbound', async (req, res) => {
    try {
        const host = req.headers.host;
        const protocol = req.headers['x-forwarded-proto'] || 'https';
        const greeting = "Hey Elijah! This is EL with Chris voice. What's up?";
        
        const key = await generateVoice(greeting);
        
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
    } catch (error) {
        console.error('Inbound error:', error);
        const twiml = new VoiceResponse();
        twiml.say('Sorry, there was an error. Please try again.');
        res.type('text/xml');
        res.send(twiml.toString());
    }
});

app.post('/voice/respond', async (req, res) => {
    try {
        const speech = req.body.SpeechResult || '';
        const host = req.headers.host;
        const protocol = req.headers['x-forwarded-proto'] || 'https';
        
        let responseText;
        
        if (!speech) {
            responseText = "I didn't catch that. Could you repeat?";
        } else {
            // Simple response for now
            responseText = `You said: ${speech}. I'm EL with Chris voice, fully working now!`;
        }
        
        const key = await generateVoice(responseText);
        
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
    } catch (error) {
        console.error('Respond error:', error);
        const twiml = new VoiceResponse();
        twiml.say('Sorry, there was an error.');
        res.type('text/xml');
        res.send(twiml.toString());
    }
});

app.get('/health', (req, res) => {
    res.json({
        status: 'OK',
        version: '9.0 - Stable',
        phone: TWILIO_PHONE_NUMBER
    });
});

app.listen(PORT, () => {
    console.log(`EL v9.0 running on port ${PORT}`);
});