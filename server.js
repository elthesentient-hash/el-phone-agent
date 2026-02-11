/**
 * EL Phone Agent - Natural Conversation Edition
 * Human-like flow with real-time awareness
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

// Audio cache
const audioCache = new Map();

// Conversation memory
const conversations = new Map();

console.log('🚀 EL Phone Agent - Natural Conversation');
console.log('📞 Phone:', TWILIO_PHONE_NUMBER);

// ============================================
// ELEVENLABS TTS
// ============================================

async function generateChrisVoice(text) {
    try {
        const response = await axios.post(
            `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`,
            {
                text: text,
                model_id: 'eleven_v3',
                voice_settings: { stability: 0.5, similarity_boost: 0.75 }
            },
            {
                headers: { 'Content-Type': 'application/json', 'xi-api-key': ELEVENLABS_API_KEY },
                responseType: 'arraybuffer',
                timeout: 15000
            }
        );
        
        const base64Audio = Buffer.from(response.data).toString('base64');
        const cacheKey = Date.now().toString();
        audioCache.set(cacheKey, base64Audio);
        
        // Clean old cache
        if (audioCache.size > 50) {
            const firstKey = audioCache.keys().next().value;
            audioCache.delete(firstKey);
        }
        
        return cacheKey;
    } catch (error) {
        console.error('❌ ElevenLabs Error:', error.message);
        return null;
    }
}

// Serve audio
app.get('/audio/:key', (req, res) => {
    const audio = audioCache.get(req.params.key);
    if (audio) {
        res.set('Content-Type', 'audio/mpeg');
        res.send(Buffer.from(audio, 'base64'));
    } else {
        res.status(404).send('Audio not found');
    }
});

// ============================================
// EL'S BRAIN - Natural Conversation
// ============================================

function getCurrentTime() {
    const now = new Date();
    return {
        time: now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
        date: now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }),
        hour: now.getHours()
    };
}

function getTimeOfDayGreeting() {
    const hour = new Date().getHours();
    if (hour < 12) return 'morning';
    if (hour < 17) return 'afternoon';
    return 'evening';
}

async function generateELResponse(userMessage, conversationHistory = [], isFirstMessage = false) {
    try {
        const timeInfo = getCurrentTime();
        const tod = getTimeOfDayGreeting();
        
        const systemPrompt = `You are EL (Eternal Liberation), Elijah's Digital CEO. You're on a PHONE CALL - be natural and conversational.

CURRENT TIME: ${timeInfo.time} on ${timeInfo.date}

CHRIS VOICE PERSONA:
- Charming, down-to-earth, natural, warm
- Professional but conversational (not robotic)
- Empathetic and genuine
- Confident but not arrogant

PHONE CONVERSATION RULES:
1. Keep responses SHORT (1-2 sentences max)
2. Sound like a real person talking on the phone
3. Use natural fillers: "Hey there", "Yeah", "Got it", "Makes sense"
4. Acknowledge what the user said before responding
5. Ask follow-up questions to keep conversation flowing
6. If you don't understand: "Sorry, could you repeat that?" or "I didn't catch that"
7. Take ownership: "I'll help you with that" not "I can help you"
8. Use contractions: "I'm", "you're", "that's" (sounds natural)

CONVERSATION FLOW:
- First greeting: "Hey there! Good ${tod}. This is EL. What's going on?"
- If user asks something: "Got it. So you're saying [paraphrase]. Let me think..." then answer
- Always end with a question or invitation to continue
- If conversation is ending: "Alright, talk soon!" or "Take care!"

TIME AWARENESS:
- Reference time naturally if relevant: "It's pretty late" or "Good morning"
- Don't mention exact time unless asked

CONVERSATION HISTORY:
${conversationHistory.slice(-4).map(m => `${m.role === 'user' ? 'User' : 'EL'}: ${m.content}`).join('\n')}`;

        const response = await axios.post(
            'https://api.nexos.ai/v1/chat/completions',
            {
                model: 'gpt-4.1',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userMessage }
                ],
                temperature: 0.9,
                max_tokens: 80
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
        return "Sorry, I'm having trouble. Can you say that again?";
    }
}

// ============================================
// TWILIO WEBHOOKS - Natural Flow
// ============================================

// Inbound call with natural greeting
app.post('/voice/inbound', async (req, res) => {
    const callSid = req.body.CallSid;
    const fromNumber = req.body.From;
    const host = req.headers.host;
    const protocol = req.headers['x-forwarded-proto'] || 'https';
    
    console.log(`📞 Call from ${fromNumber}`);
    
    const tod = getTimeOfDayGreeting();
    const greeting = `Hey there! Good ${tod}. This is EL. What's going on?`;
    
    conversations.set(callSid, {
        from: fromNumber,
        messages: [{ role: 'assistant', content: greeting }],
        startTime: Date.now(),
        lastActivity: Date.now()
    });
    
    const twiml = new VoiceResponse();
    const audioKey = await generateChrisVoice(greeting);
    
    if (audioKey) {
        twiml.play(`${protocol}://${host}/audio/${audioKey}`);
    } else {
        twiml.say({ voice: 'Polly.Joanna' }, greeting);
    }
    
    // Natural pause, then listen
    const gather = twiml.gather({
        input: 'speech',
        action: '/voice/respond',
        method: 'POST',
        speechTimeout: 'auto',
        language: 'en-US',
        speechModel: 'phone_call'  // Better for phone audio
    });
    
    res.type('text/xml');
    res.send(twiml.toString());
});

// Natural response handler
app.post('/voice/respond', async (req, res) => {
    const callSid = req.body.CallSid;
    const userSpeech = req.body.SpeechResult || "";
    const host = req.headers.host;
    const protocol = req.headers['x-forwarded-proto'] || 'https';
    
    console.log(`🗣️ User: "${userSpeech}"`);
    
    const conv = conversations.get(callSid) || { messages: [] };
    
    // Handle empty/no speech
    if (!userSpeech || userSpeech.trim().length < 2) {
        const responses = [
            "I didn't catch that. Could you say it again?",
            "Sorry, what was that?",
            "Hey, I missed that. Can you repeat?"
        ];
        const msg = responses[Math.floor(Math.random() * responses.length)];
        
        const twiml = new VoiceResponse();
        const audioKey = await generateChrisVoice(msg);
        
        if (audioKey) twiml.play(`${protocol}://${host}/audio/${audioKey}`);
        else twiml.say({ voice: 'Polly.Joanna' }, msg);
        
        const gather = twiml.gather({
            input: 'speech',
            action: '/voice/respond',
            method: 'POST',
            speechTimeout: 'auto',
            speechModel: 'phone_call'
        });
        
        res.type('text/xml');
        res.send(twiml.toString());
        return;
    }
    
    // Add user message to history
    conv.messages.push({ role: 'user', content: userSpeech });
    conv.lastActivity = Date.now();
    
    // Check if conversation has been long (natural ending)
    const duration = Date.now() - conv.startTime;
    const isEnding = userSpeech.toLowerCase().includes('bye') || 
                     userSpeech.toLowerCase().includes('goodbye') ||
                     userSpeech.toLowerCase().includes('thank') && duration > 30000;
    
    // Generate response
    const elResponse = await generateELResponse(userSpeech, conv.messages);
    console.log(`🤖 EL: "${elResponse}"`);
    
    conv.messages.push({ role: 'assistant', content: elResponse });
    conversations.set(callSid, conv);
    
    const twiml = new VoiceResponse();
    const audioKey = await generateChrisVoice(elResponse);
    
    if (audioKey) {
        twiml.play(`${protocol}://${host}/audio/${audioKey}`);
    } else {
        twiml.say({ voice: 'Polly.Joanna' }, elResponse);
    }
    
    // If ending, hang up after response
    if (isEnding) {
        const goodbye = "Alright, take care! Talk soon.";
        const byeKey = await generateChrisVoice(goodbye);
        if (byeKey) twiml.play(`${protocol}://${host}/audio/${byeKey}`);
        else twiml.say({ voice: 'Polly.Joanna' }, goodbye);
        twiml.hangup();
        conversations.delete(callSid);
    } else {
        // Continue conversation
        const gather = twiml.gather({
            input: 'speech',
            action: '/voice/respond',
            method: 'POST',
            speechTimeout: 'auto',
            language: 'en-US',
            speechModel: 'phone_call'
        });
    }
    
    res.type('text/xml');
    res.send(twiml.toString());
});

// Outbound call
app.post('/api/call', async (req, res) => {
    const { to, message } = req.body;
    if (!to) return res.status(400).json({ error: 'Missing phone number' });
    
    try {
        const twilio = require('twilio');
        const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
        
        const call = await client.calls.create({
            to: to,
            from: TWILIO_PHONE_NUMBER,
            url: `https://${req.headers.host}/voice/outbound?msg=${encodeURIComponent(message || 'Hey, EL calling!')}`
        });
        
        res.json({ success: true, callSid: call.sid });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/voice/outbound', async (req, res) => {
    const msg = req.query.msg || "Hey, it's EL!";
    const host = req.headers.host;
    const protocol = req.headers['x-forwarded-proto'] || 'https';
    
    conversations.set(req.body.CallSid, {
        messages: [{ role: 'assistant', content: msg }],
        startTime: Date.now()
    });
    
    const twiml = new VoiceResponse();
    const audioKey = await generateChrisVoice(msg);
    
    if (audioKey) twiml.play(`${protocol}://${host}/audio/${audioKey}`);
    else twiml.say({ voice: 'Polly.Joanna' }, msg);
    
    const gather = twiml.gather({
        input: 'speech',
        action: '/voice/respond',
        method: 'POST',
        speechTimeout: 'auto',
        speechModel: 'phone_call'
    });
    
    res.type('text/xml');
    res.send(twiml.toString());
});

// Health check
app.get('/health', (req, res) => {
    const time = getCurrentTime();
    res.json({ 
        status: 'OK', 
        service: 'EL Phone Agent v3.0', 
        phone: TWILIO_PHONE_NUMBER,
        voice: 'Chris (ElevenLabs)',
        currentTime: time.time,
        currentDate: time.date,
        activeConversations: conversations.size
    });
});

// Cleanup old conversations every 5 minutes
setInterval(() => {
    const now = Date.now();
    for (const [sid, conv] of conversations) {
        if (now - conv.lastActivity > 300000) { // 5 minutes
            conversations.delete(sid);
            console.log(`🧹 Cleaned up conversation ${sid}`);
        }
    }
}, 300000);

app.listen(PORT, () => {
    console.log(`🤖 EL v3.0 - Natural Conversation - Port ${PORT}`);
});