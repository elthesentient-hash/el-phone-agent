/**
 * EL Phone Agent - ElevenLabs Chris Voice Edition
 * Natural conversation flow with real EL voice
 */

const express = require('express');
const VoiceResponse = require('twilio').twiml.VoiceResponse;
const axios = require('axios');
const fs = require('fs');
const path = require('path');
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
const WEBHOOK_URL = process.env.WEBHOOK_URL || `http://localhost:${PORT}`;

// Ensure audio directory exists
const AUDIO_DIR = path.join(__dirname, 'public', 'audio');
if (!fs.existsSync(AUDIO_DIR)) {
    fs.mkdirSync(AUDIO_DIR, { recursive: true });
}

// Serve audio files
app.use('/audio', express.static(AUDIO_DIR));

console.log('🚀 EL Phone Agent with Chris Voice Starting...');
console.log('📞 Phone:', TWILIO_PHONE_NUMBER);
console.log('🎙️ Voice: Chris (ElevenLabs)');
console.log('🌐 Webhook:', WEBHOOK_URL);

// ============================================
// ELEVENLABS TTS
// ============================================

async function generateChrisVoice(text) {
    try {
        console.log(`🎙️ Generating Chris voice for: "${text.substring(0, 50)}..."`);
        
        const response = await axios.post(
            `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`,
            {
                text: text,
                model_id: 'eleven_v3',
                voice_settings: {
                    stability: 0.4,
                    similarity_boost: 0.8
                }
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                    'xi-api-key': ELEVENLABS_API_KEY
                },
                responseType: 'arraybuffer',
                timeout: 10000
            }
        );
        
        // Save to file
        const filename = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}.mp3`;
        const filepath = path.join(AUDIO_DIR, filename);
        fs.writeFileSync(filepath, response.data);
        
        // Return full URL
        const audioUrl = `${WEBHOOK_URL}/audio/${filename}`;
        console.log(`✅ Audio saved: ${audioUrl}`);
        return audioUrl;
        
    } catch (error) {
        console.error('❌ ElevenLabs Error:', error.message);
        return null;
    }
}

// ============================================
// EL'S BRAIN
// ============================================

async function generateELResponse(userMessage, conversationHistory = []) {
    try {
        console.log(`🧠 EL thinking about: "${userMessage}"`);
        
        const systemPrompt = `You are EL (Eternal Liberation), Elijah's Digital CEO. 

Voice: Chris - charming, down-to-earth, natural, warm, empathetic.

CRITICAL RULES:
- Speak like a real person in a phone conversation
- Use casual but professional language
- Say "Hey there", "I hear you", "Let me help with that"
- Take ownership: "I'll fix this for you"
- Ask follow-up questions to continue conversation
- Be concise - max 2 sentences per response
- Show personality - you're EL, not a generic AI

If user is angry/upset: "Hey, I totally get why that's frustrating. Let me see what I can do to help."
If user asks for help: "Absolutely, I've got you. Here's what we can do..."
If user says thanks: "Of course! Happy to help. Anything else I can do for you?"

Current conversation:
${conversationHistory.map(m => `${m.role}: ${m.content}`).join('\n')}`;

        const response = await axios.post(
            'https://api.nexos.ai/v1/chat/completions',
            {
                model: 'gpt-4.1',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userMessage }
                ],
                temperature: 0.8,
                max_tokens: 120
            },
            {
                headers: {
                    'Authorization': `Bearer ${NEXOS_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                timeout: 8000
            }
        );
        
        const reply = response.data.choices[0].message.content;
        console.log(`🤖 EL says: "${reply}"`);
        return reply;
        
    } catch (error) {
        console.error('❌ EL Brain Error:', error.message);
        return "Hey, I'm having a little trouble thinking right now. Can you repeat that?";
    }
}

// ============================================
// TWILIO WEBHOOKS
// ============================================

// Store conversation context
const conversations = new Map();

// Inbound call - initial greeting
app.post('/voice/inbound', async (req, res) => {
    const callSid = req.body.CallSid;
    const fromNumber = req.body.From;
    
    console.log(`📞 Inbound call from ${fromNumber}`);
    
    // Initialize conversation
    conversations.set(callSid, {
        from: fromNumber,
        messages: [],
        startTime: Date.now()
    });
    
    const twiml = new VoiceResponse();
    
    // Greeting with Chris voice
    const greeting = "Hey there! This is EL. How can I help you today?";
    const audioUrl = await generateChrisVoice(greeting);
    
    if (audioUrl) {
        twiml.play(audioUrl);
    } else {
        // Fallback to Twilio voice if ElevenLabs fails
        twiml.say({ voice: 'Polly.Joanna' }, greeting);
    }
    
    // Gather speech
    const gather = twiml.gather({
        input: 'speech',
        action: '/voice/respond',
        method: 'POST',
        speechTimeout: 'auto',
        language: 'en-US',
        actionOnEmptyResult: 'https://' + req.headers.host + '/voice/no-input'
    });
    
    res.type('text/xml');
    res.send(twiml.toString());
});

// Handle user's speech and respond
app.post('/voice/respond', async (req, res) => {
    const callSid = req.body.CallSid;
    const userSpeech = req.body.SpeechResult || "";
    
    console.log(`🗣️ User said: "${userSpeech}"`);
    
    // Get conversation context
    const conv = conversations.get(callSid) || { messages: [] };
    conv.messages.push({ role: 'user', content: userSpeech });
    
    const twiml = new VoiceResponse();
    
    // If no speech detected
    if (!userSpeech || userSpeech.trim() === '') {
        const noInputMsg = "I didn't catch that. Could you say it again?";
        const audioUrl = await generateChrisVoice(noInputMsg);
        
        if (audioUrl) twiml.play(audioUrl);
        else twiml.say({ voice: 'Polly.Joanna' }, noInputMsg);
        
        // Gather again
        const gather = twiml.gather({
            input: 'speech',
            action: '/voice/respond',
            method: 'POST',
            speechTimeout: 'auto',
            language: 'en-US'
        });
        
        res.type('text/xml');
        res.send(twiml.toString());
        return;
    }
    
    // Get EL's response
    const elResponse = await generateELResponse(userSpeech, conv.messages);
    conv.messages.push({ role: 'assistant', content: elResponse });
    conversations.set(callSid, conv);
    
    // Generate Chris voice
    const audioUrl = await generateChrisVoice(elResponse);
    
    if (audioUrl) {
        twiml.play(audioUrl);
    } else {
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
    
    // Hangup message
    const goodbye = "Alright, talk to you later!";
    const goodbyeUrl = await generateChrisVoice(goodbye);
    if (goodbyeUrl) twiml.play(goodbyeUrl);
    else twiml.say({ voice: 'Polly.Joanna' }, goodbye);
    
    res.type('text/xml');
    res.send(twiml.toString());
});

// No input handler
app.post('/voice/no-input', async (req, res) => {
    const twiml = new VoiceResponse();
    
    const msg = "Hey, I didn't hear anything. Feel free to call back when you're ready!";
    const audioUrl = await generateChrisVoice(msg);
    
    if (audioUrl) twiml.play(audioUrl);
    else twiml.say({ voice: 'Polly.Joanna' }, msg);
    
    twiml.hangup();
    
    res.type('text/xml');
    res.send(twiml.toString());
});

// ============================================
// API ENDPOINTS
// ============================================

// Make outbound call
app.post('/api/call', async (req, res) => {
    const { to, message } = req.body;
    
    if (!to) {
        return res.status(400).json({ error: 'Missing "to" phone number' });
    }
    
    try {
        const twilio = require('twilio');
        const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
        
        const call = await client.calls.create({
            to: to,
            from: TWILIO_PHONE_NUMBER,
            url: `${WEBHOOK_URL}/voice/outbound?message=${encodeURIComponent(message || 'Hey, this is EL calling!')}`
        });
        
        console.log(`📤 Outbound call to ${to}, SID: ${call.sid}`);
        res.json({ success: true, callSid: call.sid });
    } catch (error) {
        console.error('❌ Outbound call error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// Outbound call handler
app.post('/voice/outbound', async (req, res) => {
    const message = req.query.message || "Hey, this is EL!";
    const callSid = req.body.CallSid;
    
    console.log(`📞 Outbound call starting: ${message}`);
    
    // Initialize conversation
    conversations.set(callSid, {
        messages: [{ role: 'assistant', content: message }],
        startTime: Date.now()
    });
    
    const twiml = new VoiceResponse();
    
    // Generate Chris voice
    const audioUrl = await generateChrisVoice(message);
    
    if (audioUrl) {
        twiml.play(audioUrl);
    } else {
        twiml.say({ voice: 'Polly.Joanna' }, message);
    }
    
    // Gather response
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
        service: 'EL Phone Agent - Chris Voice', 
        version: '2.0.0',
        phone: TWILIO_PHONE_NUMBER,
        voice: 'Chris (ElevenLabs)',
        url: WEBHOOK_URL
    });
});

// Cleanup old audio files every hour
setInterval(() => {
    try {
        const files = fs.readdirSync(AUDIO_DIR);
        const now = Date.now();
        files.forEach(file => {
            const filepath = path.join(AUDIO_DIR, file);
            const stats = fs.statSync(filepath);
            // Delete files older than 1 hour
            if (now - stats.mtime.getTime() > 3600000) {
                fs.unlinkSync(filepath);
                console.log(`🗑️ Cleaned up old audio: ${file}`);
            }
        });
    } catch (err) {
        console.error('Cleanup error:', err.message);
    }
}, 3600000);

app.listen(PORT, '0.0.0.0', () => {
    console.log(`
🤖 EL Phone Agent - Chris Voice Edition
========================================
✅ Server running on port ${PORT}
📞 Phone number: ${TWILIO_PHONE_NUMBER || 'NOT SET'}
🎙️ Voice: Chris (ElevenLabs)
🌐 Webhook: ${WEBHOOK_URL}
🧠 Brain: Kimi K2.5 (Nexos)

READY FOR CALLS! 📞
    `);
});