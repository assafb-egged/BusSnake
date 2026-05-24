const { Snake } = require('./snake');
const {
  BOARD_WIDTH,
  BOARD_HEIGHT,
  TICK_RATE_MS,
  TARGET_FOOD_COUNT,
  SNAKE_COLORS,
  RESPAWN_GRACE_MS
} = require('./constants');

class GameRoom {
  constructor(busId, onState) {
    this.busId = busId;
    this.snakes = new Map();
    this.food = [];
    this.colorIndex = 0;
    this.onState = onState;
    this.lastDeaths = [];
    for (let i = 0; i < TARGET_FOOD_COUNT; i++) this.spawnFood();
    this.interval = setInterval(() => this.tick(), TICK_RATE_MS);
  }

  stop() {
    clearInterval(this.interval);
  }

  isEmpty() {
    return this.snakes.size === 0;
  }

  pickColor() {
    const c = SNAKE_COLORS[this.colorIndex % SNAKE_COLORS.length];
    this.colorIndex++;
    return c;
  }

  randomEmptyCell() {
    const occupied = new Set();
    for (const s of this.snakes.values()) {
      for (const seg of s.segments) occupied.add(`${seg.x},${seg.y}`);
    }
    for (const f of this.food) occupied.add(`${f.x},${f.y}`);
    for (let attempts = 0; attempts < 100; attempts++) {
      const x = Math.floor(Math.random() * BOARD_WIDTH);
      const y = Math.floor(Math.random() * BOARD_HEIGHT);
      if (!occupied.has(`${x},${y}`)) return { x, y };
    }
    return { x: Math.floor(Math.random() * BOARD_WIDTH), y: Math.floor(Math.random() * BOARD_HEIGHT) };
  }

  spawnFood(atPos = null) {
    const pos = atPos || this.randomEmptyCell();
    this.food.push({ x: pos.x, y: pos.y });
  }

  addPlayer(socketId, name) {
    const color = this.pickColor();
    const pos = this.randomEmptyCell();
    const snake = new Snake({
      id: socketId,
      name: name || 'נוסע',
      color,
      x: Math.max(4, pos.x),
      y: pos.y,
      direction: 'right'
    });
    this.snakes.set(socketId, snake);
    return snake;
  }

  removePlayer(socketId) {
    const snake = this.snakes.get(socketId);
    if (snake) {
      for (const seg of snake.segments) {
        this.food.push({ x: seg.x, y: seg.y });
      }
    }
    this.snakes.delete(socketId);
  }

  setPaused(socketId, paused) {
    const snake = this.snakes.get(socketId);
    if (snake) snake.paused = paused;
  }

  setDirection(socketId, dir) {
    const snake = this.snakes.get(socketId);
    if (snake && snake.alive) snake.setDirection(dir);
  }

  respawn(socketId, name) {
    this.removePlayer(socketId);
    return this.addPlayer(socketId, name);
  }

  killSnake(snake, killerId = null) {
    if (!snake.alive) return;
    snake.alive = false;
    snake.deadUntil = Date.now() + RESPAWN_GRACE_MS;
    for (const seg of snake.segments) {
      this.food.push({ x: seg.x, y: seg.y });
    }
    snake.segments = [];
    this.lastDeaths.push({ id: snake.id, killerId, at: Date.now() });
  }

  tick() {
    const movers = [];
    for (const snake of this.snakes.values()) {
      if (!snake.alive || snake.paused) continue;
      snake.step(BOARD_WIDTH, BOARD_HEIGHT);
      movers.push(snake);
    }

    const occupiedBody = new Map();
    for (const snake of this.snakes.values()) {
      if (!snake.alive) continue;
      for (let i = 0; i < snake.segments.length - 1; i++) {
        const seg = snake.segments[i];
        occupiedBody.set(`${seg.x},${seg.y}`, snake.id);
      }
    }

    const heads = new Map();
    for (const snake of movers) {
      const h = snake.head();
      const key = `${h.x},${h.y}`;
      if (!heads.has(key)) heads.set(key, []);
      heads.get(key).push(snake);
    }

    const toKill = new Set();
    for (const [key, snakesAtHead] of heads) {
      if (snakesAtHead.length > 1) {
        for (const s of snakesAtHead) toKill.add(s);
      }
      const bodyOwner = occupiedBody.get(key);
      if (bodyOwner) {
        for (const s of snakesAtHead) toKill.add(s);
      }
    }

    for (const snake of toKill) {
      this.killSnake(snake);
    }

    for (const snake of movers) {
      if (toKill.has(snake)) continue;
      const h = snake.head();
      const idx = this.food.findIndex(f => f.x === h.x && f.y === h.y);
      if (idx >= 0) {
        this.food.splice(idx, 1);
        snake.grow(1);
      }
    }

    while (this.food.length < TARGET_FOOD_COUNT) {
      this.spawnFood();
    }

    if (this.food.length > TARGET_FOOD_COUNT * 4) {
      this.food = this.food.slice(-TARGET_FOOD_COUNT * 4);
    }

    if (this.onState) this.onState(this.serialize());
  }

  serialize() {
    return {
      board: { width: BOARD_WIDTH, height: BOARD_HEIGHT },
      snakes: Array.from(this.snakes.values()).map(s => s.serialize()),
      food: this.food,
      lastDeaths: this.lastDeaths.splice(0)
    };
  }
}

module.exports = { GameRoom };
