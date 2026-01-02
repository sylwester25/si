
import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as C from './constants';
import * as T from './types';
import { audioService } from './services/AudioService';

const App: React.FC = () => {
  const [status, setStatus] = useState<T.GameStatus>('START');
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(3);
  const [level, setLevel] = useState(1);
  const [soundEnabled, setSoundEnabled] = useState(true);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Fix: added initial value to useRef to resolve "Expected 1 arguments, but got 0" error
  const gameLoopRef = useRef<number | undefined>(undefined);
  
  // Game State Refs (to avoid closures in loop)
  const gameState = useRef({
    playerX: C.GAME_WIDTH / 2 - C.PLAYER_WIDTH / 2,
    bullets: [] as T.Bullet[],
    enemies: [] as T.Enemy[],
    barriers: [] as T.Barrier[],
    particles: [] as T.Particle[],
    enemyDirection: 1,
    enemyMoveTimer: 0,
    lastFireTime: 0,
    keys: {} as Record<string, boolean>,
    shakeAmount: 0,
    frameCount: 0
  });

  const initLevel = useCallback((lvl: number) => {
    gameState.current.enemies = [];
    const rows = C.ENEMY_ROWS;
    const cols = C.ENEMY_COLS;
    
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        gameState.current.enemies.push({
          x: c * (C.ENEMY_WIDTH + C.ENEMY_PADDING) + 50,
          y: r * (C.ENEMY_HEIGHT + C.ENEMY_PADDING) + 80,
          width: C.ENEMY_WIDTH,
          height: C.ENEMY_HEIGHT,
          active: true,
          type: r % 3,
          points: (3 - (r % 3)) * 10
        });
      }
    }

    // Initialize Barriers
    gameState.current.barriers = [];
    const spacing = C.GAME_WIDTH / (C.BARRIER_COUNT + 1);
    for (let i = 0; i < C.BARRIER_COUNT; i++) {
      for (let x = 0; x < C.BARRIER_WIDTH; x += C.BARRIER_BLOCK_SIZE) {
        for (let y = 0; y < C.BARRIER_HEIGHT; y += C.BARRIER_BLOCK_SIZE) {
          gameState.current.barriers.push({
            x: (i + 1) * spacing - C.BARRIER_WIDTH / 2 + x,
            y: C.GAME_HEIGHT - 120 + y,
            width: C.BARRIER_BLOCK_SIZE,
            height: C.BARRIER_BLOCK_SIZE,
            health: 1
          });
        }
      }
    }

    gameState.current.bullets = [];
    gameState.current.particles = [];
    gameState.current.enemyDirection = 1;
    gameState.current.enemyMoveTimer = 0;
  }, []);

  const startGame = () => {
    audioService.init();
    setScore(0);
    setLives(3);
    setLevel(1);
    initLevel(1);
    setStatus('PLAYING');
  };

  const nextLevel = () => {
    const nextLvl = level + 1;
    setLevel(nextLvl);
    initLevel(nextLvl);
    setStatus('PLAYING');
    audioService.playNextLevel();
  };

  const spawnExplosion = (x: number, y: number, color: string) => {
    for (let i = 0; i < 8; i++) {
      gameState.current.particles.push({
        x, y,
        vx: (Math.random() - 0.5) * 4,
        vy: (Math.random() - 0.5) * 4,
        life: 1.0,
        color
      });
    }
    gameState.current.shakeAmount = 4;
  };

  const update = () => {
    if (status !== 'PLAYING') return;

    const state = gameState.current;
    state.frameCount++;

    // Player movement
    if (state.keys['ArrowLeft']) state.playerX -= C.PLAYER_SPEED;
    if (state.keys['ArrowRight']) state.playerX += C.PLAYER_SPEED;
    state.playerX = Math.max(0, Math.min(C.GAME_WIDTH - C.PLAYER_WIDTH, state.playerX));

    // Firing
    if (state.keys[' '] && Date.now() - state.lastFireTime > C.FIRE_COOLDOWN) {
      state.bullets.push({
        x: state.playerX + C.PLAYER_WIDTH / 2 - C.BULLET_WIDTH / 2,
        y: C.GAME_HEIGHT - 60,
        width: C.BULLET_WIDTH,
        height: C.BULLET_HEIGHT,
        active: true,
        isPlayer: true
      });
      state.lastFireTime = Date.now();
      audioService.playShoot();
    }

    // Bullets movement & collision
    state.bullets = state.bullets.filter(b => b.active);
    state.bullets.forEach(b => {
      b.y += b.isPlayer ? -C.BULLET_SPEED : C.BULLET_SPEED;
      if (b.y < 0 || b.y > C.GAME_HEIGHT) b.active = false;

      // Barrier collision
      state.barriers.forEach(bar => {
        if (b.active && b.x < bar.x + bar.width && b.x + b.width > bar.x && b.y < bar.y + bar.height && b.y + b.height > bar.y) {
          b.active = false;
          bar.health = 0;
        }
      });
      state.barriers = state.barriers.filter(bar => bar.health > 0);

      // Enemy collision (if player bullet)
      if (b.isPlayer) {
        state.enemies.forEach(e => {
          if (e.active && b.x < e.x + e.width && b.x + b.width > e.x && b.y < e.y + e.height && b.y + b.height > e.y) {
            e.active = false;
            b.active = false;
            setScore(prev => prev + e.points);
            spawnExplosion(e.x + e.width/2, e.y + e.height/2, C.COLORS.enemy1);
            audioService.playExplosion();
          }
        });
      } else {
        // Player collision (if enemy bullet)
        if (b.x < state.playerX + C.PLAYER_WIDTH && b.x + b.width > state.playerX && b.y < C.GAME_HEIGHT - 50 + C.PLAYER_HEIGHT && b.y + b.height > C.GAME_HEIGHT - 50) {
          b.active = false;
          setLives(prev => {
            const next = prev - 1;
            if (next <= 0) setStatus('GAMEOVER');
            return next;
          });
          spawnExplosion(state.playerX + C.PLAYER_WIDTH/2, C.GAME_HEIGHT - 40, C.COLORS.player);
          audioService.playDamage();
        }
      }
    });

    // Enemy logic
    const moveInterval = Math.max(100, C.ENEMY_MOVE_TIME_BASE - (level * 100) - (C.ENEMY_COLS * C.ENEMY_ROWS - state.enemies.filter(e => e.active).length) * 20);
    if (Date.now() - state.enemyMoveTimer > moveInterval) {
      let edgeReached = false;
      const activeEnemies = state.enemies.filter(e => e.active);
      
      if (activeEnemies.length === 0) {
        setStatus('LEVEL_COMPLETE');
        return;
      }

      activeEnemies.forEach(e => {
        if (state.enemyDirection === 1 && e.x + e.width + C.ENEMY_PADDING > C.GAME_WIDTH) edgeReached = true;
        if (state.enemyDirection === -1 && e.x - C.ENEMY_PADDING < 0) edgeReached = true;
      });

      if (edgeReached) {
        state.enemyDirection *= -1;
        state.enemies.forEach(e => {
          e.y += 20;
          if (e.active && e.y + e.height > C.GAME_HEIGHT - 70) setStatus('GAMEOVER');
        });
      } else {
        state.enemies.forEach(e => e.x += 10 * state.enemyDirection);
      }
      state.enemyMoveTimer = Date.now();
    }

    // Enemy Shooting
    if (state.frameCount % 60 === 0) {
      const activeEnemies = state.enemies.filter(e => e.active);
      if (activeEnemies.length > 0 && Math.random() < 0.2 + (level * 0.05)) {
        const shooter = activeEnemies[Math.floor(Math.random() * activeEnemies.length)];
        state.bullets.push({
          x: shooter.x + shooter.width / 2,
          y: shooter.y + shooter.height,
          width: C.BULLET_WIDTH,
          height: C.BULLET_HEIGHT,
          active: true,
          isPlayer: false
        });
      }
    }

    // Particles
    state.particles.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.life -= 0.02;
    });
    state.particles = state.particles.filter(p => p.life > 0);

    // Shake
    if (state.shakeAmount > 0) state.shakeAmount *= 0.9;
  };

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const state = gameState.current;

    ctx.clearRect(0, 0, C.GAME_WIDTH, C.GAME_HEIGHT);
    ctx.save();
    
    // Screen shake
    if (state.shakeAmount > 0.5) {
      ctx.translate((Math.random() - 0.5) * state.shakeAmount, (Math.random() - 0.5) * state.shakeAmount);
    }

    // Draw Barriers
    ctx.fillStyle = C.COLORS.barrier;
    state.barriers.forEach(b => {
      ctx.fillRect(b.x, b.y, b.width, b.height);
    });

    // Draw Player (Sperm Rider)
    ctx.fillStyle = C.COLORS.player;
    const px = state.playerX;
    const py = C.GAME_HEIGHT - 50;
    
    // Sperm Body
    ctx.beginPath();
    ctx.arc(px + 20, py + 15, 12, 0, Math.PI * 2);
    ctx.fill();
    // Sperm Tail (Animowana fala)
    ctx.beginPath();
    ctx.moveTo(px + 20, py + 27);
    for (let i = 0; i < 20; i++) {
        const xOffset = Math.sin(state.frameCount * 0.15 + i * 0.3) * 5;
        ctx.lineTo(px + 20 + xOffset, py + 27 + i);
    }
    ctx.lineWidth = 4;
    ctx.strokeStyle = C.COLORS.player;
    ctx.stroke();

    // Draw Enemies (Eggs)
    state.enemies.forEach(e => {
      if (!e.active) return;
      const colors = [C.COLORS.enemy1, C.COLORS.enemy2, C.COLORS.enemy3];
      ctx.fillStyle = colors[e.type];
      
      // Egg Shape
      ctx.beginPath();
      ctx.ellipse(e.x + 15, e.y + 15, 12, 16, 0, 0, Math.PI * 2);
      ctx.fill();
      
      // Nucleus
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.beginPath();
      ctx.arc(e.x + 15, e.y + 12, 4, 0, Math.PI * 2);
      ctx.fill();
    });

    // Draw Bullets (Sperm Shots)
    state.bullets.forEach(b => {
      ctx.fillStyle = b.isPlayer ? C.COLORS.player : C.COLORS.bullet;
      ctx.beginPath();
      ctx.arc(b.x + b.width/2, b.y, b.width/2, 0, Math.PI * 2);
      ctx.fill();
      
      // Small tail for bullet
      ctx.beginPath();
      ctx.moveTo(b.x + b.width/2, b.y);
      const tailLen = b.isPlayer ? 10 : -10;
      ctx.lineTo(b.x + b.width/2, b.y + tailLen);
      ctx.strokeStyle = ctx.fillStyle;
      ctx.lineWidth = 2;
      ctx.stroke();
    });

    // Draw Particles
    state.particles.forEach(p => {
      ctx.globalAlpha = p.life;
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x, p.y, 3, 3);
    });
    ctx.globalAlpha = 1.0;

    ctx.restore();
  }, []);

  const loop = useCallback(() => {
    update();
    draw();
    gameLoopRef.current = requestAnimationFrame(loop);
  }, [status, level, draw]); // status and level are needed to handle update logic

  useEffect(() => {
    gameLoopRef.current = requestAnimationFrame(loop);
    return () => {
      if (gameLoopRef.current) cancelAnimationFrame(gameLoopRef.current);
    };
  }, [loop]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      gameState.current.keys[e.key] = true;
      if (e.key === 'p' || e.key === 'P') {
        setStatus(prev => prev === 'PLAYING' ? 'PAUSED' : prev === 'PAUSED' ? 'PLAYING' : prev);
      }
      if (e.key === 'r' || e.key === 'R') {
        if (status === 'GAMEOVER' || status === 'START') startGame();
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => gameState.current.keys[e.key] = false;
    
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [status]);

  const toggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    audioService.toggle(next);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-900 text-white font-sans overflow-hidden">
      {/* HUD */}
      <div className="absolute top-4 left-4 right-4 flex justify-between text-xl font-bold z-10 pointer-events-none">
        <div>WYNIK: <span className="text-yellow-400">{score}</span></div>
        <div className="flex gap-4">
          <div>POZIOM: {level}</div>
          <div>ŻYCIA: {'❤️'.repeat(lives)}</div>
        </div>
      </div>

      {/* Main Game Container */}
      <div className="relative border-4 border-slate-700 bg-black rounded-lg shadow-2xl overflow-hidden aspect-[4/3] w-full max-w-[800px]">
        <canvas 
          ref={canvasRef} 
          width={C.GAME_WIDTH} 
          height={C.GAME_HEIGHT}
          className="w-full h-full"
        />

        {/* Overlays */}
        {status === 'START' && (
          <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center text-center p-8">
            <h1 className="text-6xl font-black mb-4 text-white drop-shadow-lg tracking-tighter">SPERM RIDER</h1>
            <p className="text-xl mb-8 text-slate-300">Broń galaktyki przed inwazją jajeczek!</p>
            <div className="space-y-4 text-lg bg-slate-800/50 p-6 rounded-xl border border-slate-600 mb-8">
              <p>⬅️ ➡️ Strzałki do poruszania</p>
              <p>⌨️ SPACJA do strzału</p>
              <p>🅿️ Pauza | Ⓡ Restart</p>
            </div>
            <button 
              onClick={startGame}
              className="bg-white text-slate-900 px-10 py-4 rounded-full font-bold text-2xl hover:scale-105 transition-transform"
            >
              STARTUJEMY!
            </button>
          </div>
        )}

        {status === 'PAUSED' && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
            <h2 className="text-5xl font-bold">PAUZA</h2>
            <button onClick={() => setStatus('PLAYING')} className="ml-4 text-lg underline">Wznów</button>
          </div>
        )}

        {status === 'GAMEOVER' && (
          <div className="absolute inset-0 bg-red-900/80 flex flex-col items-center justify-center text-center p-8">
            <h2 className="text-6xl font-black mb-2">KONIEC GRY!</h2>
            <p className="text-3xl mb-8">Twój wynik: {score}</p>
            <button 
              onClick={startGame}
              className="bg-white text-red-900 px-10 py-4 rounded-full font-bold text-2xl hover:scale-105 transition-transform"
            >
              SPRÓBUJ PONOWNIE
            </button>
          </div>
        )}

        {status === 'LEVEL_COMPLETE' && (
          <div className="absolute inset-0 bg-green-900/80 flex flex-col items-center justify-center text-center p-8">
            <h2 className="text-6xl font-black mb-2">POZIOM ZALICZONY!</h2>
            <p className="text-2xl mb-8">Przygotuj się na kolejną falę...</p>
            <button 
              onClick={nextLevel}
              className="bg-white text-green-900 px-10 py-4 rounded-full font-bold text-2xl hover:scale-105 transition-transform"
            >
              NASTĘPNY POZIOM
            </button>
          </div>
        )}

        {/* Mobile Controls */}
        <div className="absolute bottom-4 left-4 right-4 flex justify-between lg:hidden pointer-events-none">
          <div className="flex gap-2 pointer-events-auto">
            <button 
              className="w-16 h-16 bg-slate-700/50 rounded-full flex items-center justify-center text-3xl active:bg-slate-500"
              onPointerDown={() => gameState.current.keys['ArrowLeft'] = true}
              onPointerUp={() => gameState.current.keys['ArrowLeft'] = false}
            >⬅️</button>
            <button 
              className="w-16 h-16 bg-slate-700/50 rounded-full flex items-center justify-center text-3xl active:bg-slate-500"
              onPointerDown={() => gameState.current.keys['ArrowRight'] = true}
              onPointerUp={() => gameState.current.keys['ArrowRight'] = false}
            >➡️</button>
          </div>
          <button 
            className="w-20 h-20 bg-yellow-500/50 rounded-full flex items-center justify-center text-4xl pointer-events-auto active:bg-yellow-400"
            onPointerDown={() => gameState.current.keys[' '] = true}
            onPointerUp={() => gameState.current.keys[' '] = false}
          >🔥</button>
        </div>
      </div>

      {/* Settings Bar */}
      <div className="mt-8 flex gap-4 text-slate-400">
        <button onClick={toggleSound} className="hover:text-white transition-colors">
          {soundEnabled ? '🔊 Dźwięk WŁ.' : '🔇 Dźwięk WYŁ.'}
        </button>
        <span>•</span>
        <button onClick={() => setStatus('START')} className="hover:text-white transition-colors">Menu Główne</button>
      </div>

      <footer className="mt-auto py-4 text-xs text-slate-500 uppercase tracking-widest">
        &copy; 2024 Spermersi.pl - Wszystkie Prawa Plemników Zastrzeżone
      </footer>
    </div>
  );
};

export default App;
