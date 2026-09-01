import { useState, useEffect, useCallback } from 'react';
import { TowerControl, Gem, Skull, ChevronUp } from 'lucide-react';
import { useAuth } from '@/authentication/auth-context';
import { useWallet } from '@/wallet/wallet-context';
import { getGameConfig } from '@/game-engine/game-config-service';
import { startTowersGame, pickTowersTile, cashoutTowersGame, type TowersStartResult, type TowersPickResult } from '@/game-engine/game-service';
import { ProvablyFairPanel, type ProvablyFairData } from '@/game-engine/provably-fair-panel';
import { useGameHistory } from '@/game-engine/use-game-history';
import { cn, formatMD, dollarsToCents, centsToDollars } from '@/lib/utils';
import { toast } from 'sonner';

type Difficulty = 'easy' | 'normal' | 'hard';
type GameState = 'idle' | 'playing' | 'settling' | 'complete';
const DIFFICULTY_COLS: Record<Difficulty, number> = { easy: 3, normal: 2, hard: 3 };

export function TowersPage() {
  const { user } = useAuth();
  const { wallet, refresh: refreshWallet } = useWallet();
  const { sessions, refresh: refreshHistory } = useGameHistory('towers', 20);

  const [minBet, setMinBet] = useState(10);
  const [maxBet, setMaxBet] = useState(1000000000);
  const [betInput, setBetInput] = useState('1.00');
  const [difficulty, setDifficulty] = useState<Difficulty>('normal');
  const [busy, setBusy] = useState(false);
  const [gameState, setGameState] = useState<GameState>('idle');
  const [session, setSession] = useState<TowersStartResult | null>(null);
  const [level, setLevel] = useState(0);
  const [multiplier, setMultiplier] = useState(0);
  const [revealedBombs, setRevealedBombs] = useState<number[][] | null>(null);
  const [pickedCols, setPickedCols] = useState<number[]>([]);
  const [busted, setBusted] = useState(false);
  const [pfData, setPfData] = useState<ProvablyFairData | null>(null);

  const betAmount = Math.max(minBet, Math.min(maxBet, dollarsToCents(parseFloat(betInput) || 0)));
  const cols = session ? session.columns : DIFFICULTY_COLS[difficulty];
  const mults = session ? session.multipliers : [];
  const currentPayout = level > 0 ? Math.round(betAmount * multiplier) : 0;

  useEffect(() => {
    getGameConfig('towers').then((cfg) => { if (cfg) { setMinBet(cfg.min_bet); setMaxBet(cfg.max_bet); } });
  }, []);

  const handleStart = useCallback(async () => {
    if (busy || !user) return;
    if (!wallet || wallet.balance < betAmount) { toast.error('Insufficient balance'); return; }
    setBusy(true); setPfData(null);
    try {
      const res = await startTowersGame(betAmount, difficulty);
      setSession(res); setLevel(0); setMultiplier(0);
      setRevealedBombs(null); setPickedCols([]); setBusted(false);
      setGameState('playing'); refreshWallet();
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Failed to start'); }
    finally { setBusy(false); }
  }, [busy, user, wallet, betAmount, difficulty, refreshWallet]);

  const handlePick = useCallback(async (col: number) => {
    if (!session || busy || gameState !== 'playing') return;
    setBusy(true); setGameState('settling');
    try {
      const res = await pickTowersTile(session.session_id, col);
      setPickedCols((prev) => [...prev, col]);
      if (res.busted) {
        setBusted(true); setRevealedBombs(res.bombs ?? null);
        if (res.server_seed) setPfData({ roundId: session.session_id, clientSeed: session.client_seed, serverSeed: res.server_seed, serverSeedHash: session.server_seed_hash, nonce: session.nonce, gameType: 'Towers' });
        setGameState('complete'); refreshWallet(); refreshHistory();
        toast.error(`Bust! You lost ${formatMD(betAmount)}`);
      } else if (res.completed) {
        setLevel(res.level); setMultiplier(res.multiplier ?? 0);
        setRevealedBombs(res.bombs ?? null);
        if (res.server_seed) setPfData({ roundId: session.session_id, clientSeed: session.client_seed, serverSeed: res.server_seed, serverSeedHash: session.server_seed_hash, nonce: session.nonce, gameType: 'Towers' });
        setGameState('complete'); refreshWallet(); refreshHistory();
        toast.success(`Max level! You won ${formatMD(res.payout ?? 0)}`);
      } else {
        setLevel(res.level); setMultiplier(res.multiplier ?? 0); setGameState('playing');
      }
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Pick failed'); setGameState('playing'); }
    finally { setBusy(false); }
  }, [session, busy, gameState, betAmount, refreshWallet, refreshHistory]);

  const handleCashout = useCallback(async () => {
    if (!session || busy || gameState !== 'playing' || level < 1) return;
    setBusy(true); setGameState('settling');
    try {
      const res = await cashoutTowersGame(session.session_id);
      setRevealedBombs(res.bombs ?? null);
      if (res.server_seed) setPfData({ roundId: session.session_id, clientSeed: session.client_seed, serverSeed: res.server_seed, serverSeedHash: session.server_seed_hash, nonce: session.nonce, gameType: 'Towers' });
      setGameState('complete'); refreshWallet(); refreshHistory();
      toast.success(`Cashed out ${formatMD(res.payout ?? 0)}`);
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Cash out failed'); setGameState('playing'); }
    finally { setBusy(false); }
  }, [session, busy, gameState, level, refreshWallet, refreshHistory]);

  const handleNewGame = useCallback(() => {
    setSession(null); setLevel(0); setMultiplier(0);
    setRevealedBombs(null); setPickedCols([]); setBusted(false);
    setPfData(null); setGameState('idle');
  }, []);

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 animate-fade-in">
      <div className="flex flex-1 flex-col gap-4 overflow-hidden lg:flex-row">
        <div className="flex w-full flex-col gap-3 lg:w-[260px] lg:shrink-0">
          <div className="flex h-9 items-center gap-0 rounded border border-border/60 bg-surface-1 p-1">
            <button className="flex-1 rounded bg-background py-1 text-[13px] font-semibold">Manual</button>
            <button className="flex-1 rounded py-1 text-[13px] text-muted-foreground opacity-50 cursor-not-allowed" disabled>Auto</button>
          </div>

          {gameState === 'idle' && (
            <>
              <div className="space-y-1.5">
                <label className="text-[11px] uppercase tracking-wide text-muted-foreground">Bet Amount</label>
                <div className="flex items-center gap-1.5">
                  <div className="relative flex-1">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[13px] font-bold text-gold">$</span>
                    <input type="number" value={betInput} onChange={(e) => setBetInput(e.target.value)} disabled={busy}
                      min={centsToDollars(minBet)} max={centsToDollars(maxBet)} step="0.01"
                      className="h-9 w-full rounded border border-border/60 bg-surface-2 pl-7 pr-2 text-[13px] font-mono font-semibold focus:border-primary/50 focus:outline-none disabled:opacity-50" />
                  </div>
                  <button onClick={() => setBetInput((v) => (parseFloat(v) / 2 || centsToDollars(minBet)).toFixed(2))} disabled={busy}
                    className="h-9 rounded border border-border/60 bg-surface-2 px-2.5 text-[12px] font-semibold text-muted-foreground hover:border-primary/40 disabled:opacity-40">1/2</button>
                  <button onClick={() => setBetInput((v) => (parseFloat(v) * 2 || centsToDollars(minBet)).toFixed(2))} disabled={busy}
                    className="h-9 rounded border border-border/60 bg-surface-2 px-2.5 text-[12px] font-semibold text-muted-foreground hover:border-primary/40 disabled:opacity-40">2x</button>
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-[11px] uppercase tracking-wide text-muted-foreground">Difficulty</label>
                <div className="grid grid-cols-3 gap-1.5">
                  {(['easy', 'normal', 'hard'] as Difficulty[]).map((d) => (
                    <button key={d} onClick={() => setDifficulty(d)} disabled={busy}
                      className={cn('h-10 rounded border text-[12px] font-bold capitalize transition-all',
                        difficulty === d ? 'border-primary/60 bg-primary/15 text-primary' : 'border-border/60 bg-surface-2 text-muted-foreground hover:border-primary/30 disabled:opacity-40')}>{d}</button>
                  ))}
                </div>
              </div>
            </>
          )}

          {gameState !== 'idle' && (
            <div className="space-y-2 rounded border border-border/60 bg-surface-1 px-3 py-2.5">
              <div className="flex items-center justify-between text-[12px]"><span className="text-muted-foreground">Bet</span><span className="font-mono font-bold">{formatMD(betAmount)}</span></div>
              <div className="flex items-center justify-between text-[12px]"><span className="text-muted-foreground">Level</span><span className="font-mono font-bold">{level} / 8</span></div>
              <div className="flex items-center justify-between text-[12px]"><span className="text-muted-foreground">Multiplier</span><span className="font-mono font-bold text-gold">{multiplier}x</span></div>
              <div className="flex items-center justify-between text-[12px]"><span className="text-muted-foreground">Payout</span><span className="font-mono font-bold text-success">{formatMD(currentPayout)}</span></div>
            </div>
          )}

          <div className="flex-1" />

          {gameState === 'idle' ? (
            <button onClick={handleStart} disabled={busy}
              className={cn('flex h-11 w-full items-center justify-center gap-2 rounded bg-primary text-[14px] font-bold text-primary-foreground transition-all hover:bg-primary/90', busy && 'opacity-70 animate-pulse')}>
              <TowerControl className="h-4 w-4" />{busy ? 'Starting…' : 'Start Game'}
            </button>
          ) : gameState === 'playing' ? (
            <button onClick={handleCashout} disabled={busy || level < 1}
              className="flex h-11 w-full items-center justify-center gap-2 rounded bg-success text-[14px] font-bold text-success-foreground transition-all hover:bg-success/90 disabled:opacity-50">
              <ChevronUp className="h-4 w-4" />Cash Out {level > 0 && `(${formatMD(currentPayout)})`}
            </button>
          ) : (
            <button onClick={handleNewGame} className="flex h-11 w-full items-center justify-center gap-2 rounded bg-primary text-[14px] font-bold text-primary-foreground transition-all hover:bg-primary/90">
              <TowerControl className="h-4 w-4" />New Game
            </button>
          )}

          {pfData && <ProvablyFairPanel data={pfData} />}
        </div>

        {/* Tower board */}
        <div className="relative flex flex-1 flex-col items-center justify-center gap-2 overflow-y-auto rounded border border-border/60 bg-gradient-to-b from-violet-950/20 to-surface-1 p-4 scrollbar-thin">
          <div className="flex flex-col-reverse gap-2">
            {Array.from({ length: 8 }, (_, rowIdx) => {
              const isPast = rowIdx < level;
              const isCurrent = rowIdx === level && gameState === 'playing';
              const picked = pickedCols[rowIdx];
              const bombs = revealedBombs ? revealedBombs[rowIdx] : null;
              return (
                <div key={rowIdx} className="flex gap-2">
                  {Array.from({ length: cols }, (_, colIdx) => {
                    const isPicked = picked === colIdx;
                    const isBomb = bombs ? bombs.includes(colIdx) : false;
                    const isSafe = isPicked && !isBomb;
                    return (
                      <button key={colIdx} onClick={() => isCurrent && handlePick(colIdx)} disabled={!isCurrent || busy}
                        className={cn(
                          'group relative flex h-14 w-20 items-center justify-center rounded-lg border transition-all duration-300',
                          'shadow-md',
                          isCurrent && 'border-primary/40 bg-surface-2 hover:border-primary/60 hover:bg-primary/10 cursor-pointer hover:scale-[1.03]',
                          !isCurrent && !isPast && 'border-border/40 bg-surface-2/30 opacity-40',
                          isPast && !isPicked && 'border-border/40 bg-surface-2/50 opacity-60',
                          isSafe && 'border-success/50 bg-success/10 shadow-success/20',
                          isBomb && isPicked && 'border-destructive/50 bg-destructive/15 shadow-destructive/20',
                          isBomb && !isPicked && revealedBombs && 'border-destructive/30 bg-destructive/5 opacity-50',
                        )}>
                        {isSafe && <Gem className="h-6 w-6 text-success drop-shadow" />}
                        {isBomb && <Skull className={cn('h-6 w-6', isPicked ? 'text-destructive drop-shadow' : 'text-destructive/50')} />}
                        {isCurrent && !isPicked && <span className="text-[20px] font-bold text-muted-foreground/40 group-hover:text-primary/60">?</span>}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>

          {/* Multiplier trail */}
          <div className="mt-3 flex items-center gap-1.5">
            {mults.map((m, i) => (
              <div key={i} className={cn(
                'flex h-7 min-w-[40px] items-center justify-center rounded border px-1 text-[11px] font-bold transition-all',
                i === level - 1 ? 'border-gold/60 bg-gold/15 text-gold scale-110' : 'border-border/40 bg-surface-2 text-muted-foreground'
              )}>{m}x</div>
            ))}
          </div>

          {gameState === 'complete' && (
            <div className={cn('mt-2 rounded-lg px-4 py-1.5 text-[14px] font-bold',
              busted ? 'bg-destructive/15 text-destructive' : 'bg-success/15 text-success')}>
              {busted ? `Bust at level ${level}` : `Won ${formatMD(currentPayout)}`}
            </div>
          )}
        </div>
      </div>

      {sessions.length > 0 && (
        <div className="space-y-1.5">
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Live Feed</h3>
          <div className="rounded border border-border/60 bg-surface-1">
            <div className="grid grid-cols-[1fr_80px_80px_80px] gap-2 border-b border-border/60 px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              <span>Bet</span><span className="text-center">Diff</span><span className="text-center">Level</span><span className="text-right">Profit</span>
            </div>
            <div className="max-h-[200px] overflow-y-auto scrollbar-thin">
              {sessions.map((s) => {
                const won = (s.profit ?? 0) > 0;
                const d = (s.config as Record<string, unknown> | null)?.difficulty as string | undefined;
                const lvl = (s.result as Record<string, unknown> | null)?.level as number | undefined;
                return (
                  <div key={s.id} className="grid grid-cols-[1fr_80px_80px_80px] items-center gap-2 border-b border-border/40 px-3 py-1.5 text-[12px] last:border-0 hover:bg-surface-2">
                    <span className="font-mono">{formatMD(s.bet_amount ?? 0)}</span>
                    <span className="text-center capitalize">{d ?? '—'}</span>
                    <span className="text-center font-mono">{lvl ?? '—'}</span>
                    <span className={cn('text-right font-mono font-semibold', won ? 'text-success' : 'text-destructive')}>{won ? '+' : ''}{formatMD(s.profit ?? 0)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
