import { useState, useEffect, useCallback, useRef } from 'react';
import { Bomb, Gem, HelpCircle, RotateCcw } from 'lucide-react';
import { useAuth } from '@/authentication/auth-context';
import { useWallet } from '@/wallet/wallet-context';
import { getGameConfig } from '@/game-engine/game-config-service';
import {
  calculateMinesMultiplier,
  getNextMultiplier,
  getMineCountRange,
} from '@/game-engine/mines-math';
import {
  startMinesGame,
  revealMinesTile,
  cashoutMinesGame,
  getActiveSession,
} from '@/game-engine/game-service';
import { ProvablyFairPanel } from '@/game-engine/provably-fair-panel';
import { useGameHistory } from '@/game-engine/use-game-history';
import { cn, formatCoins } from '@/lib/utils';
import { toast } from 'sonner';

const BOARD_SIZES = [
  { cols: 2, rows: 2, label: '2x2', totalTiles: 4 },
  { cols: 3, rows: 3, label: '3x3', totalTiles: 9 },
  { cols: 4, rows: 4, label: '4x4', totalTiles: 16 },
  { cols: 5, rows: 5, label: '5x5', totalTiles: 25 },
  { cols: 7, rows: 7, label: '7x7', totalTiles: 49 },
  { cols: 10, rows: 10, label: '10x10', totalTiles: 100 },
];
const QUICK_MINE_COUNTS = [1, 3, 5, 10, 15, 20];
const BOARD_SIZE_IDX = 3; // default 5x5

type TileState = 'hidden' | 'safe' | 'mine' | 'mine-revealed';
type GamePhase = 'idle' | 'active' | 'won' | 'lost';

interface ActiveGame {
  sessionId: string;
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
  mineCount: number;
  totalTiles: number;
  pfId: string;
}

interface RevealedResult {
  payout: number;
  profit: number;
  multiplier: number;
  serverSeed: string;
  mineIndices: number[];
}

export function MinesPage() {
  const { user } = useAuth();
  const { wallet, refresh: refreshWallet } = useWallet();
  const { sessions, refresh: refreshHistory } = useGameHistory('mines', 10);

  // Config
  const [rtp, setRtp] = useState(0.99);
  const [minBet, setMinBet] = useState(0.01);
  const [maxBet, setMaxBet] = useState(1000);
  const [maxPayoutCap, setMaxPayoutCap] = useState(10000);

  // UI state
  const [betInput, setBetInput] = useState('1.00');
  const [boardSizeIdx, setBoardSizeIdx] = useState(BOARD_SIZE_IDX);
  const [mineCount, setMineCount] = useState(3);
  const [phase, setPhase] = useState<GamePhase>('idle');
  const [tiles, setTiles] = useState<TileState[]>(Array(25).fill('hidden'));
  const [activeGame, setActiveGame] = useState<ActiveGame | null>(null);
  const [currentMultiplier, setCurrentMultiplier] = useState(1);
  const [currentPayout, setCurrentPayout] = useState(0);
  const [revealedIndices, setRevealedIndices] = useState<number[]>([]);
  const [finalResult, setFinalResult] = useState<RevealedResult | null>(null);
  const [animating, setAnimating] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const focusRef = useRef<HTMLDivElement>(null);

  const boardSize = BOARD_SIZES[boardSizeIdx];
  const mineRange = getMineCountRange(boardSize.totalTiles);
  const safeMineCount = Math.min(Math.max(mineCount, mineRange.min), mineRange.max);
  const betAmount = Math.max(minBet, Math.min(maxBet, parseFloat(betInput) || 0));

  // Load game config from DB on mount
  useEffect(() => {
    getGameConfig('mines').then((cfg) => {
      if (!cfg) return;
      setRtp(cfg.rtp);
      setMinBet(cfg.min_bet);
      setMaxBet(cfg.max_bet);
      setMaxPayoutCap(cfg.max_payout);
    });
  }, []);

  // Restore active session on mount
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const active = await getActiveSession('mines');
        if (!mounted || !active) return;
        const config = active.config as Record<string, unknown> | null;
        const result = active.result as Record<string, unknown> | null;
        if (!config) return;
        const totalTiles = config.total_tiles as number;
        const mineCount = config.mine_count as number;
        const revealedIndices = (config.revealed_indices ?? []) as number[];
        const sessionId = active.id;
        const pfId = (config.pf_id ?? active.id) as string;

        setActiveGame({
          sessionId,
          serverSeedHash: active.server_seed_hash,
          clientSeed: active.client_seed,
          nonce: active.nonce,
          mineCount,
          totalTiles,
          pfId,
        });
        setMineCount(mineCount);
        setRevealedIndices(revealedIndices);
        setPhase('active');
        setTiles((prev) => {
          const next = Array(totalTiles).fill('hidden');
          for (const idx of revealedIndices) {
            if (idx >= 0 && idx < totalTiles) next[idx] = 'safe';
          }
          return next;
        });
        if (result && result.multiplier) setCurrentMultiplier(result.multiplier as number);
        if (result && result.payout) setCurrentPayout(result.payout as number);
      } catch {
        // ignore
      }
    })();
    return () => { mounted = false; };
  }, []);

  // Reset tiles when board size changes
  useEffect(() => {
    if (phase === 'idle') {
      setTiles(Array(boardSize.totalTiles).fill('hidden'));
    }
  }, [boardSizeIdx, phase, boardSize.totalTiles]);

  // Clamp mine count when board changes
  useEffect(() => {
    const range = getMineCountRange(boardSize.totalTiles);
    if (mineCount < range.min) setMineCount(range.min);
    if (mineCount > range.max) setMineCount(range.max);
  }, [boardSize.totalTiles, mineCount]);

  // Compute display multiplier and payout in idle (preview) state
  const previewMultiplier = revealedIndices.length > 0
    ? currentMultiplier
    : getNextMultiplier(0, boardSize.totalTiles, safeMineCount, rtp);
  const nextMultiplier = getNextMultiplier(revealedIndices.length, boardSize.totalTiles, safeMineCount, rtp);

  const handleStart = useCallback(async () => {
    if (!user || loading) return;
    if (betAmount < minBet) { toast.error(`Minimum bet is ${formatCoins(minBet)}`); return; }
    if (!wallet || wallet.balance < betAmount) { toast.error('Insufficient balance'); return; }

    setLoading(true);
    try {
      const result = await startMinesGame(user.id, betAmount, safeMineCount, boardSize.totalTiles);
      setActiveGame({
        sessionId: result.session_id,
        serverSeedHash: result.server_seed_hash,
        clientSeed: result.client_seed,
        nonce: result.nonce,
        mineCount: result.mine_count,
        totalTiles: result.total_tiles,
        pfId: result.pf_id,
      });
      setPhase('active');
      setTiles(Array(boardSize.totalTiles).fill('hidden'));
      setRevealedIndices([]);
      setCurrentMultiplier(1);
      setCurrentPayout(betAmount);
      setFinalResult(null);
      refreshWallet();
      setTimeout(() => focusRef.current?.focus(), 100);
    } catch (err) {
      toast.error(err instanceof Error ? err.message.replace(/_/g, ' ') : 'Failed to start game');
    } finally {
      setLoading(false);
    }
  }, [user, loading, betAmount, minBet, wallet, safeMineCount, boardSize.totalTiles, refreshWallet]);

  const handleReveal = useCallback(async (tileIdx: number) => {
    if (!user || !activeGame || phase !== 'active' || loading) return;
    if (tiles[tileIdx] !== 'hidden') return;

    setAnimating((s) => new Set(s).add(tileIdx));
    setLoading(true);

    try {
      const result = await revealMinesTile(user.id, activeGame.sessionId, tileIdx);

      if (result.is_mine) {
        // Reveal all mines
        setTiles((prev) => {
          const next = [...prev];
          next[tileIdx] = 'mine';
          if (result.mine_indices) {
            for (const mi of result.mine_indices) {
              if (next[mi] === 'hidden') next[mi] = 'mine-revealed';
            }
          }
          return next;
        });
        setPhase('lost');
        setCurrentMultiplier(0);
        setCurrentPayout(0);
        setFinalResult({
          payout: 0,
          profit: -betAmount,
          multiplier: 0,
          serverSeed: result.server_seed ?? '',
          mineIndices: result.mine_indices ? Array.from(result.mine_indices as unknown as number[]) : [],
        });
        refreshWallet();
        refreshHistory();
      } else {
        const newRevealed = [...revealedIndices, tileIdx];
        setRevealedIndices(newRevealed);
        setTiles((prev) => {
          const next = [...prev];
          next[tileIdx] = 'safe';
          return next;
        });
        setCurrentMultiplier(result.multiplier);
        setCurrentPayout(result.payout);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message.replace(/_/g, ' ') : 'Failed to reveal tile');
    } finally {
      setLoading(false);
      setTimeout(() => setAnimating((s) => { const n = new Set(s); n.delete(tileIdx); return n; }), 400);
    }
  }, [user, activeGame, phase, loading, tiles, betAmount, revealedIndices, refreshWallet, refreshHistory]);

  const handleCashout = useCallback(async () => {
    if (!user || !activeGame || phase !== 'active' || loading) return;
    if (revealedIndices.length === 0) { toast.error('Reveal at least one tile first'); return; }

    setLoading(true);
    try {
      const result = await cashoutMinesGame(user.id, activeGame.sessionId);
      setPhase('won');
      setFinalResult({
        payout: result.payout,
        profit: result.profit,
        multiplier: result.multiplier,
        serverSeed: result.server_seed,
        mineIndices: result.mine_indices as unknown as number[],
      });
      setTiles((prev) => {
        const next = [...prev];
        for (const mi of result.mine_indices as unknown as number[]) {
          if (next[mi] === 'hidden') next[mi] = 'mine-revealed';
        }
        return next;
      });
      refreshWallet();
      refreshHistory();
      toast.success(`Cashed out ${formatCoins(result.payout)}!`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message.replace(/_/g, ' ') : 'Failed to cash out');
    } finally {
      setLoading(false);
    }
  }, [user, activeGame, phase, loading, revealedIndices, refreshWallet, refreshHistory]);

  const handleReset = () => {
    setPhase('idle');
    setTiles(Array(boardSize.totalTiles).fill('hidden'));
    setActiveGame(null);
    setRevealedIndices([]);
    setCurrentMultiplier(1);
    setCurrentPayout(betAmount);
    setFinalResult(null);
  };

  // Keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent, idx: number) => {
    const { cols } = boardSize;
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleReveal(idx); }
    if (e.key === 'ArrowRight') { e.preventDefault(); (document.querySelector(`[data-tile="${idx + 1}"]`) as HTMLElement)?.focus(); }
    if (e.key === 'ArrowLeft')  { e.preventDefault(); (document.querySelector(`[data-tile="${idx - 1}"]`) as HTMLElement)?.focus(); }
    if (e.key === 'ArrowDown')  { e.preventDefault(); (document.querySelector(`[data-tile="${idx + cols}"]`) as HTMLElement)?.focus(); }
    if (e.key === 'ArrowUp')    { e.preventDefault(); (document.querySelector(`[data-tile="${idx - cols}"]`) as HTMLElement)?.focus(); }
    if (e.key === 'c' || e.key === 'C') { e.preventDefault(); handleCashout(); }
  }, [boardSize, handleReveal, handleCashout]);

  const pfData = activeGame || finalResult ? {
    roundId: activeGame?.sessionId ?? sessions[0]?.id ?? '',
    clientSeed: activeGame?.clientSeed ?? '',
    serverSeedHash: activeGame?.serverSeedHash ?? '',
    serverSeed: (phase === 'won' || phase === 'lost') ? (finalResult?.serverSeed ?? null) : null,
    nonce: activeGame?.nonce ?? 0,
    gameType: 'Mines',
  } : null;

  const displayBet = isNaN(parseFloat(betInput)) ? 0 : parseFloat(betInput);
  const totalEarnings = phase === 'won' ? finalResult?.payout ?? 0 : currentPayout;

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 animate-fade-in">
      <div className="flex flex-1 flex-col gap-4 overflow-hidden lg:flex-row">
        {/* ── LEFT CONTROL PANEL ──────────────────────────────────────────────── */}
        <div className="flex w-full flex-col gap-3 lg:w-[280px] lg:shrink-0">
          {/* Tab bar */}
          <div className="flex h-9 items-center gap-0 rounded border border-border/60 bg-surface-1 p-1">
            <button className="flex-1 rounded bg-background py-1 text-[13px] font-semibold">Manual</button>
            <button className="flex-1 rounded py-1 text-[13px] text-muted-foreground opacity-50 cursor-not-allowed" disabled>Auto</button>
          </div>

          {/* Bet amount */}
          <div className="space-y-1.5">
            <label className="text-[11px] uppercase tracking-wide text-muted-foreground">Bet Amount</label>
            <div className="flex items-center gap-1.5">
              <div className="relative flex-1">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[13px] font-bold text-gold">$</span>
                <input
                  type="number"
                  value={betInput}
                  onChange={(e) => setBetInput(e.target.value)}
                  disabled={phase === 'active'}
                  min={minBet}
                  max={maxBet}
                  step="0.01"
                  className="h-9 w-full rounded border border-border/60 bg-surface-2 pl-7 pr-2 text-[13px] font-mono font-semibold focus:border-primary/50 focus:outline-none disabled:opacity-50"
                />
              </div>
              <button
                onClick={() => setBetInput((prev) => (parseFloat(prev) / 2).toFixed(2))}
                disabled={phase === 'active'}
                className="h-9 rounded border border-border/60 bg-surface-2 px-2.5 text-[12px] font-semibold text-muted-foreground hover:border-primary/40 disabled:opacity-40"
              >
                1/2
              </button>
              <button
                onClick={() => setBetInput((prev) => (parseFloat(prev) * 2).toFixed(2))}
                disabled={phase === 'active'}
                className="h-9 rounded border border-border/60 bg-surface-2 px-2.5 text-[12px] font-semibold text-muted-foreground hover:border-primary/40 disabled:opacity-40"
              >
                2x
              </button>
            </div>
          </div>

          {/* Mine count */}
          <div className="space-y-1.5">
            <label className="text-[11px] uppercase tracking-wide text-muted-foreground">Mines</label>
            <div className="flex items-center gap-1.5">
              <div className="flex h-9 w-14 items-center justify-center rounded border border-border/60 bg-surface-2 text-[14px] font-bold">
                {safeMineCount}
              </div>
              <div className="flex flex-1 flex-wrap gap-1">
                {QUICK_MINE_COUNTS.filter((n) => n >= mineRange.min && n <= mineRange.max).map((n) => (
                  <button
                    key={n}
                    onClick={() => setMineCount(n)}
                    disabled={phase === 'active'}
                    className={cn(
                      'h-9 min-w-[36px] flex-1 rounded border px-1 text-[12px] font-semibold transition-colors disabled:opacity-40',
                      safeMineCount === n
                        ? 'border-primary/60 bg-primary/15 text-primary'
                        : 'border-border/60 bg-surface-2 text-muted-foreground hover:border-primary/30'
                    )}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
            {/* Custom slider */}
            <input
              type="range"
              min={mineRange.min}
              max={mineRange.max}
              value={safeMineCount}
              onChange={(e) => setMineCount(parseInt(e.target.value))}
              disabled={phase === 'active'}
              className="mines-slider w-full disabled:opacity-40"
            />
          </div>

          {/* Grid size */}
          <div className="space-y-1.5">
            <label className="text-[11px] uppercase tracking-wide text-muted-foreground">Grid Size</label>
            <div className="relative flex items-center gap-1">
              <input
                type="range"
                min={0}
                max={BOARD_SIZES.length - 1}
                value={boardSizeIdx}
                onChange={(e) => setBoardSizeIdx(parseInt(e.target.value))}
                disabled={phase === 'active'}
                className="mines-slider w-full disabled:opacity-40"
                step={1}
              />
            </div>
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>2x2</span>
              <span className="font-semibold text-foreground">{boardSize.label}</span>
              <span>10x10</span>
            </div>
          </div>

          {/* Total earnings */}
          <div className="space-y-1.5">
            <label className="text-[11px] uppercase tracking-wide text-muted-foreground">
              {phase === 'active' ? `Total Earnings · ${currentMultiplier.toFixed(4)}x` : 'Total Earnings'}
            </label>
            <div className={cn(
              'flex h-9 items-center gap-2 rounded border px-3',
              phase === 'won' ? 'border-success/40 bg-success/10' : 'border-border/60 bg-surface-2'
            )}>
              <span className="text-[13px] font-bold text-gold">$</span>
              <span className={cn('font-mono text-[14px] font-bold', phase === 'won' ? 'text-success' : 'text-foreground')}>
                {totalEarnings > 0 ? formatCoins(totalEarnings) : '—'}
              </span>
            </div>
          </div>

          {/* Next-tile multiplier (only during active game) */}
          {phase === 'active' && (
            <div className="flex items-center justify-between rounded border border-border/60 bg-surface-2 px-3 py-2">
              <span className="text-[11px] text-muted-foreground">Next tile</span>
              <span className="font-mono text-[13px] font-bold text-primary">{nextMultiplier.toFixed(4)}x</span>
            </div>
          )}

          <div className="flex-1" />

          {/* Action button */}
          {(phase === 'idle' || phase === 'won' || phase === 'lost') ? (
            <button
              onClick={phase === 'idle' ? handleStart : handleReset}
              disabled={loading}
              className={cn(
                'flex h-11 w-full items-center justify-center rounded text-[14px] font-bold transition-all',
                phase === 'won'
                  ? 'bg-success hover:bg-success/90 text-white'
                  : phase === 'lost'
                    ? 'bg-destructive hover:bg-destructive/90 text-white'
                    : 'bg-primary hover:bg-primary/90 text-primary-foreground',
                loading && 'animate-pulse opacity-70'
              )}
            >
              {loading ? 'Starting…' : phase === 'won' ? 'New Game' : phase === 'lost' ? 'Try Again' : 'Start new game'}
            </button>
          ) : (
            <div className="space-y-2">
              <button
                onClick={handleCashout}
                disabled={loading || revealedIndices.length === 0}
                className={cn(
                  'flex h-11 w-full items-center justify-center rounded text-[14px] font-bold transition-all',
                  revealedIndices.length > 0
                    ? 'bg-gold hover:bg-gold/90 text-black'
                    : 'cursor-not-allowed bg-surface-3 text-muted-foreground',
                  loading && 'animate-pulse opacity-70'
                )}
              >
                {loading ? 'Processing…' : `Cash Out ${formatCoins(currentPayout)}`}
              </button>
            </div>
          )}

          {/* Provably fair panel */}
          {pfData && <ProvablyFairPanel data={pfData} />}
        </div>

        {/* ── RIGHT BOARD ─────────────────────────────────────────────────────── */}
        <div className="relative flex flex-1 flex-col rounded border border-border/60 bg-surface-1">
          {/* Board header */}
          <div className="flex items-center justify-between border-b border-border/60 px-3 py-2">
            <span className="text-[12px] font-semibold text-muted-foreground">{boardSize.label}</span>
            <div className="flex items-center gap-1.5">
              {phase === 'active' && (
                <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Bomb className="h-3 w-3 text-destructive" />
                  {safeMineCount} mines
                </span>
              )}
              <button
                onClick={() => setShowHelp(!showHelp)}
                className="flex h-6 w-6 items-center justify-center rounded bg-surface-2 text-muted-foreground hover:text-foreground"
              >
                <HelpCircle className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Help overlay */}
          {showHelp && (
            <div className="absolute inset-0 z-10 flex items-center justify-center rounded bg-background/80 backdrop-blur-sm">
              <div className="max-w-xs rounded border border-border/60 bg-surface-1 p-4 text-[13px] space-y-2">
                <p className="font-semibold">How to play</p>
                <p className="text-muted-foreground">Click tiles to reveal gems. Avoid mines. Cash out before hitting one.</p>
                <p className="text-muted-foreground">Keyboard: Arrow keys to navigate · Enter/Space to reveal · C to cash out</p>
                <button onClick={() => setShowHelp(false)} className="mt-1 text-[12px] text-primary hover:underline">Close</button>
              </div>
            </div>
          )}

          {/* Grid */}
          <div
            className="flex flex-1 items-center justify-center p-3"
            ref={focusRef}
          >
            <div
              className="grid w-full gap-1.5"
              style={{
                gridTemplateColumns: `repeat(${boardSize.cols}, 1fr)`,
                maxWidth: boardSize.cols <= 5 ? '440px' : '700px',
              }}
            >
              {Array.from({ length: boardSize.totalTiles }).map((_, idx) => {
                const state = tiles[idx] ?? 'hidden';
                const isAnimatingTile = animating.has(idx);
                const isClickable = phase === 'active' && state === 'hidden' && !loading;

                return (
                  <button
                    key={idx}
                    data-tile={idx}
                    onClick={() => handleReveal(idx)}
                    onKeyDown={(e) => handleKeyDown(e, idx)}
                    disabled={!isClickable}
                    tabIndex={phase === 'active' && state === 'hidden' ? 0 : -1}
                    aria-label={`Tile ${idx + 1}: ${state}`}
                    className={cn(
                      'relative flex items-center justify-center rounded transition-all duration-200 select-none',
                      boardSize.cols <= 5 ? 'aspect-square' : 'aspect-square',
                      // Base styles
                      state === 'hidden' && 'bg-surface-2 border border-border/60',
                      state === 'hidden' && isClickable && 'cursor-pointer hover:bg-surface-3 hover:border-primary/40 hover:scale-105 active:scale-95',
                      state === 'hidden' && !isClickable && phase === 'idle' && 'opacity-80',
                      state === 'safe' && 'bg-emerald-500/15 border border-emerald-500/30 cursor-default',
                      state === 'mine' && 'bg-destructive/20 border border-destructive/50 cursor-default',
                      state === 'mine-revealed' && 'bg-destructive/10 border border-destructive/30 cursor-default',
                      isAnimatingTile && 'scale-90',
                    )}
                  >
                    {state === 'hidden' && (
                      <div className="flex h-8 w-8 items-center justify-center opacity-30 md:h-10 md:w-10">
                        <RingIcon className="h-full w-full" />
                      </div>
                    )}
                    {state === 'safe' && (
                      <Gem className={cn(
                        'text-emerald-400 transition-all',
                        boardSize.cols <= 5 ? 'h-7 w-7' : 'h-4 w-4',
                        'animate-pop'
                      )} />
                    )}
                    {(state === 'mine' || state === 'mine-revealed') && (
                      <Bomb className={cn(
                        state === 'mine' ? 'text-destructive' : 'text-destructive/60',
                        boardSize.cols <= 5 ? 'h-7 w-7' : 'h-4 w-4',
                        state === 'mine' && 'animate-pop'
                      )} />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Win/Loss overlay message */}
          {(phase === 'won' || phase === 'lost') && finalResult && (
            <div className={cn(
              'absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-2 rounded border px-4 py-2 text-[14px] font-bold shadow-lg backdrop-blur-sm',
              phase === 'won' ? 'border-success/40 bg-success/15 text-success' : 'border-destructive/40 bg-destructive/15 text-destructive'
            )}>
              {phase === 'won' ? (
                <><Gem className="h-4 w-4" /> Cashed out +{formatCoins(finalResult.profit)}</>
              ) : (
                <><Bomb className="h-4 w-4" /> Hit a mine — lost {formatCoins(Math.abs(finalResult.profit))}</>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Recent games strip */}
      {sessions.length > 0 && (
        <div className="space-y-1.5">
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Recent Games</h3>
          <div className="rounded border border-border/60 bg-surface-1">
            {sessions.slice(0, 5).map((s) => {
              const won = (s.profit ?? 0) > 0;
              const res = s.result as Record<string, unknown> | null;
              return (
                <div key={s.id} className="flex items-center gap-3 border-b border-border/40 px-3 py-1.5 text-[12px] last:border-0">
                  <span className={cn('flex h-5 w-5 items-center justify-center rounded', won ? 'bg-success/15 text-success' : 'bg-destructive/15 text-destructive')}>
                    {won ? <Gem className="h-3 w-3" /> : <Bomb className="h-3 w-3" />}
                  </span>
                  <span className="font-mono text-muted-foreground">{formatCoins(s.bet_amount ?? 0)}</span>
                  <span className="text-muted-foreground">×</span>
                  <span className="font-mono">{((res?.multiplier as number) ?? 0).toFixed(4)}x</span>
                  <span className={cn('ml-auto font-mono font-semibold', won ? 'text-success' : 'text-destructive')}>
                    {won ? '+' : ''}{formatCoins(s.profit ?? 0)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// Minimal ring/planet icon matching the reference art style
function RingIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" fill="none" className={className} aria-hidden>
      <circle cx="20" cy="20" r="9" fill="currentColor" opacity="0.4" />
      <ellipse cx="20" cy="20" rx="17" ry="5" stroke="currentColor" strokeWidth="2.5" opacity="0.5" />
      <circle cx="20" cy="20" r="9" stroke="currentColor" strokeWidth="2" opacity="0.6" />
    </svg>
  );
}
