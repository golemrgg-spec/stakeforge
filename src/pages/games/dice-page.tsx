import { useState, useEffect, useCallback, useRef } from 'react';
import { Dice5, TrendingUp, TrendingDown, ChevronRight } from 'lucide-react';
import { useAuth } from '@/authentication/auth-context';
import { useWallet } from '@/wallet/wallet-context';
import { getGameConfig } from '@/game-engine/game-config-service';
import { calculateDiceMultiplier, getDiceTarget } from '@/game-engine/dice-math';
import { playDiceGame } from '@/game-engine/game-service';
import { ProvablyFairPanel, type ProvablyFairData } from '@/game-engine/provably-fair-panel';
import { useGameHistory } from '@/game-engine/use-game-history';
import { cn, formatCoins } from '@/lib/utils';
import { toast } from 'sonner';

interface RollResult {
  sessionId: string;
  rolled: number;
  target: number;
  isWin: boolean;
  multiplier: number;
  payout: number;
  profit: number;
  serverSeed: string;
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
}

const DEFAULT_WIN_CHANCE = 50;

export function DicePage() {
  const { user } = useAuth();
  const { wallet, refresh: refreshWallet } = useWallet();
  const { sessions, refresh: refreshHistory } = useGameHistory('dice', 20);

  // Config from DB
  const [rtp, setRtp] = useState(0.99);
  const [houseEdge, setHouseEdge] = useState(0.01);
  const [minBet, setMinBet] = useState(0.01);
  const [maxBet, setMaxBet] = useState(1000);
  const [minWinChance, setMinWinChance] = useState(2);
  const [maxWinChance, setMaxWinChance] = useState(98);

  // UI state
  const [betInput, setBetInput] = useState('1.00');
  const [winChance, setWinChance] = useState(DEFAULT_WIN_CHANCE);
  const [direction, setDirection] = useState<'over' | 'under'>('over');
  const [rolling, setRolling] = useState(false);
  const [lastResult, setLastResult] = useState<RollResult | null>(null);
  const [animatedValue, setAnimatedValue] = useState<number | null>(null);
  const animFrameRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Derived from engine (never hardcoded)
  const multiplier = calculateDiceMultiplier(winChance, rtp);
  const target = getDiceTarget(winChance, direction);
  const betAmount = Math.max(minBet, Math.min(maxBet, parseFloat(betInput) || 0));
  const profitDisplay = betAmount * multiplier - betAmount;

  useEffect(() => {
    getGameConfig('dice').then((cfg) => {
      if (!cfg) return;
      setRtp(cfg.rtp);
      setHouseEdge(cfg.house_edge);
      setMinBet(cfg.min_bet);
      setMaxBet(cfg.max_bet);
      const minWC = typeof cfg.custom.min_win_chance === 'number' ? cfg.custom.min_win_chance : 2;
      const maxWC = typeof cfg.custom.max_win_chance === 'number' ? cfg.custom.max_win_chance : 98;
      setMinWinChance(minWC);
      setMaxWinChance(maxWC);
    });
  }, []);

  const runAnimation = useCallback((finalValue: number) => {
    let elapsed = 0;
    const duration = 600;
    const fps = 30;
    const interval = 1000 / fps;

    const tick = () => {
      elapsed += interval;
      if (elapsed < duration - 100) {
        setAnimatedValue(Math.random() * 100);
        animFrameRef.current = setTimeout(tick, interval);
      } else {
        setAnimatedValue(finalValue);
      }
    };
    tick();
  }, []);

  const handleRoll = useCallback(async () => {
    if (!user || rolling) return;
    if (!wallet || wallet.balance < betAmount) { toast.error('Insufficient balance'); return; }
    if (betAmount < minBet) { toast.error(`Minimum bet is ${formatCoins(minBet)}`); return; }

    setRolling(true);
    setAnimatedValue(null);

    try {
      const result = await playDiceGame(user.id, betAmount, winChance, direction);

      // Animate, then reveal
      runAnimation(result.rolled);

      setTimeout(() => {
        setLastResult({
          sessionId: result.session_id,
          rolled: result.rolled,
          target: result.target,
          isWin: result.is_win,
          multiplier: result.multiplier,
          payout: result.payout,
          profit: result.profit,
          serverSeed: result.server_seed,
          serverSeedHash: result.server_seed_hash,
          clientSeed: result.client_seed,
          nonce: result.nonce,
        });
        refreshWallet();
        refreshHistory();
      }, 650);
    } catch (err) {
      toast.error(err instanceof Error ? err.message.replace(/_/g, ' ') : 'Roll failed');
    } finally {
      setTimeout(() => setRolling(false), 700);
    }
  }, [user, rolling, wallet, betAmount, minBet, winChance, direction, runAnimation, refreshWallet, refreshHistory]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !rolling) handleRoll();
    if (e.key === 'ArrowLeft') setWinChance((w) => Math.max(minWinChance, w - 1));
    if (e.key === 'ArrowRight') setWinChance((w) => Math.min(maxWinChance, w + 1));
  }, [rolling, handleRoll, minWinChance, maxWinChance]);

  const displayValue = animatedValue ?? lastResult?.rolled;

  const pfData: ProvablyFairData | null = lastResult ? {
    roundId: lastResult.sessionId,
    clientSeed: lastResult.clientSeed,
    serverSeed: lastResult.serverSeed,
    serverSeedHash: lastResult.serverSeedHash,
    nonce: lastResult.nonce,
    gameType: 'Dice',
  } : null;

  // Compute the position of the target line on the slider (0-100%)
  const targetPct = target;
  // Win zone: if 'over', right of target is green; if 'under', left is green
  const loseColor = '#ef4444';
  const winColor = '#f59e0b';

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 animate-fade-in" onKeyDown={handleKeyDown} tabIndex={0}>
      <div className="flex flex-1 flex-col gap-4 overflow-hidden lg:flex-row">
        {/* ── LEFT PANEL ───────────────────────────────────────────────────────── */}
        <div className="flex w-full flex-col gap-3 lg:w-[280px] lg:shrink-0">
          {/* Tab */}
          <div className="flex h-9 items-center gap-0 rounded border border-border/60 bg-surface-1 p-1">
            <button className="flex-1 rounded bg-background py-1 text-[13px] font-semibold">Manual</button>
            <button className="flex-1 rounded py-1 text-[13px] text-muted-foreground opacity-50 cursor-not-allowed" disabled>Auto</button>
          </div>

          {/* Bet amount */}
          <div className="space-y-1.5">
            <label className="text-[11px] uppercase tracking-wide text-muted-foreground">Bet Amount</label>
            <div className="flex items-center gap-1.5">
              <div className="relative flex-1">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[13px] font-bold text-gold">RC</span>
                <input
                  type="number"
                  value={betInput}
                  onChange={(e) => setBetInput(e.target.value)}
                  disabled={rolling}
                  min={minBet}
                  max={maxBet}
                  step="0.01"
                  className="h-9 w-full rounded border border-border/60 bg-surface-2 pl-7 pr-2 text-[13px] font-mono font-semibold focus:border-primary/50 focus:outline-none disabled:opacity-50"
                />
              </div>
              <button
                onClick={() => setBetInput((v) => (parseFloat(v) / 2).toFixed(2))}
                disabled={rolling}
                className="h-9 rounded border border-border/60 bg-surface-2 px-2.5 text-[12px] font-semibold text-muted-foreground hover:border-primary/40 disabled:opacity-40"
              >
                1/2
              </button>
              <button
                onClick={() => setBetInput((v) => (parseFloat(v) * 2).toFixed(2))}
                disabled={rolling}
                className="h-9 rounded border border-border/60 bg-surface-2 px-2.5 text-[12px] font-semibold text-muted-foreground hover:border-primary/40 disabled:opacity-40"
              >
                2x
              </button>
            </div>
          </div>

          {/* Total profit */}
          <div className="space-y-1.5">
            <label className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Total Profit{' '}
              <span className="font-mono text-foreground">{multiplier.toFixed(4)}x</span>
            </label>
            <div className="flex h-9 items-center gap-2 rounded border border-border/60 bg-surface-2 px-3">
              <span className="text-[13px] font-bold text-gold">RC</span>
              <span className="font-mono text-[14px] font-bold">{formatCoins(profitDisplay)}</span>
            </div>
          </div>

          {/* Last roll result */}
          {lastResult && (
            <div className={cn(
              'flex items-center justify-between rounded border px-3 py-2',
              lastResult.isWin
                ? 'border-success/40 bg-success/10'
                : 'border-destructive/40 bg-destructive/10'
            )}>
              <div className="flex items-center gap-1.5">
                {lastResult.isWin
                  ? <TrendingUp className="h-4 w-4 text-success" />
                  : <TrendingDown className="h-4 w-4 text-destructive" />
                }
                <span className="text-[12px] font-semibold">
                  {lastResult.isWin ? 'Win' : 'Loss'}
                </span>
              </div>
              <span className={cn(
                'font-mono text-[13px] font-bold',
                lastResult.isWin ? 'text-success' : 'text-destructive'
              )}>
                {lastResult.isWin ? '+' : ''}{formatCoins(lastResult.profit)}
              </span>
            </div>
          )}

          <div className="flex-1" />

          {/* Place bet */}
          <button
            onClick={handleRoll}
            disabled={rolling}
            className={cn(
              'flex h-11 w-full items-center justify-center gap-2 rounded text-[14px] font-bold transition-all',
              'bg-primary hover:bg-primary/90 text-primary-foreground',
              rolling && 'animate-pulse opacity-70'
            )}
          >
            {rolling ? (
              <>Rolling…</>
            ) : (
              <><Dice5 className="h-4 w-4" /> Place bet</>
            )}
          </button>

          {/* Provably fair */}
          {pfData && <ProvablyFairPanel data={pfData} />}
        </div>

        {/* ── RIGHT PANEL ──────────────────────────────────────────────────────── */}
        <div className="flex flex-1 flex-col gap-4 rounded border border-border/60 bg-surface-1 p-4">
          {/* Roll result display */}
          <div className="flex items-center justify-center py-2">
            {displayValue !== null && displayValue !== undefined ? (
              <div className={cn(
                'flex h-16 w-32 items-center justify-center rounded border text-[32px] font-mono font-bold transition-colors duration-300',
                lastResult?.isWin
                  ? 'border-success/40 bg-success/10 text-success'
                  : lastResult && !lastResult.isWin
                    ? 'border-destructive/40 bg-destructive/10 text-destructive'
                    : 'border-border/60 bg-surface-2'
              )}>
                {(displayValue as number).toFixed(2)}
              </div>
            ) : (
              <div className="flex h-16 w-32 items-center justify-center rounded border border-border/60 bg-surface-2 text-[13px] text-muted-foreground">
                Roll to play
              </div>
            )}
          </div>

          {/* Color bar + slider */}
          <div className="space-y-3">
            {/* Gradient bar */}
            <div className="relative h-7 rounded-full overflow-hidden">
              {direction === 'over' ? (
                <>
                  <div
                    className="absolute inset-y-0 left-0 rounded-l-full"
                    style={{ width: `${targetPct}%`, background: loseColor }}
                  />
                  <div
                    className="absolute inset-y-0 right-0 rounded-r-full"
                    style={{ width: `${100 - targetPct}%`, background: winColor }}
                  />
                </>
              ) : (
                <>
                  <div
                    className="absolute inset-y-0 left-0 rounded-l-full"
                    style={{ width: `${targetPct}%`, background: winColor }}
                  />
                  <div
                    className="absolute inset-y-0 right-0 rounded-r-full"
                    style={{ width: `${100 - targetPct}%`, background: loseColor }}
                  />
                </>
              )}
              {/* Target line */}
              <div
                className="absolute inset-y-0 w-1 -translate-x-1/2 bg-white/80"
                style={{ left: `${targetPct}%` }}
              />
              {/* Rolled value marker */}
              {displayValue !== null && displayValue !== undefined && (
                <div
                  className={cn(
                    'absolute inset-y-0 w-4 -translate-x-1/2 flex items-center justify-center transition-all duration-300',
                  )}
                  style={{ left: `${displayValue}%` }}
                >
                  <div className={cn(
                    'h-7 w-4 rounded border-2 bg-white flex items-center justify-center',
                    lastResult?.isWin ? 'border-success' : 'border-destructive'
                  )}>
                    <ChevronRight className="h-3 w-3 text-background rotate-90 [writing-mode:vertical-rl]" />
                  </div>
                </div>
              )}
            </div>

            {/* Tick marks */}
            <div className="flex justify-between text-[11px] font-mono text-muted-foreground px-0.5">
              {[0, 25, 50, 75, 100].map((n) => (
                <span key={n}>{n}</span>
              ))}
            </div>

            {/* Win chance slider */}
            <div className="space-y-1">
              <input
                type="range"
                min={minWinChance}
                max={maxWinChance}
                step={0.5}
                value={winChance}
                onChange={(e) => setWinChance(parseFloat(e.target.value))}
                disabled={rolling}
                className="dice-slider w-full disabled:opacity-40"
              />
            </div>
          </div>

          {/* Three info boxes */}
          <div className="grid grid-cols-3 gap-2">
            <InfoBox
              label="Multiplier"
              value={multiplier.toFixed(4)}
              suffix="x"
              onClick={() => {}}
            />
            <InfoBox
              label={direction === 'over' ? 'Roll Over' : 'Roll Under'}
              value={target.toFixed(2)}
              clickable
              onClick={() => setDirection(direction === 'over' ? 'under' : 'over')}
              sublabel="(click to flip)"
            />
            <InfoBox
              label="Win Chance"
              value={winChance.toFixed(2)}
              suffix="%"
              onClick={() => {}}
            />
          </div>

          {/* House edge display */}
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>House edge</span>
            <span className="font-mono">{(houseEdge * 100).toFixed(2)}%</span>
          </div>
        </div>
      </div>

      {/* Live feed */}
      {sessions.length > 0 && (
        <div className="space-y-1.5">
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Live Feed</h3>
          <div className="rounded border border-border/60 bg-surface-1">
            <div className="grid grid-cols-[1fr_80px_80px_80px] gap-2 border-b border-border/60 px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              <span>Bet</span>
              <span className="text-right">Roll</span>
              <span className="text-right">Multiplier</span>
              <span className="text-right">Profit</span>
            </div>
            <div className="max-h-[240px] overflow-y-auto scrollbar-thin">
              {sessions.map((s) => {
                const res = s.result as Record<string, unknown> | null;
                const won = (s.profit ?? 0) > 0;
                return (
                  <div key={s.id} className="grid grid-cols-[1fr_80px_80px_80px] items-center gap-2 border-b border-border/40 px-3 py-1.5 text-[12px] last:border-0 hover:bg-surface-2">
                    <span className="font-mono">{formatCoins(s.bet_amount ?? 0)}</span>
                    <span className={cn('text-right font-mono', won ? 'text-success' : 'text-destructive')}>
                      {((res?.rolled as number) ?? 0).toFixed(2)}
                    </span>
                    <span className="text-right font-mono">{((res?.multiplier as number) ?? 0).toFixed(2)}x</span>
                    <span className={cn('text-right font-mono font-semibold', won ? 'text-success' : 'text-destructive')}>
                      {won ? '+' : ''}{formatCoins(s.profit ?? 0)}
                    </span>
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

function InfoBox({
  label,
  value,
  suffix,
  sublabel,
  clickable,
  onClick,
}: {
  label: string;
  value: string;
  suffix?: string;
  sublabel?: string;
  clickable?: boolean;
  onClick: () => void;
}) {
  return (
    <div className="space-y-1">
      <label className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
        {sublabel && <span className="ml-1 normal-case text-[10px] opacity-50">{sublabel}</span>}
      </label>
      <button
        onClick={onClick}
        className={cn(
          'flex h-10 w-full items-center justify-between rounded border border-border/60 bg-surface-2 px-3',
          clickable && 'hover:border-primary/40 cursor-pointer',
          !clickable && 'cursor-default'
        )}
      >
        <span className="font-mono text-[15px] font-bold">
          {value}
        </span>
        {suffix && <span className="text-[12px] text-muted-foreground">{suffix}</span>}
      </button>
    </div>
  );
}
