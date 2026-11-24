# XLICON-V2-MD

XLICON-V2-MD is a multi-device WhatsApp bot built on
[@whiskeysockets/baileys](https://github.com/WhiskeySockets/Baileys).
It was created by SALMAN AHMAD (salmanytofficial) and Abraham Dwamena
(abztech) and is maintained in this fork for cleanup and documentation work.

The bot loads 77 plugins from the `plugins/` directory at startup
(`index.js` logs `Total plugins loaded: N`), groups them under a single
command prefix (`.` by default), and stores its WhatsApp session in the
gitignored `session/` folder.

## Repository layout

```
xlicon/
  index.js        Bot entry point: connection, message handling, plugin loader
  handler.js      Shared message/context helpers passed to plugins
  config.js       Globals: prefix, owner/dev JIDs, menu image, owner name
  plugins/        77 command plugins (one module each, name + execute)
  lib/            fetchSession.js (session retrieval), sticker.js
  session/        Persisted WhatsApp credentials (gitignored)
  .env            SESSION_ID and other environment values
```

## Setup

Requirements: Node.js and a WhatsApp account to link as the bot.

1. Install dependencies:

   ```bash
   npm install
   ```

2. Provide a session ID. The bot reads `SESSION_ID` from the environment
   (`config.js`: `global.sessionid = process.env.SESSION_ID || ''`) and
   fetches credentials from the paired session API in
   `lib/fetchSession.js` (`https://xlicon-sessionid.koyeb.app`). Create a
   `.env` file or export the variable:

   ```bash
   echo "SESSION_ID=your-session-id" > .env
   ```

3. Start the bot:

   ```bash
   npm start
   ```

   `npm run stop` and `npm run restart` wrap `pm2 stop/restart Xlicon`;
   `pm2` is included as a dev dependency.

Note in `config.js`: the upstream author documents an unresolved issue
where the bot stops working after linking with a session ID.

## Plugins

Plugins are CommonJS modules exporting `name`, optional `aliases`, and an
`execute(sock, m, args)` function. The loader in `index.js` registers every
`.js` file in `plugins/` and matches incoming commands against each plugin's
`name` and `aliases`. Grouped by primary purpose:

- AI and search: `ai`, `ai-search`, `aiv` (AI voice search)
- Anime and images: `anime` (waifu), `husbando`, `kitsune`, `neko`,
  `couplepp`, `img`, `bluearchive`
- Media downloaders: `play`, `ytdl` (ytmp3), `ytmp4`, `ytsearch`,
  `fbdl`, `instadl`, `ttdl`, `view-once`, `clip`
- Stickers and images: `sticker`, `sticker-roundedeffect`, `resize`,
  `write` (handwritten text), `textpro`, `tweet`, `create` (genimg),
  `ocr`, `tourl`, `pp`
- Group management: `admin-power` (promote/demote), `kick`, `antilinkdel`,
  `antigst`, `linkgc`, `group-info`, `groupsettings`, `groupstatus`,
  `welcome`, `joinleave`, `tagall`, `tag_everyone`, `tagme`, `retag`,
  `forward`, `poll`, `channelid`
- Utilities and tools: `shazam`, `tts`, `tts2`, `weather`, `bible`,
  `agecalculator`, `guessflag`, `guessgender`, `style`, `hide`
  (readmore), `temp` (deltmp), `exec`, `save`, `delete`
- Bot and owner: `alive`, `ping`, `uptime`, `menu`, `main-menu2`, `guide`,
  `Addowner`, `setprefix`, `setpp`, `self`, `creator`, `logger`,
  `mention`, `autoreact`, `arise`, `XLICON-reply`, `niggareply`

## Configuration

`config.js` defines two role lists plus shared globals:

- `global.owners` - bot owners (full command access, owner-only plugins
  such as `exec`, `save`, and `setprefix`).
- `global.dev` - developers credited in menus; distinct from owners.
- `global.BOT_PREFIX` - command prefix (`.`).
- `global.menuImage` - image shown in the main menu.
- `global.ownerName` - name displayed in bot UI.

Owner and developer JIDs are hard-coded in `config.js`; edit that file to
change them. Do not commit a `config.js` with real JIDs to a public fork
(it is listed in `.gitignore`).

## Dependencies

All 24 runtime dependencies in `package.json` (including `@hapi/boom`,
`@whiskeysockets/baileys`, `axios`, `sharp`, `pino`, `qrcode`,
`fluent-ffmpeg`, `yt-search`, `google-tts-api`, `acrcloud`, `pixcore`,
`gifted-btns`, `jimp`, `node-webpmux`, `file-type`, `dotenv`, `express`,
`body-parser`, `node-fetch`, `@img/sharp-wasm32`, `qrcode-terminal`,
`pino-pretty`, `os`, `path`) resolve on the npm registry as of November
2026; none are dead. `pm2` is the sole dev dependency.

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening issues or pull
requests; report security vulnerabilities per
[SECURITY.md](SECURITY.md) rather than in public issues.

## Credits

- Baileys library: [WhiskeySockets](https://github.com/WhiskeySockets/Baileys)
  (originally by adiwajshing)
- XLICON-V2 creator: [salmanytofficial](https://github.com/salmanytofficial)
- Main developer: [abrahamdw882](https://github.com/abrahamdw882) (abztech)

License: [MIT](LICENSE)
