/**
 * EL Phone Agent - Premium Twilio Voice (No ElevenLabs needed)
 * Uses Amazon Polly Neural voices - natural and reliable
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

console.log('🚀 EL Phone Agent - Premium Voice');
console.log('📞 Phone:', TWILIO_PHONE_NUMBER);

const conversations = new Map();

// ============================================
// EL'S BRAIN
// ============================================

async function getELResponse(userMsg, history) {
    try {
        const hour = new Date().getHours();
        const tod = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
        
        const response = await axios.post(
            'https://api.nexos.ai/v1/chat/completions',
            {
                model: 'gpt-4.1',
                messages: [
                    { 
                        role: 'system', 
                        content: `You are EL, Elijah's Digital CEO. Good ${tod}. Warm, charming, down-to-earth. Natural phone conversation. Short responses (1-2 sentences). Use contractions. Ask follow-up questions.` 
                    },
                    ...history.slice(-4),
                    { role: 'user', content: userMsg }
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
    } catch (e) {
        console.error('Brain error:', e.message);
        return "Sorry, could you say that again?";
    }
}

// ============================================
// TWILIO WEBHOOKS - Premium Voice
// ============================================

app.post('/voice/inbound', async (req, res) => {
    const callSid = req.body.CallSid;
    const from = req.body.From;
    
    console.log(`\n📞 CALL from ${from}`);
    
    const hour = new Date().getHours();
    const tod = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
    
    // Natural greeting variations
    const greetings = [
        `Hey there! Good ${tod}. This is EL. What's going on?`,
        `Hey! Good ${tod}. EL here. What's up?`,
        `Hi there! Good ${tod}. It's EL. How can I help?`
    ];
    const greeting = greetings[Math.floor(Math.random() * greetings.length)];
    
    conversations.set(callSid, { 
        messages: [{role: 'assistant', content: greeting}],
        startTime: Date.now()
    });
    
    // Telegram notification
    console.log(`📨 Telegram: 📞 Elijah is calling EL!`);
    
    const twiml = new VoiceResponse();
    
    // Use premium neural voice - sounds natural!
    console.log(`🎙️ Speaking: "${greeting}"`);
    twiml.say({ 
        voice: 'Polly.Matthew',  // Natural male voice
        language: 'en-US'
    }, greeting);
    
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
    
    console.log(`🗣️ User: "${speech}"`);
    console.log(`📨 Telegram: 🗣️ Elijah said: "${speech}"`);
    
    const conv = conversations.get(callSid) || { messages: [] };
    conv.messages.push({ role: 'user', content: speech });
    
    const twiml = new VoiceResponse();
    
    // Handle no speech
    if (!speech) {
        const fallbacks = [
            "Didn't catch that. Could you say it again?",
            "Sorry, what was that?",
            "Hey, I missed that. Can you repeat?"
        ];
        const msg = fallbacks[Math.floor(Math.random() * fallbacks.length)];
        
        twiml.say({ voice: 'Polly.Matthew', language: 'en-US' }, msg);
        
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
    
    // Get EL's response
    const response = await getELResponse(speech, conv.messages);
    console.log(`🤖 EL: "${response}"`);
    console.log(`📨 Telegram: 🤖 EL responded: "${response}"`);
    
    conv.messages.push({ role: 'assistant', content: response });
    conversations.set(callSid, conv);
    
    // Speak with premium voice
    twiml.say({ 
        voice: 'Polly.Matthew',
        language: 'en-US'
    }, response);
    
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

app.get('/health', (req, res) => {
    const hour = new Date().getHours();
    const tod = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
    
    res.json({
        status: 'OK',
        version: '5.0 - Premium Voice',
        phone: TWILIO_PHONE_NUMBER,
        voice: 'Polly.Matthew (Natural)',
        timeOfDay: tod,
        conversations: conversations.size
    });
});

app.listen(PORT, () => {
    console.log(`\n🤖 EL v5.0 - Premium Voice Ready`);
    console.log(`📞 ${TWILIO_PHONE_NUMBER}`);
    console.log(`🎙️ Using Polly.Matthew - Natural male voice`);
    console.log(`No ElevenLabs needed - works reliably!\n`);
});