require('./config')
const pino = require('pino');
const fs = require('fs');
const fsp = require('fs/promises');

const originalOpen = fsp.open;
fsp.open = async function(...args) {
    for (let i = 0; i < 5; i++) {
        try {
            return await originalOpen.apply(this, args);
        } catch (err) {
            if (err?.code === 'EMFILE' && i < 4) {
                await new Promise(r => setTimeout(r, 100 * (i + 1)));
                continue;
            }
            throw err;
        }
    }
};
const path = require('path');
const http = require('http');
const {
    generateWAMessageContent,
    generateWAMessageFromContent,
    generateMessageID,
    prepareWAMessageMedia,
    downloadMediaMessage,
    generateProfilePicture,
    proto
} = require('@whiskeysockets/baileys');
const { getSession } = require('./lib/fetchSession.js');
const { getStoredMessage, rememberMessage } = require('./lib/messageStore.js');
const { startBot, state, AUTH_FOLDER } = require('./lib/connection.js');

const JimpImport = require('jimp');

const Jimp =
  JimpImport.read
    ? JimpImport
    : JimpImport.Jimp
    ? JimpImport.Jimp
    : JimpImport.default;

global.generateWAMessageContent = generateWAMessageContent;
global.generateWAMessageFromContent = generateWAMessageFromContent;
global.generateMessageID = generateMessageID;
global.prepareWAMessageMedia = prepareWAMessageMedia;
global.proto = proto;
global.Jimp = Jimp;
global.generateProfilePicture = generateProfilePicture;
global.downloadMediaMessage = downloadMediaMessage;
global.getMessage = getStoredMessage;
global.rememberMessage = rememberMessage;
global.bannedChats = global.bannedChats || [];

const PORT = process.env.PORT || 8000;

async function ensureSession() {
    const credsPath = path.join(__dirname, 'session', 'creds.json');

    if (fs.existsSync(credsPath)) {
        console.log('[session] creds.json already exists, skipping fetch');
        return;
    }
    if (!global.sessionid) {
        console.log('[session] no SESSIONID set, will use QR/pairing');
        return;
    }

    console.log('[session] fetching session from API...');
    const raw = await getSession(global.sessionid);
    if (!raw) throw new Error('getSession returned empty');

    const sessionData = typeof raw === 'string' ? JSON.parse(raw) : raw;

    if (!sessionData || typeof sessionData !== 'object' || !sessionData.noiseKey) {
        throw new Error('Fetched session is not a valid Baileys creds object');
    }

    fs.mkdirSync(path.dirname(credsPath), { recursive: true });
    fs.writeFileSync(credsPath, JSON.stringify(sessionData, null, 2));
    console.log('[session] creds.json written');
}
async function loadPrefix() {
    const configPath = path.join(__dirname, 'config.json');
    if (fs.existsSync(configPath)) {
        try {
            const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            if (config.prefix) {
                global.BOT_PREFIX = config.prefix;
                console.log(`Loaded prefix: ${global.BOT_PREFIX}`);
            }
        } catch (err) {
            console.error('Error loading config:', err);
        }
    }

    try {
        // Placed it here, lets hope it works
        await ensureSession();
    } catch (err) {
        console.error('[session] failed:', err.message);
    }

    await startBot();
}
const server = http.createServer((req, res) => {
    const url = req.url;
    
    if (url === '/' || url === '/qr') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>WhatsApp Bot</title>
</head>
<body>
    <div style="max-width: 800px; margin: 20px auto; padding: 20px; font-family: Arial, sans-serif;">
        <h1>WhatsApp Bot</h1>
        <hr>
        
        <h2>Status</h2>
        <p><strong>Status:</strong> <span id="statusLabel">Disconnected</span></p>
        <p><strong>Prefix:</strong> ${global.BOT_PREFIX || '.'}</p>
        <p><strong>Uptime:</strong> <span id="uptime">0s</span></p>
        <hr>
        
        <h2>QR Code Login</h2>
        <div id="qrArea" style="margin: 20px 0; padding: 20px; border: 1px solid #ccc; border-radius: 8px; text-align: center; min-height: 200px;">
            <p>Loading QR code...</p>
        </div>
        <hr>
        
        <h2>Pair with Code</h2>
        <div style="margin: 20px 0; padding: 20px; border: 1px solid #ccc; border-radius: 8px;">
            <label>Phone Number (with country code):</label><br>
            <input type="tel" id="phoneNumber" placeholder="233533763772" style="width: 100%; padding: 10px; margin: 10px 0; border: 1px solid #ccc; border-radius: 4px; font-size: 16px;">
            <button id="pairBtn" style="width: 100%; padding: 12px; background: #25D366; color: white; border: none; border-radius: 4px; font-size: 16px; cursor: pointer; font-weight: bold;">Get Pairing Code</button>
            <div id="pairingCodeDisplay" style="display: none; margin-top: 15px; padding: 15px; background: #d4edda; border: 1px solid #c3e6cb; border-radius: 4px; text-align: center;">
                <p><strong>Pairing Code:</strong></p>
                <p id="pairingCode" style="font-size: 26px; font-weight: bold; color: #155724; letter-spacing: 2px; user-select: all; -webkit-user-select: all; cursor: pointer;" title="Click to copy"></p>
                <button type="button" id="copyCodeBtn" style="margin: 8px auto; padding: 8px 18px; background: #155724; color: white; border: none; border-radius: 4px; font-size: 14px; cursor: pointer; font-weight: bold;">Copy Code</button>
                <p style="font-size: 12px; color: #155724; margin-top: 8px;">Enter this code in WhatsApp > Linked Devices > Link with phone number</p>
            </div>
        </div>
        <hr>
        
        <div style="margin-top: 20px; padding: 15px; background: #f8f9fa; border-radius: 4px; text-align: center;">
            <p style="margin: 5px; font-size: 14px; color: #6c757d;">Session stored securely | Auto-reconnect enabled</p>
        </div>
    </div>

    <script>
        let refreshInterval = null;
        let currentQR = null;

        function setStatus(status) {
            const statusElem = document.getElementById('statusLabel');
            let statusText = status.charAt(0).toUpperCase() + status.slice(1);
            statusElem.textContent = statusText;
            statusElem.style.color = status === 'connected' ? '#28a745' : status === 'connecting' ? '#ffc107' : '#dc3545';
        }

        function updateQR(qrData) {
            const qrArea = document.getElementById('qrArea');
            if (qrData) {
                currentQR = qrData;
                qrArea.innerHTML = \`
                    <div style="display: inline-block; background: white; padding: 15px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
                        <img src="\${qrData}" alt="QR Code" style="max-width: 250px; width: 100%; height: auto;">
                    </div>
                    <p style="margin-top: 10px; font-size: 14px; color: #6c757d;">
                        Scan with WhatsApp > Linked Devices > Link a Device
                    </p>
                \`;
            } else {
                qrArea.innerHTML = \`
                    <div style="padding: 40px 20px; background: #f8f9fa; border-radius: 8px;">
                        <p style="font-size: 48px; margin: 0;">QR</p>
                        <p style="color: #6c757d;">QR code will appear here when ready</p>
                    </div>
                \`;
            }
        }

        function updatePairingCode(code) {
            const displayDiv = document.getElementById('pairingCodeDisplay');
            const codeSpan = document.getElementById('pairingCode');
            if (code && code !== 'null' && code !== 'undefined') {
                if (codeSpan.textContent !== code) {
                    codeSpan.textContent = code;
                }
                if (displayDiv.style.display !== 'block') {
                    displayDiv.style.display = 'block';
                }
            } else {
                if (displayDiv.style.display !== 'none') {
                    displayDiv.style.display = 'none';
                    codeSpan.textContent = '';
                }
            }
        }

        function copyPairingCode() {
            const codeSpan = document.getElementById('pairingCode');
            const code = codeSpan.textContent.trim();
            if (!code) return;
            navigator.clipboard.writeText(code).then(() => {
                const btn = document.getElementById('copyCodeBtn');
                if (btn) {
                    const originalText = btn.textContent;
                    btn.textContent = 'Copied!';
                    btn.style.background = '#28a745';
                    setTimeout(() => {
                        btn.textContent = originalText;
                        btn.style.background = '#155724';
                    }, 2000);
                }
            }).catch(() => {});
        }

        function updateUptime(uptime) {
            const uptimeElem = document.getElementById('uptime');
            if (uptime) {
                const seconds = Math.floor(uptime);
                const minutes = Math.floor(seconds / 60);
                const hours = Math.floor(minutes / 60);
                const days = Math.floor(hours / 24);
                
                let uptimeStr = '';
                if (days > 0) uptimeStr += days + 'd ';
                if (hours > 0) uptimeStr += (hours % 24) + 'h ';
                if (minutes > 0) uptimeStr += (minutes % 60) + 'm ';
                uptimeStr += (seconds % 60) + 's';
                
                uptimeElem.textContent = uptimeStr;
            }
        }

        async function fetchStatus() {
            try {
                const resp = await fetch('/api/status');
                if (!resp.ok) throw new Error('Status fetch failed');
                const data = await resp.json();
                
                setStatus(data.status);
                updateUptime(data.uptime);
                
                if (data.status === 'connected') {
                    updateQR(null);
                    updatePairingCode(null);
                } else if (data.qr && data.qr !== currentQR) {
                    updateQR(data.qr);
                } else if (!data.qr) {
                    updateQR(null);
                }
                
                updatePairingCode(data.pairingCode);
                
            } catch (err) {
                console.error('Status poll error:', err);
            }
        }

        async function requestPairingCode() {
            const phoneInput = document.getElementById('phoneNumber');
            const phone = phoneInput.value.trim();
            const pairBtn = document.getElementById('pairBtn');
            
            if (!phone) {
                alert('Please enter your phone number with country code');
                return;
            }
            
            if (!phone.match(/^[0-9]{10,15}$/)) {
                alert('Please enter a valid phone number (numbers only, with country code)');
                return;
            }
            
            pairBtn.disabled = true;
            pairBtn.textContent = 'Requesting...';
            
            try {
                const formData = new URLSearchParams();
                formData.append('phone', phone);
                
                const resp = await fetch('/pair', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: formData
                });
                
                const text = await resp.text();
                if (resp.ok && text.includes('Pairing Code')) {
                    fetchStatus();
                    setTimeout(() => fetchStatus(), 2000);
                    setTimeout(() => fetchStatus(), 5000);
                } else {
                    alert('Failed to get pairing code. Make sure phone number is correct (e.g. 233533763772).');
                }
            } catch (err) {
                alert('Error: ' + err.message);
            } finally {
                pairBtn.disabled = false;
                pairBtn.textContent = 'Get Pairing Code';
            }
        }
        
        document.getElementById('pairBtn').addEventListener('click', requestPairingCode);
        document.getElementById('phoneNumber').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') requestPairingCode();
        });
        document.getElementById('copyCodeBtn').addEventListener('click', copyPairingCode);
        document.getElementById('pairingCode').addEventListener('click', copyPairingCode);
        
        refreshInterval = setInterval(fetchStatus, 2000);
        fetchStatus();
        
        window.addEventListener('beforeunload', () => {
            if (refreshInterval) clearInterval(refreshInterval);
        });
    </script>
</body>
</html>`);
    } 
    
    else if (url === '/pair' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: Arial; padding: 20px; text-align: center; }
        form { margin: 20px; padding: 20px; background: #f0f0f0; display: inline-block; }
        input, button { padding: 10px; margin: 5px; }
    </style>
</head>
<body>
    <h1>Pair WhatsApp</h1>
    <form method="POST">
        Phone: <input type="text" name="phone" placeholder="911234567890" required><br><br>
        <button type="submit">Get Code</button><br><br>
        <a href="/">Back</a>
    </form>
</body>
</html>`);
    }
    
    else if (url === '/pair' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const params = new URLSearchParams(body);
                let phoneNumber = params.get('phone').trim();
                
                if (!phoneNumber) {
                    res.writeHead(200, { 'Content-Type': 'text/html' });
                    res.end(`<center><h2>Error: Phone number required</h2><a href="/pair">Try Again</a></center>`);
                    return;
                }

                phoneNumber = phoneNumber.replace(/\D/g, '');
                
                if (!state.sock) {
                    res.writeHead(200, { 'Content-Type': 'text/html' });
                    res.end(`<center><h2>Bot not ready</h2><p>Please wait a moment for the bot to initialize.</p><a href="/">Go Back</a></center>`);
                    return;
                }

                if (state.botStatus === 'connected') {
                    res.writeHead(200, { 'Content-Type': 'text/html' });
                    res.end(`<center><h2>Already linked</h2><p>The device is already connected.</p><a href="/">Go Back</a></center>`);
                    return;
                }

                const pairingCode = await state.sock.requestPairingCode(phoneNumber);
                
                state.pairingCodes.set(phoneNumber, {
                    code: pairingCode,
                    timestamp: Date.now()
                });

                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end(`<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: Arial; padding: 20px; text-align: center; }
        .code { font-size: 2em; color: green; font-weight: bold; margin: 20px; }
        .info { background: #e8f5e8; padding: 15px; margin: 20px; border-radius: 5px; }
    </style>
</head>
<body>
    <h1>Pairing Code Generated</h1>
    <h2>Phone: ${phoneNumber}</h2>
    <div class="code">Code: ${pairingCode}</div>
    <div class="info">
        <p>Go to WhatsApp > Settings > Linked Devices > Link a Device</p>
        <p>Select "Use pairing code" and enter the code above</p>
    </div>
    <br>
    <a href="/">Home</a> | <a href="/pair">Pair Another</a>
</body>
</html>`);

                console.log(`Pairing code for ${phoneNumber}: ${pairingCode}`);
                
            } catch (error) {
                console.error('Pair error:', error);
                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end(`<center><h2>Error</h2><p>${error.message}</p><p>Make sure the phone number is in international format (e.g., 911234567890)</p><a href="/pair">Try Again</a></center>`);
            }
        });
        return;
    }
    
    else if (url === '/api/status') {
        let pairingCode = null;
        for (const [_, data] of state.pairingCodes) {
            if (Date.now() - data.timestamp < 300000) {
                pairingCode = data.code;
                break;
            }
        }
        
        res.writeHead(200, { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
        });
        res.end(JSON.stringify({ 
            status: state.botStatus,
            hasQR: !!state.latestQR,
            qr: state.latestQR,
            pairingCode: pairingCode,
            prefix: global.BOT_PREFIX,
            timestamp: new Date().toISOString(),
            uptime: process.uptime()
        }));
    }
    
    else {
        res.writeHead(404, { 'Content-Type': 'text/html' });
        res.end(`<center><h1>404 - Page Not Found</h1><a href="/">Go Home</a></center>`);
    }
});

server.listen(PORT, async () => {
    console.log(`Web server running at http://localhost:${PORT}`);
    console.log(`Session folder: ${path.resolve(AUTH_FOLDER)}`);
    await loadPrefix();
});

process.on('SIGINT', () => {
    console.log('\nShutting down gracefully...');
    process.exit(0);
});

process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection:', reason);
});
