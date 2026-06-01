/**
 * ============================================================================
 * WEB WORKER: MOTOR DE INTELIGENCIA ARTIFICIAL ("El Cerebro")
 * Este archivo corre en un hilo secundario. No congela la pantalla.
 * Utiliza técnicas de motores de ajedrez: Minimax, Poda Alfa-Beta, 
 * Tablas de Transposición, Ordenamiento de Movimientos y Profundización Iterativa.
 * ============================================================================
 */

// 1. CONSTANTES DEL JUEGO (Copia necesaria porque el Worker no tiene acceso a main.js)
const ROWS = 7, COLS = 7, CR = 3, CC = 3;
const CORNERS = [[0, 0], [0, 6], [6, 0], [6, 6]];
const DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];

// Memoria a corto plazo de la IA
const TT = new Map(); 
let timeUp = false;
let endTime = 0;

// 2. RECEPCIÓN DE MENSAJES (Cuando main.js le pide a la IA que piense)
self.onmessage = function(e) {
  const { board, currentPlayer, kingLeftCenter, ironSetArray, botDepth, activeBotId } = e.data;
  
  // Reconstruir el Set de la Línea de Hierro
  const currentIronSet = new Set(ironSetArray);
  
  // Limpiar memoria si está muy llena para evitar crasheos de RAM
  if (TT.size > 200000) TT.clear();

  // Configurar el tiempo de pensamiento según el bot
  // Darius (Jefe) piensa hasta 2.5 segundos. Novatos piensan medio segundo.
  let timeLimit = 500;
  if (activeBotId === 'veterano') timeLimit = 1200;
  if (activeBotId === 'darius') timeLimit = 2800; // Darius usa todo el tiempo posible
  
  // SOLUCIÓN: Ahora pasamos activeBotId correctamente a la función de búsqueda
  const bestMove = getStockfishMove(board, currentPlayer, kingLeftCenter, currentIronSet, timeLimit, botDepth, activeBotId);
  
  // Enviar la respuesta de vuelta al hilo principal
  self.postMessage({ move: bestMove });
};


/* ══════════════════════════════════════════════
   MOTOR "STOCKFISH" (Búsqueda y Lógica Avanzada)
══════════════════════════════════════════════ */

// SOLUCIÓN: Añadimos activeBotId a la firma de la función
function getStockfishMove(board, team, klc, ironSet, timeLimit, maxDepthConfig, activeBotId) {
  timeUp = false;
  endTime = Date.now() + timeLimit;
  
  let bestGlobalMove = null;
  const isMaximizing = (team === 'atacante');
  let moves = getAllPossibleMoves(board, team, ironSet, klc);
  
  if (moves.length === 0) return null;

  // Si solo hay un movimiento posible, no pierdas tiempo pensando
  if (moves.length === 1) return moves[0];

  // Profundización Iterativa (Iterative Deepening)
  // Intentamos llegar a profundidad 1, luego 2, luego 3... hasta que se acabe el tiempo
  let maxDepth = (activeBotId === 'darius') ? 10 : maxDepthConfig; // Darius no tiene límite real más que el tiempo
  
  for (let depth = 1; depth <= maxDepth; depth++) {
    let currentBestMove = null;
    let bestScore = isMaximizing ? -Infinity : Infinity;
    
    // Ordenamiento de Movimientos: Evaluar capturas y escapes primero mejora la Poda Alfa-Beta
    moves = orderMoves(moves, board, klc);

    for (const mv of moves) {
      if (timeUp) break; // Si se acabó el tiempo en medio del cálculo, abortar esta profundidad

      const sim = simulateApplyMove(board, mv.fromR, mv.fromC, mv.toR, mv.toC, klc);
      let score;

      if (sim.winner === 'atacante') score = 100000 + depth;
      else if (sim.winner === 'defensor') score = -100000 - depth;
      else {
        const nextIs = calculateIronSetSim(sim.board);
        score = minimax(sim.board, depth - 1, -Infinity, Infinity, !isMaximizing, sim.kingLeftCenter, nextIs);
      }

      if (isMaximizing) {
        if (score > bestScore) { bestScore = score; currentBestMove = mv; }
      } else {
        if (score < bestScore) { bestScore = score; currentBestMove = mv; }
      }
    }

    // Solo actualizar el mejor movimiento global si logramos terminar la profundidad completa sin que se acabe el tiempo
    if (!timeUp && currentBestMove) {
      bestGlobalMove = currentBestMove;
      // Si encontramos un mate inevitable, detener la búsqueda
      if (Math.abs(bestScore) > 90000) break; 
    } else {
      break; // Salir del bucle si el tiempo expiró
    }
  }

  return bestGlobalMove || moves[0];
}

function minimax(b, depthLeft, alpha, beta, isMax, klc, iS) {
  if (Date.now() > endTime) { timeUp = true; return 0; }

  const hash = getBoardHashSim(b, isMax, klc);
  
  if (TT.has(hash)) {
    const cached = TT.get(hash);
    if (cached.depth >= depthLeft) return cached.score;
  }

  if (depthLeft === 0) {
    const score = evaluateBoard(b, klc);
    TT.set(hash, { score: score, depth: depthLeft });
    return score;
  }

  const team = isMax ? 'atacante' : 'defensor';
  let moves = getAllPossibleMoves(b, team, iS, klc);
  
  if (moves.length === 0) {
    const score = evaluateBoard(b, klc);
    TT.set(hash, { score: score, depth: depthLeft });
    return score;
  }

  // Optimización: Ordenar movimientos para podar ramas inútiles rápido
  moves = orderMoves(moves, b, klc);

  let bestScore = isMax ? -Infinity : Infinity;

  for (let mv of moves) {
    const sim = simulateApplyMove(b, mv.fromR, mv.fromC, mv.toR, mv.toC, klc);
    let score;
    
    if (sim.winner === 'atacante') score = 100000 + depthLeft;
    else if (sim.winner === 'defensor') score = -100000 - depthLeft;
    else {
      const nextIs = calculateIronSetSim(sim.board);
      score = minimax(sim.board, depthLeft - 1, alpha, beta, !isMax, sim.kingLeftCenter, nextIs);
    }

    if (timeUp) return 0; // Abortar propagación si se acabó el tiempo

    if (isMax) {
      bestScore = Math.max(bestScore, score);
      alpha = Math.max(alpha, bestScore);
    } else {
      bestScore = Math.min(bestScore, score);
      beta = Math.min(beta, bestScore);
    }
    
    if (beta <= alpha) break; // Poda Alfa-Beta (Corta ramas inútiles)
  }

  if (!timeUp) TT.set(hash, { score: bestScore, depth: depthLeft });
  return bestScore;
}

/**
 * MOVE ORDERING (Ordenamiento de Movimientos)
 * Evalúa superficialmente cada movimiento para poner los más prometedores al principio.
 * Esto hace que el Algoritmo Minimax sea exponencialmente más rápido.
 */
function orderMoves(moves, board, klc) {
  for (let m of moves) {
    let scoreGuess = 0;
    const piece = board[m.fromR][m.fromC];
    const targetCell = board[m.toR][m.toC];
    
    // 1. Recompensar capturas potenciales (Sándwich hipotético)
    // Para simplificar el Worker, damos bonus si terminan cerca de piezas enemigas
    
    // 2. Si es el Rey, moverse a una esquina vale muchísimo
    if (piece === 'S') {
      if (isCorner(m.toR, m.toC)) scoreGuess += 10000;
      // Bonus por acercarse a esquinas
      let distToCorner = Math.min(...CORNERS.map(([cr, cc]) => Math.abs(m.toR - cr) + Math.abs(m.toC - cc)));
      scoreGuess -= distToCorner * 10;
    }
    
    // 3. Invasores se acercan al rey
    if (piece === 'I') {
      // Buscar al rey para acercarse
      let kr = -1, kc = -1;
      for (let r=0; r<ROWS; r++) for (let c=0; c<COLS; c++) if (board[r][c] === 'S') { kr=r; kc=c; }
      if (kr !== -1) {
        let distToKing = Math.abs(m.toR - kr) + Math.abs(m.toC - kc);
        scoreGuess -= distToKing * 5;
      }
    }
    m.scoreGuess = scoreGuess;
  }
  
  // Ordenar de mayor a menor puntaje
  return moves.sort((a, b) => b.scoreGuess - a.scoreGuess);
}

/**
 * FUNCIÓN HEURÍSTICA DE DARIUS (El "Sexto Sentido" de la IA)
 * + Puntos = Ventaja Invasores
 * - Puntos = Ventaja Defensores
 */
function evaluateBoard(b, klc) {
  let score = 0, kingR = -1, kingC = -1, invaders = [], guardianCount = 0;
  
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const p = b[r][c];
      if (p === 'I') invaders.push({ r, c }); 
      else if (p === 'G') guardianCount++; 
      else if (p === 'S') { kingR = r; kingC = c; }
    }
  }
  
  if (kingR === -1) return 100000;         // Invasor ganó
  if (isCorner(kingR, kingC)) return -100000; // Defensor ganó
  
  // 1. Material
  score += invaders.length * 100; 
  score -= guardianCount * 130; 
  
  let kingInvulnerable = (!klc && kingR === CR && kingC === CC);
  
  // 2. Distancia a la esquina más cercana
  let dists = CORNERS.map(([cr, cc]) => Math.abs(kingR - cr) + Math.abs(kingC - cc)).sort((a, b) => a - b);
  let minD = dists[0];
  let distScores = [0, -700, -400, -200, -80, -30, 0]; // Valores incrementados
  score += (distScores[minD] || 0);
  
  // 3. Presión de Invasores sobre el Rey (Caja y Encierro)
  let q1=0, q2=0, q3=0, q4=0, danger=0;
  for (const iv of invaders) {
    if (iv.r < kingR && iv.c < kingC) q1 = 1; 
    else if (iv.r < kingR && iv.c > kingC) q2 = 1; 
    else if (iv.r > kingR && iv.c < kingC) q3 = 1; 
    else if (iv.r > kingR && iv.c > kingC) q4 = 1;
    
    let dr = Math.abs(iv.r - kingR);
    let dc = Math.abs(iv.c - kingC);
    let d = dr + dc;
    
    if (!kingInvulnerable && (dr === 0 || dc === 0)) {
      if (d === 1) danger += 80; 
      else if (d === 2) danger += 25; 
    }
  }
  score += danger;
  score += (q1 + q2 + q3 + q4) * 30; // Darius prefiere rodear por los 4 cuadrantes
  
  // 4. Vías de Escape
  let openLines = 0;
  let kingOnEscapeRoute = false;
  for (const [dr, dc] of DIRS) {
     let r = kingR + dr, c = kingC + dc;
     let blocked = false;
     while (inBounds(r, c)) {
        if (b[r][c] === 'I') { blocked = true; break; }
        r += dr; c += dc;
     }
     if (!blocked) {
       openLines++;
       if (!kingInvulnerable) kingOnEscapeRoute = true;
     }
  }
  
  score -= (openLines * 40); 
  if (kingOnEscapeRoute) score -= 200; // ALERTA ROJA para Invasores
  if (kingInvulnerable && openLines === 0) score -= 100; 
  
  // 5. Muros de Hierro
  let iSet = calculateIronSetSim(b); 
  score -= iSet.size * 25; 
  
  return score;
}

/* ══════════════════════════════════════════════
   REGLAS DEL JUEGO DUPLICADAS PARA EL WORKER
   (El Worker no puede leer main.js, debe saber jugar solo)
══════════════════════════════════════════════ */
function getTeam(piece) { if (piece === 'I') return 'atacante'; if (piece === 'G' || piece === 'S') return 'defensor'; return null; }
function isCorner(r, c) { return CORNERS.some(([cr, cc]) => cr === r && cc === c); }
function inBounds(r, c) { return r >= 0 && r < ROWS && c >= 0 && c < COLS; }
function getBoardHashSim(b, isMax, klc) { return b.map(row => row.join('')).join('') + (isMax?'A':'D') + klc; }

function calculateIronSetSim(boardState) {
  let iset = new Set();
  for (let r = 0; r < ROWS; r++) {
    let run = [];
    for (let c = 0; c <= COLS; c++) {
      if (c < COLS && boardState[r][c] === 'G') run.push(`${r},${c}`);
      else { if (run.length >= 3) run.forEach(k => iset.add(k)); run = []; }
    }
  }
  for (let c = 0; c < COLS; c++) {
    let run = [];
    for (let r = 0; r <= ROWS; r++) {
      if (r < ROWS && boardState[r][c] === 'G') run.push(`${r},${c}`);
      else { if (run.length >= 3) run.forEach(k => iset.add(k)); run = []; }
    }
  }
  return iset;
}

function isAdjToIronSim(r, c, currentIronSet) { 
  for (const [dr, dc] of DIRS) if (currentIronSet.has(`${r + dr},${c + dc}`)) return true; 
  return false; 
}

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
    const r1 = r + dr, c1 = c + dc; 
    if (!inBounds(r1, c1)) continue;
    if (boardState[r1][c1] === '.') { 
      if (isKingOut && r1 === CR && c1 === CC) continue; 
      moves.push({ r: r1, c: c1 }); 
    } else if (boardState[r1][c1] === 'G') { 
      const r2 = r + dr * 2, c2 = c + dc * 2; 
      if (inBounds(r2, c2) && boardState[r2][c2] === '.') { 
        if (isKingOut && r2 === CR && c2 === CC) continue; 
        moves.push({ r: r2, c: c2 }); 
      } 
    }
  }
  return moves;
}

function getGuardianMovesSim(boardState, r, c) {
  const moves = [];
  for (const [dr, dc] of DIRS) { 
    const nr = r + dr, nc = c + dc; 
    if (inBounds(nr, nc) && boardState[nr][nc] === '.' && !isCorner(nr, nc)) moves.push({ r: nr, c: nc }); 
  }
  return moves;
}

function getInvaderMovesSim(boardState, r, c, currentIronSet) {
  const maxDistance = isAdjToIronSim(r, c, currentIronSet) ? 1 : 2; 
  const moves = [];
  for (const [dr, dc] of DIRS) { 
    for (let d = 1; d <= maxDistance; d++) { 
      const nr = r + dr * d, nc = c + dc * d; 
      if (!inBounds(nr, nc) || isCorner(nr, nc) || boardState[nr][nc] !== '.') break; 
      moves.push({ r: nr, c: nc }); 
    } 
  }
  return moves;
}

function checkCapturesSim(boardState, moveR, moveC, isKingOut) {
  const movePiece = boardState[moveR][moveC];
  const moveTeam = getTeam(movePiece);
  const captures = [];
  for (const [dr, dc] of DIRS) {
    const adjR = moveR + dr, adjC = moveC + dc; 
    if (!inBounds(adjR, adjC)) continue;
    const adjPiece = boardState[adjR][adjC]; 
    if (!adjPiece || adjPiece === '.' || getTeam(adjPiece) === moveTeam) continue;
    if (adjPiece === 'S' && !isKingOut) continue;
    const flankR = adjR + dr, flankC = adjC + dc; 
    if (!inBounds(flankR, flankC)) continue;
    const flankPiece = boardState[flankR][flankC]; 
    if (!flankPiece || flankPiece === '.' || getTeam(flankPiece) !== moveTeam) continue;
    if (adjPiece === 'S' && (movePiece !== 'I' || flankPiece !== 'I')) continue;
    captures.push({ r: adjR, c: adjC, piece: adjPiece });
  }
  return captures;
}

function simulateApplyMove(tempBoard, fR, fC, tR, tC, isKingOut) {
  let b = tempBoard.map(row => [...row]); 
  let p = b[fR][fC]; b[fR][fC] = '.'; b[tR][tC] = p;
  let newKingOut = isKingOut; if (p === 'S' && !newKingOut) newKingOut = true;
  if (p === 'S' && isCorner(tR, tC)) return { board: b, kingLeftCenter: newKingOut, winner: 'defensor' };
  const cap = checkCapturesSim(b, tR, tC, newKingOut);
  for (let c of cap) { b[c.r][c.c] = '.'; if (c.piece === 'S') return { board: b, kingLeftCenter: newKingOut, winner: 'atacante' }; }
  return { board: b, kingLeftCenter: newKingOut, winner: null };
}

function getAllPossibleMoves(boardState, team, currentIronSet, isKingOut) {
  let allMoves = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (boardState[r][c] !== '.' && getTeam(boardState[r][c]) === team) {
        let pieceMoves = getValidMovesSim(boardState, r, c, currentIronSet, isKingOut);
        for (let m of pieceMoves) {
          allMoves.push({ fromR: r, fromC: c, toR: m.r, toC: m.c });
        }
      }
    }
  }
  return allMoves;
}
