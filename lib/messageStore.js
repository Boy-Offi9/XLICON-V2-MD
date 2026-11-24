const MESSAGE_STORE_LIMIT = 1500;
const messageStore = new Map();

function rememberMessage(msg) {
    const id = msg?.key?.id;
    if (!id || !msg.message) return;
    messageStore.delete(id);
    messageStore.set(id, {
        message: msg.message,
        remoteJid: msg.key.remoteJid,
        participant: msg.key.participant,
        timestamp: Date.now()
    });
    while (messageStore.size > MESSAGE_STORE_LIMIT) {
        messageStore.delete(messageStore.keys().next().value);
    }
}

function getStoredMessage(key) {
    if (!key?.id) return undefined;
    const entry = messageStore.get(key.id);
    if (!entry) return undefined;
    messageStore.delete(key.id);
    messageStore.set(key.id, entry);
    return entry.message;
}

module.exports = { rememberMessage, getStoredMessage, messageStore, MESSAGE_STORE_LIMIT };
