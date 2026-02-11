#!/bin/bash
# EL Phone Agent Launcher - Keep everything running

cd /root/.openclaw/workspace/el-phone-agent-twilio

echo "🚀 Starting EL Phone Agent..."

# Start server
node server.js &
SERVER_PID=$!
echo "Server PID: $SERVER_PID"

sleep 5

# Start cloudflare tunnel with auto-restart
echo "🌐 Starting Cloudflare tunnel..."
while true; do
    cloudflared tunnel --protocol http2 --url http://localhost:3001 2>&1 | tee /tmp/cf-output.log
    echo "⚠️  Tunnel died, restarting in 5s..."
    sleep 5
done &

CF_PID=$!
echo "Tunnel PID: $CF_PID"

echo "✅ EL Phone Agent is running!"
echo "📞 Phone: +1 (450) 234-7756"
echo ""
echo "Press Ctrl+C to stop"

# Keep script running
wait