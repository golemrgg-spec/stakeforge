import { useState, useEffect, useCallback, useRef } from 'react';
import { Rocket, Users } from 'lucide-react';
import { useAuth } from '@/authentication/auth-context';
import { useWallet } from '@/wallet/wallet-context';
import { getGameConfig } from '@/game-engine/game-config-service';
import { crashPlaceBet, crashCashout, crashEnsureRunning } from '@/game-engine/game-service';
import { ProvablyFairPanel, type ProvablyFairData } from '@/game-engine/provably-fair-panel';
import { useGameHistory } from '@/game-engine/use-game-history';
import { supabase } from '@/lib/supabase';
import { cn, formatCoins } from '@/lib/utils';
import { toast } from 'sonner';

type Phase = 'betting' | 'running' | 'crashed';

interface CrashRound {
  id: string;
  round_number: number;
  phase: string;
  countdown_ends_at: string | null;
  started_at: string | null;
  ended_at: string | null;
  crash_point: number | null;
  multiplier: number;
  server_seed: string | null;
  server_seed_hash: string | null;
  client_seed: string | null;
  nonce: number;
  prev_server_seed: string | null;
  prev_server_seed_hash: string | null;
  prev_crash_point: number | null;
}

interface CrashBet {
  id: string;
  user_id: string;
  username: string;
  bet_amount: number;
  cashed_out_at: number | null;
  payout: number;
  status: 'active' | 'cashed_out' | 'crashed';
}

function maskName(name: string): string {
  if (name.length <= 2) return name[0] + '***';
  return name.slice(0, 2) + '***' + name.slice(-1);
}

export function CrashPage() {
  const { user } = useAuth();
  const { wallet, refresh: refreshWallet } = useWallet();
  const { sessions, refresh: refreshHistory } = useGameHistory('crash', 30);

  const [minBet, setMinBet] = useState(0.1);
  const [maxBet, setMaxBet] = useState(1000);

  const [round, setRound] = useState<CrashRound | null>(null);
  const [bets, setBets] = useState<CrashBet[]>([]);
  const [phase, setPhase] = useState<Phase>('betting');
  const [countdown, setCountdown] = useState(15);
  const [multiplier, setMultiplier] = useState(1.0);
  const [betInput, setBetInput] = useState('1.00');
  const [autoCashout, setAutoCashout] = useState('');
  const [myBet, setMyBet] = useState<CrashBet | null>(null);
  const [cashingOut, setCashingOut] = useState(false);
  const [placingBet, setPlacingBet] = useState(false);
  const [hasBet, setHasBet] = useState(false);
  const [prevRounds, setPrevRounds] = useState<number[]>([]);
  const [pfData, setPfData] = useState<ProvablyFairData | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const roundRef = useRef<CrashRound | null>(null);
  const autoTargetRef = useRef<number>(0);
  const cashedOutRef = useRef(false);
  const myBetRef = useRef<CrashBet | null>(null);

  const betAmount = Math.max(minBet, Math.min(maxBet, parseFloat(betInput) || 0));
  const autoTarget = parseFloat(autoCashout) || 0;
  autoTargetRef.current = autoTarget;

  useEffect(() => {
    getGameConfig('crash').then((cfg) => {
      if (!cfg) return;
      setMinBet(cfg.min_bet);
      setMaxBet(cfg.max_bet);
    });
  }, []);

  // Ensure engine running + fetch state + realtime subscriptions
  useEffect(() => {
    crashEnsureRunning().catch(() => {});
    fetchState();
    loadPrevRounds();

    const roundChannel = supabase
      .channel('crash_rounds_live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'crash_rounds' }, () => fetchState())
      .subscribe();

    const betChannel = supabase
      .channel('crash_bets_live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'crash_bets' }, () => fetchState())
      .subscribe();

    return () => {
      supabase.removeChannel(roundChannel);
      supabase.removeChannel(betChannel);
    };
  }, []);

  const fetchState = useCallback(async () => {
    const { data } = await supabase
      .from('crash_rounds')
      .select('*')
      .in('phase', ['betting', 'running', 'crashed'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!data) return;
    const r = data as CrashRound;
    roundRef.current = r;
    setRound(r);

    const { data: betData } = await supabase
      .from('crash_bets')
      .select('*')
      .eq('round_id', r.id)
      .order('created_at', { ascending: true });

    const roundBets = (betData ?? []) as CrashBet[];
    setBets(roundBets);

    const mine = roundBets.find((b) => b.user_id === user?.id) ?? null;
    myBetRef.current = mine;
    setMyBet(mine);
    setHasBet(!!mine);

    if (r.phase === 'betting') {
      setPhase('betting');
      setMultiplier(1.0);
      cashedOutRef.current = false;
      if (r.countdown_ends_at) {
        const left = Math.max(0, Math.ceil((new Date(r.countdown_ends_at).getTime() - Date.now()) / 1000));
        setCountdown(left);
      }
    } else if (r.phase === 'running') {
      setPhase('running');
      setMultiplier(r.multiplier);
    } else if (r.phase === 'crashed') {
      setPhase('crashed');
      setMultiplier(r.crash_point ?? 1.0);
      loadPrevRounds();
      if (r.server_seed) {
        setPfData({
          roundId: r.id,
          clientSeed: r.client_seed ?? '',
          serverSeed: r.server_seed,
          serverSeedHash: r.server_seed_hash ?? '',
          nonce: r.nonce,
          gameType: 'Crash',
        });
      }
      refreshWallet();
      refreshHistory();
    }
  }, [user, refreshWallet, refreshHistory]);

  const loadPrevRounds = useCallback(async () => {
    const { data } = await supabase
      .from('crash_rounds')
      .select('crash_point')
      .eq('phase', 'crashed')
      .order('created_at', { ascending: false })
      .limit(12);
    const points = (data ?? []).map((r) => r.crash_point as number).filter((v) => v != null);
    setPrevRounds(points);
  }, []);

  // Countdown timer during betting
  useEffect(() => {
    if (phase !== 'betting' || !round?.countdown_ends_at) return;
    const tick = () => {
      const left = Math.max(0, Math.ceil((new Date(round.countdown_ends_at!).getTime() - Date.now()) / 1000));
      setCountdown(left);
    };
    tick();
    const iv = setInterval(tick, 500);
    return () => clearInterval(iv);
  }, [phase, round]);

  // Multiplier animation during running
  useEffect(() => {
    if (phase !== 'running' || !round?.started_at) return;
    const startTime = new Date(round.started_at).getTime();
    const crashPoint = round.crash_point ?? 1.0;

    const tick = () => {
      const elapsed = (Date.now() - startTime) / 1000;
      const m = Math.floor(Math.pow(2, elapsed / 8) * 100) / 100;
      const displayM = Math.min(m, crashPoint);
      setMultiplier(displayM);
      drawGraph(canvasRef.current, elapsed, displayM, false);

      if (autoTargetRef.current >= 1.01 && displayM >= autoTargetRef.current && !cashedOutRef.current && myBetRef.current?.status === 'active') {
        doCashout();
      }
      if (m >= crashPoint) return;
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [phase, round]);

  // Crash phase: draw crashed graph
  useEffect(() => {
    if (phase !== 'crashed' || !round) return;
    const cp = round.crash_point ?? 1.0;
    const elapsed = Math.log2(Math.max(cp, 1.01)) * 8;
    drawGraph(canvasRef.current, elapsed, cp, true);
  }, [phase, round]);

  const handlePlaceBet = useCallback(async () => {
    if (placingBet || hasBet) return;
    if (!wallet || wallet.balance < betAmount) { toast.error('Insufficient balance'); return; }
    if (betAmount < minBet) { toast.error(`Minimum bet is ${formatCoins(minBet)}`); return; }
    if (phase !== 'betting') { toast.error('Round not in betting phase'); return; }
    setPlacingBet(true);
    try {
      await crashPlaceBet(betAmount);
      setHasBet(true);
      refreshWallet();
      toast.success(`Bet placed: ${formatCoins(betAmount)} RC`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to place bet');
    } finally {
      setPlacingBet(false);
    }
  }, [placingBet, hasBet, wallet, betAmount, minBet, phase, refreshWallet]);

  const doCashout = useCallback(async () => {
    if (cashingOut || cashedOutRef.current) return;
    if (!myBetRef.current || myBetRef.current.status !== 'active') return;
    if (!roundRef.current) return;
    cashedOutRef.current = true;
    setCashingOut(true);
    try {
      const res = await crashCashout(roundRef.current.id);
      toast.success(`Cashed out at ${res.multiplier.toFixed(2)}x for ${formatCoins(res.payout)} RC`);
      refreshWallet();
      fetchState();
    } catch (err) {
      cashedOutRef.current = false;
      toast.error(err instanceof Error ? err.message : 'Cashout failed');
    } finally {
      setCashingOut(false);
    }
  }, [refreshWallet, fetchState]);

  const allPrevRounds = [
    ...prevRounds,
    ...sessions
      .map((s) => (s.result as Record<string, unknown> | null)?.crash_point as number | undefined)
      .filter((v): v is number => typeof v === 'number'),
  ].slice(0, 12);

  const activePlayers = bets.filter((b) => b.status === 'active' || b.status === 'cashed_out');
  const cashedOutPlayers = bets.filter((b) => b.status === 'cashed_out');
  const inRound = phase === 'running' && hasBet && myBet?.status === 'active';

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 animate-fade-in">
      <div className="flex flex-1 flex-col gap-4 overflow-hidden lg:flex-row">
        {/* LEFT PANEL */}
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
                <input type="number" value={betInput} onChange={(e) => setBetInput(e.target.value)}
                  disabled={hasBet || phase !== 'betting'} min={minBet} max={maxBet} step="0.01"
                  className="h-9 w-full rounded border border-border/60 bg-surface-2 pl-7 pr-2 text-[13px] font-mono font-semibold focus:border-primary/50 focus:outline-none disabled:opacity-50" />
              </div>
              <button onClick={() => setBetInput((v) => (parseFloat(v) / 2 || minBet).toFixed(2))} disabled={hasBet || phase !== 'betting'}
                className="h-9 rounded border border-border/60 bg-surface-2 px-2.5 text-[12px] font-semibold text-muted-foreground hover:border-primary/40 disabled:opacity-40">1/2</button>
              <button onClick={() => setBetInput((v) => (parseFloat(v) * 2 || minBet).toFixed(2))} disabled={hasBet || phase !== 'betting'}
                className="h-9 rounded border border-border/60 bg-surface-2 px-2.5 text-[12px] font-semibold text-muted-foreground hover:border-primary/40 disabled:opacity-40">2x</button>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] uppercase tracking-wide text-muted-foreground">Auto Cashout (Multiplier)</label>
            <div className="flex items-center gap-1.5">
              <input type="number" value={autoCashout} onChange={(e) => setAutoCashout(e.target.value)}
                placeholder="Disabled" min="1.01" step="0.01" disabled={hasBet}
                className="h-9 w-full flex-1 rounded border border-border/60 bg-surface-2 px-2.5 text-[13px] font-mono font-semibold placeholder:text-muted-foreground/60 focus:border-primary/50 focus:outline-none disabled:opacity-50" />
              <button onClick={() => setAutoCashout('')} disabled={hasBet}
                className="h-9 rounded border border-border/60 bg-surface-2 px-2 text-[12px] font-semibold text-muted-foreground hover:border-primary/40 disabled:opacity-40">Off</button>
              <button onClick={() => setAutoCashout('2.00')} disabled={hasBet}
                className="h-9 rounded border border-border/60 bg-surface-2 px-2 text-[12px] font-semibold text-muted-foreground hover:border-primary/40 disabled:opacity-40">2x</button>
              <button onClick={() => setAutoCashout('10.00')} disabled={hasBet}
                className="h-9 rounded border border-border/60 bg-surface-2 px-2 text-[12px] font-semibold text-muted-foreground hover:border-primary/40 disabled:opacity-40">10x</button>
            </div>
          </div>

          {phase === 'betting' && !hasBet && (
            <button onClick={handlePlaceBet} disabled={placingBet}
              className="flex h-11 w-full items-center justify-center gap-2 rounded bg-primary text-[14px] font-bold text-primary-foreground transition-all hover:bg-primary/90 disabled:opacity-60">
              <Rocket className="h-4 w-4" /> {placingBet ? 'Placing…' : 'Place bet'}
            </button>
          )}
          {phase === 'betting' && hasBet && (
            <div className="flex h-11 w-full items-center justify-center rounded border border-success/40 bg-success/10 text-[14px] font-bold text-success">
              Bet placed — {formatCoins(myBet?.bet_amount ?? 0)} RC
            </div>
          )}
          {inRound && (
            <button onClick={doCashout} disabled={cashingOut}
              className={cn('flex h-11 w-full items-center justify-center gap-2 rounded bg-success text-[14px] font-bold text-background transition-all hover:bg-success/90', cashingOut && 'animate-pulse opacity-70')}>
              Cash out {formatCoins((myBet?.bet_amount ?? 0) * multiplier)} RC
            </button>
          )}
          {phase === 'running' && (!hasBet || myBet?.status !== 'active') && (
            <button disabled className="flex h-11 w-full items-center justify-center rounded border border-border/60 bg-surface-2 text-[14px] font-bold text-muted-foreground">Round in progress</button>
          )}
          {phase === 'crashed' && (
            <button disabled className="flex h-11 w-full items-center justify-center rounded border border-border/60 bg-surface-2 text-[14px] font-bold text-muted-foreground">Next round starting…</button>
          )}

          {/* Players */}
          <div className="rounded border border-border/60 bg-surface-1">
            <div className="flex items-center justify-between border-b border-border/60 px-3 py-2">
              <div className="flex items-center gap-1.5 text-[12px] font-semibold">
                <Users className="h-3.5 w-3.5 text-primary" />
                {activePlayers.length} {activePlayers.length === 1 ? 'Player' : 'Players'}
              </div>
              <span className="font-mono text-[12px] text-gold">{cashedOutPlayers.length} cashed out</span>
            </div>
            <div className="max-h-[180px] overflow-y-auto scrollbar-thin">
              {activePlayers.length === 0 ? (
                <p className="px-3 py-3 text-center text-[11px] text-muted-foreground">No bets this round</p>
              ) : (
                activePlayers.map((b) => (
                  <div key={b.id} className="flex items-center justify-between px-3 py-1.5 text-[12px] border-b border-border/40 last:border-0">
                    <span className="font-semibold">{maskName(b.username)}</span>
                    {b.status === 'cashed_out' ? (
                      <span className="font-mono font-semibold text-success">{b.cashed_out_at?.toFixed(2)}x · +{formatCoins(b.payout - b.bet_amount)}</span>
                    ) : b.status === 'crashed' ? (
                      <span className="font-mono font-semibold text-destructive">-{formatCoins(b.bet_amount)}</span>
                    ) : b.user_id === user?.id ? (
                      <span className="font-mono text-gold">playing…</span>
                    ) : (
                      <span className="font-mono text-muted-foreground">in round</span>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="flex-1" />
          {pfData && <ProvablyFairPanel data={pfData} />}
        </div>

        {/* RIGHT PANEL */}
        <div className="flex flex-1 flex-col gap-3 rounded border border-border/60 bg-surface-1 p-4">
          <div className="flex items-center justify-between">
            <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Round #{round?.round_number ?? '—'}</span>
            <div className="flex flex-wrap items-center gap-1.5">
              {allPrevRounds.length === 0 ? (
                <span className="text-[11px] text-muted-foreground">No previous rounds yet</span>
              ) : allPrevRounds.map((v, i) => (
                <span key={i} className={cn('rounded px-2 py-0.5 font-mono text-[12px] font-bold',
                  v >= 10 ? 'bg-primary/20 text-primary' : v >= 2 ? 'bg-gold/20 text-gold' : 'bg-surface-2 text-muted-foreground')}>
                  {v.toFixed(2)}
                </span>
              ))}
            </div>
          </div>

          <div className="relative flex-1 min-h-[320px] overflow-hidden rounded border border-border/40 bg-background/60">
            <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              {phase === 'betting' ? (
                <>
                  <span className="font-mono text-[52px] font-bold leading-none">{countdown}s</span>
                  <span className="mt-2 text-[13px] text-muted-foreground">
                    {hasBet ? `Bet placed — ${formatCoins(myBet?.bet_amount ?? 0)} RC` : 'Place your bet before the round starts'}
                  </span>
                </>
              ) : (
                <>
                  <span className={cn('font-mono text-[64px] font-bold leading-none transition-colors',
                    phase === 'crashed' ? 'text-destructive' : myBet?.status === 'cashed_out' ? 'text-success' : 'text-foreground')}>
                    {multiplier.toFixed(2)}x
                  </span>
                  <span className={cn('mt-2 text-[14px] font-semibold',
                    phase === 'crashed' ? 'text-destructive' : myBet?.status === 'cashed_out' ? 'text-success' : 'text-muted-foreground')}>
                    {phase === 'crashed' ? `Crashed at ${multiplier.toFixed(2)}x!` : myBet?.status === 'cashed_out' ? `Cashed out at ${myBet.cashed_out_at?.toFixed(2)}x` : 'Current multiplier'}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function drawGraph(canvas: HTMLCanvasElement | null, elapsed: number, mult: number, crashed: boolean) {
  if (!canvas) return;
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
    canvas.width = w * dpr;
    canvas.height = h * dpr;
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  const pad = 36;
  const tMax = Math.max(elapsed * 1.15, 5);
  const mMax = Math.max(mult * 1.25, 2);

  ctx.strokeStyle = 'rgba(148,163,184,0.12)';
  ctx.fillStyle = 'rgba(148,163,184,0.55)';
  ctx.font = '10px ui-monospace, monospace';
  ctx.lineWidth = 1;
  const ySteps = 5;
  for (let i = 0; i <= ySteps; i++) {
    const mv = 1 + ((mMax - 1) * i) / ySteps;
    const y = h - pad - ((mv - 1) / (mMax - 1)) * (h - pad * 2);
    ctx.beginPath();
    ctx.moveTo(pad, y);
    ctx.lineTo(w - 8, y);
    ctx.stroke();
    ctx.fillText(`${mv.toFixed(1)}x`, 4, y + 3);
  }
  const xSteps = 5;
  for (let i = 1; i <= xSteps; i++) {
    const tv = (tMax * i) / xSteps;
    const x = pad + (tv / tMax) * (w - pad - 8);
    ctx.fillText(`${tv.toFixed(0)}s`, x - 8, h - 6);
  }

  const px = (t: number) => pad + (t / tMax) * (w - pad - 8);
  const py = (m: number) => h - pad - ((m - 1) / (mMax - 1)) * (h - pad * 2);

  ctx.beginPath();
  ctx.moveTo(px(0), py(1));
  const steps = 80;
  for (let i = 1; i <= steps; i++) {
    const t = (elapsed * i) / steps;
    ctx.lineTo(px(t), py(Math.pow(2, t / 8)));
  }
  ctx.strokeStyle = crashed ? '#ef4444' : '#f59e0b';
  ctx.lineWidth = 3;
  ctx.lineJoin = 'round';
  ctx.stroke();

  const gradient = ctx.createLinearGradient(0, 0, 0, h);
  gradient.addColorStop(0, crashed ? 'rgba(239,68,68,0.18)' : 'rgba(245,158,11,0.18)');
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.lineTo(px(elapsed), h - pad);
  ctx.lineTo(px(0), h - pad);
  ctx.closePath();
  ctx.fillStyle = gradient;
  ctx.fill();

  ctx.beginPath();
  ctx.arc(px(elapsed), py(mult), 5, 0, Math.PI * 2);
  ctx.fillStyle = crashed ? '#ef4444' : '#f59e0b';
  ctx.fill();
}
