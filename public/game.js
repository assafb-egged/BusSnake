(() => {
  const params = new URLSearchParams(location.search);
  const busId = (params.get('bus') || 'demo').slice(0, 32);
  document.getElementById('bus-label').textContent = busId;
  document.getElementById('hud-bus').textContent = busId;

  const savedName = localStorage.getItem('bussnake.name') || '';
  const nameInput = document.getElementById('player-name');
  nameInput.value = savedName;

  const overlayJoin = document.getElementById('overlay-join');
  const overlayDied = document.getElementById('overlay-died');
  const overlayFull = document.getElementById('overlay-full');
  const hud = document.getElementById('hud');
  const hudName = document.getElementById('hud-name');
  const hudLength = document.getElementById('hud-length');
  const hudColor = document.getElementById('hud-color');
  const hudBoard = document.getElementById('hud-board');
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  const splash = document.getElementById('splash');
  let splashHideTimer = null;

  function showSplash() {
    if (!splash) return;
    if (splashHideTimer) clearTimeout(splashHideTimer);
    splash.classList.remove('show');
    // Force reflow so the animation restarts even if shown again
    void splash.offsetWidth;
    splash.classList.add('show');
    splashHideTimer = setTimeout(() => {
      splash.classList.remove('show');
      splashHideTimer = null;
    }, 1000);
  }

  let socket = null;
  let myId = null;
  let myColor = '#ffd93d';
  let board = { width: 60, height: 40 };
  let state = { snakes: [], food: [] };
  let cell = 16;
  let offset = { x: 0, y: 0 };
  let lastDeaths = [];
  let deathFlashes = [];

  function resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const cellW = w / board.width;
    const cellH = h / board.height;
    cell = Math.min(cellW, cellH);
    offset.x = (w - cell * board.width) / 2;
    offset.y = (h - cell * board.height) / 2;
  }
  window.addEventListener('resize', resizeCanvas);

  function connect(name) {
    socket = io({ transports: ['websocket', 'polling'] });
    socket.on('connect', () => {
      socket.emit('join', { busId, playerName: name });
    });
    socket.on('joined', (data) => {
      myId = data.playerId;
      myColor = data.color;
      board = data.board;
      hudColor.style.background = myColor;
      hudName.textContent = name;
      hudLength.textContent = '4';
      overlayJoin.classList.add('hidden');
      overlayDied.classList.add('hidden');
      hud.classList.remove('hidden');
      resizeCanvas();
      showSplash();
    });
    socket.on('full', () => {
      overlayJoin.classList.add('hidden');
      overlayFull.classList.remove('hidden');
    });
    socket.on('state', (s) => {
      state = s;
      if (s.lastDeaths && s.lastDeaths.length) {
        for (const d of s.lastDeaths) {
          deathFlashes.push({ id: d.id, at: performance.now() });
          if (d.id === myId) {
            overlayDied.classList.remove('hidden');
          }
        }
      }
      updateHud();
    });
    socket.on('disconnect', () => {
    });

    document.addEventListener('visibilitychange', () => {
      if (!socket || !socket.connected) return;
      socket.emit('pause', { paused: document.hidden });
    });
  }

  // Disconnect cleanly when the page is closed / hidden, so the server frees the slot fast.
  function cleanDisconnect() {
    if (socket && socket.connected) {
      try { socket.disconnect(); } catch (_) {}
    }
  }
  window.addEventListener('pagehide', cleanDisconnect);
  window.addEventListener('beforeunload', cleanDisconnect);

  function updateHud() {
    const me = state.snakes.find(s => s.id === myId);
    if (me) hudLength.textContent = me.length;
    const top = [...state.snakes]
      .sort((a, b) => b.length - a.length)
      .slice(0, 5);
    hudBoard.innerHTML = '';
    for (const s of top) {
      const row = document.createElement('span');
      row.className = 'row';
      const dot = document.createElement('span');
      dot.className = 'dot';
      dot.style.background = s.color;
      const label = document.createElement('span');
      label.textContent = `${s.name} (${s.length})`;
      if (s.id === myId) label.classList.add('me');
      row.appendChild(dot);
      row.appendChild(label);
      hudBoard.appendChild(row);
    }
  }

  function drawBackground() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    ctx.fillStyle = '#0e1426';
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = '#1a2440';
    ctx.fillRect(offset.x, offset.y, cell * board.width, cell * board.height);

    ctx.strokeStyle = 'rgba(255,255,255,0.03)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= board.width; x++) {
      ctx.moveTo(offset.x + x * cell, offset.y);
      ctx.lineTo(offset.x + x * cell, offset.y + board.height * cell);
    }
    for (let y = 0; y <= board.height; y++) {
      ctx.moveTo(offset.x, offset.y + y * cell);
      ctx.lineTo(offset.x + board.width * cell, offset.y + y * cell);
    }
    ctx.stroke();

    ctx.strokeStyle = 'rgba(255, 217, 61, 0.08)';
    ctx.setLineDash([cell * 0.5, cell * 0.5]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    const mid = offset.y + (board.height / 2) * cell;
    ctx.moveTo(offset.x, mid);
    ctx.lineTo(offset.x + board.width * cell, mid);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  const SHIRT_COLORS = ['#FF6B6B', '#4D96FF', '#6BCB77', '#C780FA', '#F49D1A', '#FF7DBE', '#FFD93D', '#00C2A8'];
  const SKIN_COLORS  = ['#fde2c4', '#e8b48a', '#c98a5b', '#a26b3d'];
  const HAIR_COLORS  = ['#2b1d10', '#6b4423', '#0f172a', '#a87f4a', '#d4a017'];

  function personHash(f) {
    const v = Math.abs(((f.x | 0) * 73856093) ^ ((f.y | 0) * 19349663));
    return v >>> 0;
  }

  function drawFood() {
    for (const f of state.food) {
      const cx = offset.x + (f.x + 0.5) * cell;
      const cy = offset.y + (f.y + 0.5) * cell;
      const s = cell;
      const h = personHash(f);
      const shirt = SHIRT_COLORS[h % SHIRT_COLORS.length];
      const skin = SKIN_COLORS[(h >>> 3) % SKIN_COLORS.length];
      const hair = HAIR_COLORS[(h >>> 6) % HAIR_COLORS.length];

      // shadow
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.beginPath();
      ctx.ellipse(cx, cy + s * 0.38, s * 0.22, s * 0.06, 0, 0, Math.PI * 2);
      ctx.fill();

      // legs (dark trousers)
      ctx.fillStyle = '#1e293b';
      roundRect(cx - s * 0.13, cy + s * 0.16, s * 0.1, s * 0.22, s * 0.03);
      ctx.fill();
      roundRect(cx + s * 0.03, cy + s * 0.16, s * 0.1, s * 0.22, s * 0.03);
      ctx.fill();

      // arms (same color as shirt)
      ctx.fillStyle = shirt;
      roundRect(cx - s * 0.28, cy - s * 0.02, s * 0.1, s * 0.2, s * 0.04);
      ctx.fill();
      roundRect(cx + s * 0.18, cy - s * 0.02, s * 0.1, s * 0.2, s * 0.04);
      ctx.fill();

      // torso (shirt)
      ctx.fillStyle = shirt;
      roundRect(cx - s * 0.18, cy - s * 0.06, s * 0.36, s * 0.3, s * 0.06);
      ctx.fill();

      // neck shadow
      ctx.fillStyle = 'rgba(0,0,0,0.15)';
      ctx.fillRect(cx - s * 0.05, cy - s * 0.08, s * 0.1, s * 0.04);

      // head (skin)
      ctx.fillStyle = skin;
      ctx.beginPath();
      ctx.arc(cx, cy - s * 0.2, s * 0.16, 0, Math.PI * 2);
      ctx.fill();

      // hair (top half of head)
      ctx.fillStyle = hair;
      ctx.beginPath();
      ctx.arc(cx, cy - s * 0.21, s * 0.16, Math.PI + 0.2, 2 * Math.PI - 0.2);
      ctx.fill();

      // eyes
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.arc(cx - s * 0.05, cy - s * 0.19, Math.max(0.6, s * 0.02), 0, Math.PI * 2);
      ctx.arc(cx + s * 0.05, cy - s * 0.19, Math.max(0.6, s * 0.02), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function roundRect(x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  function wrapDelta(a, b, max) {
    let d = b - a;
    if (d > max / 2) d -= max;
    else if (d < -max / 2) d += max;
    return d;
  }

  function getSegOrient(segs, i) {
    const cur = segs[i];
    const prev = i > 0 ? segs[i - 1] : null;
    const next = i < segs.length - 1 ? segs[i + 1] : null;
    if (prev && next) {
      const px = wrapDelta(cur.x, prev.x, board.width);
      const py = wrapDelta(cur.y, prev.y, board.height);
      const nx = wrapDelta(cur.x, next.x, board.width);
      const ny = wrapDelta(cur.y, next.y, board.height);
      if (px === 0 && nx === 0) return 'v';
      if (py === 0 && ny === 0) return 'h';
      return 'corner';
    } else if (next) {
      const nx = wrapDelta(cur.x, next.x, board.width);
      const ny = wrapDelta(cur.y, next.y, board.height);
      return Math.abs(nx) > Math.abs(ny) ? 'h' : 'v';
    } else if (prev) {
      const px = wrapDelta(cur.x, prev.x, board.width);
      const py = wrapDelta(cur.y, prev.y, board.height);
      return Math.abs(px) > Math.abs(py) ? 'h' : 'v';
    }
    return 'h';
  }

  function drawSnakePath(segs, c) {
    ctx.beginPath();
    let pathOpen = false;
    for (let i = 0; i < segs.length; i++) {
      const seg = segs[i];
      const px = offset.x + (seg.x + 0.5) * c;
      const py = offset.y + (seg.y + 0.5) * c;
      if (i > 0) {
        const prev = segs[i - 1];
        if (Math.abs(seg.x - prev.x) > 1 || Math.abs(seg.y - prev.y) > 1) {
          ctx.stroke();
          ctx.beginPath();
          pathOpen = false;
        }
      }
      if (!pathOpen) { ctx.moveTo(px, py); pathOpen = true; }
      else ctx.lineTo(px, py);
    }
    if (pathOpen) ctx.stroke();
  }

  function getSegFacing(segs, i, snakeDir) {
    if (i === segs.length - 1) return snakeDir;
    const cur = segs[i];
    const next = segs[i + 1];
    const dx = wrapDelta(cur.x, next.x, board.width);
    const dy = wrapDelta(cur.y, next.y, board.height);
    if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'right' : 'left';
    return dy >= 0 ? 'down' : 'up';
  }

  function facingRotation(facing) {
    if (facing === 'right') return 0;
    if (facing === 'down')  return Math.PI / 2;
    if (facing === 'left')  return Math.PI;
    if (facing === 'up')    return -Math.PI / 2;
    return 0;
  }

  const EGGED_GREEN = '#0f7a3e';
  const EGGED_GREEN_DARK = '#0a5a2d';

  function drawAggedLetterAt(segs, segIdx, letter, snakeDir, c, fontSize) {
    if (segIdx < 1 || segIdx > segs.length - 2) return;
    const seg = segs[segIdx];
    const orient = getSegOrient(segs, segIdx);
    if (orient === 'corner') return;

    const facing = getSegFacing(segs, segIdx, snakeDir);
    const wx = offset.x + (seg.x + 0.5) * c;
    const wy = offset.y + (seg.y + 0.5) * c;

    ctx.save();
    ctx.font = `900 ${Math.max(10, Math.floor(fontSize))}px Heebo, sans-serif`;
    ctx.translate(wx, wy);
    // Apply bus rotation, move to stripe center, then UN-rotate so text is always world-horizontal
    ctx.rotate(facingRotation(facing));
    ctx.translate(0, c * 0.04);
    ctx.rotate(-facingRotation(facing));
    ctx.fillText(letter, 0, 0);
    ctx.restore();
  }

  function drawAggedText(segs, c, snakeDir) {
    if (segs.length < 4) return;
    const bodyLen = segs.length - 2;
    // For left/up direction, reverse so reading order on screen stays "אגד" (right-to-left)
    const isReverse = (snakeDir === 'left' || snakeDir === 'up');

    ctx.save();
    ctx.fillStyle = EGGED_GREEN_DARK;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    if (bodyLen <= 2) {
      // Short bus - one compact "אגד" in the middle
      const midIdx = Math.max(1, Math.min(segs.length - 2, Math.floor(segs.length / 2)));
      drawAggedLetterAt(segs, midIdx, 'אגד', snakeDir, c, c * 0.22);
    } else {
      // Longer bus - 3 letters spread out, gaps grow as the bus grows
      // Letter order along the bus tail->head:
      //   forward (right/down): ד, ג, א  (so on screen reads right-to-left as אגד)
      //   reverse (left/up):     א, ג, ד  (because the bus is flipped on screen)
      const letters = isReverse ? ['א', 'ג', 'ד'] : ['ד', 'ג', 'א'];
      const positions = [
        1 + Math.round(bodyLen * 0.18),
        1 + Math.round(bodyLen * 0.50),
        1 + Math.round(bodyLen * 0.82)
      ];
      for (let i = 0; i < 3; i++) {
        const segIdx = Math.max(1, Math.min(segs.length - 2, positions[i]));
        drawAggedLetterAt(segs, segIdx, letters[i], snakeDir, c, c * 0.55);
      }
    }
    ctx.restore();
  }

  function drawSnake(snake) {
    if (!snake.alive || snake.segments.length === 0) return;
    const segs = snake.segments;
    const c = cell;
    const dim = snake.paused ? 0.55 : 1;
    ctx.globalAlpha = dim;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Dark outline
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = c * 0.96;
    drawSnakePath(segs, c);

    // Body color - always EGGED GREEN
    ctx.strokeStyle = EGGED_GREEN;
    ctx.lineWidth = c * 0.86;
    drawSnakePath(segs, c);

    // Overdraw the head segment with the player's color (identity)
    const headSeg = segs[segs.length - 1];
    ctx.save();
    ctx.translate(offset.x + (headSeg.x + 0.5) * c, offset.y + (headSeg.y + 0.5) * c);
    ctx.rotate(facingRotation(snake.direction));
    ctx.fillStyle = snake.color;
    ctx.fillRect(-c * 0.5, -c * 0.43, c * 1.0, c * 0.86);
    // Rounded forward extension (matches body stroke's round cap)
    ctx.beginPath();
    ctx.arc(c * 0.5, 0, c * 0.43, -Math.PI / 2, Math.PI / 2);
    ctx.fill();
    ctx.restore();

    // Per-segment: continuous bus look with windows + Egged white stripe + lights
    for (let i = 0; i < segs.length; i++) {
      const seg = segs[i];
      const orient = getSegOrient(segs, i);
      if (orient === 'corner') continue;

      const isHead = i === segs.length - 1;
      const isTail = i === 0;
      const facing = getSegFacing(segs, i, snake.direction);

      const x = offset.x + (seg.x + 0.5) * c;
      const y = offset.y + (seg.y + 0.5) * c;

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(facingRotation(facing));

      if (!isHead) {
        // ONE row of windows at the top of the bus (real bus look)
        ctx.fillStyle = 'rgba(140, 205, 245, 0.97)';
        ctx.fillRect(-c * 0.5, -c * 0.34, c * 1.0, c * 0.18);

        // Window pane dividers (3 panes per cell)
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        for (const px of [-c * 0.17, c * 0.17]) {
          ctx.fillRect(px - c * 0.013, -c * 0.34, c * 0.026, c * 0.18);
        }
        // Window frame top + bottom
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.fillRect(-c * 0.5, -c * 0.34, c * 1.0, c * 0.018);
        ctx.fillRect(-c * 0.5, -c * 0.174, c * 1.0, c * 0.018);
        // Glass shines
        ctx.fillStyle = 'rgba(255,255,255,0.45)';
        for (const px of [-c * 0.42, -c * 0.08, c * 0.25]) {
          ctx.fillRect(px, -c * 0.32, c * 0.08, c * 0.05);
        }

        // BIG white Egged stripe - the iconic identifier
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(-c * 0.5, -c * 0.10, c * 1.0, c * 0.26);
        // Stripe outlines (thin dark borders)
        ctx.fillStyle = 'rgba(0,0,0,0.32)';
        ctx.fillRect(-c * 0.5, -c * 0.11, c * 1.0, c * 0.015);
        ctx.fillRect(-c * 0.5, c * 0.16, c * 1.0, c * 0.015);

        // Wheels - visible at the bottom of the bus
        ctx.fillStyle = '#0a0a0a';
        ctx.beginPath();
        ctx.arc(-c * 0.26, c * 0.34, c * 0.1, 0, Math.PI * 2);
        ctx.arc(c * 0.26, c * 0.34, c * 0.1, 0, Math.PI * 2);
        ctx.fill();
        // Wheel hubs (silver)
        ctx.fillStyle = '#94a3b8';
        ctx.beginPath();
        ctx.arc(-c * 0.26, c * 0.34, c * 0.04, 0, Math.PI * 2);
        ctx.arc(c * 0.26, c * 0.34, c * 0.04, 0, Math.PI * 2);
        ctx.fill();
        // Wheel center dots
        ctx.fillStyle = '#0a0a0a';
        ctx.beginPath();
        ctx.arc(-c * 0.26, c * 0.34, c * 0.015, 0, Math.PI * 2);
        ctx.arc(c * 0.26, c * 0.34, c * 0.015, 0, Math.PI * 2);
        ctx.fill();
      }

      if (isTail) {
        // Rear panel (Egged green, like the rest of the body)
        ctx.fillStyle = EGGED_GREEN;
        ctx.fillRect(-c * 0.5, -c * 0.42, c * 0.16, c * 0.84);
        // Small rear window
        ctx.fillStyle = 'rgba(140, 205, 245, 0.85)';
        ctx.fillRect(-c * 0.45, -c * 0.32, c * 0.1, c * 0.18);
        // Rear window frame
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.fillRect(-c * 0.45, -c * 0.32, c * 0.1, c * 0.014);
        ctx.fillRect(-c * 0.45, -c * 0.148, c * 0.1, c * 0.014);
        // Taillights (red)
        ctx.fillStyle = '#ff2d20';
        roundRect(-c * 0.46, c * 0.20, c * 0.09, c * 0.10, c * 0.02);
        ctx.fill();
        // Taillight glow
        ctx.fillStyle = 'rgba(255,200,200,0.85)';
        ctx.fillRect(-c * 0.44, c * 0.22, c * 0.04, c * 0.04);
        // Rear bumper line
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(-c * 0.5, c * 0.40, c * 0.16, c * 0.04);
        ctx.fillRect(-c * 0.5, -c * 0.44, c * 0.16, c * 0.04);
      }

      ctx.restore();
    }

    // Egged brand text - one "אגד" spread along the bus
    drawAggedText(segs, c, snake.direction);

    // Head: front of bus (drawn on top, with windshield + lights + grill)
    drawBusHead(snake);

    ctx.globalAlpha = 1;

    // Highlight own snake's head
    if (snake.id === myId) {
      const head = segs[segs.length - 1];
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2.5;
      ctx.globalAlpha = 0.9 * dim;
      ctx.setLineDash([4, 3]);
      roundRect(
        offset.x + head.x * c + 1,
        offset.y + head.y * c + 1,
        c - 2, c - 2, c * 0.18
      );
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }

    drawName(snake);
  }

  function drawBusHead(snake) {
    const segs = snake.segments;
    const head = segs[segs.length - 1];
    const dir = snake.direction;
    const c = cell;

    const cx = offset.x + (head.x + 0.5) * c;
    const cy = offset.y + (head.y + 0.5) * c;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(facingRotation(dir));

    // Side window on the back portion of the head cell (top only, continuous with body)
    ctx.fillStyle = 'rgba(140, 205, 245, 0.97)';
    ctx.fillRect(-c * 0.5, -c * 0.34, c * 0.32, c * 0.18);
    // Window pane divider
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(-c * 0.34 - c * 0.013, -c * 0.34, c * 0.026, c * 0.18);
    // Window frame
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(-c * 0.5, -c * 0.34, c * 0.32, c * 0.018);
    ctx.fillRect(-c * 0.5, -c * 0.174, c * 0.32, c * 0.018);
    // Glass shine
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.fillRect(-c * 0.42, -c * 0.32, c * 0.08, c * 0.05);

    // White Egged stripe continues across head (matches body)
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-c * 0.5, -c * 0.10, c * 0.95, c * 0.26);
    ctx.fillStyle = 'rgba(0,0,0,0.32)';
    ctx.fillRect(-c * 0.5, -c * 0.11, c * 0.95, c * 0.015);
    ctx.fillRect(-c * 0.5, c * 0.16, c * 0.95, c * 0.015);

    // Front wheel under the head
    ctx.fillStyle = '#0a0a0a';
    ctx.beginPath();
    ctx.arc(-c * 0.2, c * 0.34, c * 0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#94a3b8';
    ctx.beginPath();
    ctx.arc(-c * 0.2, c * 0.34, c * 0.04, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#0a0a0a';
    ctx.beginPath();
    ctx.arc(-c * 0.2, c * 0.34, c * 0.015, 0, Math.PI * 2);
    ctx.fill();

    // Front "nose" extension - rounded front
    ctx.fillStyle = snake.color;
    roundRect(c * 0.3, -c * 0.42, c * 0.18, c * 0.84, c * 0.1);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.lineWidth = Math.max(1, c * 0.03);
    roundRect(c * 0.3, -c * 0.42, c * 0.18, c * 0.84, c * 0.1);
    ctx.stroke();

    // Windshield - large angled rectangle at the front
    ctx.fillStyle = 'rgba(150, 210, 250, 0.97)';
    ctx.beginPath();
    ctx.moveTo(-c * 0.16, -c * 0.34);
    ctx.lineTo(c * 0.28, -c * 0.32);
    ctx.lineTo(c * 0.28, -c * 0.1);
    ctx.lineTo(-c * 0.16, -c * 0.16);
    ctx.closePath();
    ctx.fill();
    // Windshield divider
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(c * 0.055, -c * 0.33, c * 0.02, c * 0.20);
    // Windshield top edge
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(-c * 0.16, -c * 0.34, c * 0.44, c * 0.014);
    // Windshield shine
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.beginPath();
    ctx.moveTo(-c * 0.1, -c * 0.31);
    ctx.lineTo(c * 0.02, -c * 0.30);
    ctx.lineTo(c * 0.02, -c * 0.18);
    ctx.lineTo(-c * 0.1, -c * 0.21);
    ctx.closePath();
    ctx.fill();

    // Headlights (bright yellow with glow)
    ctx.fillStyle = '#fff48a';
    roundRect(c * 0.36, c * 0.22, c * 0.12, c * 0.10, c * 0.02);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillRect(c * 0.38, c * 0.24, c * 0.05, c * 0.04);

    // Bumper at the very front
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(c * 0.46, -c * 0.42, c * 0.04, c * 0.84);

    // Side mirror (top only since windows are on top now)
    ctx.fillStyle = snake.color;
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 1.2;
    roundRect(c * 0.20, -c * 0.5, c * 0.07, c * 0.14, c * 0.02);
    ctx.fill(); ctx.stroke();
    // Mirror glass
    ctx.fillStyle = 'rgba(140, 205, 245, 0.9)';
    ctx.fillRect(c * 0.215, -c * 0.48, c * 0.04, c * 0.06);

    ctx.restore();
  }

  function drawName(snake) {
    const head = snake.segments[snake.segments.length - 1];
    if (!head) return;
    const cx = offset.x + (head.x + 0.5) * cell;
    const cy = offset.y + head.y * cell - 4;
    ctx.font = `${Math.max(10, Math.floor(cell * 0.55))}px Heebo, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillText(snake.name, cx + 1, cy + 1);
    ctx.fillStyle = snake.id === myId ? '#fff84a' : '#fff';
    ctx.fillText(snake.name, cx, cy);
  }

  function drawDeathFlashes() {
    const now = performance.now();
    deathFlashes = deathFlashes.filter(f => now - f.at < 600);
  }

  function render() {
    drawBackground();
    drawFood();
    for (const snake of state.snakes) drawSnake(snake);
    drawDeathFlashes();
    requestAnimationFrame(render);
  }

  function sendDir(dir) {
    if (socket && socket.connected) socket.emit('input', { direction: dir });
  }

  document.addEventListener('keydown', (e) => {
    const map = {
      ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
      w: 'up', s: 'down', a: 'left', d: 'right',
      W: 'up', S: 'down', A: 'left', D: 'right'
    };
    if (map[e.key]) {
      e.preventDefault();
      sendDir(map[e.key]);
    }
  });

  for (const btn of document.querySelectorAll('.pad')) {
    const fire = (e) => { e.preventDefault(); sendDir(btn.dataset.dir); };
    btn.addEventListener('touchstart', fire, { passive: false });
    btn.addEventListener('mousedown', fire);
  }

  let touchStart = null;
  canvas.addEventListener('touchstart', (e) => {
    const t = e.changedTouches[0];
    touchStart = { x: t.clientX, y: t.clientY };
  }, { passive: true });
  canvas.addEventListener('touchend', (e) => {
    if (!touchStart) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStart.x;
    const dy = t.clientY - touchStart.y;
    const adx = Math.abs(dx), ady = Math.abs(dy);
    if (Math.max(adx, ady) < 24) return;
    if (adx > ady) sendDir(dx > 0 ? 'right' : 'left');
    else sendDir(dy > 0 ? 'down' : 'up');
  }, { passive: true });

  document.getElementById('join-btn').addEventListener('click', () => {
    const name = (nameInput.value || 'נוסע').trim().slice(0, 16);
    localStorage.setItem('bussnake.name', name);
    connect(name);
  });
  nameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('join-btn').click();
  });

  document.getElementById('respawn-btn').addEventListener('click', () => {
    overlayDied.classList.add('hidden');
    const name = (nameInput.value || 'נוסע').trim().slice(0, 16);
    if (socket && socket.connected) socket.emit('respawn', { playerName: name });
  });

  resizeCanvas();
  requestAnimationFrame(render);
})();
