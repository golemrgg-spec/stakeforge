import { useState, useEffect, useCallback, useRef } from 'react';
import { Disc } from 'lucide-react';
import { useAuth } from '@/authentication/auth-context';
import { useWallet } from '@/wallet/wallet-context';
import { getGameConfig } from '@/game-engine/game-config-service';
import { playRouletteGame, type RoulettePlayResult } from '@/game-engine/game-service';
import { ProvablyFairPanel, type ProvablyFairData } from '@/game-engine/provably-fair-panel';
import { useGameHistory } from '@/game-engine/use-game-history';
import { cn, formatMD, dollarsToCents, centsToDollars } from '@/lib/utils';
import { toast } from 'sonner';

type Color = 'red' | 'purple' | 'yellow';
type GameState = 'idle' | 'spinning' | 'complete';

const COLORS: { name: Color; payout: number; label: string; bg: string; text: string; border: string }[] = [
  { name: 'red', payout: 2, label: 'Red', bg: 'bg-red-500/20', text: 'text-red-400', border: 'border-red-500/50' },
  { name: 'purple', payout: 2, label: 'Purple', bg: 'bg-purple-500/20', text: 'text-purple-400', border: 'border-purple-500/50' },
  { name: 'yellow', payout: 14, label: 'Yellow', bg: 'bg-yellow-500/20', text: 'text-yellow-400', border: 'border-yellow-500/50' },
];

const TILE_WIDTH = 56;
const VISIBLE_TILES = 15;
const STRIP_LENGTH = 200;

function randomStrip(length: number): Color[] {
  const strip: Color[] = [];
  for (let i = 0; i < length; i++) {
    const r = Math.floor(Math.random() * 100);
    if (r < 47) strip.push('red');
    else if (r < 94) strip.push('purple');
    else strip.push('yellow');
  }
  return strip;
}

function colorStyle(color: Color) { return COLORS.find((c) => c.name === color)!; }

export function RoulettePage() {
  const { user } = useAuth();
  const { wallet, refresh: refreshWallet } = useWallet();
  const { sessions, refresh: refreshHistory } = useGameHistory('roulette', 20);

  const [minBet, setMinBet] = useState(10);
  const [maxBet, setMaxBet] = useState(1000000000);
  const [betInput, setBetInput] = useState('1.00');
  const [choice, setChoice] = useState<Color>('red');
  const [busy, setBusy] = useState(false);
  const [gameState, setGameState] = useState<GameState>('idle');
  const [result, setResult] = useState<RoulettePlayResult | null>(null);
  const [pfData, setPfData] = useState<ProvablyFairData | null>(null);
  const [offset, setOffset] = useState(0);
  const [highlightColor, setHighlightColor] = useState<Color | null>(null);
  const [strip, setStrip] = useState<Color[]>(() => randomStrip(STRIP_LENGTH));
  const animRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const betAmount = Math.max(minBet, Math.min(maxBet, dollarsToCents(parseFloat(betInput) || 0)));

  useEffect(() => {
    getGameConfig('roulette').then((cfg) => { if (cfg) { setMinBet(cfg.min_bet); setMaxBet(cfg.max_bet); } });
  }, []);
  useEffect(() => () => { animRef.current.forEach(clearTimeout); }, []);

  const handleBet = useCallback(async () => {
    if (busy || !user) return;
    if (!wallet || wallet.balance < betAmount) { toast.error('Insufficient balance'); return; }
    if (betAmount < minBet) { toast.error(`Minimum bet is ${formatMD(minBet)}`); return; }

    setBusy(true); setResult(null); setPfData(null); setHighlightColor(null); setGameState('spinning');

    const newStrip = randomStrip(STRIP_LENGTH);
    setStrip(newStrip);

    try {
      const res = await playRouletteGame(betAmount, choice);
      const winningColor = res.color;

      // Find all tiles matching the winning color, far enough from start
      const candidates: number[] = [];
      const minIdx = VISIBLE_TILES + 30;
      for (let i = minIdx; i < STRIP_LENGTH; i++) {
        if (newStrip[i] === winningColor) candidates.push(i);
      }
      // Pick a random landing tile from candidates
      let landingIdx: number;
      if (candidates.length > 0) {
        landingIdx = candidates[Math.floor(Math.random() * candidates.length)];
      } else {
        landingIdx = STRIP_LENGTH - 5;
      }

      // Add a small random offset within the tile for visual variety
      const jitter = Math.floor(Math.random() * (TILE_WIDTH / 2)) - TILE_WIDTH / 4;
      const targetOffset = -(landingIdx * TILE_WIDTH) + jitter;
      const duration = 3000;
      const startTime = performance.now();

      const animate = (now: number) => {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3.5);
        setOffset(targetOffset * eased);
        if (progress < 1) requestAnimationFrame(animate);
      };
      requestAnimationFrame(animate);

      const t1 = setTimeout(() => {
        setHighlightColor(winningColor);
        setGameState('complete');
        setResult(res);
        refreshWallet(); refreshHistory();
        if (res.won) toast.success(`${winningColor.toUpperCase()} — You won ${formatMD(res.payout)}`);
        else toast.error(`${winningColor.toUpperCase()} — You lost ${formatMD(betAmount)}`);
        setPfData({ roundId: res.session_id, clientSeed: res.client_seed, serverSeed: res.server_seed, serverSeedHash: res.server_seed_hash, nonce: res.nonce, gameType: 'Roulette' });
      }, duration + 100);
      animRef.current.push(t1);

      const t2 = setTimeout(() => setBusy(false), duration + 500);
      animRef.current.push(t2);
    } catch (err) {
      setGameState('idle'); setBusy(false);
      toast.error(err instanceof Error ? err.message : 'Bet failed');
    }
  }, [busy, user, wallet, betAmount, minBet, choice, refreshWallet, refreshHistory]);

  // Render the visible portion of the strip
  const startIdx = Math.max(0, Math.floor(-offset / TILE_WIDTH) - 2);
  const endIdx = Math.min(STRIP_LENGTH, startIdx + VISIBLE_TILES + 4);
  const visibleTiles = strip.slice(startIdx, endIdx);
  const tileOffset = offset + startIdx * TILE_WIDTH;

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 animate-fade-in">
      <div className="flex flex-1 flex-col gap-4 overflow-hidden lg:flex-row">
        <div className="flex w-full flex-col gap-3 lg:w-[260px] lg:shrink-0">
          <div className="flex h-9 items-center gap-0 rounded border border-border/60 bg-surface-1 p-1">
            <button className="flex-1 rounded bg-background py-1 text-[13px] font-semibold">Manual</button>
            <button className="flex-1 rounded py-1 text-[13px] text-muted-foreground opacity-50 cursor-not-allowed" disabled>Auto</button>
          </div>

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
            <label className="text-[11px] uppercase tracking-wide text-muted-foreground">Your Color</label>
            <div className="grid grid-cols-3 gap-1.5">
              {COLORS.map((c) => (
                <button key={c.name} onClick={() => setChoice(c.name)} disabled={busy}
                  className={cn('flex h-16 flex-col items-center justify-center rounded-lg border text-[12px] font-bold transition-all',
                    choice === c.name ? cn(c.border, c.bg, c.text, 'shadow-lg scale-[1.02]') : 'border-border/60 bg-surface-2 text-muted-foreground hover:border-primary/30 disabled:opacity-40')}>
                  <span className="text-[14px]">{c.label}</span>
                  <span className="text-[11px] opacity-70">{c.payout}x</span>
                </button>
              ))}
            </div>
          </div>

          <div className="rounded border border-border/60 bg-surface-1 px-3 py-2.5">
            <div className="flex items-center justify-between text-[12px]"><span className="text-muted-foreground">Multiplier</span><span className="font-mono font-bold text-gold">{choice === 'yellow' ? '14x' : '2x'}</span></div>
            <div className="mt-1 flex items-center justify-between text-[12px]"><span className="text-muted-foreground">Win Chance</span><span className="font-mono font-bold">{choice === 'yellow' ? '6.67%' : '46.67%'}</span></div>
            <div className="mt-1 flex items-center justify-between text-[12px]"><span className="text-muted-foreground">Potential Win</span><span className="font-mono font-bold text-success">{formatMD(betAmount * (choice === 'yellow' ? 14 : 2))}</span></div>
          </div>

          <div className="flex-1" />

          <button onClick={handleBet} disabled={busy}
            className={cn('flex h-11 w-full items-center justify-center gap-2 rounded bg-primary text-[14px] font-bold text-primary-foreground transition-all hover:bg-primary/90', busy && 'opacity-70 animate-pulse')}>
            <Disc className="h-4 w-4" />{busy ? 'Spinning…' : `Bet ${choice}`}
          </button>

          {pfData && <ProvablyFairPanel data={pfData} />}
        </div>

        {/* Roulette reel */}
        <div className="relative flex flex-1 flex-col items-center justify-center gap-6 overflow-hidden rounded border border-border/60 bg-gradient-to-b from-surface-1 to-background p-6">
          {/* Reel track */}
          <div className="relative w-full max-w-3xl overflow-hidden rounded-lg border border-border/40 bg-surface-2/50 p-2">
            {/* Fixed marker */}
            <div className="absolute left-1/2 top-0 z-20 h-full w-1 -translate-x-1/2 bg-gold shadow-[0_0_12px_3px_rgba(245,158,11,0.6)]" />
            <div className="absolute left-1/2 top-0 z-20 -translate-x-1/2">
              <div className="h-0 w-0 border-x-[6px] border-t-[8px] border-x-transparent border-t-gold" />
            </div>

            {/* Strip */}
            <div className="flex h-16 overflow-hidden" style={{ transform: `translateX(${tileOffset}px)`, transition: 'none' }}>
              {visibleTiles.map((color, i) => {
                const cs = colorStyle(color);
                const actualIdx = startIdx + i;
                const isHighlight = highlightColor === color && result && actualIdx === Math.round(-offset / TILE_WIDTH);
                return (
                  <div key={actualIdx} className={cn(
                    'flex h-16 shrink-0 items-center justify-center border-r border-border/20 transition-all',
                    cs.bg, cs.text,
                    isHighlight && 'ring-2 ring-gold scale-y-105 z-10'
                  )} style={{ width: `${TILE_WIDTH}px` }}>
                    <div className="flex flex-col items-center gap-0.5">
                      <div className={cn('h-6 w-6 rounded-full border-2', cs.border, cs.bg)} />
                      <span className="text-[10px] font-bold uppercase">{cs.label.charAt(0)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Result */}
          {result && gameState === 'complete' && (
            <div className={cn('rounded-lg px-4 py-1.5 text-[14px] font-bold',
              result.won ? 'bg-success/15 text-success' : 'bg-destructive/15 text-destructive')}>
              {result.won ? `+${formatMD(result.payout)}` : `-${formatMD(betAmount)}`}
            </div>
          )}

          {/* Legend */}
          <div className="flex items-center gap-4">
            {COLORS.map((c) => (
              <div key={c.name} className="flex items-center gap-1.5">
                <div className={cn('h-3 w-3 rounded-full border', c.border, c.bg)} />
                <span className="text-[11px] text-muted-foreground">{c.label} {c.payout}x</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {sessions.length > 0 && (
        <div className="space-y-1.5">
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Live Feed</h3>
          <div className="rounded border border-border/60 bg-surface-1">
            <div className="grid grid-cols-[1fr_80px_80px_80px] gap-2 border-b border-border/60 px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              <span>Bet</span><span className="text-center">Pick</span><span className="text-center">Result</span><span className="text-right">Profit</span>
            </div>
            <div className="max-h-[200px] overflow-y-auto scrollbar-thin">
              {sessions.map((s) => {
                const won = (s.profit ?? 0) > 0;
                const pick = (s.config as Record<string, unknown> | null)?.choice as string | undefined;
                const res = (s.result as Record<string, unknown> | null)?.color as string | undefined;
                return (
                  <div key={s.id} className="grid grid-cols-[1fr_80px_80px_80px] items-center gap-2 border-b border-border/40 px-3 py-1.5 text-[12px] last:border-0 hover:bg-surface-2">
                    <span className="font-mono">{formatMD(s.bet_amount ?? 0)}</span>
                    <span className="text-center capitalize">{pick ?? '—'}</span>
                    <span className={cn('text-center font-semibold capitalize', won ? 'text-success' : 'text-destructive')}>{res ?? '—'}</span>
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
