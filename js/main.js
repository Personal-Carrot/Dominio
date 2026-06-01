/**
 * ============================================================================
 * MOTOR PRINCIPAL: DOMINIO
 * ============================================================================
 */

const ROWS = 7, COLS = 7, CR = 3, CC = 3;
const CORNERS = [[0, 0], [0, 6], [6, 0], [6, 6]];
const DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];

const INITIAL = [
  ['.', 'I', '.', 'I', '.', 'I', '.'],
  ['I', '.', '.', '.', '.', '.', 'I'],
  ['.', '.', 'G', 'G', 'G', '.', '.'],
  ['I', '.', 'G', 'S', 'G', '.', 'I'],
  ['.', '.', 'G', 'G', 'G', '.', '.'],
  ['I', '.', '.', '.', '.', '.', 'I'],
  ['.', 'I', '.', 'I', '.', 'I', '.']
];

let board, currentPlayer, selectedCell, validMoves;
let isGameOver, kingLeftCenter, round, phase;
let boardHistory, ironSet;
let stateHistory = [], historyIndex = 0;
let gameMode = 'pvp', isProcessingAI = false;
let lastFrom = null, lastTo = null;
let maxRounds = 20;

// Avatares y perfiles de los bots
const DEFAULT_AVATAR_EASY = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' fill='%232a5a8a'/%3E%3Ctext x='50' y='65' font-size='50' font-family='sans-serif' fill='white' text-anchor='middle'%3E😊%3C/text%3E%3C/svg%3E";
const DEFAULT_AVATAR_MED = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' fill='%23b83030'/%3E%3Ctext x='50' y='65' font-size='50' font-family='sans-serif' fill='white' text-anchor='middle'%3E😠%3C/text%3E%3C/svg%3E";
const DEFAULT_AVATAR_BOSS = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' fill='%23111'/%3E%3Ccircle cx='50' cy='50' r='30' fill='%23ff0000' opacity='0.3'/%3E%3Ctext x='50' y='65' font-size='50' font-family='sans-serif' fill='%23ff4444' text-anchor='middle'%3E💀%3C/text%3E%3C/svg%3E";

const BOTS = {
  novicio: { id: 'novicio', name: 'Garrick', title: 'El Escudero', category: 'Principiante', avatar: DEFAULT_AVATAR_EASY, depth: 1, dialogue: { menu: 'Acabo de alistarme en la guardia. Seré suave, lo prometo.', gameStart: ['¡Que gane el mejor!', 'Tengo mi escudo listo.'], capture: ['¡Ajá! ¡Te atrapé!'], theirCapture: ['Oh no... mi pobre pieza.'], kingMove: ['¡Cuidado, su majestad!'], kingEscape: ['¡No, se escapó!'], win: ['¡Gané! ¡Aún no me lo creo!'], lose: ['Necesito más entrenamiento en el patio.'] } },
  veterano: { id: 'veterano', name: 'Capitán Evans', title: 'Lobo de Mar', category: 'Avanzado', avatar: DEFAULT_AVATAR_MED, depth: 3, dialogue: { menu: 'He visto mil batallas como esta. ¿Quieres jugar?', gameStart: ['Que hable el acero.'], capture: ['Cayó en la trampa.'], theirCapture: ['Un sacrificio aceptable.'], kingMove: ['Cortadle el paso, muchachos.'], kingEscape: ['¡Maldición! Rompió el cerco.'], win: ['Una táctica de libro.'], lose: ['Has ganado mis respetos.'] } },
  darius: { id: 'darius', name: 'Darius Varkhan', title: 'El Optimizador', category: 'Jefe Final', avatar: DEFAULT_AVATAR_BOSS, depth: 5, dialogue: { menu: 'El tablero es una ecuación. Yo conozco la solución.', gameStart: ['Cada movimiento tuyo es una variable que ya he despejado.'], capture: ['Error calculado con días de antelación.'], theirCapture: ['Concedo ese intercambio. Ya he calculado lo que sigue.'], kingMove: ['El señor se mueve. El rango de escape se reduce.'], kingEscape: ['Una anomalía en mis cálculos.'], win: ['La partida terminó donde los números indicaban que terminaría.'], lose: ['Recalculando. Hay una variable que no contemplé.'] } }
};

let activeBotId = null, selectedMenuBotId = 'novicio', dariusDialogueCooldown = 0;

/* ══════════════════════════════════════════════
   GESTIÓN DEL WEB WORKER DE LA IA
══════════════════════════════════════════════ */
let aiWorker = null;

function initAIWorker() {
  if (!aiWorker) {
    try {
      aiWorker = new Worker('js/ai-worker.js');
      
      aiWorker.onmessage = function(e) {
        const { move } = e.data;
        isProcessingAI = false;
        
        if (move) {
          applyMoveReal(move.fromR, move.fromC, move.toR, move.toC);
          const sim = simulateApplyMove(board, move.fromR, move.fromC, move.toR, move.toC, kingLeftCenter);
          const caps = checkCapturesSim(sim.board, move.toR, move.toC, sim.kingLeftCenter);
          if (caps.length > 0 && currentPlayer === 'atacante') showBotDialogue('capture');
          else if (board[move.fromR][move.fromC] === 'S') showBotDialogue('kingMove');
        } else {
          logMsg('La IA cede el turno.', 'warn');
          if (phase === 0) { phase = 1; currentPlayer = 'defensor'; }
          else { phase = 0; currentPlayer = 'atacante'; round++; }
          updateUI(); checkAndTriggerAI();
        }
      };

      // Si el navegador bloquea al Worker por estar en local (file://)
      aiWorker.onerror = function(err) {
        console.error("Worker error:", err);
        isProcessingAI = false;
        document.getElementById('turn-badge').textContent = "Error de IA";
        alert("⚠️ AVISO DEL NAVEGADOR:\n\nEstás abriendo el juego desde tus archivos locales (file://). \n\nPor seguridad, los navegadores bloquean el 'Cerebro' de la IA en este modo y las piezas no se moverán.\n\nSube tu carpeta a GitHub Pages o ábrela mediante un servidor local (Live Server en VSCode) para que Darius despierte.");
      };

    } catch (error) {
      console.error("No se pudo iniciar el Worker: ", error);
      isProcessingAI = false;
    }
  }
}

function checkAndTriggerAI() {
  if (!isGameOver && isAITurn() && historyIndex === stateHistory.length - 1) {
    isProcessingAI = true; 
    let botName = activeBotId ? BOTS[activeBotId].name : 'IA';
    document.getElementById('turn-badge').textContent = (currentPlayer === 'atacante' ? 'Invasores' : 'Defensores') + ' — ' + botName + ' delibera…';
    
    // Validar entorno local
    if (window.location.protocol === 'file:' && !aiWorker) {
        alert("Atención: Jugando en archivo local (file://). La IA podría estar bloqueada por el navegador.");
    }
    
    if (!aiWorker) initAIWorker();
    
    const delay = gameMode === 'eve' ? 800 : 520;
    setTimeout(() => {
      if(aiWorker) {
        aiWorker.postMessage({ board, currentPlayer, kingLeftCenter, ironSetArray: Array.from(ironSet), botDepth: activeBotId ? BOTS[activeBotId].depth : 2, activeBotId });
      }
    }, delay);
  }
}

function isAITurn() {
  if (gameMode === 'pvp') return false; 
  if (gameMode === 'eve') return true;
  if (gameMode === 'pve-def' && currentPlayer === 'atacante') return true;
  if (gameMode === 'pve-atk' && currentPlayer === 'defensor') return true; 
  return false;
}

/* ══════════════════════════════════════════════
   LOGROS Y ESTADÍSTICAS
══════════════════════════════════════════════ */
let playerStats = { 
  wins: 0, losses: 0, draws: 0, played: 0, streak: 0, lastLogin: null, questsDate: null, quests: [],
  achievements: { first_blood: false, iron_wall: false, defender_win: false, invader_win: false, speedrun: false }
};

const ACHIEVEMENTS_INFO = {
  first_blood:  { name: 'Primera Sangre', desc: 'Realiza tu primera captura', icon: '🩸' },
  iron_wall:    { name: 'Muro Infranqueable', desc: 'Forma una Línea de Hierro', icon: '🛡' },
  defender_win: { name: 'Rey a Salvo', desc: 'Gana jugando como Defensor', icon: '👑' },
  invader_win:  { name: 'El Asedio', desc: 'Gana jugando como Invasor', icon: '⚔' },
  speedrun:     { name: 'Guerra Relámpago', desc: 'Gana en menos de 10 rondas', icon: '⚡' }
};

const QUEST_POOL = [
  { id: 'play_3', type: 'play', target: 3, desc: 'Juega 3 partidas' },
  { id: 'capture_5', type: 'capture', target: 5, desc: 'Captura 5 piezas enemigas' },
  { id: 'win_1', type: 'win', target: 1, desc: 'Consigue 1 victoria' },
  { id: 'iron_2', type: 'iron', target: 2, desc: 'Forma 2 Líneas de Hierro' }
];

function initStats() {
  try {
    const saved = localStorage.getItem('dominio_player_stats');
    if (saved) {
      playerStats = { ...playerStats, ...JSON.parse(saved) };
      if (!playerStats.achievements) playerStats.achievements = {};
      if (!playerStats.quests) playerStats.quests = [];
    }
  } catch(e) {}
  checkDailyTasks(); updateStatsUI();
}

function saveStats() {
  try { localStorage.setItem('dominio_player_stats', JSON.stringify(playerStats)); } catch(e) {}
  updateStatsUI();
}

function updateStatsUI() {
  if (document.getElementById('stat-played')) document.getElementById('stat-played').textContent = playerStats.played;
  if (document.getElementById('stat-wins')) document.getElementById('stat-wins').textContent = playerStats.wins;
  if (document.getElementById('streak-display')) document.getElementById('streak-display').textContent = playerStats.streak;
}

function checkDailyTasks() {
  const d = new Date(), today = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  if (playerStats.lastLogin !== today) {
    if (playerStats.lastLogin) {
      const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
      const yStr = `${yesterday.getFullYear()}-${yesterday.getMonth()}-${yesterday.getDate()}`;
      if (playerStats.lastLogin === yStr) playerStats.streak++; else playerStats.streak = 1;
    } else playerStats.streak = 1;
    playerStats.lastLogin = today;
  }
  if (playerStats.questsDate !== today || !playerStats.quests.length) {
    playerStats.questsDate = today;
    let shuffled = [...QUEST_POOL].sort(() => 0.5 - Math.random());
    playerStats.quests = shuffled.slice(0, 3).map(q => ({ ...q, progress: 0, done: false }));
  }
  saveStats();
}

function trackQuest(type, amount = 1) {
  if (isAITurn() && gameMode !== 'eve') return; 
  let updated = false;
  playerStats.quests.forEach(q => {
    if (q.type === type && !q.done) {
      q.progress += amount;
      if (q.progress >= q.target) { q.progress = q.target; q.done = true; showToast('Misión Completada', q.desc, '📜'); }
      updated = true;
    }
  });
  if (updated) saveStats();
}

function unlockAchievement(id) {
  if (isAITurn() && gameMode !== 'eve') return;
  if (!playerStats.achievements[id]) {
    playerStats.achievements[id] = true; saveStats();
    const ach = ACHIEVEMENTS_INFO[id]; showToast('¡Logro Desbloqueado!', ach.name, ach.icon);
  }
}

function openQuests() {
  document.getElementById('start-overlay').classList.remove('show'); document.getElementById('quests-overlay').classList.add('show');
  const qCont = document.getElementById('quests-container'); qCont.innerHTML = '';
  playerStats.quests.forEach(q => {
    const pct = Math.min(100, Math.round((q.progress / q.target) * 100));
    qCont.innerHTML += `<div class="quest-card ${q.done ? 'done' : ''}"><div class="q-title">${q.desc}</div><div class="q-bar-bg"><div class="q-bar-fill" style="width:${pct}%"></div></div><div style="font-size:0.7rem; color:var(--text-dim); text-align:right;">${q.progress} / ${q.target}</div></div>`;
  });
  const aCont = document.getElementById('achiev-container'); aCont.innerHTML = '';
  for (const [id, info] of Object.entries(ACHIEVEMENTS_INFO)) {
    const isUnlocked = playerStats.achievements[id];
    aCont.innerHTML += `<div class="achiev-card ${isUnlocked ? 'unlocked' : ''}"><div class="achiev-icon">${info.icon}</div><div class="achiev-name">${info.name}</div><div class="achiev-desc">${info.desc}</div></div>`;
  }
}

function closeQuests() {
  document.getElementById('quests-overlay').classList.remove('show'); document.getElementById('start-overlay').classList.add('show');
}


/* ══════════════════════════════════════════════
   TUTORIAL
══════════════════════════════════════════════ */
const TUT_STEPS = [
  { icon: '🏰', title: 'Bienvenido a Dominio', text: 'Dominio es un juego de asedio. Un bando defiende el castillo y el otro ataca. El tablero tiene cuatro esquinas sagradas (✦).' },
  { icon: '⚔', title: 'Los Invasores', text: 'Los Invasores atacan. Se mueven 1 ó 2 casillas libres en línea recta. Su objetivo es capturar al Señor del Hierro fuera del centro.' },
  { icon: '🛡', title: 'Los Guardianes', text: 'Los Guardianes protegen al Señor. Se mueven 1 casilla libre en línea recta. Su misión es escoltar al Señor hasta una esquina (✦).' },
  { icon: '♛', title: 'El Señor del Hierro', text: 'El Señor empieza en el centro (D4) y es invulnerable ahí. Se mueve 1 casilla, o salta sobre un Guardián propio. ¡Si sale del centro, no puede volver!' },
  { icon: '⚖', title: 'Cómo Capturar', text: 'Una pieza es capturada al quedar flanqueada entre dos piezas enemigas en línea recta. Las esquinas (✦) cuentan como aliadas para los Defensores.' },
  { icon: '🏆', title: 'Victoria', text: '• Defensor gana si el Señor llega a una esquina ✦.\n• Invasor gana si captura al Señor fuera de D4.\n• Empate si se agota el límite de rondas.' }
];

let tutCurrentStep = 0;

function openTutorial() { tutCurrentStep = 0; document.getElementById('start-overlay').classList.remove('show'); document.getElementById('tutorial-overlay').classList.add('show'); renderTutStep(); }
function closeTutorial() { document.getElementById('tutorial-overlay').classList.remove('show'); document.getElementById('start-overlay').classList.add('show'); }

function renderTutStep() {
  const step = TUT_STEPS[tutCurrentStep];
  document.getElementById('tut-content').innerHTML = `<div class="tut-step active"><div class="tut-title">${step.title}</div><div class="tut-icon">${step.icon}</div><div class="tut-text" style="white-space: pre-line;">${step.text}</div></div>`;
  const dots = document.getElementById('tut-dots'); dots.innerHTML = '';
  TUT_STEPS.forEach((_, i) => {
    const dot = document.createElement('div'); dot.className = 'tut-dot' + (i === tutCurrentStep ? ' active' : '');
    dot.onclick = () => { tutCurrentStep = i; renderTutStep(); }; dots.appendChild(dot);
  });
  const prevBtn = document.getElementById('btn-tut-prev'), nextBtn = document.getElementById('btn-tut-next');
  prevBtn.disabled = tutCurrentStep === 0; prevBtn.style.opacity = tutCurrentStep === 0 ? '0.35' : '1';
  if (tutCurrentStep === TUT_STEPS.length - 1) { nextBtn.textContent = '¡A Jugar! ⚔'; nextBtn.onclick = closeTutorial; } 
  else { nextBtn.textContent = 'Siguiente'; nextBtn.onclick = nextTut; }
}
function nextTut() { if (tutCurrentStep < TUT_STEPS.length - 1) { tutCurrentStep++; renderTutStep(); } }
function prevTut() { if (tutCurrentStep > 0) { tutCurrentStep--; renderTutStep(); } }

function showToast(title, desc, icon) {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div'); toast.className = 'toast';
  toast.innerHTML = `<div class="toast-icon">${icon}</div><div class="toast-body"><div class="toast-title">${title}</div><div class="toast-desc">${desc}</div></div>`;
  container.appendChild(toast);
  setTimeout(() => { toast.classList.add('hide'); setTimeout(() => { if(toast.parentNode) toast.remove(); }, 400); }, 4000);
}


/* ══════════════════════════════════════════════
   MENÚ PRINCIPAL Y UI
══════════════════════════════════════════════ */
function initBotMenu() {
  const catalog = document.getElementById('bot-catalog'); if(!catalog) return; catalog.innerHTML = '';
  const categories = {};
  for (const id in BOTS) { const bot = BOTS[id]; if (!categories[bot.category]) categories[bot.category] = []; categories[bot.category].push(bot); }
  for (const cat in categories) {
    const title = document.createElement('div'); title.className = 'bot-category-title'; title.textContent = cat; catalog.appendChild(title);
    const grid = document.createElement('div'); grid.className = 'bot-grid';
    categories[cat].forEach(bot => {
      const card = document.createElement('div'); card.className = `bot-card ${bot.id === selectedMenuBotId ? 'selected' : ''}`; card.id = `bot-card-${bot.id}`; card.onclick = () => selectMenuBot(bot.id);
      const img = document.createElement('img'); img.className = 'bot-card-img'; img.src = bot.avatar;
      const name = document.createElement('div'); name.className = 'bot-card-name'; name.textContent = bot.name;
      card.appendChild(img); card.appendChild(name); grid.appendChild(card);
    });
    catalog.appendChild(grid);
  }
  selectMenuBot(selectedMenuBotId);
}

function selectMenuBot(botId) {
  const prevCard = document.getElementById(`bot-card-${selectedMenuBotId}`); if (prevCard) prevCard.classList.remove('selected');
  selectedMenuBotId = botId;
  const newCard = document.getElementById(`bot-card-${selectedMenuBotId}`); if (newCard) newCard.classList.add('selected');
  const bot = BOTS[selectedMenuBotId];
  document.getElementById('menu-bot-avatar').src = bot.avatar;
  document.getElementById('menu-bot-name').textContent = bot.name;
  document.getElementById('menu-bot-rating').textContent = `${bot.title} (Nivel ${bot.depth})`;
  document.getElementById('menu-bot-chat').textContent = bot.dialogue.menu;
}

function showStartMenu() {
  document.getElementById('end-overlay').classList.remove('show');
  initBotMenu(); initStats();
  document.getElementById('start-overlay').classList.add('show');
  stopMusic();
}

function startGameWithMenuBot(mode) { if (mode === 'pvp') startGame('pvp', null); else startGame(mode, selectedMenuBotId); }

function startGame(mode, botId = null) {
  activeBotId = botId; gameMode = mode; 
  document.getElementById('start-overlay').classList.remove('show');
  board = INITIAL.map(r => [...r]); currentPlayer = 'atacante'; selectedCell = null; validMoves = []; isGameOver = false; kingLeftCenter = false; round = 1; phase = 0; maxRounds = 20;
  boardHistory = [getBoardHash()]; stateHistory = []; historyIndex = 0; lastFrom = null; lastTo = null;
  ironSet = calculateIronSetSim(board);
  saveState([{ text: `Partida iniciada. Los Invasores atacan primero.`, type: 'sys' }]);
  
  const leftPanel = document.getElementById('left-panel');
  if (activeBotId && mode !== 'pvp') {
     leftPanel.style.display = 'flex'; const bot = BOTS[activeBotId];
     document.getElementById('in-game-bot-avatar').src = bot.avatar; document.getElementById('in-game-bot-name').textContent = bot.name; document.getElementById('in-game-bot-title').textContent = bot.title; document.getElementById('in-game-bot-chat').textContent = '...';
  } else { leftPanel.style.display = 'none'; }
  
  updateUI(); getCtx(); sfxGameStart(); setTimeout(startMusic, 1600);
  if (activeBotId && (isAITurn() || gameMode === 'eve')) setTimeout(() => showBotDialogue('gameStart'), 2200);
  
  trackQuest('play'); checkAndTriggerAI();
}


/* ══════════════════════════════════════════════
   LÓGICA DEL JUEGO
══════════════════════════════════════════════ */
function getTeam(piece) { if (piece === 'I') return 'atacante'; if (piece === 'G' || piece === 'S') return 'defensor'; return null; }
function isCorner(r, c) { return CORNERS.some(([cr, cc]) => cr === r && cc === c); }
function inBounds(r, c) { return r >= 0 && r < ROWS && c >= 0 && c < COLS; }
function squareName(r, c) { return `${String.fromCharCode(65 + c)}${ROWS - r}`; }
function getBoardHash() { return board.map(row => row.join('')).join('|') + ':' + currentPlayer; }

function calculateIronSetSim(boardState) {
  let iset = new Set();
  for (let r = 0; r < ROWS; r++) { let run = []; for (let c = 0; c <= COLS; c++) { if (c < COLS && boardState[r][c] === 'G') run.push(`${r},${c}`); else { if (run.length >= 3) run.forEach(k => iset.add(k)); run = []; } } }
  for (let c = 0; c < COLS; c++) { let run = []; for (let r = 0; r <= ROWS; r++) { if (r < ROWS && boardState[r][c] === 'G') run.push(`${r},${c}`); else { if (run.length >= 3) run.forEach(k => iset.add(k)); run = []; } } }
  return iset;
}

function isAdjToIronSim(r, c, currentIronSet) { for (const [dr, dc] of DIRS) if (currentIronSet.has(`${r + dr},${c + dc}`)) return true; return false; }

function getValidMovesSim(boardState, r, c, currentIronSet, isKingOut) {
  const p = boardState[r][c];
  if (p === 'S') return getKingMovesSim(boardState, r, c, isKingOut); 
  if (p === 'G') return getGuardianMovesSim(boardState, r, c); 
  if (p === 'I') return getInvaderMovesSim(boardState, r, c, currentIronSet);
  return [];
}

function getKingMovesSim(boardState, r, c, isKingOut) {
  const moves = [];
  for (const [dr, dc] of DIRS) {
    const r1 = r + dr, c1 = c + dc; if (!inBounds(r1, c1)) continue;
    if (boardState[r1][c1] === '.') { if (isKingOut && r1 === CR && c1 === CC) continue; moves.push({ r: r1, c: c1 }); } 
    else if (boardState[r1][c1] === 'G') { const r2 = r + dr * 2, c2 = c + dc * 2; if (inBounds(r2, c2) && boardState[r2][c2] === '.') { if (isKingOut && r2 === CR && c2 === CC) continue; moves.push({ r: r2, c: c2 }); } }
  }
  return moves;
}

function getGuardianMovesSim(boardState, r, c) {
  const moves = [];
  for (const [dr, dc] of DIRS) { const nr = r + dr, nc = c + dc; if (inBounds(nr, nc) && boardState[nr][nc] === '.' && !isCorner(nr, nc)) moves.push({ r: nr, c: nc }); }
  return moves;
}

function getInvaderMovesSim(boardState, r, c, currentIronSet) {
  const maxDistance = isAdjToIronSim(r, c, currentIronSet) ? 1 : 2; const moves = [];
  for (const [dr, dc] of DIRS) { for (let d = 1; d <= maxDistance; d++) { const nr = r + dr * d, nc = c + dc * d; if (!inBounds(nr, nc) || isCorner(nr, nc) || boardState[nr][nc] !== '.') break; moves.push({ r: nr, c: nc }); } }
  return moves;
}

function checkCapturesSim(boardState, moveR, moveC, isKingOut) {
  const movePiece = boardState[moveR][moveC], moveTeam = getTeam(movePiece), captures = [];
  for (const [dr, dc] of DIRS) {
    const adjR = moveR + dr, adjC = moveC + dc; if (!inBounds(adjR, adjC)) continue;
    const adjPiece = boardState[adjR][adjC]; if (!adjPiece || adjPiece === '.' || getTeam(adjPiece) === moveTeam) continue;
    if (adjPiece === 'S' && !isKingOut) continue;
    const flankR = adjR + dr, flankC = adjC + dc; if (!inBounds(flankR, flankC)) continue;
    const flankPiece = boardState[flankR][flankC]; if (!flankPiece || flankPiece === '.' || getTeam(flankPiece) !== moveTeam) continue;
    if (adjPiece === 'S' && (movePiece !== 'I' || flankPiece !== 'I')) continue;
    captures.push({ r: adjR, c: adjC, piece: adjPiece });
  }
  return captures;
}

function simulateApplyMove(tempBoard, fR, fC, tR, tC, isKingOut) {
  let b = tempBoard.map(row => [...row]); let p = b[fR][fC]; b[fR][fC] = '.'; b[tR][tC] = p;
  let newKingOut = isKingOut; if (p === 'S' && !newKingOut) newKingOut = true;
  if (p === 'S' && isCorner(tR, tC)) return { board: b, kingLeftCenter: newKingOut, winner: 'defensor' };
  const cap = checkCapturesSim(b, tR, tC, newKingOut);
  for (let c of cap) { b[c.r][c.c] = '.'; if (c.piece === 'S') return { board: b, kingLeftCenter: newKingOut, winner: 'atacante' }; }
  return { board: b, kingLeftCenter: newKingOut, winner: null };
}

function handleCellClick(r, c) {
  if (isGameOver || isProcessingAI) return;
  if (historyIndex < stateHistory.length - 1) { logMsg('Estás en el pasado. Vuelve al presente.', 'warn'); return; }
  if (isAITurn()) return;
  
  const piece = board[r][c], clickTeam = getTeam(piece);
  if (validMoves.some(m => m.r === r && m.c === c)) { applyMoveReal(selectedCell.r, selectedCell.c, r, c); return; }
  if (clickTeam === currentPlayer) {
    selectedCell = { r, c }; validMoves = getValidMovesSim(board, r, c, ironSet, kingLeftCenter);
    if (!validMoves.length) logMsg(`Esa pieza en ${squareName(r, c)} no tiene movimientos.`, 'warn'); else sfxSelect();
    updateUI(); return;
  }
  selectedCell = null; validMoves = []; updateUI();
}

function applyMoveReal(fR, fC, tR, tC) {
  const piece = board[fR][fC], team = getTeam(piece), from = squareName(fR, fC), to = squareName(tR, tC);
  board[fR][fC] = '.'; board[tR][tC] = piece; 
  if (piece === 'S' && !kingLeftCenter) kingLeftCenter = true;
  lastFrom = { r: fR, c: fC }; lastTo = { r: tR, c: tC }; sfxMove(piece);
  let logs = [{ text: `[${team === 'atacante' ? 'Invasores' : 'Defensores'}] Mueve ${from} → ${to}`, type: team === 'atacante' ? 'atk' : 'def' }];
  
  if (piece === 'S' && isCorner(tR, tC)) { 
    ironSet = calculateIronSetSim(board); if (activeBotId && !isAITurn()) setTimeout(() => showBotDialogue('kingEscape'), 600);
    endGame('defensor', `El Señor escapó a ${to}. ¡Victoria del Defensor!`, logs); return; 
  }
  
  const cap = checkCapturesSim(board, tR, tC, kingLeftCenter); let kingCaptured = false;
  for (const c of cap) { 
    board[c.r][c.c] = '.'; logs.push({ text: `Captura: Pieza en ${squareName(c.r, c.c)} eliminada.`, type: 'cap' }); 
    if (c.piece === 'S') kingCaptured = true; 
    trackQuest('capture', 1);
  }
  
  const prevSz = ironSet.size; ironSet = calculateIronSetSim(board); 
  if (kingCaptured) { sfxKingCapture(); endGame('atacante', 'El Señor fue capturado. ¡Victoria de los Invasores!', logs); return; }
  else if (cap.length) { sfxCapture(); unlockAchievement('first_blood'); if (!isAITurn() && activeBotId) setTimeout(() => showBotDialogue('theirCapture'), 600); }
  if (ironSet.size > prevSz) { sfxIronLine(); trackQuest('iron', 1); unlockAchievement('iron_wall'); }
  
  const hash = getBoardHash(); boardHistory.push(hash);
  if (boardHistory.filter(h => h === hash).length >= 3) { endGame('empate', 'Empate por triple repetición.', logs); return; }
  
  selectedCell = null; validMoves = [];
  if (phase === 0) { phase = 1; currentPlayer = 'defensor'; } 
  else { phase = 0; currentPlayer = 'atacante'; round++; if (round > maxRounds) { endGame('empate', `Límite de ${maxRounds} rondas alcanzado.`, logs, 'round_limit'); return; } }
  
  saveState(logs); updateUI(); checkAndTriggerAI();
}

function endGame(winner, msg, logs = [], reason = null) {
  if (!isGameOver) {
      playerStats.played++;
      if (winner === 'empate') playerStats.draws++;
      else if (gameMode.startsWith('pve')) {
          const isAtk = gameMode === 'pve-atk'; 
          if ((isAtk && winner === 'atacante') || (!isAtk && winner === 'defensor')) {
              playerStats.wins++; trackQuest('win', 1); 
              if (!isAtk && winner === 'defensor') unlockAchievement('defender_win');
              if (isAtk && winner === 'atacante') unlockAchievement('invader_win');
              if (round < 10) unlockAchievement('speedrun');
          } else playerStats.losses++;
      }
      saveStats();
  }
  isGameOver = true; logs.push({ text: '— ' + msg, type: 'cap' }); saveState(logs); updateUI(); stopMusic();
  setTimeout(() => { if (winner === 'empate') sfxDraw(); else sfxVictory(winner); }, 350);
  
  const aiSide = (gameMode === 'pve-def') ? 'atacante' : (gameMode === 'pve-atk') ? 'defensor' : null;
  if (activeBotId && (aiSide || gameMode === 'eve')) {
    const botWon = (winner === (aiSide || 'atacante'));
    setTimeout(() => showBotDialogue(botWon ? 'win' : 'lose'), 1200);
  }
  
  let displayMsg = msg;
  if (activeBotId && (gameMode === 'pve-def' || gameMode === 'pve-atk')) {
    const bot = BOTS[activeBotId], botWon = (winner === (aiSide || 'atacante')), finalLines = botWon ? bot.dialogue.win : bot.dialogue.lose;
    if (finalLines && finalLines.length) displayMsg = winner === 'atacante' ? `◈ ${bot.name} gana. "${finalLines[Math.floor(Math.random() * finalLines.length)]}"` : `Victoria tuya. "${finalLines[Math.floor(Math.random() * finalLines.length)]}"`;
  }
  
  const icons = { defensor: '🏛', atacante: '⚔', empate: '⚖' }; const titles = { defensor: 'Victoria del Defensor', atacante: 'Victoria de los Invasores', empate: 'Empate' };
  const colors = { defensor: 'var(--steel-bright)', atacante: 'var(--blood-bright)', empate: 'var(--fire-gold)' };
  
  document.getElementById('modal-icon').textContent = icons[winner]; document.getElementById('modal-title').textContent = titles[winner];
  document.getElementById('modal-title').style.color = colors[winner]; document.getElementById('modal-msg').textContent = displayMsg;
  
  const extOpts = document.getElementById('extend-options');
  if (extOpts) {
    if (reason === 'round_limit') {
      extOpts.style.display = 'block';
      document.getElementById('btn-ext-25').style.display = maxRounds < 25 ? 'inline-block' : 'none';
      document.getElementById('btn-ext-30').style.display = maxRounds < 30 ? 'inline-block' : 'none';
      document.getElementById('btn-ext-40').style.display = maxRounds < 40 ? 'inline-block' : 'none';
      document.getElementById('btn-ext-50').style.display = maxRounds < 50 ? 'inline-block' : 'none';
    } else extOpts.style.display = 'none';
  }
  document.getElementById('end-overlay').classList.add('show');
}
function hideEndModal() { document.getElementById('end-overlay').classList.remove('show'); }
function extendGame(newLimit) {
  if (newLimit <= round) return;
  maxRounds = newLimit; isGameOver = false;
  if (stateHistory.length > 0) { stateHistory[stateHistory.length - 1].isGameOver = false; stateHistory[stateHistory.length - 1].maxRounds = newLimit; stateHistory[stateHistory.length - 1].logs.push({text: `El asedio se prolonga a ${newLimit} rondas.`, type: 'sys'}); }
  hideEndModal(); logMsg(`El asedio se prolonga a ${newLimit} rondas.`, 'sys'); if (musicVol > 0 && !musicRunning) startMusic(); updateUI(); checkAndTriggerAI();
}

function updateUI() {
  const grid = document.getElementById('board-grid'); if(!grid) return; grid.innerHTML = '';
  grid.appendChild(makeLabel('')); for (let c = 0; c < COLS; c++) grid.appendChild(makeLabel(String.fromCharCode(65 + c)));
  
  const VISUAL_THEMES = { clasico: { I:'⚔', G:'🛡', S:'♛' }, boreal: { I:'🪓', G:'⛨', S:'👑' }, desierto: { I:'🌙', G:'☀️', S:'👁' } };
  const theme = document.body.getAttribute('data-theme') || 'clasico';

  for (let r = 0; r < ROWS; r++) {
    grid.appendChild(makeLabel(String(ROWS - r)));
    for (let c = 0; c < COLS; c++) {
      const cell = document.createElement('div'); cell.className = 'cell ' + ((r + c) % 2 === 0 ? 'cell-a' : 'cell-b');
      if (isCorner(r, c)) cell.classList.add('corner'); else if (r === CR && c === CC) cell.classList.add('center-sq');
      if (ironSet && ironSet.has(`${r},${c}`)) cell.classList.add('iron-cell');
      if (validMoves && validMoves.some(m => m.r === r && m.c === c)) cell.classList.add('valid-move');
      if (lastFrom && lastFrom.r === r && lastFrom.c === c) cell.classList.add('last-from');
      if (lastTo && lastTo.r === r && lastTo.c === c) cell.classList.add('last-to');
      const p = board[r][c];
      if (p !== '.') {
        const pd = document.createElement('div'); pd.className = `piece piece-${p}`; pd.textContent = VISUAL_THEMES[theme][p];
        if (selectedCell && selectedCell.r === r && selectedCell.c === c) pd.classList.add('selected'); cell.appendChild(pd);
      }
      cell.addEventListener('click', () => handleCellClick(r, c)); grid.appendChild(cell);
    }
  }
  
  document.querySelector('.leg-dot.I + span .leg-name').textContent = VISUAL_THEMES[theme]['I'] + " Invasores";
  document.querySelector('.leg-dot.G + span .leg-name').textContent = VISUAL_THEMES[theme]['G'] + " Guardianes";
  document.querySelector('.leg-dot.S + span .leg-name').textContent = VISUAL_THEMES[theme]['S'] + " El Señor";

  const badge = document.getElementById('turn-badge'), ovl = document.getElementById('past-overlay');
  if (historyIndex < stateHistory.length - 1) {
    ovl.style.display = 'block'; badge.textContent = '⏱ Revisando partida'; badge.className = ''; badge.style.cssText = 'color:var(--stone-pale);border-color:var(--stone-pale);background:rgba(0,0,0,0.3);';
  } else {
    ovl.style.display = 'none'; badge.style.cssText = '';
    if (isGameOver) { badge.textContent = 'Partida Finalizada'; badge.className = ''; badge.style.cssText = 'color:var(--fire-dim);border-color:var(--fire-dim);background:rgba(200,114,40,0.05);'; } 
    else { const ai = isAITurn() ? ' (IA)' : ''; if (currentPlayer === 'atacante') { badge.textContent = `Invasores${ai} ▶`; badge.className = 'atacante'; } else { badge.textContent = `Defensores${ai} ▶`; badge.className = 'defensor'; } }
  }
  document.getElementById('round-display').textContent = `Ronda ${round} / ${maxRounds}`;
  if(ironSet) document.getElementById('iron-badge').classList.toggle('active', ironSet.size > 0);
}
function makeLabel(text) { const d = document.createElement('div'); d.className = 'lbl'; d.textContent = text; return d; }

function saveState(logs) { stateHistory.push({ board: board.map(r => [...r]), currentPlayer, kingLeftCenter, round, phase, maxRounds, ironSet: new Set(ironSet), logs, isGameOver, lastFrom, lastTo }); historyIndex = stateHistory.length - 1; renderLog(); }
function loadState(idx) { if (idx < 0 || idx >= stateHistory.length) return; historyIndex = idx; const s = stateHistory[idx]; board = s.board.map(r => [...r]); currentPlayer = s.currentPlayer; kingLeftCenter = s.kingLeftCenter; round = s.round; phase = s.phase; maxRounds = s.maxRounds || 20; ironSet = new Set(s.ironSet); isGameOver = s.isGameOver; lastFrom = s.lastFrom; lastTo = s.lastTo; updateUI(); renderLog(); if (historyIndex === stateHistory.length - 1 && !isGameOver && isAITurn() && !isProcessingAI) checkAndTriggerAI(); }
function navHistory(action) { if (action === 'start') loadState(0); else if (action === 'prev') loadState(historyIndex - 1); else if (action === 'next') loadState(historyIndex + 1); else loadState(stateHistory.length - 1); }
function navHistoryTo(idx) { loadState(idx); }

function renderLog() {
  const log = document.getElementById('game-log'); if(!log) return; log.innerHTML = '';
  stateHistory.forEach((s, idx) => s.logs.forEach(l => { const p = document.createElement('p'); p.className = 'log-entry ' + (l.type || ''); if (idx === historyIndex) p.classList.add('active'); p.textContent = l.text; p.onclick = () => navHistoryTo(idx); log.appendChild(p); }));
  document.getElementById('btn-hist-start').disabled = historyIndex === 0; document.getElementById('btn-hist-prev').disabled = historyIndex === 0; document.getElementById('btn-hist-next').disabled = historyIndex === stateHistory.length - 1; document.getElementById('btn-hist-end').disabled = historyIndex === stateHistory.length - 1; document.getElementById('hist-display').textContent = `${historyIndex} / ${Math.max(0, stateHistory.length - 1)}`;
  const a = log.getElementsByClassName('active'); if (a.length > 0) a[a.length - 1].scrollIntoView({ block: 'nearest' });
}
function logMsg(msg, type) { const log = document.getElementById('game-log'); if(!log) return; const p = document.createElement('p'); p.className = 'log-entry ' + (type || ''); p.textContent = msg; log.appendChild(p); log.scrollTop = log.scrollHeight; }

function copyLog() {
  if(!stateHistory||stateHistory.length===0) return; let text='DOMINIO — Registro de Partida\n\n'; stateHistory.forEach(s=>s.logs.forEach(l=>{ text+=l.text+'\n'; }));
  const btn=document.getElementById('btn-copy'); const ok=()=>{ const orig=btn.innerHTML; btn.innerHTML='✓ Copiado'; btn.style.color='var(--fire-bright)'; setTimeout(()=>{btn.innerHTML=orig;btn.style.color='var(--fire-gold)';},2000); };
  if(navigator.clipboard&&window.isSecureContext) navigator.clipboard.writeText(text).then(ok).catch(()=>fallbackCopy(text,ok)); else fallbackCopy(text,ok);
}
function fallbackCopy(text,cb){ const ta=document.createElement('textarea'); ta.value=text; document.body.appendChild(ta); ta.select(); try{ document.execCommand('copy'); cb(); } catch(e){} document.body.removeChild(ta); }
function downloadGame() {
  const htmlContent = "<!DOCTYPE html>\n" + document.documentElement.outerHTML; const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'Dominio_Clasico.html'; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url); logMsg('El juego ha sido descargado (Dominio_Clasico.html).', 'sys');
}

function getBotDialogue(event) {
  if (!activeBotId) return null; const bot = BOTS[activeBotId]; if (!bot) return null;
  if (dariusDialogueCooldown > 0) { dariusDialogueCooldown--; return null; }
  const lines = bot.dialogue[event]; if (!lines || !lines.length) return null;
  dariusDialogueCooldown = 2 + Math.floor(Math.random() * 2); return lines[Math.floor(Math.random() * lines.length)];
}
function showBotDialogue(event) {
  const line = getBotDialogue(event); if (!line || !activeBotId) return;
  const chatBubble = document.getElementById('in-game-bot-chat');
  if (chatBubble) { chatBubble.textContent = line; chatBubble.classList.remove('pop-anim'); void chatBubble.offsetWidth; chatBubble.classList.add('pop-anim'); }
}
function changeTheme(theme) { currentVisualTheme = theme; document.body.setAttribute('data-theme', theme); if(board) updateUI(); }
function changeMusicTheme(theme) { currentMusicTheme = theme; }

/* ══════════════════════════════════════════════
   SISTEMA DE AUDIO
══════════════════════════════════════════════ */
let audioCtx = null, globalMusicGain = null, globalSfxGain = null, reverbNode = null;
let sfxVol = 0.5, musicVol = 0.5;

function getCtx() {
  if (!audioCtx) { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); globalMusicGain = audioCtx.createGain(); globalMusicGain.gain.value = musicVol; globalMusicGain.connect(audioCtx.destination); globalSfxGain = audioCtx.createGain(); globalSfxGain.gain.value = sfxVol; globalSfxGain.connect(audioCtx.destination); }
  if (audioCtx.state === 'suspended') audioCtx.resume(); return audioCtx;
}
function getReverb() {
  if (reverbNode) return reverbNode;
  const ctx = getCtx(); const len = ctx.sampleRate * 2.2; const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) { const d = buf.getChannelData(c); for (let i = 0; i < len; i++) { const t = i / ctx.sampleRate; let v = (Math.random() * 2 - 1) * Math.exp(-t * 2.8); if (i === Math.floor(0.020 * ctx.sampleRate)) v += 0.3; if (i === Math.floor(0.035 * ctx.sampleRate)) v += 0.2; if (i === Math.floor(0.055 * ctx.sampleRate)) v += 0.15; d[i] = v; } }
  const cv = ctx.createConvolver(); cv.buffer = buf; const g = ctx.createGain(); g.gain.value = 0.16; cv.connect(g); g.connect(globalSfxGain); reverbNode = cv; return reverbNode;
}
function sendToReverb(node) { const rv = getReverb(); if (rv) node.connect(rv); }

function updateVol(type, val) {
  val = parseFloat(val); const ctx = getCtx();
  if (type === 'music') { musicVol = val; if (globalMusicGain) globalMusicGain.gain.setTargetAtTime(val, ctx.currentTime, 0.08); if (val > 0 && !musicRunning && !isGameOver && !document.getElementById('start-overlay').classList.contains('show')) startMusic(); } 
  else { sfxVol = val; if (globalSfxGain) globalSfxGain.gain.setTargetAtTime(val, ctx.currentTime, 0.08); }
}

function sfxSelect() {
  if (sfxVol <= 0) return; const ctx = getCtx(), t = ctx.currentTime; const car = ctx.createOscillator(), mod = ctx.createOscillator(), modG = ctx.createGain();
  car.type = 'sine'; car.frequency.value = 660; mod.type = 'sine'; mod.frequency.value = 660 * 3.5;
  modG.gain.setValueAtTime(500, t); modG.gain.exponentialRampToValueAtTime(50, t + 0.3); mod.connect(modG); modG.connect(car.frequency);
  const env = ctx.createGain(); env.gain.setValueAtTime(0, t); env.gain.linearRampToValueAtTime(0.35, t + 0.005); env.gain.exponentialRampToValueAtTime(0.001, t + 1.4);
  car.connect(env); env.connect(globalSfxGain); sendToReverb(env); car.start(t); mod.start(t); car.stop(t + 1.6); mod.stop(t + 1.6);
}
function sfxMoveInvader() {
  if (sfxVol <= 0) return; const ctx = getCtx(), t = ctx.currentTime; const buf = ctx.createBuffer(1, ctx.sampleRate * 0.25, ctx.sampleRate); const d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.06));
  const src = ctx.createBufferSource(); src.buffer = buf; const filt = ctx.createBiquadFilter(); filt.type = 'bandpass'; filt.frequency.value = 2200; filt.Q.value = 8; const g = ctx.createGain(); g.gain.value = 0.45;
  src.connect(filt); filt.connect(g); g.connect(globalSfxGain); sendToReverb(g); src.start(t);
  const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = 1800; const og = ctx.createGain(); og.gain.setValueAtTime(0.12, t + 0.03); og.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
  o.connect(og); og.connect(globalSfxGain); o.start(t + 0.03); o.stop(t + 0.2);
}
function sfxMoveGuardian() {
  if (sfxVol <= 0) return; const ctx = getCtx(), t = ctx.currentTime; const buf = ctx.createBuffer(1, ctx.sampleRate * 0.35, ctx.sampleRate); const d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.12));
  const src = ctx.createBufferSource(); src.buffer = buf; const filt = ctx.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.value = 220; filt.frequency.linearRampToValueAtTime(500, t + 0.1); const g = ctx.createGain(); g.gain.value = 0.55;
  src.connect(filt); filt.connect(g); g.connect(globalSfxGain); sendToReverb(g); src.start(t);
}
function sfxMoveKing() {
  if (sfxVol <= 0) return; const ctx = getCtx(), t = ctx.currentTime; [[220, 0], [220 * 1.008, 0.01], [330, 0.02]].forEach(([f, dt], i) => { const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f; const env = ctx.createGain(); env.gain.setValueAtTime(0, t + dt); env.gain.linearRampToValueAtTime(0.22 - i * 0.06, t + dt + 0.008); env.gain.exponentialRampToValueAtTime(0.001, t + dt + 1.2); o.connect(env); env.connect(globalSfxGain); sendToReverb(env); o.start(t + dt); o.stop(t + dt + 1.4); });
}
function sfxMove(piece) { if (piece === 'I') sfxMoveInvader(); else if (piece === 'G') sfxMoveGuardian(); else if (piece === 'S') sfxMoveKing(); }
function sfxCapture() {
  if (sfxVol <= 0) return; const ctx = getCtx(), t = ctx.currentTime;
  [800, 1400, 2100].forEach((f, i) => { const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = f; const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.12 - i * 0.03, t + 0.005); g.gain.exponentialRampToValueAtTime(0.001, t + 0.18 + i * 0.04); o.connect(g); g.connect(globalSfxGain); sendToReverb(g); o.start(t); o.stop(t + 0.3); });
  const ibuf = ctx.createBuffer(1, ctx.sampleRate * 0.12, ctx.sampleRate); const id = ibuf.getChannelData(0); for (let i = 0; i < id.length; i++) id[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.015)); const is = ctx.createBufferSource(); is.buffer = ibuf; const ifilt = ctx.createBiquadFilter(); ifilt.type = 'highpass'; ifilt.frequency.value = 3000; const ig = ctx.createGain(); ig.gain.value = 0.4; is.connect(ifilt); ifilt.connect(ig); ig.connect(globalSfxGain); sendToReverb(ig); is.start(t);
}
function sfxKingCapture() {
  if (sfxVol <= 0) return; const ctx = getCtx(), t = ctx.currentTime; const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(36, t + 0.8); const filt = ctx.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.value = 400; const env = ctx.createGain(); env.gain.setValueAtTime(0.6, t); env.gain.exponentialRampToValueAtTime(0.001, t + 0.9); o.connect(filt); filt.connect(env); env.connect(globalSfxGain); sendToReverb(env); o.start(t); o.stop(t + 1.0);
  const ibuf = ctx.createBuffer(1, ctx.sampleRate * 0.6, ctx.sampleRate); const id = ibuf.getChannelData(0); for (let i = 0; i < id.length; i++) id[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.18)); const is = ctx.createBufferSource(); is.buffer = ibuf; const ifl = ctx.createBiquadFilter(); ifl.type = 'bandpass'; ifl.frequency.value = 80; ifl.Q.value = 0.8; const ig = ctx.createGain(); ig.gain.value = 0.35; is.connect(ifl); ifl.connect(ig); ig.connect(globalSfxGain); sendToReverb(ig); is.start(t + 0.05);
}
function sfxVictory(winner) {
  if (sfxVol <= 0) return; const ctx = getCtx(), t = ctx.currentTime; const notes = winner === 'defensor' ? [523.25, 659.25, 783.99, 1046.5, 1318.5] : [220, 246.94, 261.63, 293.66, 220]; notes.forEach((freq, i) => { const o = ctx.createOscillator(); o.type = winner === 'defensor' ? 'triangle' : 'sawtooth'; o.frequency.value = freq; const filt = ctx.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.value = winner === 'defensor' ? 3000 : 800; const env = ctx.createGain(); const st = t + i * 0.18; env.gain.setValueAtTime(0, st); env.gain.linearRampToValueAtTime(0.28, st + 0.04); env.gain.setValueAtTime(0.28, st + 0.22); env.gain.exponentialRampToValueAtTime(0.001, st + 0.85); o.connect(filt); filt.connect(env); env.connect(globalSfxGain); sendToReverb(env); o.start(st); o.stop(st + 1.0); });
}
function sfxDraw() {
  if (sfxVol <= 0) return; const ctx = getCtx(), t = ctx.currentTime; [220, 261.63, 311.13, 369.99].forEach((f, i) => { const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f; const g = ctx.createGain(); const st = t + i * 0.09; g.gain.setValueAtTime(0, st); g.gain.linearRampToValueAtTime(0.14, st + 0.06); g.gain.exponentialRampToValueAtTime(0.001, st + 0.75); o.connect(g); g.connect(globalSfxGain); sendToReverb(g); o.start(st); o.stop(st + 0.9); });
}
function sfxIronLine() {
  if (sfxVol <= 0) return; const ctx = getCtx(), t = ctx.currentTime; [80, 160, 240].forEach((f, i) => { const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f; const g = ctx.createGain(); g.gain.setValueAtTime(0.12 - i * 0.03, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.5); o.connect(g); g.connect(globalSfxGain); sendToReverb(g); o.start(t); o.stop(t + 0.55); });
}
function sfxGameStart() {
  if (sfxVol <= 0) return; const ctx = getCtx(), t = ctx.currentTime; [110, 165, 220].forEach((f, i) => { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(f * 1.04, t + i * 0.18); o.frequency.exponentialRampToValueAtTime(f, t + i * 0.18 + 0.12); const filt = ctx.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.value = 600; const g = ctx.createGain(); g.gain.setValueAtTime(0, t + i * 0.18); g.gain.linearRampToValueAtTime(0.25 - i * 0.05, t + i * 0.18 + 0.06); g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.18 + 1.4); o.connect(filt); filt.connect(g); g.connect(globalSfxGain); sendToReverb(g); o.start(t + i * 0.18); o.stop(t + i * 0.18 + 1.6); });
}

const DORIAN = [146.83, 164.81, 174.61, 196.00, 220.00, 246.94, 261.63, 293.66, 329.63, 349.23, 392.00, 440.00, 493.88, 523.25];
const MIXOLYDIAN = [146.83, 164.81, 185.00, 196.00, 220.00, 246.94, 261.63, 293.66, 329.63, 370.00];
const AEOLIAN = [146.83, 164.81, 174.61, 196.00, 220.00, 233.08, 261.63, 293.66, 329.63, 349.23];
const CHANT_PHRASES = [ [0, 2, 1, 0, 3, 2, 1, 0], [4, 3, 5, 4, 3, 2, 1, 0], [2, 4, 5, 6, 5, 4, 2, 0], [6, 5, 4, 5, 6, 7, 6, 4], [0, 1, 2, 0, 3, 2, 1, 0], [3, 5, 4, 6, 5, 3, 2, 1], [7, 6, 5, 4, 3, 2, 1, 0], [2, 4, 3, 2, 4, 5, 4, 2], ];
let musicRunning = false, musicTimeoutId = null, musicPhase = 0;

function startMusic() {
  if (musicVol <= 0 || musicRunning) return; const ctx = getCtx(); musicRunning = true;
  globalMusicGain.gain.cancelScheduledValues(ctx.currentTime); globalMusicGain.gain.setValueAtTime(0, ctx.currentTime); globalMusicGain.gain.linearRampToValueAtTime(musicVol, ctx.currentTime + 3.5);
  scheduleMusicLoop();
}
function stopMusic() {
  musicRunning = false; if (musicTimeoutId) { clearTimeout(musicTimeoutId); musicTimeoutId = null; }
  if (!audioCtx || !globalMusicGain) return; const t = audioCtx.currentTime;
  globalMusicGain.gain.cancelScheduledValues(t); globalMusicGain.gain.setValueAtTime(globalMusicGain.gain.value, t); globalMusicGain.gain.linearRampToValueAtTime(0, t + 3.0);
}
function scheduleMusicLoop() {
  if (!musicRunning || musicVol <= 0) { if (musicVol <= 0) musicRunning = false; return; }
  const ctx = getCtx(), t = ctx.currentTime;
  if (currentMusicTheme === 'gregoriano') { const DUR = 9.0; playHurdyGurdy(ctx, t, DUR, 1.0); playChantPhrase(ctx, t, musicPhase, DORIAN, false); playBodhran(ctx, t, DUR, 'slow'); if (Math.random() > 0.35) playLute(ctx, t + 1.5 + Math.random() * 3, 4, DORIAN); musicPhase = (musicPhase + 1) % 8; musicTimeoutId = setTimeout(scheduleMusicLoop, (DUR - 0.5) * 1000); } 
  else if (currentMusicTheme === 'taberna') { const DUR = 6.0; playHurdyGurdy(ctx, t, DUR, 1.4); playBodhran(ctx, t, DUR, 'jig'); playLuteArpeggio(ctx, t, DUR, MIXOLYDIAN); musicTimeoutId = setTimeout(scheduleMusicLoop, (DUR - 0.2) * 1000); } 
  else if (currentMusicTheme === 'mistico') { const DUR = 12.0; playMysticDrone(ctx, t, DUR); if (Math.random() > 0.4) playChantPhrase(ctx, t + 2, musicPhase, AEOLIAN, true); if (Math.random() > 0.6) playLute(ctx, t + Math.random() * 6, 2, AEOLIAN); musicPhase = (musicPhase + 1) % 8; musicTimeoutId = setTimeout(scheduleMusicLoop, (DUR - 1.0) * 1000); }
}
function playHurdyGurdy(ctx, t, dur, lfoMult) {
  const strings = [{ freq: 146.83, vol: 0.055, detune: 0 }, { freq: 146.83, vol: 0.040, detune: 1.007 }, { freq: 73.41, vol: 0.065, detune: 1.0 }];
  strings.forEach(({ freq, vol, detune }) => { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = freq * detune; const lfo = ctx.createOscillator(); const lfoG = ctx.createGain(); lfo.frequency.value = (7.2 + Math.random() * 0.3) * lfoMult; lfoG.gain.value = 0.9; lfo.connect(lfoG); lfoG.connect(o.frequency); const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 60; const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700; lp.Q.value = 1.5; const env = ctx.createGain(); env.gain.setValueAtTime(0, t); env.gain.linearRampToValueAtTime(vol, t + 1.0); env.gain.setValueAtTime(vol, t + dur - 1.0); env.gain.linearRampToValueAtTime(0, t + dur); o.connect(hp); hp.connect(lp); lp.connect(env); env.connect(globalMusicGain); lfo.start(t); lfo.stop(t + dur + 0.2); o.start(t); o.stop(t + dur + 0.2); });
}
function playMysticDrone(ctx, t, dur) {
  const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = 73.41; const o2 = ctx.createOscillator(); o2.type = 'triangle'; o2.frequency.value = 110.0; const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 4; lp.frequency.setValueAtTime(200, t); lp.frequency.exponentialRampToValueAtTime(600, t + dur/2); lp.frequency.exponentialRampToValueAtTime(200, t + dur); const env = ctx.createGain(); env.gain.setValueAtTime(0, t); env.gain.linearRampToValueAtTime(0.08, t + 3.0); env.gain.setValueAtTime(0.08, t + dur - 3.0); env.gain.linearRampToValueAtTime(0, t + dur); o.connect(lp); o2.connect(lp); lp.connect(env); env.connect(globalMusicGain); sendToReverb(env); o.start(t); o.stop(t + dur); o2.start(t); o2.stop(t + dur);
}
function playChantPhrase(ctx, t, phase, scale, isAmbient) {
  const pattern = CHANT_PHRASES[phase], beatDur = isAmbient ? 1.5 : 1.12;
  pattern.forEach((idx, beat) => {
    const freq = scale[Math.min(idx, scale.length - 1)], freq5 = freq * (3/4), noteLen = beat === pattern.length - 1 ? 1.9 : 0.75, noteT = t + beat * beatDur + Math.random() * 0.03;
    const mel = ctx.createOscillator(); mel.type = 'triangle'; mel.frequency.value = freq * 2; const nbuf = ctx.createBuffer(1, 512, ctx.sampleRate); const nd = nbuf.getChannelData(0); for (let i = 0; i < 512; i++) nd[i] = (Math.random() * 2 - 1) * 0.06; const ns = ctx.createBufferSource(); ns.buffer = nbuf; ns.loop = true; const nf = ctx.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = freq * 6; nf.Q.value = 1.5;
    const melEnv = ctx.createGain(); const maxVol = isAmbient ? 0.05 : 0.085; melEnv.gain.setValueAtTime(0, noteT); melEnv.gain.linearRampToValueAtTime(maxVol, noteT + 0.09); melEnv.gain.setValueAtTime(maxVol*0.9, noteT + noteLen * 0.8); melEnv.gain.exponentialRampToValueAtTime(0.001, noteT + noteLen); mel.connect(melEnv); ns.connect(nf); nf.connect(melEnv); melEnv.connect(globalMusicGain); sendToReverb(melEnv); mel.start(noteT); mel.stop(noteT + noteLen + 0.1); ns.start(noteT); ns.stop(noteT + noteLen + 0.1);
    if (!isAmbient && beat % 2 === 0) { const org = ctx.createOscillator(); org.type = 'sine'; org.frequency.value = freq5; const orgEnv = ctx.createGain(); orgEnv.gain.setValueAtTime(0, noteT); orgEnv.gain.linearRampToValueAtTime(0.045, noteT + 0.12); orgEnv.gain.exponentialRampToValueAtTime(0.001, noteT + noteLen * 1.3); org.connect(orgEnv); orgEnv.connect(globalMusicGain); sendToReverb(orgEnv); org.start(noteT); org.stop(noteT + noteLen * 1.4); }
  });
}
function playBodhran(ctx, t, dur, style) {
  let pattern = []; if (style === 'slow') pattern = [0, 1.12, 2.24, 3.36, 4.48, 5.60, 6.72, 7.84]; if (style === 'jig') pattern = [0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0, 5.5];
  pattern.forEach((beat, i) => {
    const bt = t + beat + (Math.random() * 0.02 - 0.01), isAccent = (style === 'jig') ? (i % 3 === 0) : (i % 4 === 0);
    const buf = ctx.createBuffer(1, ctx.sampleRate * 0.22, ctx.sampleRate); const d = buf.getChannelData(0); const tc = ctx.sampleRate * (isAccent ? 0.055 : 0.038); for (let j = 0; j < d.length; j++) d[j] = (Math.random() * 2 - 1) * Math.exp(-j / tc); const src = ctx.createBufferSource(); src.buffer = buf; const filt = ctx.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.setValueAtTime(isAccent ? 180 : 140, bt); filt.frequency.linearRampToValueAtTime(isAccent ? 400 : 280, bt + 0.08); const g = ctx.createGain(); g.gain.value = isAccent ? 0.12 : 0.072; src.connect(filt); filt.connect(g); g.connect(globalMusicGain); sendToReverb(g); src.start(bt);
    if (!isAccent && (i % 2 !== 0)) { const rbuf = ctx.createBuffer(1, ctx.sampleRate * 0.06, ctx.sampleRate); const rd = rbuf.getChannelData(0); for (let j = 0; j < rd.length; j++) rd[j] = (Math.random() * 2 - 1) * Math.exp(-j / (ctx.sampleRate * 0.012)); const rs = ctx.createBufferSource(); rs.buffer = rbuf; const rf = ctx.createBiquadFilter(); rf.type = 'highpass'; rf.frequency.value = 1800; const rg = ctx.createGain(); rg.gain.value = 0.045; rs.connect(rf); rf.connect(rg); rg.connect(globalMusicGain); rs.start(bt + 0.01); }
  });
}
function playLute(ctx, t, numNotes, scale) { for (let n = 0; n < numNotes; n++) { const noteT = t + n * (0.45 + Math.random() * 0.35); const freq = scale[Math.floor(Math.random() * scale.length)] * (Math.random() > 0.6 ? 2 : 1); pluckLuteString(ctx, noteT, freq, 0.08 + Math.random() * 0.03); } }
function playLuteArpeggio(ctx, t, dur, scale) { const totalNotes = Math.floor(dur * 4); for (let n = 0; n < totalNotes; n++) { const noteT = t + n * 0.25; const idx = [0, 2, 4, 6, 4, 2][n % 6]; const freq = scale[idx] * (n%12===0 ? 0.5 : 1); pluckLuteString(ctx, noteT, freq, 0.05 + (n%3===0 ? 0.03 : 0)); } }
function pluckLuteString(ctx, t, freq, vol) {
  const bufLen = Math.max(4, Math.round(ctx.sampleRate / freq)), total = bufLen + Math.floor(ctx.sampleRate * 1.0), buf = ctx.createBuffer(1, total, ctx.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < bufLen; i++) d[i] = Math.random() * 2 - 1; for (let i = bufLen; i < total; i++) d[i] = (d[i - bufLen] + d[i - bufLen + (bufLen > 1 ? 1 : 0)]) * 0.497;
  const src = ctx.createBufferSource(); src.buffer = buf; const filt = ctx.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.value = 2000; const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + 1.3); src.connect(filt); filt.connect(g); g.connect(globalMusicGain); sendToReverb(g); src.start(t); src.stop(t + 1.4);
}

(function() {
  function initFlame(id, offsetPhase) {
    const cv = document.getElementById(id); if (!cv) return;
    const ctx = cv.getContext('2d'), W = cv.width, H = cv.height;
    const pts = []; for (let i = 0; i < 22; i++) pts.push({ x: W/2, y: H, vx: 0, vy: 0, life: 0, maxLife: 1, r: 0 });
    function spawn(p) { p.x = W/2 + (Math.random()-0.5)*5; p.y = H; const speed = 0.55 + Math.random()*0.7; const ang = -Math.PI/2 + (Math.random()-0.5)*0.6; p.vx = Math.cos(ang)*speed; p.vy = Math.sin(ang)*speed; p.maxLife = 22 + Math.random()*20; p.life = p.maxLife; p.r = 2.5 + Math.random()*3.5; }
    let spawnTimer = 0, t = offsetPhase;
    function draw() {
      ctx.clearRect(0, 0, W, H); t += 0.04; spawnTimer++;
      if (spawnTimer >= 2) { spawnTimer = 0; const idle = pts.find(p => p.life <= 0); if (idle) spawn(idle); }
      for (const p of pts) {
        if (p.life <= 0) continue;
        p.life--; p.x += p.vx + Math.sin(t * 2.1 + p.y * 0.2) * 0.22; p.y += p.vy; p.vx *= 0.97; p.vy *= 0.99;
        const frac = p.life / p.maxLife; let r, g, b, a;
        if (frac > 0.75) { const ff = (frac - 0.75)/0.25; r = 255; g = Math.floor(200 + 55*ff); b = Math.floor(80 + 100*ff); a = frac; } else if (frac > 0.4) { r = 255; g = Math.floor(120 + 80*(frac-0.4)/0.35); b = 20; a = frac * 0.85; } else { r = 180; g = 40; b = 10; a = frac * 0.5; }
        const rad = p.r * (0.4 + frac * 0.6), grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, rad);
        grad.addColorStop(0, `rgba(${r},${g},${b},${a.toFixed(2)})`); grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
        ctx.beginPath(); ctx.arc(p.x, p.y, rad, 0, Math.PI * 2); ctx.fillStyle = grad; ctx.fill();
      }
      requestAnimationFrame(draw);
    }
    draw();
  }
  window.addEventListener('DOMContentLoaded', () => { initFlame('flame-left', 0); initFlame('flame-right', 1.4); showStartMenu(); });
})();
