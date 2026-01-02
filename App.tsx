
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
  const gameLoopRef = useRef<number | undefined>(undefined);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const gameState = useRef({
    playerX: C.GAME_WIDTH / 2 - C.PLAYER_WIDTH / 2,
    bullets: [] as T.Bullet[],
    enemies: [] as T.Enemy[],
    barriers: [] as T.Barrier[],
    particles: [] as T.Particle[],
    bgCells: [] as {x: number, y: number, r: number, s: number, alpha: number}[],
    enemyDirection: 1,
    enemyMoveTimer: 0,
    lastFireTime: 0,
    keys: {} as Record<string, boolean>,
    shakeAmount: 0,
    frameCount: 0
  });

  const vibrate = (pattern: number | number[]) => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(pattern);
    }
  };

  const initLevel = useCallback((lvl: number) => {
    const state = gameState.current;
    state.enemies = [];
    
    state.bgCells = Array.from({length: 30}, () => ({
      x: Math.random() * C.GAME_WIDTH,
      y: Math.random() * C.GAME_HEIGHT,
      r: 5 + Math.random() * 35,
      s: 0.05 + Math.random() * 0.2,
      alpha: 0.03 + Math.random() * 0.07
    }));

    for (let r = 0; r < C.ENEMY_ROWS; r++) {
      for (let c = 0; c < C.ENEMY_COLS; c++) {
        state.enemies.push({
          x: c * (C.ENEMY_WIDTH + C.ENEMY_PADDING) + 60,
          y: r * (C.ENEMY_HEIGHT + C.ENEMY_PADDING) + 80,
          width: C.ENEMY_WIDTH,
          height: C.ENEMY_HEIGHT,
          active: true,
          type: r % 3,
          points: (r + 1) * 20
        });
      }
    }

    state.barriers = [];
    const spacing = C.GAME_WIDTH / (C.BARRIER_COUNT + 1);
    for (let i = 0; i < C.BARRIER_COUNT; i++) {
      for (let x = 0; x < C.BARRIER_WIDTH; x += C.BARRIER_BLOCK_SIZE) {
        for (let y = 0; y < C.BARRIER_HEIGHT; y += C.BARRIER_BLOCK_SIZE) {
          const dx = x - C.BARRIER_WIDTH/2;
          const dy = y - C.BARRIER_HEIGHT/2;
          if (dx*dx/(C.BARRIER_WIDTH*C.BARRIER_WIDTH/4) + dy*dy/(C.BARRIER_HEIGHT*C.BARRIER_HEIGHT/4) < 1) {
            state.barriers.push({
              x: (i + 1) * spacing - C.BARRIER_WIDTH / 2 + x,
              y: C.GAME_HEIGHT - 140 + y,
              width: C.BARRIER_BLOCK_SIZE,
              height: C.BARRIER_BLOCK_SIZE,
              health: 1
            });
          }
        }
      }
    }

    state.bullets = [];
    state.particles = [];
    state.enemyDirection = 1;
    state.enemyMoveTimer = 0;
  }, []);

  const shoot = useCallback(() => {
    const state = gameState.current;
    if (Date.now() - state.lastFireTime > C.FIRE_COOLDOWN) {
      state.bullets.push({
        x: state.playerX + C.PLAYER_WIDTH / 2 - C.BULLET_WIDTH / 2,
        y: C.GAME_HEIGHT - 65,
        width: C.BULLET_WIDTH,
        height: C.BULLET_HEIGHT,
        active: true,
        isPlayer: true
      });
      state.lastFireTime = Date.now();
      audioService.playShoot();
    }
  }, []);

  const startGame = () => {
    audioService.init();
    setScore(0);
    setLives(3);
    setLevel(1);
    initLevel(1);
    setStatus('PLAYING');
    vibrate(50);
  };

  const nextLevel = () => {
    const nextLvl = level + 1;
    setLevel(nextLvl);
    initLevel(nextLvl);
    setStatus('PLAYING');
    audioService.playNextLevel();
    vibrate([50, 30, 50]);
  };

  const spawnExplosion = (x: number, y: number, color: string, count = 15, isPlayer = false) => {
    for (let i = 0; i < count; i++) {
      gameState.current.particles.push({
        x, y,
        vx: (Math.random() - 0.5) * 10,
        vy: (Math.random() - 0.5) * 10,
        life: 1.0,
        color
      });
    }
    gameState.current.shakeAmount = isPlayer ? 25 : 12;
    if (isPlayer) vibrate([150, 50, 150]);
    else vibrate(25);
  };

  const update = () => {
    if (status !== 'PLAYING') return;

    const state = gameState.current;
    state.frameCount++;

    state.bgCells.forEach(cell => {
      cell.y += cell.s;
      if (cell.y > C.GAME_HEIGHT + cell.r) cell.y = -cell.r;
    });

    if (state.keys['ArrowLeft']) state.playerX -= C.PLAYER_SPEED;
    if (state.keys['ArrowRight']) state.playerX += C.PLAYER_SPEED;
    state.playerX = Math.max(0, Math.min(C.GAME_WIDTH - C.PLAYER_WIDTH, state.playerX));

    if (state.keys[' ']) shoot();

    state.bullets = state.bullets.filter(b => b.active);
    state.bullets.forEach(b => {
      const speed = b.isPlayer ? C.BULLET_SPEED : C.BULLET_SPEED * 0.5 + (level * 0.4);
      b.y += b.isPlayer ? -speed : speed;
      
      if (b.y < -30 || b.y > C.GAME_HEIGHT + 30) b.active = false;

      state.barriers.forEach(bar => {
        if (b.active && b.x < bar.x + bar.width && b.x + b.width > bar.x && b.y < bar.y + bar.height && b.y + b.height > bar.y) {
          b.active = false;
          bar.health = 0;
          spawnExplosion(bar.x, bar.y, C.COLORS.barrier, 4);
        }
      });

      if (b.isPlayer) {
        state.enemies.forEach(e => {
          if (e.active && b.x < e.x + e.width && b.x + b.width > e.x && b.y < e.y + e.height && b.y + b.height > e.y) {
            e.active = false;
            b.active = false;
            setScore(prev => prev + e.points);
            const enemyColor = [C.COLORS.enemy1, C.COLORS.enemy2, C.COLORS.enemy3][e.type];
            spawnExplosion(e.x + e.width/2, e.y + e.height/2, enemyColor);
            audioService.playExplosion();
          }
        });
      } else {
        if (b.x < state.playerX + C.PLAYER_WIDTH && b.x + b.width > state.playerX && b.y < C.GAME_HEIGHT - 50 + C.PLAYER_HEIGHT && b.y + b.height > C.GAME_HEIGHT - 50) {
          b.active = false;
          setLives(prev => {
            const next = prev - 1;
            if (next <= 0) setStatus('GAMEOVER');
            return next;
          });
          spawnExplosion(state.playerX + C.PLAYER_WIDTH/2, C.GAME_HEIGHT - 40, C.COLORS.player, 25, true);
          audioService.playDamage();
        }
      }
    });

    const activeEnemiesCount = state.enemies.filter(e => e.active).length;
    const moveInterval = Math.max(40, C.ENEMY_MOVE_TIME_BASE - (level * 70) - (C.ENEMY_COLS * C.ENEMY_ROWS - activeEnemiesCount) * 10);
    
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
          e.y += 30;
          if (e.active && e.y + e.height > C.GAME_HEIGHT - 100) setStatus('GAMEOVER');
        });
      } else {
        state.enemies.forEach(e => e.x += 18 * state.enemyDirection);
      }
      state.enemyMoveTimer = Date.now();
    }

    const fireRateMod = Math.max(12, 40 - (level * 6)); 
    if (state.frameCount % fireRateMod === 0) {
      const activeEnemies = state.enemies.filter(e => e.active);
      if (activeEnemies.length > 0 && Math.random() < 0.45 + (level * 0.1)) {
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

    state.particles.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.life -= 0.04;
    });
    state.particles = state.particles.filter(p => p.life > 0);

    if (state.shakeAmount > 0) state.shakeAmount *= 0.82;
  };

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const state = gameState.current;
    
    const bgGrad = ctx.createRadialGradient(C.GAME_WIDTH/2, C.GAME_HEIGHT/2, 50, C.GAME_WIDTH/2, C.GAME_HEIGHT/2, C.GAME_WIDTH);
    bgGrad.addColorStop(0, '#2d0a1a');
    bgGrad.addColorStop(1, '#1a050d');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, C.GAME_WIDTH, C.GAME_HEIGHT);

    state.bgCells.forEach(cell => {
      ctx.globalAlpha = cell.alpha;
      ctx.fillStyle = '#db2777';
      ctx.beginPath();
      ctx.arc(cell.x, cell.y, cell.r, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1.0;

    ctx.save();
    if (state.shakeAmount > 0.5) {
      ctx.translate((Math.random() - 0.5) * state.shakeAmount, (Math.random() - 0.5) * state.shakeAmount);
    }

    state.barriers.forEach(b => {
      ctx.fillStyle = C.COLORS.barrier;
      ctx.beginPath();
      ctx.arc(b.x + b.width/2, b.y + b.height/2, b.width/1.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#701a3d';
      ctx.beginPath();
      ctx.arc(b.x + b.width/2, b.y + b.height/2, b.width/3, 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.shadowBlur = 15;
    ctx.shadowColor = 'rgba(255, 255, 255, 0.8)';
    ctx.fillStyle = C.COLORS.player;
    const px = state.playerX;
    const py = C.GAME_HEIGHT - 60;
    
    ctx.beginPath();
    ctx.ellipse(px + 20, py + 15, 12, 14, 0, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.beginPath();
    ctx.moveTo(px + 20, py + 27);
    for (let i = 0; i < 24; i++) {
        const wave = Math.sin(state.frameCount * 0.4 + i * 0.5) * (i * 0.4);
        ctx.lineTo(px + 20 + wave, py + 27 + i);
    }
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.strokeStyle = C.COLORS.player;
    ctx.stroke();
    ctx.shadowBlur = 0;

    const pulse = Math.sin(state.frameCount * 0.1) * 2;
    state.enemies.forEach(e => {
      if (!e.active) return;
      const colors = [C.COLORS.enemy1, C.COLORS.enemy2, C.COLORS.enemy3];
      ctx.fillStyle = colors[e.type];
      const r = 16 + pulse;
      ctx.shadowBlur = 10;
      ctx.shadowColor = colors[e.type];
      ctx.beginPath();
      ctx.arc(e.x + 15, e.y + 15, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.beginPath();
      ctx.arc(e.x + 15, e.y + 15, r/2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.beginPath();
      ctx.arc(e.x + 10, e.y + 10, r/4, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.shadowBlur = 0;

    state.bullets.forEach(b => {
      ctx.fillStyle = b.isPlayer ? C.COLORS.player : C.COLORS.bullet;
      ctx.beginPath();
      ctx.arc(b.x + b.width/2, b.y, b.width/2 + 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(b.x + b.width/2, b.y);
      const tailLen = b.isPlayer ? 18 : -18;
      ctx.lineTo(b.x + b.width/2, b.y + tailLen);
      ctx.strokeStyle = ctx.fillStyle;
      ctx.lineWidth = 3;
      ctx.stroke();
    });

    state.particles.forEach(p => {
      ctx.globalAlpha = p.life;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3 * p.life, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1.0;
    ctx.restore();
  }, []);

  const loop = useCallback(() => {
    update();
    draw();
    gameLoopRef.current = requestAnimationFrame(loop);
  }, [status, level, draw]);

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
    const handleKeyUp = (e: KeyboardEvent) => {
      gameState.current.keys[e.key] = false;
    };
    
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

  const handleContainerTouch = (e: React.PointerEvent) => {
    if (status === 'PLAYING') {
      const target = e.target as HTMLElement;
      // If the target is NOT a control button, fire
      if (!target.closest('.control-btn')) {
        shoot();
      }
    }
  };

  return (
    <div 
      ref={containerRef}
      onPointerDown={handleContainerTouch}
      className="flex flex-col items-center justify-center min-h-screen bg-[#0d0206] text-white font-sans overflow-hidden touch-none select-none relative"
    >
      {/* HUD - Always visible */}
      <div className="absolute top-4 left-4 right-4 flex justify-between text-xs md:text-xl font-bold z-10 pointer-events-none">
        <div className="bg-pink-950/60 p-2 rounded-lg border border-pink-800 shadow-xl backdrop-blur-md">PUNKTY: <span className="text-pink-300 font-mono">{score.toString().padStart(6, '0')}</span></div>
        <div className="flex gap-2">
          <div className="bg-pink-950/60 p-2 rounded-lg border border-pink-800 shadow-xl backdrop-blur-md">FALA: {level}</div>
          <div className="bg-pink-950/60 p-2 rounded-lg border border-pink-800 shadow-xl backdrop-blur-md">GENY: {lives}🧬</div>
        </div>
      </div>

      {/* GAME CANVAS CONTAINER */}
      <div className="relative border-b-4 md:border-8 border-pink-900 bg-black shadow-[0_0_80px_rgba(219,39,119,0.3)] overflow-hidden aspect-[3/4] md:aspect-[4/3] w-full max-w-[800px] flex items-center justify-center transition-all">
        <canvas 
          ref={canvasRef} 
          width={C.GAME_WIDTH} 
          height={C.GAME_HEIGHT}
          className="w-full h-full object-contain pointer-events-none"
        />

        {/* OVERLAYS */}
        {status === 'START' && (
          <div className="absolute inset-0 bg-pink-950/90 flex flex-col items-center justify-center text-center p-4 backdrop-blur-md z-20">
            <h1 className="text-6xl md:text-9xl font-black mb-2 text-white drop-shadow-[0_0_40px_rgba(255,255,255,0.5)] tracking-tighter italic animate-pulse">SPERMERSI.PL</h1>
            <p className="text-lg md:text-2xl mb-8 text-pink-300 font-bold uppercase tracking-[0.3em] opacity-80">BIOLOGICZNA INWAZJA</p>
            <div className="space-y-3 text-xs md:text-lg bg-black/40 p-6 rounded-2xl border border-pink-500/30 mb-8 backdrop-blur-xl">
              <p className="font-black text-pink-200 uppercase tracking-widest">INSTRUKCJA MOBILNA</p>
              <p>Przyciski po bokach: Ruch | Kliknij w środek: Strzał</p>
            </div>
            <button 
              onClick={(e) => { e.stopPropagation(); startGame(); }}
              className="bg-white text-pink-900 px-12 py-5 rounded-full font-black text-3xl md:text-5xl hover:bg-pink-100 hover:scale-110 transition-all transform active:scale-95 shadow-[0_0_50_rgba(255,255,255,0.4)]"
            >
              START
            </button>
          </div>
        )}

        {status === 'PAUSED' && (
          <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center backdrop-blur-sm z-20">
            <h2 className="text-6xl font-black text-pink-400 mb-8 drop-shadow-lg italic uppercase">PAUZA</h2>
            <button onClick={(e) => { e.stopPropagation(); setStatus('PLAYING'); }} className="bg-white text-black px-12 py-5 rounded-full font-black text-3xl active:scale-90 transition-all">WZNÓW</button>
          </div>
        )}

        {status === 'GAMEOVER' && (
          <div className="absolute inset-0 bg-red-950/95 flex flex-col items-center justify-center text-center p-8 z-20">
            <h2 className="text-6xl md:text-9xl font-black mb-4 text-white italic">WYPŁUKANY!</h2>
            <p className="text-2xl mb-12 text-pink-300 font-mono tracking-[0.5em]">WYNIK: {score}</p>
            <button 
              onClick={(e) => { e.stopPropagation(); startGame(); }}
              className="bg-white text-red-950 px-14 py-6 rounded-full font-black text-3xl active:scale-90 shadow-2xl"
            >
              PONÓW
            </button>
          </div>
        )}

        {status === 'LEVEL_COMPLETE' && (
          <div className="absolute inset-0 bg-pink-900/95 flex flex-col items-center justify-center text-center p-8 z-20">
            <h2 className="text-6xl md:text-9xl font-black mb-4 text-white italic drop-shadow-2xl animate-pulse">ZAPŁODNIONE!</h2>
            <p className="text-2xl mb-12 text-pink-200 font-bold">FALA {level} OPANOWANA</p>
            <button 
              onClick={(e) => { e.stopPropagation(); nextLevel(); }}
              className="bg-white text-pink-950 px-16 py-7 rounded-full font-black text-4xl active:scale-90 shadow-2xl transition-all"
            >
              GŁĘBIEJ!
            </button>
          </div>
        )}
      </div>

      {/* MOBILE CONTROLS - EXTREME SIDES FOR THUMBS */}
      {status === 'PLAYING' && (
        <>
          <div className="absolute left-4 bottom-1/4 z-30 lg:hidden control-btn">
            <button 
              className="w-24 h-40 bg-pink-900/20 backdrop-blur-sm border-2 border-pink-500/30 rounded-full flex items-center justify-center text-6xl active:bg-pink-600/50 active:scale-110 transition-all select-none"
              style={{ touchAction: 'none' }}
              onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); gameState.current.keys['ArrowLeft'] = true; vibrate(15); }}
              onPointerUp={(e) => { e.preventDefault(); e.stopPropagation(); gameState.current.keys['ArrowLeft'] = false; }}
              onPointerLeave={(e) => { e.preventDefault(); e.stopPropagation(); gameState.current.keys['ArrowLeft'] = false; }}
            >⬅️</button>
          </div>
          <div className="absolute right-4 bottom-1/4 z-30 lg:hidden control-btn">
            <button 
              className="w-24 h-40 bg-pink-900/20 backdrop-blur-sm border-2 border-pink-500/30 rounded-full flex items-center justify-center text-6xl active:bg-pink-600/50 active:scale-110 transition-all select-none"
              style={{ touchAction: 'none' }}
              onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); gameState.current.keys['ArrowRight'] = true; vibrate(15); }}
              onPointerUp={(e) => { e.preventDefault(); e.stopPropagation(); gameState.current.keys['ArrowRight'] = false; }}
              onPointerLeave={(e) => { e.preventDefault(); e.stopPropagation(); gameState.current.keys['ArrowRight'] = false; }}
            >➡️</button>
          </div>
        </>
      )}

      {/* FOOTER & AUX CONTROLS */}
      <div className="mt-4 flex flex-wrap justify-center gap-6 text-pink-700 font-black tracking-[0.2em] uppercase text-[10px] md:text-sm px-4 text-center z-10">
        <button onClick={(e) => { e.stopPropagation(); toggleSound(); }} className="hover:text-pink-400 active:text-white transition-colors">
          {soundEnabled ? '🔊 DŹWIĘK WŁ.' : '🔇 DŹWIĘK WYŁ.'}
        </button>
        <button 
          onClick={(e) => { e.stopPropagation(); setStatus(prev => prev === 'PLAYING' ? 'PAUSED' : prev === 'PAUSED' ? 'PLAYING' : prev); }}
          className="hover:text-white active:text-white transition-colors"
        >PAUZA (P)</button>
        <button onClick={(e) => { e.stopPropagation(); setStatus('START'); }} className="hover:text-white active:text-white transition-colors">MENU</button>
      </div>

      <footer className="mt-auto py-2 text-[9px] md:text-[11px] text-pink-950 uppercase tracking-[0.4em] font-black text-center px-4">
        &copy; 2024 SPERMERSI.PL - BIOLOGICZNY TRIUMF
      </footer>
    </div>
  );
};

export default App;
