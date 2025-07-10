async function Solving(conn, store) {
  console.log('Depin Bot siap menerima pesan...');
}

async function MessagesUpsert(conn, message, store, groupCache) {
  try {
    const msg = message.messages[0];
    if (!msg.message) return;
    const from = msg.key.remoteJid;
    const text = msg.message.conversation || msg.message.extendedTextMessage?.text || '';

    if (text.toLowerCase() === 'ping') {
      await conn.sendMessage(from, { text: 'Pong 🏓' }, { quoted: msg });
    }
  } catch (e) {
    console.error('Message error:', e);
  }
}

async function GroupParticipantsUpdate(conn, update, store, groupCache) {
  console.log('Update anggota grup:', update);
}

module.exports = {
  Solving,
  MessagesUpsert,
  GroupParticipantsUpdate
};
