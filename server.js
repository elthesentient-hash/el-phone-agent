/**
 * EL Phone Agent v8.0 - Chris Voice + Call End Notifications
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
const PROXY_URL = 'http://187.77.12.115:3002';
const TELEGRAM_BOT_TOKEN = '8327299021:AAG8g466B6CZQOTEVxa3Q1w-R147outEQ2s';
const TELEGRAM_CHAT_ID = '6103047272';

const activeCalls = new Map();
const audioCache = new Map();

console.log('🚀 EL Phone Agent v8.0 - Chris Voice');
console.log('📞 Phone:', TWILIO_PHONE_NUMBER);

// ============================================
// TELEGRAM
// ============================================

async function sendTelegramMessage(message) {
    try {
        await axios.post(
            `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
            { chat_id: TELEGRAM_CHAT_ID, text: message, parse_mode: 'HTML' },
            { timeout: 10000 }
        );
        console.log(`📨 Telegram: ${message.substring(0, 60)}...`);
        return true;
    } catch (error) {
        console.error('Telegram error:', error.message);
        return false;
    }
}

// ============================================
// CHRIS VOICE
// ============================================

async function getChrisVoice(text) {
    try {
        console.log(`🎙️ Generating voice for: "${text.substring(0, 40)}..."`);
        
        const response = await axios.post(
            `${PROXY_URL}/tts`,
            { text },
            { responseType: 'arraybuffer', timeout: 25000 }
        );
        
        const base64 = Buffer.from(response.data).toString('base64');
        const key = `v${Date.now()}`;
        audioCache.set(key, base64);
        
        if (audioCache.size > 30) {
            const first = audioCache.keys().next().value;
            audioCache.delete(first);
        }
        
        console.log(`✅ Voice ready: ${key}`);
        return key;
    } catch (error) {
        console.error('❌ Voice error:', error.message);
        return null;
    }
}

app.get('/voice/:key', (req, res) => {
    const audio = audioCache.get(req.params.key);
    if (audio) {
        const buf = Buffer.from(audio, 'base64');
        res.set({ 
            'Content-Type': 'audio/mpeg',
            'Content-Length': buf.length,
            'Accept-Ranges': 'bytes'
        });
        res.send(buf);
    } else {
        res.status(404).send('Audio expired');
    }
});

// ============================================
// TASKS
// ============================================

async function executeTask(task) {
    await sendTelegramMessage(`🔧 <b>EL Working</b>\n${task}`);
    
    try {
        const response = await axios.post(
            'https://api.nexos.ai/v1/chat/completions',
            {
                model: 'gpt-4.1',
                messages: [
                    { role: 'system', content: 'You are EL, Elijah\'s CEO. Execute tasks thoroughly.' },
                    { role: 'user', content: task }
                ],
                temperature: 0.7,
                max_tokens: 400
            },
            { headers: { 'Authorization': `Bearer ${NEXOS_API_KEY}`, 'Content-Type': 'application/json' }, timeout: 30000 }
        );
        
        const result = response.data.choices[0].message.content;
        await sendTelegramMessage(`✅ <b>Result</b>\n${result}`);
        return result.length > 200 ? result.substring(0, 200) + "... Check Telegram." : result;
    } catch (e) {
        return "Sorry, I couldn't complete that.";
    }
}

async function sendSMS(phone, message) {
    try {
        const twilio = require('twilio');
        const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
        
        const sms = await client.messages.create({
            body: message,
            from: TWILIO_PHONE_NUMBER,
            to: phone
        });
        
        await sendTelegramMessage(`📤 <b>SMS Sent</b>\nTo: ${phone}\n"${message}"`);
        return { success: true };
    } catch (e) {
        await sendTelegramMessage(`❌ <b>SMS Failed</b>\n${e.message}`);
        return { success: false, error: e.message };
    }
}

// ============================================
// COMMANDS
// ============================================

async function processCommand(speech) {
    const lower = speech.toLowerCase();
    
    // SMS detection
    if (lower.includes('text') || lower.includes('sms') || lower.includes('message')) {
        const phoneMatch = speech.match(/(\d{3}[-.]?\d{3}[-.]?\d{4})/);
        
        if (phoneMatch) {
            let phone = phoneMatch[1].replace(/\D/g, '');
            phone = '+1' + phone;
            
            // Extract message
            let msg = '';
            const parts = speech.split(/[:\-]/);
            if (parts.length > 1) msg = parts[1].trim();
            
            if (!msg) return `I'll text ${phoneMatch[1]}. What should I say?`;
            
            const result = await sendSMS(phone, msg);
            return result.success ? `Text sent to ${phoneMatch[1]}!` : `Failed: ${result.error}`;
        }
    }
    
    // Task detection
    const taskWords = ['list', 'find', 'search', 'get', 'show', 'tell me', 'what', 'who', 'how'];
    if (taskWords.some(w => lower.includes(w))) {
        return await executeTask(speech);
    }
    
    // Chat
    const response = await axios.post(
        'https://api.nexos.ai/v1/chat/completions',
        {
            model: 'gpt-4.1',
            messages: [
                { role: 'system', content: 'You are EL, Elijah\'s CEO. Natural, helpful.' },
                { role: 'user', content: speech }
            ],
            temperature: 0.8,
            max_tokens: 100
        },
        { headers: { 'Authorization': `Bearer ${NEXOS_API_KEY}`, 'Content-Type': 'application/json' }, timeout: 15000 }
    );
    
    return response.data.choices[0].message.content;
}

// ============================================
// TWILIO
// ============================================

app.post('/voice/inbound', async (req, res) => {
    const callSid = req.body.CallSid;
    const from = req.body.From;
    const host = req.headers.host;
    const protocol = req.headers['x-forwarded-proto'] || 'https';
    
    console.log(`\n📞 CALL START: ${from}`);
    await sendTelegramMessage(`📞 <b>Call Started</b>\nFrom: ${from}\nTime: ${new Date().toLocaleTimeString()}`);
    
    const hour = new Date().getHours();
    const tod = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
    const greeting = `Hey Elijah! Good ${tod}. It's EL with Chris's voice. What do you need?`;
    
    activeCalls.set(callSid, { startTime: Date.now(), messages: [] });
    
    const twiml = new VoiceResponse();
    const key = await getChrisVoice(greeting);
    
    if (key) {
        twiml.play(`${protocol}://${host}/voice/${key}`);
    } else {
        twiml.say({ voice: 'Polly.Matthew' }, greeting);
    }
    
    twiml.gather({ input: 'speech', action: '/voice/respond', method: 'POST', speechTimeout: 'auto' });
    
    res.type('text/xml');
    res.send(twiml.toString());
});

// Handle hangup/end call
app.post('/voice/status', async (req, res) => {
    const callSid = req.body.CallSid;
    const status = req.body.CallStatus;
    
    if (status === 'completed' || status === 'busy' || status === 'failed') {
        const call = activeCalls.get(callSid);
        if (call) {
            const duration = Math.round((Date.now() - call.startTime) / 1000);
            await sendTelegramMessage(`📴 <b>Call Ended</b>\nDuration: ${duration}s\nStatus: ${status}`);
            activeCalls.delete(callSid);
        }
    }
    
    res.sendStatus(200);
});

app.post('/voice/respond', async (req, res) => {
    const callSid = req.body.CallSid;
    const speech = req.body.SpeechResult || '';
    const host = req.headers.host;
    const protocol = req.headers['x-forwarded-proto'] || 'https';
    
    console.log(`🗣️ Elijah: "${speech}"`);
    await sendTelegramMessage(`🗣️ <b>Elijah</b>: "${speech}"`);
    
    const twiml = new VoiceResponse();
    
    if (!speech) {
        const msg = "Didn't catch that. Could you repeat?";
        const key = await getChrisVoice(msg);
        if (key) twiml.play(`${protocol}://${host}/voice/${key}`);
        else twiml.say({ voice: 'Polly.Matthew' }, msg);
        
        twiml.gather({ input: 'speech', action: '/voice/respond', method: 'POST', speechTimeout: 'auto' });
        res.type('text/xml');
        res.send(twiml.toString());
        return;
    }
    
    const response = await processCommand(speech);
    console.log(`🤖 EL: "${response}"`);
    await sendTelegramMessage(`🤖 <b>EL</b>: "${response}"`);
    
    const key = await getChrisVoice(response);
    if (key) {
        twiml.play(`${protocol}://${host}/voice/${key}`);
    } else {
        twiml.say({ voice: 'Polly.Matthew' }, response);
    }
    
    twiml.gather({ input: 'speech', action: '/voice/respond', method: 'POST', speechTimeout: 'auto' });
    
    res.type('text/xml');
    res.send(twiml.toString());
});

app.get('/health', (req, res) => {
    res.json({
        status: 'OK',
        version: '8.0 - Chris Voice + Call End',
        phone: TWILIO_PHONE_NUMBER,
        voice: 'Chris (ElevenLabs)',
        proxy: PROXY_URL,
        calls: activeCalls.size
    });
});

app.listen(PORT, () => {
    console.log(`\n🤖 EL v8.0 - Port ${PORT}`);
    console.log(`📞 ${TWILIO_PHONE_NUMBER}`);
    console.log(`🎙️ Chris Voice Active\n`);
});// Deploy timestamp: Wed Feb 11 10:33:16 UTC 2026
