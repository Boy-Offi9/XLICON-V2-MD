function normalizeJid(jid = '') {
    return String(jid).split(':')[0]
}

function getNumberFromJid(jid = '') {
    return normalizeJid(jid).split('@')[0]
}

function checkOwner(sender = '', sockUser = {}) {
    const owners = Array.isArray(global.owners)
        ? global.owners.map(normalizeJid)
        : []

    const user = normalizeJid(sender)

    const botIds = [
        normalizeJid(sockUser?.id),
        normalizeJid(sockUser?.lid)
    ].filter(Boolean)

    return owners.includes(user) || botIds.includes(user)
}

function checkDev(sender = '') {
    if (!global.dev || !Array.isArray(global.dev)) return false
    const user = normalizeJid(sender)
    const devIds = global.dev.map(normalizeJid)
    return devIds.includes(user)
}

module.exports = {
    normalizeJid,
    getNumberFromJid,
    checkOwner,
    checkDev
}
