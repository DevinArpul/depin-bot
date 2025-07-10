require('./settings');
const fs = require('fs');
const pino = require('pino');
const axios = require('axios');
const chalk = require('chalk');
const readline = require('readline');
const { Boom } = require('@hapi/boom');
const qrcode = require('qrcode-terminal');
const NodeCache = require('node-cache');
const { toBuffer } = require('qrcode');
const { exec } = require('child_process');
const PhoneNumber = require('awesome-phonenumber'); // ✅ diperbaiki

const { default: WAConnection, useMultiFileAuthState, Browsers, DisconnectReason, makeCacheableSignalKeyStore, fetchLatestBaileysVersion } = require('baileys');
const { dataBase } = require('./src/database');
const { app, server, PORT } = require('./src/server');
const { GroupParticipantsUpdate, MessagesUpsert, Solving } = require('./src/message');
const { isUrl, generateMessageTag, getBuffer, getSizeMedia, fetchJson, sleep } = require('./lib/function');

const pairingCode = process.argv.includes('--qr') ? false : process.argv.includes('--pairing-code') || global.pairing_code;
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const question = (text) => new Promise((resolve) => rl.question(text, resolve));

let pairingStarted = false;
let phoneNumber;

global.fetchApi = async (path = '/', query = {}, options) => {
  const urlnya = (options?.name || options ? ((options?.name || options) in global.APIs ? global.APIs[(options?.name || options)] : (options?.name || options)) : global.APIs['hitori'] ? global.APIs['hitori'] : (options?.name || options)) + path + (query ? '?' + decodeURIComponent(new URLSearchParams(Object.entries({ ...query }))) : '');
  const { data } = await axios.get(urlnya, { ...((options?.name || options) ? {} : { headers: { 'accept': 'application/json', 'x-api-key': global.APIKeys[global.APIs['hitori']] } }) });
  return data;
};

const storeDB = dataBase(global.tempatStore);
const database = dataBase(global.tempatDB);
const msgRetryCounterCache = new NodeCache();
const groupCache = new NodeCache({ stdTTL: 5 * 60, useClones: false });

server.listen(PORT, () => {
  console.log('App listened on port', PORT);
});

async function startDepinBot() {
  const { state, saveCreds } = await useMultiFileAuthState('depindev');
  const { version } = await fetchLatestBaileysVersion();
  const level = pino({ level: 'silent' });

  try {
    const loadData = await database.read();
    const storeLoadData = await storeDB.read();
    global.db = loadData || { hit: {}, set: {}, list: {}, store: {}, users: {}, game: {}, groups: {}, database: {}, premium: [], sewa: [] };
    await database.write(global.db);
    global.store = storeLoadData || { contacts: {}, presences: {}, messages: {}, groupMetadata: {} };
    await storeDB.write(global.store);

    setInterval(async () => {
      if (global.db) await database.write(global.db);
      if (global.store) await storeDB.write(global.store);
    }, 30 * 1000);
  } catch (e) {
    console.log(e);
    process.exit(1);
  }

  const getMessage = async (key) => {
    const messages = store.messages?.[key.remoteJid]?.array;
    if (!messages) return { conversation: 'Halo Saya Depin Bot' };
    const msg = messages.find(msg => msg?.key?.id === key.id);
    return msg?.message || { conversation: 'Halo Saya Depin Bot' };
  };

  const depin = WAConnection({
    logger: level,
    getMessage,
    syncFullHistory: true,
    maxMsgRetryCount: 15,
    msgRetryCounterCache,
    retryRequestDelayMs: 10,
    defaultQueryTimeoutMs: 0,
    connectTimeoutMs: 60000,
    browser: Browsers.ubuntu('Chrome'),
    generateHighQualityLinkPreview: true,
    cachedGroupMetadata: async (jid) => groupCache.get(jid),
    shouldSyncHistoryMessage: msg => {
      console.log(`\x1b[32mMemuat Chat [${msg.progress || 0}%]\x1b[39m`);
      return !!msg.syncType;
    },
    transactionOpts: {
      maxCommitRetries: 10,
      delayBetweenTriesMs: 10,
    },
    appStateMacVerification: {
      patch: true,
      snapshot: true,
    },
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, level),
    },
  });

  if (pairingCode && !phoneNumber && !depin.authState.creds.registered) {
    async function getPhoneNumber() {
      phoneNumber = global.number_bot || process.env.BOT_NUMBER || await question('Please type your WhatsApp number: ');
      phoneNumber = phoneNumber.replace(/[^0-9]/g, '');

      const pn = new PhoneNumber('+' + phoneNumber);
      if (!pn.isValid() && phoneNumber.length < 6) {
        console.log(chalk.bgBlack(chalk.redBright('Start with your Country WhatsApp code') + chalk.whiteBright(',') + chalk.greenBright(' Example : 62xxx')));
        await getPhoneNumber();
      }
    }

    await getPhoneNumber();
    await exec('rm -rf ./depindev/*');
    console.log('Phone number captured. Waiting for Connection...');
  }

  await Solving(depin, store);
  depin.ev.on('creds.update', saveCreds);

  depin.ev.on('connection.update', async ({ qr, connection, lastDisconnect, isNewLogin, receivedPendingNotifications }) => {
    if (!depin.authState.creds.registered) console.log('Connection: ', connection || false);
    if ((connection === 'connecting' || !!qr) && pairingCode && phoneNumber && !depin.authState.creds.registered && !pairingStarted) {
      setTimeout(async () => {
        pairingStarted = true;
        console.log('Requesting Pairing Code...');
        let code = await depin.requestPairingCode(phoneNumber);
        console.log(`Your Pairing Code : ${code}`);
      }, 3000);
    }
    if (connection === 'close') {
      const reason = new Boom(lastDisconnect?.error)?.output.statusCode;
      if ([DisconnectReason.connectionLost, DisconnectReason.connectionClosed, DisconnectReason.restartRequired, DisconnectReason.timedOut].includes(reason)) {
        console.log('Attempting to reconnect...');
        startDepinBot();
      } else if ([DisconnectReason.badSession, DisconnectReason.loggedOut, DisconnectReason.forbidden, DisconnectReason.multideviceMismatch].includes(reason)) {
        console.log('Session error. Clearing session...');
        exec('rm -rf ./depindev/*');
        process.exit(1);
      } else if (reason === DisconnectReason.connectionReplaced) {
        console.log('Close current Session first...');
      } else {
        depin.end(`Unknown DisconnectReason : ${reason}|${connection}`);
      }
    }
    if (connection === 'open') {
      console.log('Connected to : ' + JSON.stringify(depin.user, null, 2));
    }
    if (qr && !pairingCode) qrcode.generate(qr, { small: true });
    if (isNewLogin) console.log(chalk.green('New device login detected...'));
    if (receivedPendingNotifications == 'true') depin.ev.flush();
  });

  depin.ev.on('messages.upsert', async (message) => {
    await MessagesUpsert(depin, message, store, groupCache);
  });

  depin.ev.on('group-participants.update', async (update) => {
    await GroupParticipantsUpdate(depin, update, store, groupCache);
  });

  setInterval(async () => {
    if (depin?.user?.id) await depin.sendPresenceUpdate('available', depin.decodeJid(depin.user.id)).catch(e => {});
  }, 10 * 60 * 1000);

  return depin;
}

startDepinBot();

const cleanup = async (signal) => {
  console.log(`Received ${signal}. Menyimpan database...`);
  if (global.db) await database.write(global.db);
  if (global.store) await storeDB.write(global.store);
  server.close(() => {
    console.log('Server closed. Exiting...');
    process.exit(0);
  });
};

process.on('SIGINT', () => cleanup('SIGINT'));
process.on('SIGTERM', () => cleanup('SIGTERM'));
process.on('exit', () => cleanup('exit'));

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.log(`Address localhost:${PORT} in use.`);
    server.close();
  } else console.error('Server error:', error);
});

setInterval(() => {}, 1000 * 60 * 10);

let file = require.resolve(__filename);
fs.watchFile(file, () => {
  fs.unwatchFile(file);
  console.log(chalk.redBright(`Update ${__filename}`));
  delete require.cache[file];
  require(file);
});
