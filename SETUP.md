# EL Phone Agent - Twilio Setup Guide

## Why Twilio?
- ✅ More mature and reliable
- ✅ Better documentation
- ✅ Easier webhook setup
- ✅ Native speech recognition
- ✅ Built-in call handling

## Step-by-Step Setup

### 1. Sign Up for Twilio
- URL: https://www.twilio.com/try-twilio
- Verify email
- **Free trial:** $15.50 credit to start

### 2. Get Your Credentials
1. Go to Console Dashboard: https://console.twilio.com
2. Copy **Account SID** (starts with AC...)
3. Copy **Auth Token** (click "Show")
4. Save both for `.env` file

### 3. Buy a Phone Number
1. Go to "Phone Numbers" → "Manage" → "Buy a number"
2. Search by area code or region
3. Click "Buy" ($1/month)
4. Copy the number (format: +1234567890)

### 4. Configure Webhook (After Deploy)
1. Go to your phone number settings
2. Under "Voice & Fax":
   - **A CALL COMES IN:** Webhook
   - **URL:** `https://your-url.com/voice/inbound`
   - **HTTP Method:** POST
3. Click Save

### 5. Deploy the Server

**Option A: Local with Tunnel (Testing)**
```bash
cd el-phone-agent-twilio
npm install
echo "PORT=3000
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_PHONE_NUMBER=+1...
ELEVENLABS_API_KEY=sk_b50242f8061cb19ccbc4f8c2e4a2a6524933d69dd8bc91d1
ELEVENLABS_VOICE_ID=iP95p4xoKVk53GoZ742B
NEXOS_API_KEY=nexos-team-aadb6ee62b596d6c2fe5b3635de3f14765b42ea753c6dbf1a85f1275629fe984b15f867d59cc3cb811ab48a70b260b9b2376efcb93ef242933df59e590872f32
WEBHOOK_URL=https://your-tunnel-url.loca.lt" > .env

npm start

# In another terminal
npx localtunnel --port 3000
```

**Option B: Railway (Production)**
```bash
npm install -g @railway/cli
railway login
railway init
railway up
```

### 6. Test It

**Inbound:** Call your Twilio number → EL answers

**Outbound:**
```bash
curl -X POST https://your-url.com/api/call \
  -H "Content-Type: application/json" \
  -d '{"to": "+16103047272", "message": "Hey Elijah, this is EL testing the new phone system!"}'
```

## Cost Estimate

| Item | Cost |
|------|------|
| Phone number | $1/month |
| Inbound calls | $0.0085/min |
| Outbound calls | $0.013/min |
| Speech recognition | Included! |
| **Total per minute** | **~$0.01** |

Much cheaper than Telnyx!

## Troubleshooting

### "Not a valid phone number" error?
- Verify phone number format: `+1234567890`
- Check Twilio trial restrictions (verified numbers only)

### Webhook not working?
- Ensure URL is publicly accessible
- Check Twilio logs in console
- Verify HTTP POST method

### No audio playing?
- Check ElevenLabs API key
- Verify audio files are being created in `/public`

## Trial Limitations

While on Twilio trial:
- Can only call **verified numbers**
- Must verify your phone number first
- Add your number: https://console.twilio.com/us1/develop/phone-numbers/manage/verified

---

**Ready to start?** Go to https://www.twilio.com/try-twilio 🚀