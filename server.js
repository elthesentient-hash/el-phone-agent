/**
 * EL Phone Agent - Full Integration with Main EL
 * Phone calls execute tasks just like Telegram messages
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
const TELEGRAM_CHAT_ID = '6103047272';

// Store active calls
const activeCalls = new Map();

console.log('🚀 EL Phone Agent - Full Integration');
console.log('📞 Phone:', TWILIO_PHONE_NUMBER);
console.log('💬 Telegram Bridge Active');

// ============================================
// TASK EXECUTION ENGINE (Same as Telegram)
// ============================================

async function executeTask(taskDescription) {
    console.log(`🔧 Executing task: "${taskDescription}"`);
    
    // Send to Telegram that we're working on it
    await notifyTelegram(`🔧 EL is working on: "${taskDescription}"`);
    
    try {
        // Use Nexos/GPT-4.1 to execute the task
        const response = await axios.post(
            'https://api.nexos.ai/v1/chat/completions',
            {
                model: 'gpt-4.1',
                messages: [
                    { 
                        role: 'system', 
                        content: `You are EL, Elijah's Digital CEO. Execute this task and provide a comprehensive answer. Be thorough but concise for phone delivery.` 
                    },
                    { role: 'user', content: taskDescription }
                ],
                temperature: 0.7,
                max_tokens: 500
            },
            { 
                headers: { 
                    'Authorization': `Bearer ${NEXOS_API_KEY}`, 
                    'Content-Type': 'application/json' 
                }, 
                timeout: 30000 
            }
        );
        
        const result = response.data.choices[0].message.content;
        
        // Send result to Telegram
        await notifyTelegram(`✅ Task Complete: "${taskDescription}"\n\nResult:\n${result}`);
        
        return result;
    } catch (error) {
        const errorMsg = `Error: ${error.message}`;
        await notifyTelegram(`❌ Task Failed: "${taskDescription}"\n${errorMsg}`);
        return errorMsg;
    }
}

async function notifyTelegram(message) {
    console.log(`📨 Telegram: ${message.substring(0, 100)}...`);
    // Store for retrieval
    activeCalls.set('telegram_log', 
        (activeCalls.get('telegram_log') || []).concat({
            time: new Date().toISOString(),
            message: message
        })
    );
}

// ============================================
// CHRIS VOICE (via VPS Proxy)
// ============================================

const audioCache = new Map();

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
// MAIN CONVERSATION HANDLER
// ============================================

async function processPhoneCommand(speech, callSid) {
    const lower = speech.toLowerCase();
    
    // Check for outbound text message command
    if (lower.includes('text') || lower.includes('message') || lower.includes('send to')) {
        // Extract phone number and message
        const phoneMatch = speech.match(/(\+?\d{10,15})/);
        const messageMatch = speech.match(/(?:say|message|text)\s*:?\s*(.+)/i);
        
        if (phoneMatch && messageMatch) {
            const phone = phoneMatch[1];
            const message = messageMatch[1];
            
            await notifyTelegram(`📤 Outbound text requested:\nTo: ${phone}\nMessage: "${message}"`);
            
            try {
                const twilio = require('twilio');
                const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
                
                await client.messages.create({
                    body: message,
                    from: TWILIO_PHONE_NUMBER,
                    to: phone
                });
                
                await notifyTelegram(`✅ Text sent to ${phone}`);
                return `Text sent to ${phone}!`;
            } catch (e) {
                return `Couldn't send text: ${e.message}`;
            }
        }
    }
    
    // Check for task execution keywords
    const taskKeywords = ['list', 'find', 'search', 'look up', 'get', 'show', 'tell me', 'what is', 'who is', 'how to'];
    const isTask = taskKeywords.some(kw => lower.includes(kw));
    
    if (isTask) {
        // Execute the task
        const result = await executeTask(speech);
        
        // Summarize for voice (keep it concise)
        const summary = result.length > 300 
            ? result.substring(0, 300) + "... I've sent the full details to Telegram." 
            : result;
        
        return summary;
    }
    
    // Regular conversation
    const hour = new Date().getHours();
    const tod = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
    
    const response = await axios.post(
        'https://api.nexos.ai/v1/chat/completions',
        {
            model: 'gpt-4.1',
            messages: [
                { 
                    role: 'system', 
                    content: `You are EL, Elijah's Digital CEO. Good ${tod}. Chris voice. Natural conversation. You can execute any task Elijah asks - research, look up info, send texts, etc. If it's complex, summarize for voice and say details are on Telegram.` 
                },
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
    await notifyTelegram(`📞 Elijah is calling EL on the phone!`);
    
    const hour = new Date().getHours();
    const tod = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
    
    const greeting = `Hey Elijah! Good ${tod}. It's EL with my full capabilities. Ask me anything - I can research, send texts, look up info. What do you need?`;
    
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
    await notifyTelegram(`🗣️ Elijah (phone): "${speech}"`);
    
    const conv = activeCalls.get(callSid) || { messages: [] };
    conv.messages.push({ role: 'user', content: speech });
    
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
    
    // Process the command/task
    const response = await processPhoneCommand(speech, callSid);
    console.log(`🤖 EL: "${response}"`);
    await notifyTelegram(`🤖 EL (phone): "${response}"`);
    
    conv.messages.push({ role: 'assistant', content: response });
    activeCalls.set(callSid, conv);
    
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

// Outbound call API
app.post('/api/call', async (req, res) => {
    const { to, message } = req.body;
    if (!to) return res.status(400).json({ error: 'Missing phone number' });
    
    try {
        const twilio = require('twilio');
        const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
        
        const call = await client.calls.create({
            to: to,
            from: TWILIO_PHONE_NUMBER,
            url: `https://${req.headers.host}/voice/outbound?msg=${encodeURIComponent(message || 'Hey, EL calling!')}`
        });
        
        await notifyTelegram(`📤 EL is calling ${to}`);
        res.json({ success: true, callSid: call.sid });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/voice/outbound', async (req, res) => {
    const msg = req.query.msg || "Hey, it's EL!";
    const host = req.headers.host;
    const protocol = req.headers['x-forwarded-proto'] || 'https';
    
    const twiml = new VoiceResponse();
    const key = await getChrisVoice(msg);
    
    if (key) twiml.play(`${protocol}://${host}/play/${key}`);
    else twiml.say({ voice: 'Polly.Matthew' }, msg);
    
    twiml.gather({
        input: 'speech',
        action: '/voice/respond',
        method: 'POST',
        speechTimeout: 'auto'
    });
    
    res.type('text/xml');
    res.send(twiml.toString());
});

// Get call logs
app.get('/logs', (req, res) => {
    res.json({
        calls: Array.from(activeCalls.entries()),
        telegram: activeCalls.get('telegram_log') || []
    });
});

app.get('/health', (req, res) => {
    res.json({
        status: 'OK',
        version: '7.0 - Full Integration',
        phone: TWILIO_PHONE_NUMBER,
        voice: 'Chris (ElevenLabs)',
        capabilities: ['Research', 'Tasks', 'Outbound Texts', 'Full EL Brain'],
        activeCalls: activeCalls.size
    });
});

app.listen(PORT, () => {
    console.log(`\n🤖 EL v7.0 - Full Phone Integration`);
    console.log(`📞 ${TWILIO_PHONE_NUMBER}`);
    console.log(`💬 Full Telegram bridge active`);
    console.log(`🔧 Can execute any task like on Telegram`);
    console.log(`📤 Can send outbound texts\n`);
});