/* 호준 브롤 대전 서버
   - 방(대전 한 판)마다 Durable Object 하나. 들어온 사람들끼리 메시지를 그대로 전달만 함 (게임 계산은 각자 화면에서)
   - /ws?room=<방>&uid=<사람>  웹소켓으로 연결
   - 보내는 메시지: { k: 's' 내 상태 | 'e' 이벤트 | 'w' 협동 세상 상태 | 'p' 핑, v: 내용 }
   - 받는 메시지:   { k, u: 보낸 사람, v }   ('e' 는 늦게 들어온 사람에게 다시 보내 주려고 최근 300개 기억) */
const MAX_MSG = 16000;

export class Room {
  constructor(ctx, env) { this.ctx = ctx; this.ev = []; }

  async fetch(req) {
    if (req.headers.get('Upgrade') !== 'websocket') return new Response('websocket only', { status: 426 });
    const url = new URL(req.url);
    const uid = (url.searchParams.get('uid') || '').slice(0, 64).replace(/[^A-Za-z0-9_-]/g, '');
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ uid });
    for (const m of this.ev) { try { server.send(m); } catch (e) { /* 무시 */ } }
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, msg) {
    if (typeof msg !== 'string' || msg.length > MAX_MSG) return;
    let o; try { o = JSON.parse(msg); } catch (e) { return; }
    if (!o || typeof o !== 'object') return;
    if (o.k === 'p') { try { ws.send(JSON.stringify({ k: 'p', t: o.t })); } catch (e) { /* 무시 */ } return; }
    if (o.k !== 's' && o.k !== 'e' && o.k !== 'w') return;
    const me = (ws.deserializeAttachment() || {}).uid || '';
    const out = JSON.stringify({ k: o.k, u: me, v: o.v });
    if (o.k === 'e') { this.ev.push(out); if (this.ev.length > 300) this.ev.shift(); }
    for (const w of this.ctx.getWebSockets()) {
      if (w === ws) continue;
      try { w.send(out); } catch (e) { /* 끊긴 사람 */ }
    }
  }

  async webSocketClose(ws, code) { try { ws.close(code === 1005 ? 1000 : code, 'bye'); } catch (e) { /* 무시 */ } }
  async webSocketError(ws) { try { ws.close(1011, 'error'); } catch (e) { /* 무시 */ } }
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname === '/ws') {
      const room = (url.searchParams.get('room') || '').slice(0, 80);
      if (!/^[A-Za-z0-9_-]+$/.test(room)) return new Response('bad room', { status: 400 });
      const stub = env.ROOM.get(env.ROOM.idFromName(room), { locationHint: 'apac' });   // 아시아 · 태평양 쪽 서버에서
      return stub.fetch(req);
    }
    return new Response('호준 브롤 대전 서버 OK', { headers: { 'content-type': 'text/plain; charset=utf-8', 'access-control-allow-origin': '*' } });
  },
};
