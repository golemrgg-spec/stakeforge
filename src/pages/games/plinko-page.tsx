import { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { CircleSlash } from 'lucide-react';
import { useAuth } from '@/authentication/auth-context';
import { useWallet } from '@/wallet/wallet-context';
import { getGameConfig } from '@/game-engine/game-config-service';
import { playPlinkoGame, type PlinkoPlayResult } from '@/game-engine/game-service';
import { ProvablyFairPanel, type ProvablyFairData } from '@/game-engine/provably-fair-panel';
import { useGameHistory } from '@/game-engine/use-game-history';
import { cn, formatMD, dollarsToCents, centsToDollars } from '@/lib/utils';
import { toast } from 'sonner';

const RISK_MULTS: Record<string, number[]> = {
  easy: [4.0, 2.0, 1.1, 0.5, 0.3, 0.5, 1.1, 2.0, 4.0],
  normal: [10.0, 3.0, 1.5, 1.0, 0.5, 0.3, 0.5, 1.0, 1.5, 3.0, 10.0],
  hard: [29.0, 5.0, 2.0, 0.5, 0.2, 0.1, 0.2, 0.5, 2.0, 5.0, 29.0],
};
const RISK_ROWS: Record<string, number> = { easy: 8, normal: 10, hard: 10 };

type Risk = 'easy' | 'normal' | 'hard';
type GameState = 'idle' | 'dropping' | 'complete';

const Plinko3D = ({ path, slot, mults, onComplete }: { path: number[]; slot: number; mults: number[]; onComplete: () => void }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = canvas.width = canvas.clientWidth * 2;
    const H = canvas.height = canvas.clientHeight * 2;
    ctx.scale(2, 2);
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;

    const rows = path.length;
    const pegSpacing = h / (rows + 2);
    const pegRadius = 3;
    const ballRadius = 6;

    let currentRow = 0;
    let currentCol = 0;
    let ballX = w / 2;
    let ballY = pegSpacing * 0.5;
    let ballVX = 0;
    let ballVY = 0;
    let bouncing = false;
    let bounceTimer = 0;
    let landed = false;
    let landTimer = 0;

    const pegs: { x: number; y: number }[] = [];
    for (let r = 0; r <= rows; r++) {
      const count = r + 1;
      const startX = w / 2 - (count - 1) * (w / (rows + 3)) / 2;
      for (let c = 0; c < count; c++) {
        pegs.push({ x: startX + c * (w / (rows + 3)), y: (r + 1) * pegSpacing });
      }
    }

    const animate = () => {
      ctx.clearRect(0, 0, w, h);

      // Draw pegs
      for (const peg of pegs) {
        ctx.beginPath();
        ctx.arc(peg.x, peg.y, pegRadius, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(100, 116, 139, 0.5)';
        ctx.fill();
      }

      // Draw multiplier bins
      const binCount = mults.length;
      const binW = w / binCount;
      for (let i = 0; i < binCount; i++) {
        const m = mults[i];
        const x = i * binW;
        const isWin = i === slot && landed;
        ctx.fillStyle = isWin ? (m >= 1 ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)') :
          m >= 1 ? 'rgba(34, 197, 94, 0.1)' : 'rgba(100, 116, 139, 0.1)';
        ctx.fillRect(x + 2, h - 30, binW - 4, 28);
        ctx.fillStyle = m >= 1 ? '#22c55e' : '#94a3b8';
        ctx.font = 'bold 11px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`${m}x`, x + binW / 2, h - 14);
      }

      // Ball physics
      if (!landed) {
        const targetRow = currentRow;
        const targetPegIdx = pegs.findIndex(p => Math.abs(p.y - (targetRow + 1) * pegSpacing) < 1);
        const targetCol = currentCol;
        const pegsInRow = targetRow + 1;
        const rowStartX = w / 2 - pegsInRow * (w / (rows + 3)) / 2 + (w / (rows + 3)) / 2;
        const targetX = rowStartX + targetCol * (w / (rows + 3));

        if (ballY < (targetRow + 1) * pegSpacing - ballRadius) {
          ballVY += 0.4;
          ballY += ballVY;
          ballX += ballVX;
          ballVX *= 0.95;
        } else if (!bouncing) {
          bouncing = true;
          bounceTimer = 0;
          ballVY = -2;
          ballVX = (path[targetRow] === 1 ? 1 : -1) * 2.5;
        }

        if (bouncing) {
          bounceTimer++;
          ballY += ballVY;
          ballX += ballVX;
          ballVY += 0.3;
          if (bounceTimer > 8) {
            bouncing = false;
            currentRow++;
            currentCol += path[targetRow] ?? 0;
            if (currentRow >= rows) {
              landed = true;
              ballX = (slot + 0.5) * binW;
              ballY = h - 35;
            }
          }
        }
      } else {
        landTimer++;
      }

      // Draw ball
      const grad = ctx.createRadialGradient(ballX - 2, ballY - 2, 1, ballX, ballY, ballRadius);
      grad.addColorStop(0, '#fbbf24');
      grad.addColorStop(1, '#d97706');
      ctx.beginPath();
      ctx.arc(ballX, ballY, ballRadius, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();

      // Glow on land
      if (landed && landTimer < 30) {
        ctx.beginPath();
        ctx.arc(ballX, ballY, ballRadius + landTimer * 0.8, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(245, 158, 11, ${0.6 - landTimer * 0.02})`;
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      if (landed && landTimer > 40) {
        onComplete();
        return;
      }
      animRef.current = requestAnimationFrame(animate);
    };
    animate();

    return () => cancelAnimationFrame(animRef.current);
  }, [path, slot, mults, onComplete]);

  return <canvas ref={canvasRef} className="h-full w-full" />;
};

export function PlinkoPage() {
  const { user } = useAuth();
  const { wallet, refresh: refreshWallet } = useWallet();
  const { sessions, refresh: refreshHistory } = useGameHistory('plinko', 20);

  const [minBet, setMinBet] = useState(10);
  const [maxBet, setMaxBet] = useState(1000000000);
  const [betInput, setBetInput] = useState('1.00');
  const [risk, setRisk] = useState<Risk>('normal');
  const [busy, setBusy] = useState(false);
  const [gameState, setGameState] = useState<GameState>('idle');
  const [result, setResult] = useState<PlinkoPlayResult | null>(null);
  const [pfData, setPfData] = useState<ProvablyFairData | null>(null);
  const [animPath, setAnimPath] = useState<number[] | null>(null);
  const [animSlot, setAnimSlot] = useState<number | null>(null);

  const betAmount = Math.max(minBet, Math.min(maxBet, dollarsToCents(parseFloat(betInput) || 0)));
  const mults = RISK_MULTS[risk];
  const rows = RISK_ROWS[risk];

  useEffect(() => {
    getGameConfig('plinko').then((cfg) => {
      if (!cfg) return;
      setMinBet(cfg.min_bet);
      setMaxBet(cfg.max_bet);
    });
  }, []);

  const handleDrop = useCallback(async () => {
    if (busy || !user) return;
    if (!wallet || wallet.balance < betAmount) { toast.error('Insufficient balance'); return; }
    if (betAmount < minBet) { toast.error(`Minimum bet is ${formatMD(minBet)}`); return; }

    setBusy(true);
    setResult(null);
    setPfData(null);
    setAnimPath(null);
    setAnimSlot(null);
    setGameState('dropping');

    try {
      const res = await playPlinkoGame(betAmount, risk);
      setResult(res);
      setAnimPath(res.path);
      setAnimSlot(res.slot);
    } catch (err) {
      setGameState('idle');
      setBusy(false);
      toast.error(err instanceof Error ? err.message : 'Drop failed');
    }
  }, [busy, user, wallet, betAmount, minBet, risk]);

  const onAnimationComplete = useCallback(() => {
    setGameState('complete');
    refreshWallet();
    refreshHistory();
    if (result) {
      if (result.payout > 0) toast.success(`${result.multiplier}x — You won ${formatMD(result.payout)}`);
      else toast.error(`${result.multiplier}x — You lost ${formatMD(betAmount)}`);
      setPfData({
        roundId: result.session_id, clientSeed: result.client_seed,
        serverSeed: result.server_seed, serverSeedHash: result.server_seed_hash,
        nonce: result.nonce, gameType: 'Plinko',
      });
    }
    setBusy(false);
  }, [result, betAmount, refreshWallet, refreshHistory]);

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
            <label className="text-[11px] uppercase tracking-wide text-muted-foreground">Risk</label>
            <div className="grid grid-cols-3 gap-1.5">
              {(['easy', 'normal', 'hard'] as Risk[]).map((r) => (
                <button key={r} onClick={() => setRisk(r)} disabled={busy}
                  className={cn('h-10 rounded border text-[12px] font-bold capitalize transition-all',
                    risk === r ? 'border-primary/60 bg-primary/15 text-primary' : 'border-border/60 bg-surface-2 text-muted-foreground hover:border-primary/30 disabled:opacity-40')}>
                  {r}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded border border-border/60 bg-surface-1 px-3 py-2.5">
            <div className="flex items-center justify-between text-[12px]"><span className="text-muted-foreground">Rows</span><span className="font-mono font-bold">{rows}</span></div>
            <div className="mt-1 flex items-center justify-between text-[12px]"><span className="text-muted-foreground">Max Multiplier</span><span className="font-mono font-bold text-gold">{mults[0]}x</span></div>
            <div className="mt-1 flex items-center justify-between text-[12px]"><span className="text-muted-foreground">Potential Win</span><span className="font-mono font-bold text-success">{formatMD(betAmount * mults[0])}</span></div>
          </div>

          <div className="flex-1" />

          <button onClick={handleDrop} disabled={busy}
            className={cn('flex h-11 w-full items-center justify-center gap-2 rounded bg-primary text-[14px] font-bold text-primary-foreground transition-all hover:bg-primary/90', busy && 'opacity-70 animate-pulse')}>
            <CircleSlash className="h-4 w-4" />{busy ? 'Dropping…' : 'Drop Ball'}
          </button>

          {pfData && <ProvablyFairPanel data={pfData} />}
        </div>

        <div className="relative flex flex-1 flex-col items-center justify-center gap-4 overflow-hidden rounded border border-border/60 bg-gradient-to-b from-surface-1 to-background p-4">
          {animPath && animSlot !== null ? (
            <div className="h-full w-full max-w-2xl">
              <Plinko3D path={animPath} slot={animSlot} mults={mults} onComplete={onAnimationComplete} />
            </div>
          ) : (
            <div className="flex h-full items-center justify-center">
              <div className="flex flex-col items-center gap-3">
                <CircleSlash className="h-12 w-12 text-muted-foreground/30" />
                <p className="text-[13px] text-muted-foreground">Drop a ball to start</p>
              </div>
            </div>
          )}

          {result && gameState === 'complete' && (
            <div className={cn('absolute bottom-4 left-1/2 -translate-x-1/2 rounded-lg px-4 py-1.5 text-[14px] font-bold',
              result.payout > 0 ? 'bg-success/15 text-success' : 'bg-destructive/15 text-destructive')}>
              {result.payout > 0 ? `+${formatMD(result.payout)}` : `-${formatMD(betAmount)}`}
            </div>
          )}
        </div>
      </div>

      {sessions.length > 0 && (
        <div className="space-y-1.5">
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Live Feed</h3>
          <div className="rounded border border-border/60 bg-surface-1">
            <div className="grid grid-cols-[1fr_80px_80px_80px] gap-2 border-b border-border/60 px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              <span>Bet</span><span className="text-center">Risk</span><span className="text-center">Mult</span><span className="text-right">Profit</span>
            </div>
            <div className="max-h-[200px] overflow-y-auto scrollbar-thin">
              {sessions.map((s) => {
                const won = (s.profit ?? 0) > 0;
                const r = (s.config as Record<string, unknown> | null)?.risk as string | undefined;
                const mult = (s.result as Record<string, unknown> | null)?.multiplier as number | undefined;
                return (
                  <div key={s.id} className="grid grid-cols-[1fr_80px_80px_80px] items-center gap-2 border-b border-border/40 px-3 py-1.5 text-[12px] last:border-0 hover:bg-surface-2">
                    <span className="font-mono">{formatMD(s.bet_amount ?? 0)}</span>
                    <span className="text-center capitalize">{r ?? '—'}</span>
                    <span className="text-center font-mono">{mult ?? '—'}x</span>
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
