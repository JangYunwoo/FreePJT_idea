// Pinch Tower: MediaPipe hand landmarks control a Matter.js block-stacking game.
const canvas = document.querySelector('#game-canvas');
const ctx = canvas.getContext('2d');
const practiceCanvas = document.querySelector('#practice-canvas');
const practiceCtx = practiceCanvas.getContext('2d');
const practiceHelp = document.querySelector('#practice-help');
const practiceInputStatus = document.querySelector('#practice-input-status');
const video = document.querySelector('#camera-video');
const handCanvas = document.querySelector('#hand-canvas');
const handCtx = handCanvas.getContext('2d');
const cameraButton = document.querySelector('#camera-button');
const testModeName = document.querySelector('#test-mode-name');
const cameraActionIcon = document.querySelector('#camera-action-icon');
const mouseActionIcon = document.querySelector('#mouse-action-icon');
const resetButton = document.querySelector('#reset-button');
const playAgainButton = document.querySelector('#play-again-button');
const inputStatus = document.querySelector('#input-status');
const gameMessage = document.querySelector('#game-message');
const cameraHelp = document.querySelector('#camera-help');
const cameraIndicator = document.querySelector('#camera-indicator');
const cameraPlaceholder = document.querySelector('#camera-placeholder');
const placedCount = document.querySelector('#placed-count');
const heightCount = document.querySelector('#height-count');
const resultOverlay = document.querySelector('#result-overlay');
const resultDetail = document.querySelector('#result-detail');
const resultTitle = document.querySelector('#result-title');
const modeScreen = document.querySelector('#mode-screen');
const setupScreen = document.querySelector('#setup-screen');
const setupBackButton = document.querySelector('#setup-back-button');
const setupPrimaryButton = document.querySelector('#setup-primary-button');
const competitionScreen = document.querySelector('#competition-screen');
const gameView = document.querySelector('#game-view');
const competitionEntry = document.querySelector('#competition-entry');
const competitionLobby = document.querySelector('#competition-lobby');
const competitionError = document.querySelector('#competition-error');
const playerNameInput = document.querySelector('#player-name');
const roomCodeInput = document.querySelector('#room-code-input');
const lobbyCode = document.querySelector('#lobby-code');
const lobbyCount = document.querySelector('#lobby-count');
const lobbyPlayers = document.querySelector('#lobby-players');
const lobbyHint = document.querySelector('#lobby-hint');
const startRoomButton = document.querySelector('#start-room-button');
const readyButton = document.querySelector('#ready-button');
const lobbyCameraButton = document.querySelector('#lobby-camera-button');
const opponentSidebar = document.querySelector('#opponent-sidebar');
const opponentList = document.querySelector('#opponent-list');
const opponentCount = document.querySelector('#opponent-count');
const roomStatus = document.querySelector('#room-status');
const stageWrap = document.querySelector('.stage-wrap');
const apiBase = (window.PINCH_TOWER_API_BASE || window.location.origin).replace(/\/$/, '');
document.querySelector('#setup-controls').append(document.querySelector('.control-grid'));

const W = canvas.width;
const H = canvas.height;
const CELL = 36;
const ARENA_LEFT = 66;
const ARENA_RIGHT = 716;
const GROUND_Y = 591;
const WORLD_TOP = GROUND_Y - H * 3;
const CAMERA_TOP_MARGIN = 170;
const CAMERA_BOTTOM_MARGIN = 290;
const GROUND_WIDTH = CELL * 4;
const GROUND_LEFT = (ARENA_LEFT + ARENA_RIGHT - GROUND_WIDTH) / 2;
const GROUND_RIGHT = GROUND_LEFT + GROUND_WIDTH;
const TRAY_X = 851;
const TRAY_Y = 258;
const TRAY_SCALE = 0.82;
const TOTAL = 12;
const COLORS = ['#ff8876', '#ffc65e', '#75d8c2', '#9eabf9', '#f2a6d2', '#70b9ef'];
const SHAPES = [
  { name: 'O', cells: [[0, 0], [1, 0], [0, 1], [1, 1]] },
  { name: 'I', cells: [[0, 0], [1, 0], [2, 0], [3, 0]] },
  { name: 'T', cells: [[0, 0], [1, 0], [2, 0], [1, 1]] },
  { name: 'L', cells: [[0, 0], [0, 1], [0, 2], [1, 2]] },
  { name: 'S', cells: [[1, 0], [2, 0], [0, 1], [1, 1]] },
  { name: 'J', cells: [[1, 0], [1, 1], [1, 2], [0, 2]] },
  { name: 'Z', cells: [[0, 0], [1, 0], [1, 1], [2, 1]] },
];
const SEQUENCE = [0, 2, 1, 3, 4, 0, 5, 6, 2, 1, 3, 0];
const HAND_CONNECTIONS = [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12], [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [17, 18], [18, 19], [19, 20], [0, 17]];

if (!window.Matter) {
  gameMessage.textContent = '물리엔진을 불러오지 못했습니다. 인터넷 연결을 확인해 주세요.';
  cameraButton.disabled = true;
  throw new Error('Matter.js was not loaded');
}

const { Engine, World, Bodies, Body, Query, Sleeping } = window.Matter;
const PHYSICS_STEP = 1000 / 60;
let engine;
let lastFrameTime = 0;
let physicsRemainder = 0;
let placed = [];
let pieceIndex = 0;
let holding = false;
let heldAngle = 0;
let cameraY = 0;
let mode = 'mouse';
let pointer = { x: TRAY_X, y: TRAY_Y, visible: false, pinching: false };
let mouseDown = false;
let cameraStream = null;
let landmarker = null;
let cameraLoopId = 0;
let cameraStarting = false;
let lastVideoTime = -1;
let lastDetectAt = 0;
let lastHandSeenAt = 0;
let handPinching = false;
let pinchCandidateFrames = 0;
let openCandidateFrames = 0;
let resultTimeout = 0;
let lastMessageAt = 0;
let gameMode = 'selection';
let setupContext = null;
let localReady = false;
let roomSession = null;
let roomPollTimer = 0;
let statePushTimer = 0;
let pollInFlight = false;
let pushInFlight = false;
let roomPhase = null;
const PRACTICE_BLOCK_SIZE = CELL * 4;
let practiceBlock = { x: W / 2, y: H / 2 };
let practiceHolding = false;
let practiceGrabOffset = { x: 0, y: 0 };
let practiceMouseDown = false;
let practicePointer = { x: W / 2, y: H / 2, visible: false };

function setMessage(message) {
  gameMessage.textContent = message;
  lastMessageAt = performance.now();
}

function currentPiece() {
  if (pieceIndex >= TOTAL) return null;
  return { ...SHAPES[SEQUENCE[pieceIndex]], color: COLORS[pieceIndex % COLORS.length] };
}

function nextPiece() {
  if (pieceIndex + 1 >= TOTAL) return null;
  return { ...SHAPES[SEQUENCE[pieceIndex + 1]], color: COLORS[(pieceIndex + 1) % COLORS.length] };
}

function createPhysicsEngine() {
  const newEngine = Engine.create({ enableSleeping: true, gravity: { x: 0, y: 0.9 } });
  newEngine.positionIterations = 12;
  newEngine.velocityIterations = 12;
  newEngine.constraintIterations = 4;
  const ground = Bodies.rectangle((GROUND_LEFT + GROUND_RIGHT) / 2, GROUND_Y + 22,
    GROUND_WIDTH, 44, { isStatic: true, friction: 0.9 });
  World.add(newEngine.world, ground);
  return newEngine;
}

function resetGame() {
  window.clearTimeout(resultTimeout);
  resultOverlay.classList.add('hidden');
  engine = createPhysicsEngine();
  lastFrameTime = 0;
  physicsRemainder = 0;
  placed = [];
  pieceIndex = 0;
  holding = false;
  heldAngle = 0;
  cameraY = 0;
  mouseDown = false;
  pointer.pinching = false;
  handPinching = false;
  pinchCandidateFrames = 0;
  openCandidateFrames = 0;
  placedCount.textContent = '00';
  heightCount.textContent = '0';
  setMessage('오른쪽 블록을 집어보세요');
}

function mergedCellRectangles(cells) {
  const averageX = cells.reduce((sum, cell) => sum + cell[0], 0) / cells.length;
  const averageY = cells.reduce((sum, cell) => sum + cell[1], 0) / cells.length;
  const remaining = new Set(cells.map(([x, y]) => `${x},${y}`));
  const rectangles = [];
  for (const [startX, startY] of [...cells].sort((a, b) => a[1] - b[1] || a[0] - b[0])) {
    if (!remaining.has(`${startX},${startY}`)) continue;
    let width = 1;
    while (remaining.has(`${startX + width},${startY}`)) width++;
    let height = 1;
    while (Array.from({ length: width }, (_, dx) => remaining.has(`${startX + dx},${startY + height}`)).every(Boolean)) height++;
    for (let dy = 0; dy < height; dy++) {
      for (let dx = 0; dx < width; dx++) remaining.delete(`${startX + dx},${startY + dy}`);
    }
    rectangles.push({
      dx: (startX + (width - 1) / 2 - averageX) * CELL,
      dy: (startY + (height - 1) / 2 - averageY) * CELL,
      width: width * CELL,
      height: height * CELL,
    });
  }
  return rectangles;
}

function createBody(piece, x, y) {
  const rectangles = mergedCellRectangles(piece.cells);
  const material = { friction: 0.5, frictionStatic: 0.6, frictionAir: 0.02, restitution: 0, slop: 0.015, sleepThreshold: 75 };
  // Merge adjacent cells first; a slight overlap closes seams in compound pieces.
  const seamOverlap = rectangles.length > 1 ? 0.5 : 0;
  const parts = rectangles.map(({ dx, dy, width, height }) =>
    Bodies.rectangle(x + dx, y + dy, width + seamOverlap, height + seamOverlap, material));
  const body = parts.length === 1 ? parts[0] : Body.create({ parts, ...material });
  body.gameColor = piece.color;
  body.gameCells = piece.cells;
  return body;
}

function canPlace(body, blocks = placed, viewY = cameraY) {
  const visibleTop = Math.max(WORLD_TOP, viewY + 58);
  if (body.bounds.min.x < ARENA_LEFT + 4 || body.bounds.max.x > ARENA_RIGHT - 4) return false;
  if (body.bounds.min.y < visibleTop || body.bounds.max.y > GROUND_Y - 3) return false;
  if (blocks.some(({ body: other }) => Query.collides(body, [other]).length > 0)) return false;
  return true;
}

function makeRoomForRelease(body, x, y, blocks = placed, viewY = cameraY) {
  if (canPlace(body, blocks, viewY)) return true;
  const visibleTop = Math.max(WORLD_TOP, viewY + 58);
  if (x < ARENA_LEFT || x > ARENA_RIGHT || y < visibleTop || y > GROUND_Y) return false;
  // A tiny overlap should lift the piece, not shift it off a narrow tower.
  for (let distance = 3; distance <= 18; distance += 3) {
    Body.setPosition(body, { x, y: y - distance });
    if (canPlace(body, blocks, viewY)) return true;
  }
  // Search outward from the hand, preferring above the stack on equal distances.
  const directions = [
    [0, -1], [-0.38, -0.92], [0.38, -0.92],
    [-0.71, -0.71], [0.71, -0.71],
    [-0.92, -0.38], [0.92, -0.38], [-1, 0], [1, 0],
  ];
  const maxDistance = Math.max(240, y - visibleTop + CELL * 4);
  for (let distance = 3; distance <= maxDistance; distance += 3) {
    for (const [dx, dy] of directions) {
      Body.setPosition(body, { x: x + dx * distance, y: y + dy * distance });
      if (canPlace(body, blocks, viewY)) return true;
    }
  }
  return false;
}

function practiceActive() {
  return !setupScreen.hidden;
}

function resetPracticeGame() {
  practiceBlock = { x: W / 2, y: H / 2 };
  practiceHolding = false;
  practiceGrabOffset = { x: 0, y: 0 };
  practiceMouseDown = false;
  practicePointer.visible = false;
  practiceHelp.textContent = '가운데 2×2 블록을 집어 움직여보세요. 놓으면 그 자리에 머뭅니다.';
}

function tryPracticePickUp() {
  if (!practiceActive() || practiceHolding || !practicePointer.visible) return;
  if (Math.abs(practicePointer.x - practiceBlock.x) <= PRACTICE_BLOCK_SIZE / 2 + 20
    && Math.abs(practicePointer.y - practiceBlock.y) <= PRACTICE_BLOCK_SIZE / 2 + 20) {
    practiceHolding = true;
    practiceGrabOffset = {
      x: practiceBlock.x - practicePointer.x,
      y: practiceBlock.y - practicePointer.y,
    };
    practiceHelp.textContent = '블록을 움직이고 손가락이나 마우스 버튼을 놓아보세요.';
  }
}

function movePracticeBlock() {
  if (!practiceHolding || !practicePointer.visible) return;
  const half = PRACTICE_BLOCK_SIZE / 2;
  practiceBlock.x = Math.max(half, Math.min(W - half, practicePointer.x + practiceGrabOffset.x));
  practiceBlock.y = Math.max(half, Math.min(H - half, practicePointer.y + practiceGrabOffset.y));
}

function tryPracticeRelease() {
  if (!practiceHolding) return;
  movePracticeBlock();
  practiceHolding = false;
  practiceHelp.textContent = '그 자리에 놓였어요. 다시 집어 다른 곳으로 옮겨보세요.';
}

function drawPracticeBlock() {
  const cellSize = PRACTICE_BLOCK_SIZE / 2;
  const left = practiceBlock.x - cellSize;
  const top = practiceBlock.y - cellSize;
  practiceCtx.save();
  practiceCtx.shadowColor = practiceHolding ? '#ffab9b88' : '#ff887655';
  practiceCtx.shadowBlur = 24;
  practiceCtx.fillStyle = '#ff8876';
  practiceCtx.fillRect(left, top, PRACTICE_BLOCK_SIZE, PRACTICE_BLOCK_SIZE);
  practiceCtx.shadowBlur = 0;
  practiceCtx.strokeStyle = '#ffffffb0';
  practiceCtx.lineWidth = 3;
  practiceCtx.strokeRect(left, top, PRACTICE_BLOCK_SIZE, PRACTICE_BLOCK_SIZE);
  practiceCtx.strokeStyle = '#ffffff42';
  practiceCtx.lineWidth = 2;
  practiceCtx.beginPath();
  practiceCtx.moveTo(practiceBlock.x, top);
  practiceCtx.lineTo(practiceBlock.x, top + PRACTICE_BLOCK_SIZE);
  practiceCtx.moveTo(left, practiceBlock.y);
  practiceCtx.lineTo(left + PRACTICE_BLOCK_SIZE, practiceBlock.y);
  practiceCtx.stroke();
  practiceCtx.restore();
}

function drawPractice() {
  practiceCtx.fillStyle = '#1e2d43';
  practiceCtx.fillRect(0, 0, W, H);
  practiceCtx.strokeStyle = '#ffffff12';
  practiceCtx.lineWidth = 1;
  for (let x = 0; x <= W; x += 70) {
    practiceCtx.beginPath();
    practiceCtx.moveTo(x, 0);
    practiceCtx.lineTo(x, H);
    practiceCtx.stroke();
  }
  for (let y = 0; y <= H; y += 70) {
    practiceCtx.beginPath();
    practiceCtx.moveTo(0, y);
    practiceCtx.lineTo(W, y);
    practiceCtx.stroke();
  }
  drawPracticeBlock();
  if (practicePointer.visible) {
    practiceCtx.strokeStyle = practiceHolding ? '#ff9c8b' : '#91e4cf';
    practiceCtx.lineWidth = 3;
    practiceCtx.beginPath();
    practiceCtx.arc(practicePointer.x, practicePointer.y, 18, 0, Math.PI * 2);
    practiceCtx.stroke();
  }
}

function tryPickUp() {
  if (gameView.hidden || holding || pieceIndex >= TOTAL || !pointer.visible) return;
  if (Math.abs(pointer.x - TRAY_X) < 83 && Math.abs(pointer.y - TRAY_Y) < 83) {
    holding = true;
    heldAngle = 0;
    pointer.pinching = true;
    setMessage('블록을 옮기고 A/D로 회전한 뒤 놓으세요');
  }
}

function tryRelease() {
  pointer.pinching = false;
  if (gameView.hidden) { holding = false; return; }
  if (!holding) return;
  holding = false;
  const piece = currentPiece();
  if (!piece) return;
  const worldY = pointer.y + cameraY;
  const body = createBody(piece, pointer.x, worldY);
  Body.setAngle(body, heldAngle);
  if (!makeRoomForRelease(body, pointer.x, worldY)) {
    const inside = pointer.x >= ARENA_LEFT && pointer.x <= ARENA_RIGHT
      && worldY >= Math.max(WORLD_TOP, cameraY + 58) && worldY <= GROUND_Y;
    setMessage(inside ? '근처에 빈자리가 없어요. 위치를 바꿔 다시 놓아주세요' : '쌓기 공간 안에서 손을 놓아주세요');
    return;
  }
  const pushX = pointer.x - body.position.x;
  const pushY = worldY - body.position.y;
  // Do not animate a barely visible correction as a sideways "kick".
  const wasPushed = Math.hypot(pushX, pushY) > 3;
  if (wasPushed) body.gamePushOffset = { x: pushX, y: pushY, startedAt: performance.now() };
  World.add(engine.world, body);
  placed.push({ body, color: piece.color, sequenceIndex: pieceIndex });
  pieceIndex++;
  placedCount.textContent = String(pieceIndex).padStart(2, '0');
  setMessage(pieceIndex < TOTAL
    ? wasPushed ? '겹친 블록을 밀어냈어요. 다음 블록을 집어보세요' : '좋아요! 다음 블록을 집어보세요'
    : '마지막 블록이 안착하는 중…');
  if (pieceIndex === TOTAL) {
    if (gameMode === 'versus') {
      setMessage('12개를 모두 놓았어요. 상대 플레이어를 기다리는 중…');
    } else {
      resultTimeout = window.setTimeout(() => {
        updateHeight();
        resultDetail.textContent = `12개를 놓아 ${placed.length}개가 남았고, 탑 높이는 ${heightCount.textContent}px입니다.`;
        resultOverlay.classList.remove('hidden');
      }, 1900);
    }
  }
}

function updateHeight() {
  if (!placed.length) {
    heightCount.textContent = '0';
    return;
  }
  const highest = Math.min(...placed.map(({ body }) => body.bounds.min.y));
  heightCount.textContent = String(Math.max(0, Math.round(GROUND_Y - highest)));
}

function updateCamera() {
  const towerBlocks = placed.filter(({ body }) => body.bounds.min.y < GROUND_Y
    && body.bounds.max.x > ARENA_LEFT && body.bounds.min.x < ARENA_RIGHT);
  let target = cameraY;
  if (!towerBlocks.length) {
    target = 0;
  } else {
    const highest = Math.min(...towerBlocks.map(({ body }) => body.bounds.min.y));
    const topOnScreen = highest - cameraY;
    if (topOnScreen < CAMERA_TOP_MARGIN) target = highest - CAMERA_TOP_MARGIN;
    else if (topOnScreen > CAMERA_BOTTOM_MARGIN) target = highest - CAMERA_BOTTOM_MARGIN;
  }
  target = Math.max(WORLD_TOP, Math.min(0, target));
  cameraY += (target - cameraY) * 0.09;
  if (Math.abs(target - cameraY) < 0.5) cameraY = target;
}

function removeFallenPieces() {
  let removed = 0;
  placed = placed.filter(({ body }) => {
    // Remove pieces only after they fall below the fixed ground, even when the camera pans up.
    const fallen = body.bounds.min.y > H + CELL * 2
      || body.bounds.max.x < 0
      || body.bounds.min.x > W;
    if (fallen) {
      World.remove(engine.world, body);
      removed++;
    }
    return !fallen;
  });
  if (removed && pieceIndex < TOTAL && !holding) {
    setMessage('블록이 바닥 밖으로 떨어졌어요. 다음 블록을 집어보세요');
  }
}

function releasePointBalances(targetEngine, blocks) {
  for (const { body } of blocks) {
    if (body.gameTipNudged || Math.abs(Math.sin(body.angle * 2)) < 0.8) continue;
    if (!body.isSleeping && (body.speed > 0.04 || body.angularSpeed > 0.004)) continue;
    const supports = [];
    for (const pair of targetEngine.pairs.list) {
      if (!pair.isActive) continue;
      const collision = pair.collision;
      if (collision.parentA !== body && collision.parentB !== body) continue;
      for (let i = 0; i < collision.supportCount; i++) {
        const point = collision.supports[i];
        if (point.y > body.position.y + 2) supports.push(point.x);
      }
    }
    if (!supports.length || Math.max(...supports) - Math.min(...supports) > 2) continue;
    const supportX = supports.reduce((sum, x) => sum + x, 0) / supports.length;
    const offset = body.position.x - supportX;
    const direction = Math.abs(offset) > 1 ? Math.sign(offset) : body.id % 2 ? 1 : -1;
    Sleeping.set(body, false);
    Body.setAngularVelocity(body, direction * 0.012);
    body.gameTipNudged = true;
  }
}

function roundedRect(x, y, width, height, radius, fill, stroke) {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.stroke(); }
}

function drawBackground() {
  ctx.fillStyle = '#1e2d43';
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(340, 235, 10, 340, 235, 440);
  glow.addColorStop(0, '#2c4160');
  glow.addColorStop(1, '#1e2d4300');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = '#a8bad1';
  ctx.font = '500 12px "DM Mono", monospace';
  ctx.fillText('01 / STACK ZONE', ARENA_LEFT + 16, 36);
  const groundScreenY = GROUND_Y - cameraY;
  if (groundScreenY < H) {
    ctx.fillStyle = '#96aec5';
    ctx.fillRect(GROUND_LEFT, groundScreenY, GROUND_WIDTH, 8);
    ctx.fillStyle = '#2a4059';
    ctx.fillRect(GROUND_LEFT, groundScreenY + 8, GROUND_WIDTH, Math.max(0, H - groundScreenY - 8));
  }
  ctx.strokeStyle = '#6b849b7a';
  ctx.setLineDash([3, 7]);
  ctx.beginPath(); ctx.moveTo(745, 0); ctx.lineTo(745, H); ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = '#ff9887';
  ctx.fillText('02 / PICK-UP ZONE', 775, 36);
  roundedRect(775, 130, 152, 255, 13, '#273c56', '#61728a');
  roundedRect(786, 141, 130, 168, 8, '#1c2b41', '#ffffff1a');
  ctx.fillStyle = '#ffad9e';
  ctx.font = '500 10px "DM Mono", monospace';
  ctx.textAlign = 'center';
  ctx.fillText('READY TO GRAB', TRAY_X, 166);
  ctx.fillStyle = '#8ca4ba';
  ctx.fillText('PINCH HERE', TRAY_X, 346);
  ctx.font = '500 10px "DM Mono", monospace';
  ctx.fillStyle = '#a6b8cc';
  ctx.fillText('UP NEXT', TRAY_X, 427);
  roundedRect(795, 445, 112, 112, 8, '#17273c', '#4a607b');
  ctx.textAlign = 'left';
  ctx.fillStyle = '#6f839d';
  ctx.fillText(`${String(Math.min(pieceIndex + 1, TOTAL)).padStart(2, '0')} / ${TOTAL}`, 789, 600);
}

function outlinePoints(cells) {
  const occupied = new Set(cells.map(([x, y]) => `${x},${y}`));
  const edges = [];
  for (const [x, y] of cells) {
    const left = x - 0.5;
    const right = x + 0.5;
    const top = y - 0.5;
    const bottom = y + 0.5;
    if (!occupied.has(`${x},${y - 1}`)) edges.push([[left, top], [right, top]]);
    if (!occupied.has(`${x + 1},${y}`)) edges.push([[right, top], [right, bottom]]);
    if (!occupied.has(`${x},${y + 1}`)) edges.push([[right, bottom], [left, bottom]]);
    if (!occupied.has(`${x - 1},${y}`)) edges.push([[left, bottom], [left, top]]);
  }
  const next = new Map(edges.map(([start, end]) => [start.join(','), end]));
  const start = edges[0][0];
  const points = [start];
  let point = start;
  while (points.length <= edges.length) {
    point = next.get(point.join(','));
    if (!point || point.join(',') === start.join(',')) break;
    points.push(point);
  }
  const averageX = cells.reduce((sum, cell) => sum + cell[0], 0) / cells.length;
  const averageY = cells.reduce((sum, cell) => sum + cell[1], 0) / cells.length;
  return points.map(([px, py]) => [(px - averageX) * CELL, (py - averageY) * CELL]);
}

function drawPiece(piece, x, y, scale = 1, alpha = 1, preview = false, angle = 0) {
  if (!piece) return;
  const points = outlinePoints(piece.cells);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.scale(scale, scale);
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
  ctx.closePath();
  if (preview) { ctx.shadowBlur = 10; ctx.shadowColor = piece.color + '88'; }
  ctx.fillStyle = piece.color;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = '#ffffff8c';
  ctx.lineWidth = 1.3;
  ctx.lineJoin = 'round';
  ctx.stroke();
  ctx.restore();
}

function drawPlaced() {
  ctx.save();
  ctx.translate(0, -cameraY);
  for (const { body, color } of placed) {
    let offsetX = 0;
    let offsetY = 0;
    if (body.gamePushOffset) {
      const progress = Math.min(1, (performance.now() - body.gamePushOffset.startedAt) / 150);
      const remaining = (1 - progress) ** 3;
      offsetX = body.gamePushOffset.x * remaining;
      offsetY = body.gamePushOffset.y * remaining;
      if (progress === 1) delete body.gamePushOffset;
    }
    drawPiece({ cells: body.gameCells, color }, body.position.x + offsetX, body.position.y + offsetY, 1, 1, false, body.angle);
  }
  ctx.restore();
}

function drawCursor() {
  if (!pointer.visible) return;
  const { x, y } = pointer;
  const color = holding || pointer.pinching ? '#ff9c8b' : '#91e4cf';
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.4;
  ctx.shadowBlur = 16;
  ctx.shadowColor = color;
  ctx.beginPath(); ctx.arc(x, y, holding ? 17 : 14, 0, Math.PI * 2); ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.beginPath(); ctx.moveTo(x - 5, y); ctx.lineTo(x + 5, y); ctx.moveTo(x, y - 5); ctx.lineTo(x, y + 5); ctx.stroke();
  ctx.font = '500 9px "DM Mono", monospace';
  ctx.fillStyle = color;
  ctx.fillText(holding ? 'GRABBED' : mode === 'camera' ? 'HAND' : 'MOUSE', x + 24, y - 16);
  ctx.restore();
}

function render(frameTime) {
  if (!lastFrameTime) lastFrameTime = frameTime;
  physicsRemainder += Math.min(frameTime - lastFrameTime, 50);
  lastFrameTime = frameTime;
  while (physicsRemainder >= PHYSICS_STEP) {
    Engine.update(engine, PHYSICS_STEP);
    releasePointBalances(engine, placed);
    physicsRemainder -= PHYSICS_STEP;
  }
  removeFallenPieces();
  updateCamera();
  drawBackground();
  drawPlaced();
  if (pieceIndex < TOTAL) {
    if (holding) {
      drawPiece(currentPiece(), TRAY_X, TRAY_Y, TRAY_SCALE, 0.22);
      drawPiece(currentPiece(), pointer.x, pointer.y, 1, 0.95, true, heldAngle);
    } else {
      drawPiece(currentPiece(), TRAY_X, TRAY_Y, TRAY_SCALE, 1, true);
    }
    drawPiece(nextPiece(), TRAY_X, 500, 0.58, 0.92);
  }
  drawCursor();
  if (practiceActive()) drawPractice();
  updateHeight();
  if (performance.now() - lastMessageAt > 5200 && pieceIndex < TOTAL && !holding && placed.length) {
    gameMessage.textContent = '오른쪽 블록을 집어 다음 층을 쌓으세요';
  }
  requestAnimationFrame(render);
}

function canvasPoint(event) {
  const rect = canvas.getBoundingClientRect();
  return { x: (event.clientX - rect.left) * W / rect.width, y: (event.clientY - rect.top) * H / rect.height };
}

canvas.addEventListener('pointermove', event => {
  if (mode !== 'mouse') return;
  const pos = canvasPoint(event);
  pointer.x = pos.x;
  pointer.y = pos.y;
  pointer.visible = true;
});
canvas.addEventListener('pointerenter', event => {
  if (mode !== 'mouse') return;
  Object.assign(pointer, canvasPoint(event), { visible: true });
});
canvas.addEventListener('pointerleave', () => { if (mode === 'mouse' && !mouseDown) pointer.visible = false; });
canvas.addEventListener('pointerdown', event => {
  if (mode !== 'mouse' || event.button !== 0) return;
  event.preventDefault();
  canvas.setPointerCapture(event.pointerId);
  Object.assign(pointer, canvasPoint(event), { visible: true });
  mouseDown = true;
  tryPickUp();
});
canvas.addEventListener('pointerup', event => {
  if (mode !== 'mouse' || !mouseDown) return;
  Object.assign(pointer, canvasPoint(event));
  mouseDown = false;
  tryRelease();
});
canvas.addEventListener('pointercancel', () => {
  if (mode !== 'mouse') return;
  mouseDown = false;
  holding = false;
  pointer.pinching = false;
});

function practiceCanvasPoint(event) {
  const rect = practiceCanvas.getBoundingClientRect();
  return { x: (event.clientX - rect.left) * W / rect.width, y: (event.clientY - rect.top) * H / rect.height };
}

practiceCanvas.addEventListener('pointermove', event => {
  if (mode !== 'mouse' || !practiceActive()) return;
  Object.assign(practicePointer, practiceCanvasPoint(event), { visible: true });
  movePracticeBlock();
});
practiceCanvas.addEventListener('pointerenter', event => {
  if (mode !== 'mouse' || !practiceActive()) return;
  Object.assign(practicePointer, practiceCanvasPoint(event), { visible: true });
});
practiceCanvas.addEventListener('pointerleave', () => {
  if (mode === 'mouse' && !practiceMouseDown) practicePointer.visible = false;
});
practiceCanvas.addEventListener('pointerdown', event => {
  if (mode !== 'mouse' || !practiceActive() || event.button !== 0) return;
  event.preventDefault();
  practiceCanvas.setPointerCapture(event.pointerId);
  Object.assign(practicePointer, practiceCanvasPoint(event), { visible: true });
  practiceMouseDown = true;
  tryPracticePickUp();
});
practiceCanvas.addEventListener('pointerup', event => {
  if (mode !== 'mouse' || !practiceMouseDown) return;
  Object.assign(practicePointer, practiceCanvasPoint(event), { visible: true });
  tryPracticeRelease();
  practiceMouseDown = false;
});
practiceCanvas.addEventListener('pointercancel', () => {
  practiceMouseDown = false;
  practiceHolding = false;
  practicePointer.visible = false;
});
document.querySelector('#practice-reset-button').addEventListener('click', resetPracticeGame);

window.addEventListener('keydown', event => {
  if (event.repeat || event.altKey || event.ctrlKey || event.metaKey) return;
  if (event.code !== 'KeyA' && event.code !== 'KeyD') return;
  if (!holding) return;
  event.preventDefault();
  const turn = event.code === 'KeyD' ? 1 : -1;
  heldAngle = (heldAngle + turn * Math.PI / 2 + Math.PI * 2) % (Math.PI * 2);
});

function drawHand(landmarks, isPinching) {
  handCanvas.width = video.videoWidth || 640;
  handCanvas.height = video.videoHeight || 480;
  handCtx.clearRect(0, 0, handCanvas.width, handCanvas.height);
  const color = isPinching ? '#ff9c8b' : '#91e4cf';
  handCtx.strokeStyle = color;
  handCtx.fillStyle = color;
  handCtx.lineWidth = Math.max(2, handCanvas.width / 300);
  for (const [a, b] of HAND_CONNECTIONS) {
    handCtx.beginPath();
    handCtx.moveTo(landmarks[a].x * handCanvas.width, landmarks[a].y * handCanvas.height);
    handCtx.lineTo(landmarks[b].x * handCanvas.width, landmarks[b].y * handCanvas.height);
    handCtx.stroke();
  }
  for (const mark of landmarks) {
    handCtx.beginPath();
    handCtx.arc(mark.x * handCanvas.width, mark.y * handCanvas.height, 3.6, 0, Math.PI * 2);
    handCtx.fill();
  }
  if (isPinching) {
    const x = (landmarks[4].x + landmarks[8].x) / 2 * handCanvas.width;
    const y = (landmarks[4].y + landmarks[8].y) / 2 * handCanvas.height;
    handCtx.beginPath(); handCtx.arc(x, y, 17, 0, Math.PI * 2); handCtx.stroke();
  }
}

function processHand(landmarks) {
  const thumb = landmarks[4];
  const index = landmarks[8];
  const palmWidth = Math.hypot(landmarks[5].x - landmarks[17].x, landmarks[5].y - landmarks[17].y);
  const pinchDistance = Math.hypot(thumb.x - index.x, thumb.y - index.y) / Math.max(palmWidth, 0.045);
  const targetX = (1 - (thumb.x + index.x) / 2) * W;
  const targetY = (thumb.y + index.y) / 2 * H;
  if (!pointer.visible || Math.abs(pointer.x - targetX) > 240 || Math.abs(pointer.y - targetY) > 240) {
    pointer.x = targetX;
    pointer.y = targetY;
  } else {
    pointer.x += (targetX - pointer.x) * 0.55;
    pointer.y += (targetY - pointer.y) * 0.55;
  }
  pointer.visible = true;
  if (practiceActive()) {
    Object.assign(practicePointer, { x: pointer.x, y: pointer.y, visible: true });
    movePracticeBlock();
  }
  lastHandSeenAt = performance.now();

  // Separate grab/release thresholds and two-frame confirmation avoid jitter.
  if (!handPinching) {
    pinchCandidateFrames = pinchDistance < 0.43 ? pinchCandidateFrames + 1 : 0;
    if (pinchCandidateFrames >= 2) {
      handPinching = true;
      pinchCandidateFrames = 0;
      if (practiceActive()) tryPracticePickUp();
      else tryPickUp();
    }
  } else {
    openCandidateFrames = pinchDistance > 0.64 ? openCandidateFrames + 1 : 0;
    if (openCandidateFrames >= 2) {
      handPinching = false;
      openCandidateFrames = 0;
      if (practiceActive()) tryPracticeRelease();
      else tryRelease();
    }
  }
  pointer.pinching = handPinching;
  drawHand(landmarks, handPinching);
}

function cameraLoop() {
  if (mode !== 'camera' || !cameraStream || !landmarker) return;
  const now = performance.now();
  if (video.readyState >= 2 && video.currentTime !== lastVideoTime && now - lastDetectAt > 33) {
    lastVideoTime = video.currentTime;
    lastDetectAt = now;
    try {
      const result = landmarker.detectForVideo(video, now);
      if (result.landmarks?.length) {
        processHand(result.landmarks[0]);
      } else {
        handCtx.clearRect(0, 0, handCanvas.width, handCanvas.height);
        if (now - lastHandSeenAt > 650) {
          pointer.visible = false;
          practicePointer.visible = false;
          practiceHolding = false;
          if (holding) { holding = false; setMessage('손이 화면 밖으로 나가 블록이 대기 칸으로 돌아갔어요'); }
          handPinching = false;
        }
      }
    } catch (error) {
      console.error('Hand tracking failed:', error);
      stopCamera();
      cameraHelp.textContent = '손 추적 중 오류가 발생했습니다. 카메라를 다시 켜거나 마우스 모드를 사용해 주세요.';
      return;
    }
  }
  cameraLoopId = requestAnimationFrame(cameraLoop);
}

async function startCamera() {
  if (cameraStarting) return;
  if (!navigator.mediaDevices?.getUserMedia) {
    cameraHelp.textContent = '카메라는 localhost 또는 HTTPS에서만 사용할 수 있습니다. 아래 README의 실행 방법을 확인해 주세요.';
    return;
  }
  cameraStarting = true;
  cameraButton.disabled = true;
  cameraButton.firstChild.textContent = '연결 중… ';
  cameraHelp.textContent = '손 인식 모델을 불러오고 있습니다. 첫 실행은 잠시 걸릴 수 있어요.';
  let pendingStream = null;
  try {
    const { FilesetResolver, HandLandmarker } = await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.0/vision_bundle.mjs');
    const vision = await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.0/wasm');
    if (!landmarker) {
      try {
        landmarker = await HandLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task', delegate: 'GPU' },
          runningMode: 'VIDEO', numHands: 1,
        });
      } catch (gpuError) {
        console.warn('GPU hand tracking unavailable; using CPU:', gpuError);
        landmarker = await HandLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task', delegate: 'CPU' },
          runningMode: 'VIDEO', numHands: 1,
        });
      }
    }
    pendingStream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30, max: 30 } } });
    cameraStream = pendingStream;
    video.srcObject = cameraStream;
    await video.play();
    mode = 'camera';
    pointer.visible = false;
    holding = false;
    practiceMouseDown = false;
    practiceHolding = false;
    cameraPlaceholder.classList.add('hidden');
    cameraIndicator.textContent = 'LIVE';
    cameraIndicator.classList.add('on');
    inputStatus.textContent = '손 인식 모드';
    practiceInputStatus.textContent = '카메라 손동작으로 테스트 중';
    cameraButton.firstChild.textContent = '마우스로 테스트 ';
    cameraButton.classList.add('mouse-action');
    cameraActionIcon.hidden = true;
    mouseActionIcon.hidden = false;
    testModeName.textContent = '카메라';
    cameraHelp.textContent = '손을 화면에 비춰 인식 상태를 확인하고, 위 조작 테스트에서 블록을 집어보세요.';
    lastVideoTime = -1;
    lastHandSeenAt = performance.now();
    cancelAnimationFrame(cameraLoopId);
    cameraLoop();
  } catch (error) {
    if (pendingStream) pendingStream.getTracks().forEach(track => track.stop());
    console.error('Camera start failed:', error);
    stopCamera();
    cameraHelp.textContent = error?.name === 'NotAllowedError' ? '카메라 권한이 거부되었습니다. 브라우저 주소창에서 권한을 허용해 주세요.' : '카메라 또는 모델을 불러오지 못했습니다. 인터넷 연결과 카메라 권한을 확인해 주세요.';
  } finally {
    cameraStarting = false;
    cameraButton.disabled = false;
  }
}

function stopCamera() {
  cancelAnimationFrame(cameraLoopId);
  if (cameraStream) cameraStream.getTracks().forEach(track => track.stop());
  cameraStream = null;
  video.srcObject = null;
  handCtx.clearRect(0, 0, handCanvas.width, handCanvas.height);
  cameraPlaceholder.classList.remove('hidden');
  cameraIndicator.textContent = 'OFFLINE';
  cameraIndicator.classList.remove('on');
  mode = 'mouse';
  inputStatus.textContent = '마우스 테스트 모드';
  practiceInputStatus.textContent = '마우스로 테스트 중';
  cameraButton.firstChild.textContent = '카메라 켜기 ';
  cameraButton.classList.remove('mouse-action');
  cameraActionIcon.hidden = false;
  mouseActionIcon.hidden = true;
  testModeName.textContent = '마우스';
  cameraHelp.textContent = '위 조작 테스트에서 마우스로 블록을 집어보세요.';
  pointer.visible = false;
  practicePointer.visible = false;
  practiceHolding = false;
  practiceMouseDown = false;
  pointer.pinching = false;
  holding = false;
  handPinching = false;
}

cameraButton.addEventListener('click', () => cameraStream ? stopCamera() : startCamera());

async function roomRequest(path, method = 'GET', body = null, session = roomSession) {
  const headers = { 'Content-Type': 'application/json' };
  if (session) {
    headers['X-Player-Id'] = session.id;
    headers['X-Player-Token'] = session.token;
  }
  let response;
  try {
    response = await fetch(`${apiBase}/api/rooms${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' });
  } catch {
    throw new Error('경쟁전 서버에 연결할 수 없습니다. 서버 주소와 실행 상태를 확인해 주세요.');
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || '경쟁전 서버를 찾을 수 없습니다. node server.mjs로 실행해 주세요.');
  return data;
}

function stopRoomTimers() {
  window.clearInterval(roomPollTimer);
  window.clearInterval(statePushTimer);
  roomPollTimer = 0;
  statePushTimer = 0;
}

function showModeScreen() {
  stopRoomTimers();
  stopCamera();
  roomSession = null;
  roomPhase = null;
  setupContext = null;
  localReady = false;
  sessionStorage.removeItem('pinchTowerRoom');
  gameMode = 'selection';
  modeScreen.hidden = false;
  setupScreen.hidden = true;
  competitionScreen.hidden = true;
  gameView.hidden = true;
  opponentSidebar.hidden = true;
  stageWrap.classList.remove('versus');
  resetButton.disabled = false;
  roomStatus.textContent = 'ROUND 01';
  resultTitle.textContent = '멋진 탑이에요!';
  playAgainButton.textContent = '다시 쌓기 ↗';
  competitionError.textContent = '';
}

async function leaveToMode() {
  const session = roomSession;
  showModeScreen();
  const url = new URL(window.location.href);
  url.searchParams.delete('room');
  window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
  if (session) roomRequest(`/${session.code}/leave`, 'POST', null, session).catch(() => {});
}

function showSetupScreen(context) {
  setupContext = context;
  resetPracticeGame();
  gameMode = context;
  modeScreen.hidden = true;
  setupScreen.hidden = false;
  competitionScreen.hidden = true;
  gameView.hidden = true;
  setupBackButton.textContent = context === 'solo' ? '← 모드 선택' : '← 대기실';
  setupPrimaryButton.firstChild.textContent = context === 'solo' ? '게임 시작 ' : '설정 완료 ';
}

function leaveSetupScreen() {
  practiceHolding = false;
  practiceMouseDown = false;
  practicePointer.visible = false;
  if (setupContext === 'solo') {
    leaveToMode();
    return;
  }
  setupContext = null;
  setupScreen.hidden = true;
  competitionScreen.hidden = false;
}

function showCompetitionEntry() {
  gameMode = 'versus';
  setupContext = null;
  modeScreen.hidden = true;
  setupScreen.hidden = true;
  competitionScreen.hidden = false;
  gameView.hidden = true;
  competitionEntry.hidden = false;
  competitionLobby.hidden = true;
  competitionError.textContent = '';
  roomCodeInput.value = new URLSearchParams(window.location.search).get('room')?.toUpperCase() || '';
}

function drawMiniBlock(context, block, scale, offsetX, viewY) {
  const piece = SHAPES[SEQUENCE[block.i]];
  if (!piece) return;
  const points = outlinePoints(piece.cells);
  context.save();
  context.translate(offsetX + (block.x - ARENA_LEFT) * scale, (block.y - viewY) * scale);
  context.rotate(block.a);
  context.scale(scale, scale);
  context.beginPath();
  context.moveTo(points[0][0], points[0][1]);
  for (let index = 1; index < points.length; index++) context.lineTo(points[index][0], points[index][1]);
  context.closePath();
  context.fillStyle = COLORS[block.i % COLORS.length];
  context.fill();
  context.restore();
}

function drawOpponentBoard(miniCanvas, player) {
  const mini = miniCanvas.getContext('2d');
  const scale = Math.min(miniCanvas.width / (ARENA_RIGHT - ARENA_LEFT), miniCanvas.height / H);
  const offsetX = (miniCanvas.width - (ARENA_RIGHT - ARENA_LEFT) * scale) / 2;
  const viewY = player.cameraY || 0;
  mini.fillStyle = '#1e2d43';
  mini.fillRect(0, 0, miniCanvas.width, miniCanvas.height);
  mini.fillStyle = '#7e9ab5';
  mini.fillRect(offsetX + (GROUND_LEFT - ARENA_LEFT) * scale, (GROUND_Y - viewY) * scale, GROUND_WIDTH * scale, 3);
  for (const block of player.blocks) drawMiniBlock(mini, block, scale, offsetX, viewY);
  if (player.held) {
    mini.globalAlpha = 0.55;
    drawMiniBlock(mini, player.held, scale, offsetX, viewY);
    mini.globalAlpha = 1;
  }
}

function renderOpponents(room) {
  const opponents = room.players.filter(player => player.id !== roomSession.id);
  opponentCount.textContent = `${opponents.length} / 5`;
  opponentList.replaceChildren();
  for (const player of opponents) {
    const card = document.createElement('div');
    card.className = `opponent-card${player.connected ? '' : ' offline'}`;
    const header = document.createElement('div');
    header.className = 'opponent-card-head';
    const name = document.createElement('span');
    name.textContent = player.name;
    const score = document.createElement('small');
    score.textContent = `${player.placedCount}/12`;
    header.append(name, score);
    const mini = document.createElement('canvas');
    mini.width = 160;
    mini.height = 148;
    mini.setAttribute('aria-label', `${player.name}의 탑`);
    const foot = document.createElement('div');
    foot.className = 'opponent-card-foot';
    foot.textContent = player.connected ? `HEIGHT ${player.height}px` : '연결 대기 중';
    card.append(header, mini, foot);
    opponentList.append(card);
    drawOpponentBoard(mini, player);
  }
}

function showFinishedRoom(room) {
  const winner = room.players.find(player => player.id === room.winnerId);
  resultTitle.textContent = !winner ? '무승부!' : room.winnerId === roomSession.id ? '경쟁전 우승!' : '경쟁전 종료';
  resultDetail.textContent = winner
    ? `${winner.name}님의 탑이 ${winner.height}px로 가장 높았습니다. 내 기록: ${room.players.find(player => player.id === roomSession.id)?.height ?? 0}px`
    : '가장 높은 탑의 높이와 남은 블록 수가 같습니다.';
  resultDetail.textContent += ' 잠시 후 같은 방의 대기실로 돌아갑니다.';
  playAgainButton.textContent = '대기실로 돌아가기 ↗';
  resultOverlay.classList.remove('hidden');
}

function restoreLocalGame(player) {
  resetGame();
  if (!player) return;
  cameraY = Math.max(WORLD_TOP, Math.min(0, player.cameraY || 0));
  for (const block of player.blocks) {
    const piece = { ...SHAPES[SEQUENCE[block.i]], color: COLORS[block.i % COLORS.length] };
    const body = createBody(piece, block.x, block.y);
    Body.setAngle(body, block.a);
    World.add(engine.world, body);
    placed.push({ body, color: piece.color, sequenceIndex: block.i });
  }
  pieceIndex = player.placedCount;
  placedCount.textContent = String(pieceIndex).padStart(2, '0');
  updateHeight();
}

function updateRoomView(room) {
  if (!roomSession || room.code !== roomSession.code) return;
  if (room.status === 'lobby') {
    if (roomPhase === 'finished') {
      stopCamera();
      resetGame();
      resetPracticeGame();
    }
    roomPhase = 'lobby';
    resultOverlay.classList.add('hidden');
    modeScreen.hidden = true;
    setupScreen.hidden = setupContext !== 'versus';
    competitionScreen.hidden = setupContext === 'versus';
    gameView.hidden = true;
    competitionEntry.hidden = true;
    competitionLobby.hidden = false;
    lobbyCode.textContent = room.code;
    lobbyCount.textContent = `${room.players.length} / 6명 참가`;
    lobbyPlayers.replaceChildren();
    for (const player of room.players) {
      const item = document.createElement('div');
      item.className = `lobby-player${player.connected ? '' : ' offline'}`;
      item.textContent = player.name;
      if (player.id === room.hostId) {
        const badge = document.createElement('small');
        badge.textContent = '방장';
        item.append(badge);
      }
      if (player.ready) {
        const badge = document.createElement('small');
        badge.textContent = '준비 완료';
        item.append(badge);
      }
      lobbyPlayers.append(item);
    }
    const isHost = room.hostId === roomSession.id;
    localReady = room.players.find(player => player.id === roomSession.id)?.ready === true;
    readyButton.textContent = localReady ? '준비 취소' : '준비 완료';
    readyButton.classList.toggle('active', localReady);
    startRoomButton.hidden = !isHost;
    startRoomButton.disabled = room.players.length < 2 || !room.players.every(player => player.ready);
    lobbyHint.textContent = room.players.length < 2 ? '2명 이상 모이면 시작할 수 있습니다.'
      : !room.players.every(player => player.ready) ? '모두 준비 완료를 누르면 시작할 수 있습니다.'
        : isHost ? '모두 준비됐습니다. 경쟁전을 시작하세요.' : '모두 준비됐습니다. 방장이 시작하기를 기다리고 있습니다.';
    return;
  }
  if (roomPhase === 'lobby' || roomPhase === null) {
    if (roomPhase === null) restoreLocalGame(room.players.find(player => player.id === roomSession.id));
    else resetGame();
    resultOverlay.classList.add('hidden');
    resultTitle.textContent = '멋진 탑이에요!';
    playAgainButton.textContent = '다시 쌓기 ↗';
  }
  if (room.status === 'playing' && !statePushTimer) {
    statePushTimer = window.setInterval(sendLocalState, 250);
    sendLocalState();
  }
  if (room.status === 'finished') {
    window.clearInterval(statePushTimer);
    statePushTimer = 0;
    showFinishedRoom(room);
  }
  roomPhase = room.status;
  practiceHolding = false;
  setupContext = null;
  modeScreen.hidden = true;
  setupScreen.hidden = true;
  competitionScreen.hidden = true;
  gameView.hidden = false;
  opponentSidebar.hidden = false;
  stageWrap.classList.add('versus');
  resetButton.disabled = true;
  roomStatus.textContent = `ROOM ${room.code}`;
  renderOpponents(room);
}

async function pollRoom() {
  if (!roomSession || pollInFlight) return;
  pollInFlight = true;
  const session = roomSession;
  try {
    const room = await roomRequest(`/${session.code}`, 'GET', null, session);
    if (roomSession === session) {
      competitionError.textContent = '';
      updateRoomView(room);
    }
  } catch (error) {
    if (roomSession === session) competitionError.textContent = error.message;
  } finally {
    pollInFlight = false;
  }
}

async function returnToExistingLobby() {
  if (!roomSession || roomPhase !== 'finished') return;
  try {
    updateRoomView(await roomRequest(`/${roomSession.code}/lobby`, 'POST'));
  } catch (error) {
    gameMessage.textContent = error.message;
  }
}

function localRoomState() {
  updateHeight();
  return {
    placedCount: pieceIndex,
    height: Number(heightCount.textContent),
    cameraY,
    blocks: placed.map(({ body, sequenceIndex }) => ({ i: sequenceIndex, x: body.position.x, y: body.position.y, a: body.angle })),
    held: holding ? { i: pieceIndex, x: pointer.x, y: pointer.y + cameraY, a: heldAngle } : null,
    done: pieceIndex >= TOTAL,
  };
}

async function sendLocalState() {
  if (!roomSession || roomPhase !== 'playing' || pushInFlight) return;
  pushInFlight = true;
  const session = roomSession;
  try { await roomRequest(`/${session.code}/state`, 'PUT', localRoomState(), session); }
  catch (error) { if (roomSession === session) gameMessage.textContent = error.message; }
  finally { pushInFlight = false; }
}

function saveRoomSession(data) {
  roomSession = { code: data.room.code, id: data.id, token: data.token };
  resetPracticeGame();
  sessionStorage.setItem('pinchTowerRoom', JSON.stringify(roomSession));
  gameMode = 'versus';
  roomPhase = null;
  updateRoomView(data.room);
  stopRoomTimers();
  roomPollTimer = window.setInterval(pollRoom, 500);
}

async function createOrJoinRoom(join) {
  competitionError.textContent = '';
  try {
    const name = playerNameInput.value.trim();
    if (!name) throw new Error('플레이어 이름을 입력해 주세요.');
    const code = roomCodeInput.value.trim().toUpperCase();
    if (join && !/^[A-Z2-9]{6}$/.test(code)) throw new Error('방 코드 6자리를 입력해 주세요.');
    const data = await roomRequest(join ? `/${code}/join` : '', 'POST', { name }, null);
    saveRoomSession(data);
  } catch (error) { competitionError.textContent = error.message; }
}

document.querySelector('#solo-mode-button').addEventListener('click', () => {
  showSetupScreen('solo');
  opponentSidebar.hidden = true;
  stageWrap.classList.remove('versus');
  resetButton.disabled = false;
  roomStatus.textContent = 'ROUND 01';
});
setupBackButton.addEventListener('click', leaveSetupScreen);
setupPrimaryButton.addEventListener('click', () => {
  if (setupContext === 'versus') {
    leaveSetupScreen();
    return;
  }
  practiceHolding = false;
  practiceMouseDown = false;
  practicePointer.visible = false;
  setupContext = null;
  setupScreen.hidden = true;
  gameView.hidden = false;
  resetGame();
});
document.querySelector('#versus-mode-button').addEventListener('click', showCompetitionEntry);
document.querySelector('#home-link').addEventListener('click', event => {
  event.preventDefault();
  leaveToMode();
});
document.querySelector('#competition-back-button').addEventListener('click', leaveToMode);
document.querySelector('#exit-mode-button').addEventListener('click', leaveToMode);
document.querySelector('#create-room-button').addEventListener('click', () => createOrJoinRoom(false));
document.querySelector('#join-room-button').addEventListener('click', () => createOrJoinRoom(true));
lobbyCameraButton.addEventListener('click', async () => {
  if (!roomSession) return;
  if (localReady) {
    try { updateRoomView(await roomRequest(`/${roomSession.code}/ready`, 'POST', { ready: false })); }
    catch (error) { competitionError.textContent = error.message; return; }
  }
  showSetupScreen('versus');
});
readyButton.addEventListener('click', async () => {
  if (!roomSession) return;
  readyButton.disabled = true;
  try { updateRoomView(await roomRequest(`/${roomSession.code}/ready`, 'POST', { ready: !localReady })); }
  catch (error) { competitionError.textContent = error.message; }
  finally { readyButton.disabled = false; }
});
document.querySelector('#copy-room-button').addEventListener('click', async () => {
  if (!roomSession) return;
  const invite = new URL(window.location.href);
  invite.searchParams.set('room', roomSession.code);
  try {
    await navigator.clipboard.writeText(invite.href);
    competitionError.textContent = '초대 링크를 복사했습니다.';
  } catch { competitionError.textContent = `방 코드: ${roomSession.code}`; }
});
startRoomButton.addEventListener('click', async () => {
  if (!roomSession) return;
  try { updateRoomView(await roomRequest(`/${roomSession.code}/start`, 'POST')); }
  catch (error) { competitionError.textContent = error.message; }
});
resetButton.addEventListener('click', () => { if (gameMode === 'solo') resetGame(); });
playAgainButton.addEventListener('click', () => gameMode === 'versus' ? returnToExistingLobby() : resetGame());
window.addEventListener('pagehide', () => { if (cameraStream) cameraStream.getTracks().forEach(track => track.stop()); });

resetGame();
resetPracticeGame();
requestAnimationFrame(render);
try {
  const saved = JSON.parse(sessionStorage.getItem('pinchTowerRoom') || 'null');
  if (saved?.code && saved?.id && saved?.token) {
    roomSession = saved;
    gameMode = 'versus';
    showCompetitionEntry();
    pollRoom().then(() => { if (roomSession) roomPollTimer = window.setInterval(pollRoom, 500); });
  }
} catch { sessionStorage.removeItem('pinchTowerRoom'); }
