/**
 * ============================================================================
 * MOTOR PRINCIPAL: DOMINIO
 * (Maneja la UI, Sonido, Reglas Básicas y la comunicación con el Web Worker)
 * ============================================================================
 */

/* ══════════════════════════════════════════════
   1. CONSTANTES Y ESTADO GLOBAL
══════════════════════════════════════════════ */
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

// NUEVO: Variable para contar cuántas veces puede deshacer en esta partida
let undosLeft = 0; 

const DEFAULT_AVATAR_EASY = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' fill='%232a5a8a'/%3E%3Ctext x='50' y='65' font-size='50' font-family='sans-serif' fill='white' text-anchor='middle'%3E😊%3C/text%3E%3C/svg%3E";
const DEFAULT_AVATAR_MED = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' fill='%23b83030'/%3E%3Ctext x='50' y='65' font-size='50' font-family='sans-serif' fill='white' text-anchor='middle'%3E😠%3C/text%3E%3C/svg%3E";
const DEFAULT_AVATAR_BOSS = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' fill='%23111'/%3E%3Ccircle cx='50' cy='50' r='30' fill='%23ff0000' opacity='0.3'/%3E%3Ctext x='50' y='65' font-size='50' font-family='sans-serif' fill='%23ff4444' text-anchor='middle'%3E💀%3C/text%3E%3C/svg%3E";

const BOTS = {
  novicio: {
    id: 'novicio', name: 'Garrick', title: 'El Escudero', category: 'Principiante', avatar: DEFAULT_AVATAR_EASY, depth: 1,
    undosAllowed: Infinity, // DIFICULTAD FÁCIL: Deshacer ilimitado
    dialogue: {
      menu: 'Acabo de alistarme en la guardia. Seré suave, lo prometo.',
      gameStart: ['¡Que gane el mejor!', 'Tengo mi escudo listo.'],
      capture: ['¡Ajá! ¡Te atrapé!'], theirCapture: ['Oh no... mi pobre pieza.'],
      kingMove: ['¡Cuidado, su majestad!'], kingEscape: ['¡No, se escapó!'],
      win: ['¡Gané! ¡Aún no me lo creo!'], lose: ['Necesito más entrenamiento en el patio.']
    }
  },
  veterano: {
    id: 'veterano', name: 'Capitán Evans', title: 'Lobo de Mar', category: 'Avanzado', avatar: DEFAULT_AVATAR_MED, depth: 3,
    undosAllowed: 3, // DIFICULTAD MEDIA: 3 Oportunidades
    dialogue: {
      menu: 'He visto mil batallas como esta. ¿Quieres jugar?',
      gameStart: ['Que hable el acero.'], capture: ['Cayó en la trampa.'],
      theirCapture: ['Un sacrificio aceptable.'], kingMove: ['Cortadle el paso, muchachos.'],
      kingEscape: ['¡Maldición! Rompió el cerco.'], win: ['Una táctica de libro.'], lose: ['Has ganado mis respetos.']
    }
  },
  darius: {
    id: 'darius', name: 'Darius Varkhan', title: 'El Optimizador', category: 'Jefe Final', avatar: DEFAULT_AVATAR_BOSS, depth: 5,
    undosAllowed: 0, // DIFICULTAD DIFÍCIL: 0 Oportunidades. Matemáticas puras.
    dialogue: {
      menu: 'El tablero es una ecuación. Yo conozco la solución.',
      gameStart: ['Cada movimiento tuyo es una variable que ya he despejado.'],
      capture: ['Error calculado con días de antelación.'], theirCapture: ['Concedo ese intercambio. Ya he calculado lo que sigue.'],
      kingMove: ['El señor se mueve. El rango de escape se reduce.'], kingEscape: ['Una anomalía en mis cálculos.'],
      win: ['La partida terminó donde los números indicaban que terminaría.'], lose: ['Recalculando. Hay una variable que no contemplé.']
    }
  }
};

let activeBotId = null, selectedMenuBotId = 'novicio', dariusDialogueCooldown = 0;

/* ══════════════════════════════════════════════
   2. CONFIGURACIÓN DEL WEB WORKER PARA IA
══════════════════════════════════════════════ */
let aiWorker = null;

function initAIWorker() {
  if (!aiWorker) {
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
  }
}

function checkAndTriggerAI() {
  if (!isGameOver && isAITurn() && historyIndex === stateHistory.length - 1) {
    isProcessingAI = true; 
    let botName = activeBotId ? BOTS[activeBotId].name : 'IA';
    document.getElementById('turn-badge').textContent = (currentPlayer === 'atacante' ? 'Invasores' : 'Defensores') + ' — ' + botName + ' delibera…';
    
    if (!aiWorker) initAIWorker();
    const delay = gameMode === 'eve' ? 800 : 520;
    
    // Deshabilitar botón Deshacer mientras la IA piensa
    const undoBtn = document.getElementById('btn-undo');
    if(undoBtn) undoBtn.disabled = true;

    setTimeout(() => {
      aiWorker.postMessage({
        board: board, currentPlayer: currentPlayer, kingLeftCenter: kingLeftCenter,
        ironSetArray: Array.from(ironSet), botDepth: activeBotId ? BOTS[activeBotId].depth : 2, activeBotId: activeBotId
      });
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
   3. INICIALIZACIÓN, MENÚ Y ESTADÍSTICAS
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
function closeQuests() { document.getElementById('quests-overlay').classList.remove('show'); document.getElementById('start-overlay').classList.add('show'); }

const TUT_STEPS = [
  { icon: '🏰', title: 'Bienvenido a Dominio', text: 'Dominio es un juego de asedio. Un bando defiende el castillo y el otro ataca.' },
  { icon: '⚔', title: 'Los Invasores', text: 'Los Invasores atacan. Se mueven 1 ó 2 casillas libres en línea recta.' },
  { icon: '🛡', title: 'Los Guardianes', text: 'Los Guardianes protegen al Señor. Se mueven 1 casilla libre en línea recta.' },
  { icon: '♛', title: 'El Señor del Hierro', text: 'El Señor empieza en el centro y es invulnerable ahí. Se mueve 1 casilla, o salta sobre un Guardián propio.' },
  { icon: '⚖', title: 'Cómo Capturar', text: 'Una pieza es capturada al quedar flanqueada entre dos piezas enemigas en línea recta.' },
  { icon: '🏆', title: 'Victoria', text: '• Defensor gana si el Señor llega a una esquina ✦.\n• Invasor gana si captura al Señor fuera de D4.' }
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
  if (tutCurrentStep === TUT_STEPS.length - 1) { nextBtn.textContent = '¡A Jugar! ⚔'; nextBtn.onclick = closeTutorial; } else { nextBtn.textContent = 'Siguiente'; nextBtn.onclick = nextTut; }
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
  
  // Bloquear selector si es Darius (Jefe Final)
  const assistSelect = document.getElementById('assist-mode');
  if (assistSelect) {
    if (botId === 'darius') {
      assistSelect.value = 'challenge';
      assistSelect.disabled = true;
    } else {
      assistSelect.disabled = false;
    }
    updateAssistInfo();
  }
}

function updateAssistInfo() {
  const mode = document.getElementById('assist-mode').value;
  const desc = document.getElementById('assist-desc');
  if (!desc) return;
  
  if (mode === 'friendly') desc.textContent = "Ideal para aprender. Puedes equivocarte sin miedo.";
  else if (mode === 'balanced') desc.textContent = "Un equilibrio perfecto para partidas justas.";
  else if (mode === 'challenge') desc.textContent = "La verdadera guerra. Sin ayudas, sin piedad.";
}

function showStartMenu() { document.getElementById('end-overlay').classList.remove('show'); initBotMenu(); initStats(); document.getElementById('start-overlay').classList.add('show'); }

function startGameWithMenuBot(mode) { if (mode === 'pvp') startGame('pvp', null); else startGame(mode, selectedMenuBotId); }

function startGame(mode, botId = null) {
  activeBotId = botId; gameMode = mode; 
  document.getElementById('start-overlay').classList.remove('show');
  
  board = INITIAL.map(r => [...r]); currentPlayer = 'atacante'; selectedCell = null; validMoves = []; isGameOver = false; kingLeftCenter = false; round = 1; phase = 0; maxRounds = 20;
  boardHistory = [getBoardHash()]; stateHistory = []; historyIndex = 0; lastFrom = null; lastTo = null;
  ironSet = calculateIronSetSim(board);
  
  // NUEVO: INICIALIZAR LÍMITE DE DESHACER LEYENDO EL MENÚ (Y NO EL BOT)
  if (mode === 'pvp') {
    undosLeft = Infinity; 
  } else {
    const assistMode = document.getElementById('assist-mode').value;
    if (assistMode === 'friendly') undosLeft = Infinity;
    else if (assistMode === 'balanced') undosLeft = 3;
    else if (assistMode === 'challenge') undosLeft = 0;
  }
  
  saveState([{ text: `Partida iniciada. Los Invasores atacan primero.`, type: 'sys' }]);
  
  const leftPanel = document.getElementById('left-panel');
  if (activeBotId && mode !== 'pvp') {
     leftPanel.style.display = 'flex'; const bot = BOTS[activeBotId];
     document.getElementById('in-game-bot-avatar').src = bot.avatar; document.getElementById('in-game-bot-name').textContent = bot.name; document.getElementById('in-game-bot-title').textContent = bot.title; document.getElementById('in-game-bot-chat').textContent = '...';
  } else { leftPanel.style.display = 'none'; }
  
  updateUI(); trackQuest('play'); checkAndTriggerAI();
}

/* ══════════════════════════════════════════════
   4. REGLAS BÁSICAS 
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
  if (p === 'S') return getKingMovesSim(boardState, r, c, isKingOut); if (p === 'G') return getGuardianMovesSim(boardState, r, c); if (p === 'I') return getInvaderMovesSim(boardState, r, c, currentIronSet); return [];
}
function getKingMovesSim(boardState, r, c, isKingOut) {
  const moves = [];
  for (const [dr, dc] of DIRS) {
    const r1 = r + dr, c1 = c + dc; if (!inBounds(r1, c1)) continue;
    if (boardState[r1][c1] === '.') { if (isKingOut && r1 === CR && c1 === CC) continue; moves.push({ r: r1, c: c1 }); } 
    else if (boardState[r1][c1] === 'G') { const r2 = r + dr * 2, c2 = c + dc * 2; if (inBounds(r2, c2) && boardState[r2][c2] === '.') { if (isKingOut && r2 === CR && c2 === CC) continue; moves.push({ r: r2, c: c2 }); } }
  } return moves;
}
function getGuardianMovesSim(boardState, r, c) {
  const moves = [];
  for (const [dr, dc] of DIRS) { const nr = r + dr, nc = c + dc; if (inBounds(nr, nc) && boardState[nr][nc] === '.' && !isCorner(nr, nc)) moves.push({ r: nr, c: nc }); } return moves;
}
function getInvaderMovesSim(boardState, r, c, currentIronSet) {
  const maxDistance = isAdjToIronSim(r, c, currentIronSet) ? 1 : 2; const moves = [];
  for (const [dr, dc] of DIRS) { for (let d = 1; d <= maxDistance; d++) { const nr = r + dr * d, nc = c + dc * d; if (!inBounds(nr, nc) || isCorner(nr, nc) || boardState[nr][nc] !== '.') break; moves.push({ r: nr, c: nc }); } } return moves;
}
function checkCapturesSim(boardState, moveR, moveC, isKingOut) {
  const movePiece = boardState[moveR][moveC], moveTeam = getTeam(movePiece), captures = [];
  for (const [dr, dc] of DIRS) {
    const adjR = moveR + dr, adjC = moveC + dc; if (!inBounds(adjR, adjC)) continue;
    const adjPiece = boardState[adjR][adjC]; if (!adjPiece || adjPiece === '.' || getTeam(adjPiece) === moveTeam) continue;
    if (adjPiece === 'S' && !isKingOut) continue;
    const flankR = adjR + dr, flankC = adjC + dc; if (!inBounds(flankR, flankC)) continue;
    const flankPiece = boardState[flankR][flankC]; if (!flankPiece || flankPiece === '.' || getTeam(flankPiece) !== moveTeam) continue;
    if (adjPiece === 'S' && (movePiece !== 'I' || flankPiece !== 'I')) continue; captures.push({ r: adjR, c: adjC, piece: adjPiece });
  } return captures;
}
function simulateApplyMove(tempBoard, fR, fC, tR, tC, isKingOut) {
  let b = tempBoard.map(row => [...row]); let p = b[fR][fC]; b[fR][fC] = '.'; b[tR][tC] = p;
  let newKingOut = isKingOut; if (p === 'S' && !newKingOut) newKingOut = true;
  if (p === 'S' && isCorner(tR, tC)) return { board: b, kingLeftCenter: newKingOut, winner: 'defensor' };
  const cap = checkCapturesSim(b, tR, tC, newKingOut);
  for (let c of cap) { b[c.r][c.c] = '.'; if (c.piece === 'S') return { board: b, kingLeftCenter: newKingOut, winner: 'atacante' }; } return { board: b, kingLeftCenter: newKingOut, winner: null };
}

/* ══════════════════════════════════════════════
   5. INTERACCIÓN DEL USUARIO, UI Y DESHACER
══════════════════════════════════════════════ */
function handleCellClick(r, c) {
  if (isGameOver || isProcessingAI) return;
  if (historyIndex < stateHistory.length - 1) { logMsg('Estás en el pasado. Vuelve al presente.', 'warn'); return; }
  if (isAITurn()) return;
  
  const piece = board[r][c], clickTeam = getTeam(piece);
  if (validMoves.some(m => m.r === r && m.c === c)) { applyMoveReal(selectedCell.r, selectedCell.c, r, c); return; }
  if (clickTeam === currentPlayer) {
    selectedCell = { r, c }; validMoves = getValidMovesSim(board, r, c, ironSet, kingLeftCenter); updateUI(); return;
  }
  selectedCell = null; validMoves = []; updateUI();
}

function applyMoveReal(fR, fC, tR, tC) {
  const piece = board[fR][fC], team = getTeam(piece), from = squareName(fR, fC), to = squareName(tR, tC);
  board[fR][fC] = '.'; board[tR][tC] = piece; if (piece === 'S' && !kingLeftCenter) kingLeftCenter = true;
  lastFrom = { r: fR, c: fC }; lastTo = { r: tR, c: tC }; 
  let logs = [{ text: `[${team === 'atacante' ? 'Invasores' : 'Defensores'}] Mueve ${from} → ${to}`, type: team === 'atacante' ? 'atk' : 'def' }];
  
  if (piece === 'S' && isCorner(tR, tC)) { 
    ironSet = calculateIronSetSim(board); if (activeBotId && !isAITurn()) setTimeout(() => showBotDialogue('kingEscape'), 600);
    endGame('defensor', `El Señor escapó a ${to}. ¡Victoria del Defensor!`, logs); return; 
  }
  
  const cap = checkCapturesSim(board, tR, tC, kingLeftCenter); let kingCaptured = false;
  for (const c of cap) { board[c.r][c.c] = '.'; logs.push({ text: `Captura: Pieza en ${squareName(c.r, c.c)} eliminada.`, type: 'cap' }); if (c.piece === 'S') kingCaptured = true; trackQuest('capture', 1); }
  
  const prevSz = ironSet.size; ironSet = calculateIronSetSim(board); 
  if (kingCaptured) { endGame('atacante', 'El Señor fue capturado. ¡Victoria de los Invasores!', logs); return; }
  
  const hash = getBoardHash(); boardHistory.push(hash);
  if (boardHistory.filter(h => h === hash).length >= 3) { endGame('empate', 'Empate por triple repetición.', logs); return; }
  
  selectedCell = null; validMoves = [];
  if (phase === 0) { phase = 1; currentPlayer = 'defensor'; } 
  else { phase = 0; currentPlayer = 'atacante'; round++; if (round > maxRounds) { endGame('empate', `Límite de ${maxRounds} rondas alcanzado.`, logs, 'round_limit'); return; } }
  
  saveState(logs); updateUI(); checkAndTriggerAI();
}

function endGame(winner, msg, logs = [], reason = null) {
  isGameOver = true; logs.push({ text: '— ' + msg, type: 'cap' }); saveState(logs); updateUI();
  const icons = { defensor: '🏛', atacante: '⚔', empate: '⚖' }; const titles = { defensor: 'Victoria del Defensor', atacante: 'Victoria de los Invasores', empate: 'Empate' };
  const colors = { defensor: 'var(--steel-bright)', atacante: 'var(--blood-bright)', empate: 'var(--fire-gold)' };
  
  document.getElementById('modal-icon').textContent = icons[winner]; document.getElementById('modal-title').textContent = titles[winner];
  document.getElementById('modal-title').style.color = colors[winner]; document.getElementById('modal-msg').textContent = msg;
  document.getElementById('end-overlay').classList.add('show');
}

// ==========================================
// NUEVO: SISTEMA DE DESHACER (UNDO)
// ==========================================
function undoMove() {
  if (isProcessingAI || isGameOver) return; // No se puede deshacer si el bot está pensando o el juego acabó
  if (stateHistory.length <= 1) return; // No hay nada que deshacer (estamos en el turno 1)
  
  if (undosLeft <= 0) {
    showToast("Sin Deshacer", "El destino de estas piezas ya está sellado.", "🚫");
    return;
  }

  // Si estamos jugando contra un bot, y es NUESTRO turno, significa que el Bot acaba de jugar.
  // Tenemos que borrar 2 estados (el del bot y el nuestro) para devolvernos nuestra pieza a donde estaba.
  let stepsToPop = 1;
  if (activeBotId && !isAITurn() && stateHistory.length >= 3) {
    stepsToPop = 2;
  }

  // Consumimos una oportunidad de deshacer (si no es infinito)
  if (undosLeft !== Infinity) undosLeft--;

  // Borramos el historial reciente
  for(let i = 0; i < stepsToPop; i++){
    stateHistory.pop();
    boardHistory.pop();
  }

  // Restauramos el estado viejo
  historyIndex = stateHistory.length - 1;
  const s = stateHistory[historyIndex];
  
  board = s.board.map(r => [...r]);
  currentPlayer = s.currentPlayer;
  kingLeftCenter = s.kingLeftCenter;
  round = s.round;
  phase = s.phase;
  ironSet = new Set(s.ironSet);
  isGameOver = s.isGameOver;
  lastFrom = s.lastFrom;
  lastTo = s.lastTo;

  logMsg("Has deshecho un movimiento.", "sys");
  updateUI();
  renderLog();
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
  
  const badge = document.getElementById('turn-badge'); 
  if (isGameOver) { badge.textContent = 'Partida Finalizada'; badge.className = ''; } 
  else {
    const ai = isAITurn() ? ' (IA)' : '';
    if (currentPlayer === 'atacante') { badge.textContent = `Invasores${ai} ▶`; badge.className = 'atacante'; }
    else { badge.textContent = `Defensores${ai} ▶`; badge.className = 'defensor'; }
  }
  document.getElementById('round-display').textContent = `Ronda ${round} / ${maxRounds}`;
  if(ironSet) document.getElementById('iron-badge').classList.toggle('active', ironSet.size > 0);

  // NUEVO: Actualizar el estado del botón Deshacer
  const undoBtn = document.getElementById('btn-undo');
  if (undoBtn) {
    if (isProcessingAI || isGameOver || stateHistory.length <= 1) {
      undoBtn.disabled = true;
      undoBtn.textContent = '⟲ Deshacer';
    } else {
      undoBtn.disabled = false;
      const countText = undosLeft === Infinity ? '∞' : undosLeft;
      undoBtn.textContent = `⟲ Deshacer (${countText})`;
    }
  }
}

function makeLabel(text) { const d = document.createElement('div'); d.className = 'lbl'; d.textContent = text; return d; }
function saveState(logs) { stateHistory.push({ board: board.map(r => [...r]), currentPlayer, kingLeftCenter, round, phase, maxRounds, ironSet: new Set(ironSet), logs, isGameOver, lastFrom, lastTo }); historyIndex = stateHistory.length - 1; renderLog(); }
function renderLog() {
  const log = document.getElementById('game-log'); if(!log) return; log.innerHTML = '';
  stateHistory.forEach((s, idx) => s.logs.forEach(l => {
    const p = document.createElement('p'); p.className = 'log-entry ' + (l.type || ''); if (idx === historyIndex) p.classList.add('active');
    p.textContent = l.text; log.appendChild(p);
  }));
  const a = log.getElementsByClassName('active'); if (a.length > 0) a[a.length - 1].scrollIntoView({ block: 'nearest' });
}
function logMsg(msg, type) { const log = document.getElementById('game-log'); if(!log) return; const p = document.createElement('p'); p.className = 'log-entry ' + (type || ''); p.textContent = msg; log.appendChild(p); log.scrollTop = log.scrollHeight; }
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
function changeTheme(theme) { document.body.setAttribute('data-theme', theme); if(board) updateUI(); }
window.addEventListener('DOMContentLoaded', () => { showStartMenu(); });
