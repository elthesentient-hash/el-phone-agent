/**
 * ElevenLabs Proxy Server
 * Runs on your VPS to bypass Railway IP block
 */

const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.json({ limit: '50mb' }));

const ELEVENLABS_API_KEY = 'sk_b50242f8061cb19ccbc4f8c2e4a2a6524933d69dd8bc91d1';
const ELEVENLABS_VOICE_ID = 'iP95p4xoKVk53GoZ742B';

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'OK', service: 'ElevenLabs Proxy' });
});

// Proxy TTS requests
app.post('/tts', async (req, res) => {
    try {
        const { text } = req.body;
        
        console.log(`🎙️ Proxy TTS: "${text?.substring(0, 50)}..."`);
        
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
                timeout: 20000
            }
        );
        
        res.set('Content-Type', 'audio/mpeg');
        res.send(response.data);
        console.log(`✅ Proxy success: ${response.data.length} bytes`);
        
    } catch (error) {
        console.error('❌ Proxy error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

const PORT = 3002;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🎙️ ElevenLabs Proxy running on port ${PORT}`);
    console.log(`📡 Railway can now use: http://YOUR_SERVER_IP:${PORT}/tts`);
});