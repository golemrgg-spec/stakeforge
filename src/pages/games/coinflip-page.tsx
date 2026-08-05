import { useState, useEffect, useCallback, useRef } from 'react';
import { Coins } from 'lucide-react';
import { useAuth } from '@/authentication/auth-context';
import { useWallet } from '@/wallet/wallet-context';
import { getGameConfig } from '@/game-engine/game-config-service';
import { playCoinflipGame, type CoinflipPlayResult } from '@/game-engine/game-service';
import { ProvablyFairPanel, type ProvablyFairData } from '@/game-engine/provably-fair-panel';
import { useGameHistory } from '@/game-engine/use-game-history';
import { cn, formatCoins } from '@/lib/utils';
import { toast } from 'sonner';

type Choice = 'heads' | 'tails';

export function CoinflipPage() {
  const { user } = useAuth();
  const { wallet, refresh: refreshWallet } = useWallet();
  const { sessions, refresh: refreshHistory } = useGameHistory('coinflip', 20);

  const [minBet, setMinBet] = useState(0.1);
  const [maxBet, setMaxBet] = useState(1000);
  const [betInput, setBetInput] = useState('1.00');
  const [choice, setChoice] = useState<Choice>('heads');
  const [flipping, setFlipping] = useState(false);
  const [result, setResult] = useState<CoinflipPlayResult | null>(null);
  const [coinAnim, setCoinAnim] = useState<'idle' | 'flipping' | 'settling'>('idle');
  const [landedSide, setLandedSide] = useState<Choice | null>(null);
  const [pfData, setPfData] = useState<ProvablyFairData | null>(null);
  const flipTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const betAmount = Math.max(minBet, Math.min(maxBet, parseFloat(betInput) || 0));

  useEffect(() => {
    getGameConfig('coinflip').then((cfg) => {
      if (!cfg) return;
      setMinBet(cfg.min_bet);
      setMaxBet(cfg.max_bet);
    });
  }, []);

  useEffect(() => () => { if (flipTimeoutRef.current) clearTimeout(flipTimeoutRef.current); }, []);

  const handleFlip = useCallback(async () => {
    if (flipping || !user) return;
    if (!wallet || wallet.balance < betAmount) { toast.error('Insufficient balance'); return; }
    if (betAmount < minBet) { toast.error(`Minimum bet is ${formatCoins(minBet)}`); return; }

    setFlipping(true);
    setResult(null);
    setPfData(null);
    setCoinAnim('flipping');
    setLandedSide(null);

    try {
      const res = await playCoinflipGame(betAmount, choice);
      setResult(res);
      setLandedSide(res.outcome);
      setCoinAnim('settling');

      flipTimeoutRef.current = setTimeout(() => setCoinAnim('idle'), 1200);

      refreshWallet();
      refreshHistory();

      if (res.won) toast.success(`${res.outcome.toUpperCase()}! You won ${formatCoins(res.payout)} RC`);
      else toast.error(`${res.outcome.toUpperCase()} — you lost ${formatCoins(betAmount)} RC`);

      setPfData({
        roundId: res.session_id,
        clientSeed: res.client_seed,
        serverSeed: res.server_seed,
        serverSeedHash: res.server_seed_hash,
        nonce: res.nonce,
        gameType: 'Coinflip',
      });
    } catch (err) {
      setCoinAnim('idle');
      toast.error(err instanceof Error ? err.message : 'Flip failed');
    } finally {
      setFlipping(false);
    }
  }, [flipping, user, wallet, betAmount, minBet, choice, refreshWallet, refreshHistory]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 animate-fade-in">
      <div className="flex flex-1 flex-col gap-4 overflow-hidden lg:flex-row">
        <div className="flex w-full flex-col gap-3 lg:w-[280px] lg:shrink-0">
          <div className="flex h-9 items-center gap-0 rounded border border-border/60 bg-surface-1 p-1">
            <button className="flex-1 rounded bg-background py-1 text-[13px] font-semibold">Manual</button>
            <button className="flex-1 rounded py-1 text-[13px] text-muted-foreground opacity-50 cursor-not-allowed" disabled>Auto</button>
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] uppercase tracking-wide text-muted-foreground">Bet Amount</label>
            <div className="flex items-center gap-1.5">
              <div className="relative flex-1">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[13px] font-bold text-gold">RC</span>
                <input type="number" value={betInput} onChange={(e) => setBetInput(e.target.value)} disabled={flipping} min={minBet} max={maxBet} step="0.01"
                  className="h-9 w-full rounded border border-border/60 bg-surface-2 pl-7 pr-2 text-[13px] font-mono font-semibold focus:border-primary/50 focus:outline-none disabled:opacity-50" />
              </div>
              <button onClick={() => setBetInput((v) => (parseFloat(v) / 2 || minBet).toFixed(2))} disabled={flipping}
                className="h-9 rounded border border-border/60 bg-surface-2 px-2.5 text-[12px] font-semibold text-muted-foreground hover:border-primary/40 disabled:opacity-40">1/2</button>
              <button onClick={() => setBetInput((v) => (parseFloat(v) * 2 || minBet).toFixed(2))} disabled={flipping}
                className="h-9 rounded border border-border/60 bg-surface-2 px-2.5 text-[12px] font-semibold text-muted-foreground hover:border-primary/40 disabled:opacity-40">2x</button>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] uppercase tracking-wide text-muted-foreground">Your Pick</label>
            <div className="grid grid-cols-2 gap-1.5">
              <button onClick={() => setChoice('heads')} disabled={flipping}
                className={cn('flex h-12 items-center justify-center rounded border text-[14px] font-bold transition-all',
                  choice === 'heads' ? 'border-gold/60 bg-gold/15 text-gold' : 'border-border/60 bg-surface-2 text-muted-foreground hover:border-gold/30')}>HEADS</button>
              <button onClick={() => setChoice('tails')} disabled={flipping}
                className={cn('flex h-12 items-center justify-center rounded border text-[14px] font-bold transition-all',
                  choice === 'tails' ? 'border-gold/60 bg-gold/15 text-gold' : 'border-border/60 bg-surface-2 text-muted-foreground hover:border-gold/30')}>TAILS</button>
            </div>
          </div>

          <div className="rounded border border-border/60 bg-surface-1 px-3 py-2.5">
            <div className="flex items-center justify-between text-[12px]"><span className="text-muted-foreground">Multiplier</span><span className="font-mono font-bold text-gold">1.98x</span></div>
            <div className="mt-1 flex items-center justify-between text-[12px]"><span className="text-muted-foreground">Win Chance</span><span className="font-mono font-bold">50%</span></div>
            <div className="mt-1 flex items-center justify-between text-[12px]"><span className="text-muted-foreground">Potential Win</span><span className="font-mono font-bold text-success">{formatCoins(betAmount * 1.98)} RC</span></div>
          </div>

          <div className="flex-1" />

          <button onClick={handleFlip} disabled={flipping}
            className={cn('flex h-11 w-full items-center justify-center gap-2 rounded bg-primary text-[14px] font-bold text-primary-foreground transition-all hover:bg-primary/90', flipping && 'opacity-70 animate-pulse')}>
            <Coins className="h-4 w-4" />{flipping ? 'Flipping…' : `Flip ${choice.toUpperCase()}`}
          </button>

          {pfData && <ProvablyFairPanel data={pfData} />}
        </div>

        <div className="relative flex flex-1 flex-col items-center justify-center gap-6 rounded border border-border/60 bg-surface-1 p-6">
          {result && coinAnim === 'idle' && (
            <div className={cn('absolute top-4 left-1/2 -translate-x-1/2 rounded-lg px-4 py-1.5 text-[14px] font-bold uppercase tracking-wide',
              result.won ? 'bg-success/15 text-success' : 'bg-destructive/15 text-destructive')}>
              {result.won ? `You won +${formatCoins(result.profit)} RC` : `You lost -${formatCoins(betAmount)} RC`}
            </div>
          )}
          <Coin3D animState={coinAnim} landedSide={landedSide} />
          <div className="text-center">
            {coinAnim === 'idle' && !result && <p className="text-[13px] text-muted-foreground">Pick a side and flip the coin</p>}
            {coinAnim === 'flipping' && <p className="text-[13px] font-semibold text-gold animate-pulse">Flipping…</p>}
            {coinAnim === 'settling' && result && <p className={cn('text-[15px] font-bold', result.won ? 'text-success' : 'text-destructive')}>{result.outcome.toUpperCase()} — {result.won ? 'You won!' : 'You lost'}</p>}
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
                const res = s.result as Record<string, unknown> | null;
                const won = (s.profit ?? 0) > 0;
                const pick = (s.config as Record<string, unknown> | null)?.choice as string | undefined;
                const outcome = res?.outcome as string | undefined;
                return (
                  <div key={s.id} className="grid grid-cols-[1fr_80px_80px_80px] items-center gap-2 border-b border-border/40 px-3 py-1.5 text-[12px] last:border-0 hover:bg-surface-2">
                    <span className="font-mono">{formatCoins(s.bet_amount ?? 0)}</span>
                    <span className="text-center font-semibold capitalize">{pick ?? '—'}</span>
                    <span className={cn('text-center font-semibold capitalize', won ? 'text-success' : 'text-destructive')}>{outcome ?? '—'}</span>
                    <span className={cn('text-right font-mono font-semibold', won ? 'text-success' : 'text-destructive')}>{won ? '+' : ''}{formatCoins(s.profit ?? 0)}</span>
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

function Coin3D({ animState, landedSide }: { animState: 'idle' | 'flipping' | 'settling'; landedSide: Choice | null }) {
  const [rotation, setRotation] = useState(0);

  useEffect(() => {
    if (animState === 'flipping') {
      let raf = 0;
      let current = 0;
      const spin = () => { current += 25; setRotation(current); raf = requestAnimationFrame(spin); };
      raf = requestAnimationFrame(spin);
      return () => cancelAnimationFrame(raf);
    }
    if (animState === 'settling' && landedSide) {
      const target = landedSide === 'heads' ? 0 : 180;
      setRotation((prev) => {
        const normalized = prev % 360;
        const diff = target - normalized;
        const adjusted = diff > 180 ? diff - 360 : diff < -180 ? diff + 360 : diff;
        return prev + adjusted;
      });
    }
  }, [animState, landedSide]);

  const showFront = ((rotation / 180) % 2 + 2) % 2 < 1;

  return (
    <div className="relative" style={{ perspective: '1000px' }}>
      <div className="relative h-40 w-40" style={{
        transformStyle: 'preserve-3d',
        transform: `rotateY(${rotation}deg)`,
        transitionDuration: animState === 'settling' ? '800ms' : '0ms',
        transitionTimingFunction: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
        transitionProperty: 'transform',
      }}>
        <CoinFace side="heads" visible={showFront} />
        <CoinFace side="tails" visible={!showFront} />
      </div>
      <div className={cn('absolute -bottom-3 left-1/2 h-3 w-28 -translate-x-1/2 rounded-full bg-black/30 blur-sm transition-all',
        animState === 'flipping' ? 'w-20 opacity-20' : 'w-28 opacity-30')} />
    </div>
  );
}

function CoinFace({ side }: { side: Choice; visible: boolean }) {
  return (
    <div className={cn('absolute inset-0 flex items-center justify-center rounded-full border-4 shadow-2xl',
      side === 'heads' ? 'border-amber-500/60 bg-gradient-to-br from-amber-400 to-amber-600' : 'border-slate-400/60 bg-gradient-to-br from-slate-300 to-slate-500')}
      style={{ backfaceVisibility: 'hidden', transform: side === 'tails' ? 'rotateY(180deg)' : undefined }}>
      <div className="flex h-full w-full flex-col items-center justify-center gap-1">
        <Coins className={cn('h-12 w-12', side === 'heads' ? 'text-amber-900/70' : 'text-slate-700/70')} />
        <span className={cn('text-[16px] font-black uppercase tracking-wider', side === 'heads' ? 'text-amber-900/80' : 'text-slate-700/80')}>{side}</span>
      </div>
    </div>
  );
}
