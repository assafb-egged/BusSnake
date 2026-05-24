const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const QRCode = require('qrcode');

const { GameRoom } = require('./game/room');
const { MAX_PLAYERS_PER_ROOM } = require('./game/constants');

const PORT = process.env.PORT || 3000;
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

app.use((req, res, next) => {
  res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
});
app.use(express.static(path.join(__dirname, 'public'), { etag: false, lastModified: false }));

const rooms = new Map();

function getOrCreateRoom(busId) {
  let room = rooms.get(busId);
  if (!room) {
    room = new GameRoom(busId, (state) => {
      io.to(roomChannel(busId)).emit('state', state);
    });
    rooms.set(busId, room);
    console.log(`[room] created bus=${busId}`);
  }
  return room;
}

function roomChannel(busId) {
  return `bus:${busId}`;
}

function disposeRoomIfEmpty(busId) {
  const room = rooms.get(busId);
  if (room && room.isEmpty()) {
    room.stop();
    rooms.delete(busId);
    console.log(`[room] disposed bus=${busId}`);
  }
}

app.get('/qr', async (req, res) => {
  const busId = (req.query.bus || 'demo').toString().slice(0, 32);
  const baseUrl = (req.query.base || `${req.protocol}://${req.get('host')}`).toString();
  const target = `${baseUrl}/play?bus=${encodeURIComponent(busId)}`;
  try {
    const dataUrl = await QRCode.toDataURL(target, {
      width: 512,
      margin: 2,
      color: { dark: '#0f172a', light: '#ffffff' }
    });
    res.json({ url: target, qr: dataUrl, busId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/admin', (req, res) => {
  const out = [];
  for (const [busId, room] of rooms) {
    out.push({
      busId,
      players: Array.from(room.snakes.values()).map(s => ({
        name: s.name,
        length: s.segments.length,
        alive: s.alive,
        paused: s.paused
      }))
    });
  }
  res.json({ rooms: out });
});

app.get('/play', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'play.html'));
});

io.on('connection', (socket) => {
  let busId = null;

  socket.on('join', ({ busId: requestedBus, playerName }) => {
    busId = (requestedBus || 'demo').toString().slice(0, 32);
    const room = getOrCreateRoom(busId);
    if (room.snakes.size >= MAX_PLAYERS_PER_ROOM) {
      socket.emit('full', { busId });
      return;
    }
    const safeName = (playerName || 'נוסע').toString().slice(0, 16);
    socket.join(roomChannel(busId));
    const snake = room.addPlayer(socket.id, safeName);
    socket.emit('joined', {
      playerId: socket.id,
      busId,
      color: snake.color,
      board: { width: room.serialize().board.width, height: room.serialize().board.height }
    });
    console.log(`[join] ${safeName} -> ${busId} (${socket.id})`);
  });

  socket.on('input', ({ direction }) => {
    if (!busId) return;
    const room = rooms.get(busId);
    if (!room) return;
    room.setDirection(socket.id, direction);
  });

  socket.on('respawn', ({ playerName }) => {
    if (!busId) return;
    const room = rooms.get(busId);
    if (!room) return;
    const safeName = (playerName || 'נוסע').toString().slice(0, 16);
    const snake = room.respawn(socket.id, safeName);
    socket.emit('joined', {
      playerId: socket.id,
      busId,
      color: snake.color,
      board: { width: room.serialize().board.width, height: room.serialize().board.height }
    });
  });

  socket.on('pause', ({ paused }) => {
    if (!busId) return;
    const room = rooms.get(busId);
    if (!room) return;
    room.setPaused(socket.id, !!paused);
  });

  socket.on('disconnect', () => {
    if (!busId) return;
    const room = rooms.get(busId);
    if (!room) return;
    room.removePlayer(socket.id);
    disposeRoomIfEmpty(busId);
    console.log(`[leave] ${socket.id} from ${busId}`);
  });
});

server.listen(PORT, () => {
  console.log(`BusSnake listening on http://localhost:${PORT}`);
});
