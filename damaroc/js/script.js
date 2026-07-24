const SIZE = 8;
const DARK = "dark";
const LIGHT = "light";
const ANIMATION_DURATION = 300;

let board = [];
let selected = null;
let loadedPieces = 0;
let forcedPieces = [];
let animatingPieces = [];
let currentPlayer = LIGHT;
let legalMovesForSelected = [];
let highliteLastOpponentMove = [];

const lightPawn = new Image();
const lightKing = new Image();
const blackPawn = new Image();
const blackKing = new Image();
lightPawn.src = 'https://i.ibb.co/k60qcwTd/w-p.png'; // './imgs/w-p.png';
lightKing.src = 'https://i.ibb.co/k60qcwTd/w-k.png'; // './imgs/w-k.png';
blackPawn.src = 'https://i.ibb.co/k60qcwTd/b-p.png'; // './imgs/b-p.png';
blackKing.src = 'https://i.ibb.co/k60qcwTd/b-k.png'; // './imgs/b-k.png';

const canvas = document.getElementById("board");
const ctx = canvas.getContext("2d");
const TILE = canvas.width / SIZE;

function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {

      // Draw square
      const isLight = (r + c) % 2 === 1;
      ctx.fillStyle = isLight ? "#f0d9b5" : "#b58863";
      ctx.fillRect(c * TILE, r * TILE, TILE, TILE);

      // Select square
      if (selected?.r === r && selected?.c === c) {
        ctx.fillStyle = "orange";
        ctx.fillRect(selected.c * TILE, selected.r * TILE, TILE, TILE)
      }
      
      // Select moves
      if (legalMovesForSelected?.length > 0) {
        legalMovesForSelected.forEach((m) => {
          ctx.fillStyle = 'orange';
          ctx.fillRect(m.to.c * TILE, m.to.r * TILE, TILE, TILE)
        })
      }
      
      // Select last moves
      if (highliteLastOpponentMove?.length > 0) {
        highliteLastOpponentMove.forEach((m) => {
          ctx.strokeStyle = "yellow";
          ctx.lineWidth = 2;
          ctx.strokeRect(m.c * TILE, m.r * TILE, TILE, TILE)
        })
      }

      // Draw pieces (skip animated pieces - they're drawn separately)
      const piece = board[r][c];
      if (piece) {
        const isAnimating = animatingPieces.some(ap => ap.fromR === r && ap.fromC === c);
        if (!isAnimating) {
          let pawn;
          if (piece.color === LIGHT) {
            pawn = piece.king ? lightKing : lightPawn;
          } else {
            pawn = piece.king ? blackKing : blackPawn;
          }
          ctx.drawImage(pawn, c * TILE, r * TILE, TILE, TILE)
        }
      }
    }
  }

  // Draw animated pieces on top
  animatingPieces.forEach(ap => {
    let pawn;
    if (ap.piece.color === LIGHT) {
      pawn = ap.piece.king ? lightKing : lightPawn;
    } else {
      pawn = ap.piece.king ? blackKing : blackPawn;
    }
    ctx.drawImage(pawn, ap.x, ap.y, TILE, TILE);
  });
}

function initBoard() {
  board = [];
  for (let r = 0; r < SIZE; r++) {
    const row = [];

    for (let c = 0; c < SIZE; c++) {
      if ((r + c) % 2 === 0) {
        if (r < 3) row.push({ color: DARK, king: false });
        else if (r > 4) row.push({ color: LIGHT, king: false });
        else row.push(null);
      } else {
        row.push(null);
      }
    }
    board.push(row);
  }

  render();
}

function cloneBoard(b) {
  return b.map((row) => row.map((cell) => (cell ? { ...cell } : null)));
}

function inBounds(r, c) {
  return r >= 0 && r < SIZE && c >= 0 && c < SIZE;
}

function opponent(color) {
  return color === DARK ? LIGHT : DARK;
}

function forwardDir(color) {
  return color === DARK ? 1 : -1;
}

function getSimpleMoves(b, r, c) {
  const piece = b[r][c];
  if (!piece) return [];
  const moves = [];
  const dirs = piece.king
    ? [
        [-1, -1],
        [-1, 1],
        [1, -1],
        [1, 1]
      ]
    : [
        [forwardDir(piece.color), -1],
        [forwardDir(piece.color), 1]
      ];

  for (const [dr, dc] of dirs) {
    if (piece.king) {
      let dist = 1;
      while (
        inBounds(r + dr * dist, c + dc * dist) &&
        b[r + dr * dist][c + dc * dist] === null
      ) {
        const toR = r + dr * dist;
        const toC = c + dc * dist;
        moves.push({
          from: { r, c },
          to: { r: toR, c: toC },
          path: [{ r: toR, c: toC }],
          captures: [],
          finalKing: true
        });
        dist++;
      }
    } else {
      const toR = r + dr;
      const toC = c + dc;
      if (inBounds(toR, toC) && b[toR][toC] === null) {
        const willCrown = isPromotionRow(piece.color, toR);
        moves.push({
          from: { r, c },
          to: { r: toR, c: toC },
          path: [{ r: toR, c: toC }],
          captures: [],
          finalKing: willCrown
        });
      }
    }
  }
  return moves;
}

function getCaptureMoves(b, r, c) {
  const piece = b[r][c];
  if (!piece) return [];
  const results = [];
  const MAX_CAPTURES = 3;

  function explore(curR, curC, capturedSoFar, boardState, path, arrivedDr, arrivedDc) {
    const p = boardState[curR][curC];
    const atCap = !p.king && capturedSoFar.length >= MAX_CAPTURES;
    const dirs = p.king ? [ [-1, -1],[-1, 1],[1, -1],[1, 1] ] : [
          [forwardDir(p.color), -1], [forwardDir(p.color), 1]
        ];
    let foundFurther = false;

    if (!atCap) {
      for (const [dr, dc] of dirs) {
        if (p.king && arrivedDr !== null && dr === -arrivedDr && dc === -arrivedDc) continue;
        if (p.king) {
          let dist = 1;
          while (inBounds(curR + dr * dist, curC + dc * dist)) {
            const checkR = curR + dr * dist;
            const checkC = curC + dc * dist;
            const cell = boardState[checkR][checkC];
            if (cell === null) {
              dist++;
              continue;
            }
            if (cell.color === p.color) break;
            if (capturedSoFar.some((cap) => cap.r === checkR && cap.c === checkC))
              break;
            let landDist = dist + 1;
            while (inBounds(curR + dr * landDist, curC + dc * landDist)) {
              const landR = curR + dr * landDist;
              const landC = curC + dc * landDist;
              if (boardState[landR][landC] !== null) break;
              const isFormerCapture = capturedSoFar.some(
                (cap) => cap.r === landR && cap.c === landC
              );
              if (isFormerCapture) {
                landDist++;
                continue;
              }
              foundFurther = true;
              const newBoard = cloneBoard(boardState);
              newBoard[landR][landC] = { ...newBoard[curR][curC] };
              newBoard[curR][curC] = null;
              newBoard[checkR][checkC] = null;
              const newCaptured = [...capturedSoFar, { r: checkR, c: checkC }];
              const newPath = [...path, { r: landR, c: landC }];
              explore(landR, landC, newCaptured, newBoard, newPath, dr, dc);
              landDist++;
            }
            break;
          }
        } else {
          const midR = curR + dr;
          const midC = curC + dc;
          const landR = curR + dr * 2;
          const landC = curC + dc * 2;
          if (!inBounds(landR, landC)) continue;
          const midCell = boardState[midR][midC];
          const landCell = boardState[landR][landC];
          if (midCell && midCell.color !== p.color && landCell === null &&
            !capturedSoFar.some((cap) => cap.r === midR && cap.c === midC)) {
            foundFurther = true;
            const newBoard = cloneBoard(boardState);
            newBoard[landR][landC] = { ...newBoard[curR][curC] };
            newBoard[curR][curC] = null;
            newBoard[midR][midC] = null;
            const newCaptured = [...capturedSoFar, { r: midR, c: midC }];
            const newPath = [...path, { r: landR, c: landC }];
            explore(landR, landC, newCaptured, newBoard, newPath, dr, dc);
          }
        }
      }
    }

    if ((!foundFurther || atCap) && capturedSoFar.length > 0) {
      const finalR = path[path.length - 1].r;
      const willCrown = !p.king && isPromotionRow(p.color, finalR);
      results.push({
        from: { r, c },
        to: { r: path[path.length - 1].r, c: path[path.length - 1].c },
        path: path,
        captures: capturedSoFar,
        finalKing: p.king || willCrown
      });
    }
  }

  explore(r, c, [], b, [], null, null);
  return results;
}

function isPromotionRow(color, r) {
  return (color === DARK && r === SIZE - 1) || (color === LIGHT && r === 0);
}

function getAllMoves(b, color) {
  let allCaptures = [];
  let allSimple = [];
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const piece = b[r][c];
      if (piece && piece.color === color) {
        const caps = getCaptureMoves(b, r, c);
        if (caps.length) allCaptures.push(...caps);
        allSimple.push(...getSimpleMoves(b, r, c));
      }
    }
  }
  if (allCaptures.length > 0) {
    const maxCaptures = Math.max(...allCaptures.map((m) => m.captures.length));
    return allCaptures.filter((m) => m.captures.length === maxCaptures);
  }
  return allSimple;
}

function getMovesForPiece(b, r, c, color) {
  const all = getAllMoves(b, color);
  return all.filter((m) => m.from.r === r && m.from.c === c);
}

function applyMove(b, move) {
  const newBoard = cloneBoard(b);
  const piece = { ...newBoard[move.from.r][move.from.c] };
  newBoard[move.from.r][move.from.c] = null;
  for (const cap of move.captures) {
    newBoard[cap.r][cap.c] = null;
  }
  piece.king = move.finalKing;
  newBoard[move.to.r][move.to.c] = piece;
  return newBoard;
}

function onSquareClick(r, c) {
  const moves = getAllMoves(board, currentPlayer);
  if (moves.length === 0) return;

  if (selected) {
    const move = legalMovesForSelected.find((m) => m.to.r === r && m.to.c === c);
    if (move) return performMove(move)
  }
  
  const piece = board[r][c];
  if (piece && piece.color === currentPlayer) {
    const pieceMoves = moves.filter((m) => m.from.r === r && m.from.c === c);
    if (pieceMoves.length === 0) {
      selected = null;
      legalMovesForSelected = [];
      return;
    }

    if (piece.king && pieceMoves.length > 1) {
      const captureMoves = pieceMoves.filter((m) => m.captures.length > 0);
      if (captureMoves.length > 0) {
        const maxCap = Math.max(...captureMoves.map((m) => m.captures.length));
        const best = captureMoves.filter((m) => m.captures.length === maxCap);
        const uniqueDests = new Set(best.map((m) => `${m.to.r},${m.to.c}`));
        if (uniqueDests.size === 1) {
          return performMove(best[0]);
        }
        selected = { r, c };
        legalMovesForSelected = best;
        render();
        return;
      }
      const uniqueDests = new Set(pieceMoves.map((m) => `${m.to.r},${m.to.c}`));
      if (uniqueDests.size === 1) {
        return performMove(pieceMoves[0]);
      }
      selected = { r, c };
      legalMovesForSelected = pieceMoves;
      render();
      return;
    }
    if (pieceMoves.length === 1) {return performMove(pieceMoves[0])}
    selected = { r, c };
    legalMovesForSelected = pieceMoves;
    render();
  }
  else {
    selected = null;
    legalMovesForSelected = [];
  }
}

function animateMove(move, callback) {
   const piece = board[move.from.r][move.from.c];
  const startX = move.from.c * TILE;
  const startY = move.from.r * TILE;

  // Build the full path including all intermediate squares
  const fullPath = [{ r: move.from.r, c: move.from.c }, ...move.path];
  const totalSegments = fullPath.length - 1;
  const segmentDuration = ANIMATION_DURATION / totalSegments;

  const animatingPiece = {
    piece: piece,
    fromR: move.from.r,
    fromC: move.from.c,
    x: startX,
    y: startY,
  };

  animatingPieces.push(animatingPiece);
  const startTime = Date.now();

  function updateAnimation() {
    const elapsed = Date.now() - startTime;
    const progress = Math.min(elapsed / ANIMATION_DURATION, 1);

    // Determine which segment we're on
    const segmentProgress = progress * totalSegments;
    const currentSegment = Math.floor(segmentProgress);
    const segmentT = segmentProgress - currentSegment;

    // Get the start and end of current segment
    const fromSquare = fullPath[currentSegment];
    const toSquare = fullPath[Math.min(currentSegment + 1, totalSegments)];

    const fromX = fromSquare.c * TILE;
    const fromY = fromSquare.r * TILE;
    const toX = toSquare.c * TILE;
    const toY = toSquare.r * TILE;

    // Easing function for smooth animation
    const easeT = segmentT < 0.5 
      ? 2 * segmentT * segmentT 
      : -1 + (4 - 2 * segmentT) * segmentT;

    animatingPiece.x = fromX + (toX - fromX) * easeT;
    animatingPiece.y = fromY + (toY - fromY) * easeT;

    render();

    if (progress < 1) {
      requestAnimationFrame(updateAnimation);
    } else {
      // Animation complete - remove from animating list
      animatingPieces = animatingPieces.filter(ap => ap !== animatingPiece);
      callback();
    }
  }

  requestAnimationFrame(updateAnimation);
}

function performMove(move) {
  highliteLastOpponentMove = [];
  animateMove(move, () => {
    board = applyMove(board, move);
    selected = null;
    legalMovesForSelected = [];
    currentPlayer = opponent(currentPlayer);
    highliteLastOpponentMove.push(move.from, move.to);
    render();
  });
}

function onImageLoad() {
  loadedPieces++;
  if (loadedPieces === 2) initBoard();
}

lightPawn.onload = onImageLoad;
blackPawn.onload = onImageLoad;

canvas.addEventListener("click", (e) => {
  if (animatingPieces.length > 0) return;
  
  const rect = canvas.getBoundingClientRect();
  const x = (e.clientX - rect.left) * (canvas.width / rect.width);
  const y = (e.clientY - rect.top) * (canvas.height / rect.height);
  const c = Math.floor(x / TILE); 
  const r = Math.floor(y / TILE);

  onSquareClick(r, c);
})


