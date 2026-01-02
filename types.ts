
export type GameStatus = 'START' | 'PLAYING' | 'PAUSED' | 'GAMEOVER' | 'LEVEL_COMPLETE';

export interface Entity {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Bullet extends Entity {
  active: boolean;
  isPlayer: boolean;
}

export interface Enemy extends Entity {
  active: boolean;
  type: number;
  points: number;
}

export interface Barrier extends Entity {
  health: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
}
