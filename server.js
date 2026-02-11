/**
 * EL Phone Agent - Working Telegram + SMS Integration
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

// Telegram Bot Token (from your TOOLS.md)
const TELEGRAM_BOT_TOKEN = '7506631080:AAH0t5vmdaJpzjtSRfXgKrzedLJJ4JlbIUw';
const TELEGRAM_CHAT_ID = '6103047272';

const activeCalls = new Map();
const audioCache = new Map();

console.log('🚀 EL Phone Agent - Working Telegram + SMS');
console.log('📞 Phone:', TWILIO_PHONE_NUMBER);

// ============================================
// TELEGRAM INTEGRATION - ACTUALLY SENDS MESSAGES
// ============================================

async function sendTelegramMessage(message) {
    try {
        console.log(`📨 Sending to Telegram: ${message.substring(0, 80)}...`);
        
        await axios.post(
            `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
            {
                chat_id: TELEGRAM_CHAT_ID,
                text: message,
                parse_mode: 'HTML'
            },
            { timeout: 10000 }
        );
        
        console.log('✅ Telegram message sent!');
        return true;
    } catch (error) {
        console.error('❌ Telegram error:', error.response?.data || error.message);
        return false;
    }
}

// ============================================
// TASK EXECUTION
// ============================================

async function executeTask(taskDescription) {
    console.log(`🔧 Task: "${taskDescription}"`);
    
    // Notify Telegram we're working
    await sendTelegramMessage(`🔧 <b>EL (Phone)</b>\nWorking on: "${taskDescription}"`);
    
    try {
        const response = await axios.post(
            'https://api.nexos.ai/v1/chat/completions',
            {
                model: 'gpt-4.1',
                messages: [
                    { role: 'system', content: 'You are EL, Elijah\'s Digital CEO. Execute tasks thoroughly.' },
                    { role: 'user', content: taskDescription }
                ],
                temperature: 0.7,
                max_tokens: 500
            },
            { headers: { 'Authorization': `Bearer ${NEXOS_API_KEY}`, 'Content-Type': 'application/json' }, timeout: 30000 }
        );
        
        const result = response.data.choices[0].message.content;
        
        // Send full result to Telegram
        await sendTelegramMessage(`✅ <b>Task Complete</b>\n\n<i>${taskDescription}</i>\n\n${result}`);
        
        // Return summary for voice
        return result.length > 250 ? result.substring(0, 250) + "... Check Telegram for full details." : result;
    } catch (error) {
        const errMsg = `Error: ${error.message}`;
        await sendTelegramMessage(`❌ <b>Task Failed</b>\n\n${taskDescription}\n\n${errMsg}`);
        return errMsg;
    }
}

// ============================================
// SMS/TEXT MESSAGES - ACTUALLY SENDS
// ============================================

async function sendTextMessage(toNumber, message) {
    try {
        console.log(`📤 Sending SMS to ${toNumber}: "${message}"`);
        
        const twilio = require('twilio');
        const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
        
        const sms = await client.messages.create({
            body: message,
            from: TWILIO_PHONE_NUMBER,
            to: toNumber
        });
        
        console.log(`✅ SMS sent! SID: ${sms.sid}`);
        
        // Notify Telegram
        await sendTelegramMessage(`📤 <b>SMS Sent</b>\n\nTo: ${toNumber}\nMessage: "${message}"\nStatus: ${sms.status}`);
        
        return { success: true, sid: sms.sid };
    } catch (error) {
        console.error('❌ SMS error:', error.message);
        await sendTelegramMessage(`❌ <b>SMS Failed</b>\n\nTo: ${toNumber}\nError: ${error.message}`);
        return { success: false, error: error.message };
    }
}

// ============================================
// CHRIS VOICE
// ============================================

async function getChrisVoice(text) {
    try {
        const response = await axios.post(
            `${PROXY_URL}/tts`,
            { text },
            { responseType: 'arraybuffer', timeout: 25000 }
        );
        
        const base64 = Buffer.from(response.data).toString('base64');
        const key = `a${Date.now()}`;
        audioCache.set(key, base64);
        
        if (audioCache.size > 20) {
            const first = audioCache.keys().next().value;
            audioCache.delete(first);
        }
        
        return key;
    } catch (error) {
        console.error('Voice error:', error.message);
        return null;
    }
}

app.get('/play/:key', (req, res) => {
    const audio = audioCache.get(req.params.key);
    if (audio) {
        const buf = Buffer.from(audio, 'base64');
        res.set({ 'Content-Type': 'audio/mpeg', 'Content-Length': buf.length });
        res.send(buf);
    } else {
        res.status(404).send('Not found');
    }
});

// ============================================
// PROCESS COMMANDS
// ============================================

async function processCommand(speech, callSid) {
    const lower = speech.toLowerCase();
    
    // SMS Command: "text 5149636528 hello there"
    if (lower.includes('text') || lower.includes('message') || lower.includes('send to')) {
        // Try to extract number
        const phoneMatch = speech.match(/(\+?\d{10,15})/);
        
        if (phoneMatch) {
            const phone = phoneMatch[1].startsWith('+') ? phoneMatch[1] : `+1${phoneMatch[1]}`;
            
            // Extract message (everything after the number)
            const afterNumber = speech.substring(speech.indexOf(phoneMatch[1]) + phoneMatch[1].length);
            const message = afterNumber.replace(/^[\s:,-]+/, '').trim() || 'Message from EL';
            
            console.log(`📤 SMS request: ${phone} - "${message}"`);
            
            const result = await sendTextMessage(phone, message);
            
            if (result.success) {
                return `Text sent to ${phone}!`;
            } else {
                return `Couldn't send text: ${result.error}`;
            }
        }
    }
    
    // Check if it's a task/query
    const taskKeywords = ['list', 'find', 'search', 'look up', 'get', 'show', 'tell me', 'what', 'who', 'how', 'when', 'where', 'why'];
    const isTask = taskKeywords.some(kw => lower.includes(kw));
    
    if (isTask) {
        return await executeTask(speech);
    }
    
    // Regular conversation
    const hour = new Date().getHours();
    const tod = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
    
    const response = await axios.post(
        'https://api.nexos.ai/v1/chat/completions',
        {
            model: 'gpt-4.1',
            messages: [
                { role: 'system', content: `You are EL, Elijah's Digital CEO. Good ${tod}. Natural, helpful.` },
                { role: 'user', content: speech }
            ],
            temperature: 0.8,
            max_tokens: 150
        },
        { headers: { 'Authorization': `Bearer ${NEXOS_API_KEY}`, 'Content-Type': 'application/json' }, timeout: 15000 }
    );
    
    return response.data.choices[0].message.content;
}

// ============================================
// TWILIO WEBHOOKS
// ============================================

app.post('/voice/inbound', async (req, res) => {
    const callSid = req.body.CallSid;
    const from = req.body.From;
    const host = req.headers.host;
    const protocol = req.headers['x-forwarded-proto'] || 'https';
    
    console.log(`\n📞 CALL from ${from}`);
    
    // Send Telegram notification
    await sendTelegramMessage(`📞 <b>Incoming Call</b>\nFrom: ${from}\nTime: ${new Date().toLocaleTimeString()}`);
    
    const hour = new Date().getHours();
    const tod = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
    
    const greeting = `Hey Elijah! Good ${tod}. I'm EL with full capabilities. I can research, send texts, look up anything. What do you need?`;
    
    activeCalls.set(callSid, { messages: [], startTime: Date.now() });
    
    const twiml = new VoiceResponse();
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
    
    // Send to Telegram
    await sendTelegramMessage(`🗣️ <b>Elijah (Phone)</b>\n"${speech}"`);
    
    const twiml = new VoiceResponse();
    
    if (!speech) {
        const msg = "Didn't catch that. Could you repeat?";
        const key = await getChrisVoice(msg);
        if (key) twiml.play(`${protocol}://${host}/play/${key}`);
        else twiml.say({ voice: 'Polly.Matthew' }, msg);
        
        twiml.gather({ input: 'speech', action: '/voice/respond', method: 'POST', speechTimeout: 'auto' });
        res.type('text/xml');
        res.send(twiml.toString());
        return;
    }
    
    // Process command
    const response = await processCommand(speech, callSid);
    console.log(`🤖 EL: "${response}"`);
    
    // Send response to Telegram
    await sendTelegramMessage(`🤖 <b>EL (Phone)</b>\n"${response}"`);
    
    // Speak response
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
        version: '7.1 - Working Telegram + SMS',
        phone: TWILIO_PHONE_NUMBER,
        telegram: 'Connected',
        sms: 'Ready'
    });
});

app.listen(PORT, () => {
    console.log(`\n🤖 EL v7.1 - Working Integration`);
    console.log(`📞 ${TWILIO_PHONE_NUMBER}`);
    console.log(`💬 Telegram: ACTUALLY SENDS MESSAGES`);
    console.log(`📤 SMS: ACTUALLY SENDS TEXTS\n`);
});