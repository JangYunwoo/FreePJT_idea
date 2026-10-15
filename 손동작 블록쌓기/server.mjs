import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectDir = dirname(fileURLToPath(import.meta.url));
const publicDir = resolve(projectDir, 'dist');
const rooms = new Map();
const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const maxPlayers = 6;
const playerTimeoutMs = 90_000;
const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
};

function fail(status, message) {
  throw Object.assign(new Error(message), { status });
}

function send(response, status, data) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(data));
}

async function readJson(request) {
  let content = '';
  for await (const chunk of request) {
    content += chunk;
    if (content.length > 32_768) fail(413, '요청이 너무 큽니다.');
  }
  try { return content ? JSON.parse(content) : {}; }
  catch { fail(400, '올바른 JSON이 아닙니다.'); }
}

function cleanName(value) {
  const name = typeof value === 'string' ? value.trim().slice(0, 16) : '';
  if (!name) fail(400, '이름을 입력해 주세요.');
  return name;
}

function newCode() {
  let code;
  do {
    code = Array.from(randomBytes(6), byte => alphabet[byte % alphabet.length]).join('');
  } while (rooms.has(code));
  return code;
}

function newPlayer(name) {
  return {
    id: randomBytes(9).toString('base64url'),
    token: randomBytes(24).toString('base64url'),
    name,
    ready: false,
    lastSeen: Date.now(),
    state: { placedCount: 0, height: 0, cameraY: 0, blocks: [], held: null, done: false },
  };
}

function pruneRooms() {
  const now = Date.now();
  for (const room of rooms.values()) {
    for (const player of room.players.values()) {
      if (now - player.lastSeen > playerTimeoutMs) room.players.delete(player.id);
    }
    if (!room.players.size) { rooms.delete(room.code); continue; }
    if (!room.players.has(room.hostId)) room.hostId = room.players.keys().next().value;
  }
}

function getRoom(code) {
  const room = rooms.get(code);
  if (!room) fail(404, '방을 찾을 수 없습니다.');
  return room;
}

function authenticate(request, room) {
  const player = room.players.get(request.headers['x-player-id']);
  if (!player || player.token !== request.headers['x-player-token']) fail(401, '다시 방에 참가해 주세요.');
  player.lastSeen = Date.now();
  return player;
}

function returnToLobby(room) {
  room.status = 'lobby';
  room.allDoneAt = 0;
  room.finishedAt = 0;
  room.winnerId = null;
  for (const player of room.players.values()) {
    player.ready = false;
    player.state = { placedCount: 0, height: 0, cameraY: 0, blocks: [], held: null, done: false };
  }
}

function finishIfReady(room) {
  if (room.status !== 'playing') return;
  if (room.players.size === 1) {
    room.status = 'finished';
    room.finishedAt = Date.now();
    room.winnerId = room.players.keys().next().value;
    return;
  }
  if (![...room.players.values()].every(player => player.state.done)) {
    room.allDoneAt = 0;
    return;
  }
  room.allDoneAt ||= Date.now();
  if (Date.now() - room.allDoneAt < 3_000) return;
  room.status = 'finished';
  room.finishedAt = Date.now();
  const ranked = [...room.players.values()].sort((a, b) =>
    b.state.height - a.state.height || b.state.blocks.length - a.state.blocks.length);
  const [first, second] = ranked;
  room.winnerId = second && first.state.height === second.state.height && first.state.blocks.length === second.state.blocks.length
    ? null : first?.id ?? null;
}

function snapshot(room) {
  finishIfReady(room);
  if (room.status === 'finished' && Date.now() - room.finishedAt >= 6_000) returnToLobby(room);
  return {
    code: room.code,
    status: room.status,
    hostId: room.hostId,
    winnerId: room.winnerId,
    players: [...room.players.values()].map(player => ({
      id: player.id,
      name: player.name,
      ready: player.ready,
      connected: Date.now() - player.lastSeen < 5_000,
      ...player.state,
    })),
  };
}

function number(value, min, max) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : 0;
}

function cleanState(value) {
  if (!value || !Array.isArray(value.blocks) || value.blocks.length > 12) fail(400, '블록 상태가 올바르지 않습니다.');
  const cleanBlock = block => {
    if (!block || !Number.isInteger(block.i) || block.i < 0 || block.i >= 12) fail(400, '블록 번호가 올바르지 않습니다.');
    return { i: block.i, x: number(block.x, -200, 1_200), y: number(block.y, -2_000, 1_200), a: number(block.a, -100, 100) };
  };
  const blocks = value.blocks.map(cleanBlock);
  return {
    placedCount: Math.round(number(value.placedCount, 0, 12)),
    height: Math.round(number(value.height, 0, 3_000)),
    cameraY: number(value.cameraY, -2_000, 0),
    blocks,
    held: value.held ? cleanBlock(value.held) : null,
    done: value.done === true,
  };
}

async function handleApi(request, response, parts) {
  pruneRooms();
  if (parts.length === 2 && parts[1] === 'rooms' && request.method === 'POST') {
    if (rooms.size >= 200) fail(503, '방이 너무 많습니다. 잠시 후 다시 시도해 주세요.');
    const player = newPlayer(cleanName((await readJson(request)).name));
    const room = { code: newCode(), hostId: player.id, status: 'lobby', players: new Map([[player.id, player]]), allDoneAt: 0, finishedAt: 0, winnerId: null };
    rooms.set(room.code, room);
    send(response, 201, { id: player.id, token: player.token, room: snapshot(room) });
    return;
  }
  const code = parts[2];
  if (parts.length < 3 || !/^[A-Z2-9]{6}$/.test(code)) fail(404, '방을 찾을 수 없습니다.');
  const room = getRoom(code);
  if (parts.length === 4 && parts[3] === 'join' && request.method === 'POST') {
    if (room.status !== 'lobby') fail(409, '이미 시작한 방입니다.');
    if (room.players.size >= maxPlayers) fail(409, '최대 6명까지 참가할 수 있습니다.');
    const player = newPlayer(cleanName((await readJson(request)).name));
    room.players.set(player.id, player);
    send(response, 201, { id: player.id, token: player.token, room: snapshot(room) });
    return;
  }
  const player = authenticate(request, room);
  if (parts.length === 3 && request.method === 'GET') {
    send(response, 200, snapshot(room));
    return;
  }
  if (parts.length === 4 && parts[3] === 'ready' && request.method === 'POST') {
    if (room.status !== 'lobby') fail(409, '대기실에서만 준비 상태를 바꿀 수 있습니다.');
    const { ready } = await readJson(request);
    if (typeof ready !== 'boolean') fail(400, '준비 상태가 올바르지 않습니다.');
    player.ready = ready;
    send(response, 200, snapshot(room));
    return;
  }
  if (parts.length === 4 && parts[3] === 'start' && request.method === 'POST') {
    if (player.id !== room.hostId) fail(403, '방장만 시작할 수 있습니다.');
    if (room.status !== 'lobby') fail(409, '이미 시작한 방입니다.');
    if (room.players.size < 2) fail(409, '경쟁전은 2명 이상이어야 합니다.');
    if ([...room.players.values()].some(member => !member.ready)) fail(409, '모든 참가자가 준비 완료를 눌러야 합니다.');
    room.status = 'playing';
    room.allDoneAt = 0;
    room.finishedAt = 0;
    room.winnerId = null;
    for (const member of room.players.values()) member.state = { placedCount: 0, height: 0, cameraY: 0, blocks: [], held: null, done: false };
    send(response, 200, snapshot(room));
    return;
  }
  if (parts.length === 4 && parts[3] === 'state' && request.method === 'PUT') {
    if (room.status !== 'playing') fail(409, '진행 중인 방이 아닙니다.');
    player.state = cleanState(await readJson(request));
    finishIfReady(room);
    send(response, 200, { ok: true });
    return;
  }
  if (parts.length === 4 && parts[3] === 'lobby' && request.method === 'POST') {
    if (room.status !== 'finished' && room.status !== 'lobby') fail(409, '경기가 아직 진행 중입니다.');
    if (room.status === 'finished') returnToLobby(room);
    send(response, 200, snapshot(room));
    return;
  }
  if (parts.length === 4 && parts[3] === 'leave' && request.method === 'POST') {
    room.players.delete(player.id);
    if (!room.players.size) rooms.delete(room.code);
    else if (room.hostId === player.id) room.hostId = room.players.keys().next().value;
    send(response, 200, { ok: true });
    return;
  }
  fail(404, '요청을 찾을 수 없습니다.');
}

export function createGameServer() {
  return http.createServer(async (request, response) => {
    const allowedOrigin = process.env.PINCH_TOWER_ORIGIN;
    if (allowedOrigin && request.headers.origin === allowedOrigin) {
      response.setHeader('Access-Control-Allow-Origin', allowedOrigin);
      response.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
      response.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Player-Id, X-Player-Token');
      response.setHeader('Vary', 'Origin');
    }
    if (request.method === 'OPTIONS') { response.writeHead(204).end(); return; }
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      if (pathname.startsWith('/api/')) {
        await handleApi(request, response, pathname.split('/').filter(Boolean));
        return;
      }
      if (request.method !== 'GET') fail(405, '지원하지 않는 요청입니다.');
      const filePath = resolve(publicDir, pathname === '/' ? 'index.html' : pathname.slice(1));
      if (filePath !== publicDir && !filePath.startsWith(publicDir + sep)) fail(403, '접근할 수 없습니다.');
      const content = await readFile(filePath);
      response.writeHead(200, { 'Content-Type': mimeTypes[extname(filePath)] || 'application/octet-stream' });
      response.end(content);
    } catch (error) {
      if (request.url?.startsWith('/api/')) send(response, error.status || 500, { error: error.message || '서버 오류' });
      else response.writeHead(error.status || 404).end(error.status ? error.message : 'Not found');
    }
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 8000);
  const host = process.env.HOST || '127.0.0.1';
  createGameServer().listen(port, host, () => console.log(`PINCH TOWER: http://${host}:${port}`));
}
