/**
 * VoiceCallApp - Sinyalizasyon Sunucusu v2
 * Kullanıcı adı kaydı + çevrimiçi listesi + doğrudan arama
 *
 * Kurulum:
 *   npm install ws
 *   node server.js
 */

const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: 8080 });

// Kayıtlı kullanıcılar: { username -> WebSocket }
const onlineUsers = new Map();

console.log("Sunucu port 8080'de çalışıyor...");

function broadcast(data) {
  const msg = JSON.stringify(data);
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) client.send(msg);
  });
}

function getOnlineList() {
  return Array.from(onlineUsers.keys());
}

wss.on('connection', (ws) => {
  let myUsername = null;

  ws.on('message', (data) => {
    let msg;
    try { msg = JSON.parse(data); } catch { return; }
    const { type } = msg;

    // ── Kullanıcı adıyla kayıt ol ──────────────────────────
    if (type === 'register') {
      const username = (msg.username || '').trim().toLowerCase();
      if (!username || username.length < 2 || username.length > 20) {
        ws.send(JSON.stringify({ type: 'register_error', reason: 'Kullanici adi 2-20 karakter olmali.' }));
        return;
      }
      if (!/^[a-z0-9_]+$/.test(username)) {
        ws.send(JSON.stringify({ type: 'register_error', reason: 'Sadece harf, rakam ve _ kullanilabilir.' }));
        return;
      }
      if (onlineUsers.has(username)) {
        ws.send(JSON.stringify({ type: 'register_error', reason: 'Bu kullanici adi zaten kullanimda.' }));
        return;
      }
      myUsername = username;
      onlineUsers.set(username, ws);
      ws.send(JSON.stringify({ type: 'register_ok', username }));
      broadcast({ type: 'online_list', users: getOnlineList() });
      console.log(`+ ${username} baglandi (${onlineUsers.size} cevrimici)`);
      return;
    }

    if (!myUsername) {
      ws.send(JSON.stringify({ type: 'error', reason: 'Once kayit olun.' }));
      return;
    }

    // ── Kullanıcı ara ─────────────────────────────────────
    if (type === 'search') {
      const target = (msg.username || '').trim().toLowerCase();
      ws.send(JSON.stringify({ type: 'search_result', username: target, online: onlineUsers.has(target) }));
      return;
    }

    // ── Arama isteği gönder ───────────────────────────────
    if (type === 'call_request') {
      const targetWs = onlineUsers.get(msg.to);
      if (!targetWs || targetWs.readyState !== WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'call_error', reason: 'Kullanici cevrimdisi.' }));
        return;
      }
      targetWs.send(JSON.stringify({ type: 'incoming_call', from: myUsername }));
      return;
    }

    // ── Aramayı kabul / reddet ────────────────────────────
    if (type === 'call_accept' || type === 'call_reject') {
      const targetWs = onlineUsers.get(msg.to);
      if (targetWs?.readyState === WebSocket.OPEN) {
        targetWs.send(JSON.stringify({ type, from: myUsername }));
      }
      return;
    }

    // ── WebRTC sinyalizasyon (offer / answer / ice) ───────
    if (['offer', 'answer', 'ice_candidate', 'call_end'].includes(type)) {
      const targetWs = onlineUsers.get(msg.to);
      if (targetWs?.readyState === WebSocket.OPEN) {
        targetWs.send(JSON.stringify({ ...msg, from: myUsername }));
      }
      return;
    }
  });

  ws.on('close', () => {
    if (myUsername) {
      onlineUsers.delete(myUsername);
      broadcast({ type: 'online_list', users: getOnlineList() });
      console.log(`- ${myUsername} ayrildi (${onlineUsers.size} cevrimici)`);
      myUsername = null;
    }
  });
});
