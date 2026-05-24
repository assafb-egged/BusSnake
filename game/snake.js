const { INITIAL_SNAKE_LENGTH } = require('./constants');

const DIRECTIONS = {
  up:    { dx: 0,  dy: -1 },
  down:  { dx: 0,  dy: 1  },
  left:  { dx: -1, dy: 0  },
  right: { dx: 1,  dy: 0  }
};

const OPPOSITE = { up: 'down', down: 'up', left: 'right', right: 'left' };

class Snake {
  constructor({ id, name, color, x, y, direction = 'right' }) {
    this.id = id;
    this.name = name;
    this.color = color;
    this.direction = direction;
    this.pendingDirection = direction;
    this.alive = true;
    this.paused = false;
    this.deadUntil = 0;
    this.lastSeenMs = Date.now();
    this.segments = [];
    for (let i = INITIAL_SNAKE_LENGTH - 1; i >= 0; i--) {
      this.segments.push({ x: x - i, y });
    }
    this.growth = 0;
  }

  head() {
    return this.segments[this.segments.length - 1];
  }

  setDirection(dir) {
    if (!DIRECTIONS[dir]) return;
    if (OPPOSITE[this.direction] === dir && this.segments.length > 1) return;
    this.pendingDirection = dir;
  }

  step(boardWidth, boardHeight) {
    this.direction = this.pendingDirection;
    const { dx, dy } = DIRECTIONS[this.direction];
    const head = this.head();
    const nextHead = {
      x: (head.x + dx + boardWidth) % boardWidth,
      y: (head.y + dy + boardHeight) % boardHeight
    };
    this.segments.push(nextHead);
    if (this.growth > 0) {
      this.growth--;
    } else {
      this.segments.shift();
    }
    return nextHead;
  }

  grow(amount = 1) {
    this.growth += amount;
  }

  serialize() {
    return {
      id: this.id,
      name: this.name,
      color: this.color,
      segments: this.segments,
      direction: this.direction,
      alive: this.alive,
      paused: this.paused,
      length: this.segments.length
    };
  }
}

module.exports = { Snake, DIRECTIONS };
