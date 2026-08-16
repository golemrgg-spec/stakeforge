import { useState, useEffect, useCallback, useRef } from 'react';
import { Spade } from 'lucide-react';
import { useAuth } from '@/authentication/auth-context';
import { useWallet } from '@/wallet/wallet-context';
import { getGameConfig } from '@/game-engine/game-config-service';
import { blackjackDeal, blackjackAction, getActiveSession, type BjCard, type BjHand, type BjState } from '@/game-engine/game-service';
import { ProvablyFairPanel, type ProvablyFairData } from '@/game-engine/provably-fair-panel';
import { useGameHistory } from '@/game-engine/use-game-history';
import { cn, formatCoins } from '@/lib/utils';
import { toast } from 'sonner';
import type { GameSession } from '@/types';

const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

function handValue(cards: BjCard[]): { value: number; soft: boolean } {
  let total = 0;
  let aces = 0;
  for (const c of cards) {
    if (c.rank === 1) { aces++; total += 1; }
    else total += Math.min(c.rank, 10);
  }
  let soft = false;
  if (aces > 0 && total + 10 <= 21) { total += 10; soft = true; }
  return { value: total, soft };
}

const RESULT_LABEL: Record<string, string> = {
  blackjack: 'Blackjack!',
  win: 'Win',
  dealer_bust: 'Dealer Bust',
  push: 'Push',
  bust: 'Bust',
  lose: 'Lose',
};

export function BlackjackPage() {
  const { user } = useAuth();
  const { wallet, refresh: refreshWallet } = useWallet();
  const { sessions, refresh: refreshHistory } = useGameHistory('blackjack', 20);

  const [minBet, setMinBet] = useState(0.1);
  const [maxBet, setMaxBet] = useState(1000);
  const [betInput, setBetInput] = useState('1.00');
  const [state, setState] = useState<BjState | null>(null);
  const [seedInfo, setSeedInfo] = useState<{ sessionId: string; hash: string; clientSeed: string; nonce: number } | null>(null);
  const [serverSeed, setServerSeed] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dealtCount, setDealtCount] = useState(0);
  const [revealedCount, setRevealedCount] = useState(0);
  const [restoring, setRestoring] = useState(false);
  const prevSettledRef = useRef(false);

  const betAmount = Math.max(minBet, Math.min(maxBet, parseFloat(betInput) || 0));

  useEffect(() => {
    getGameConfig('blackjack').then((cfg) => {
      if (!cfg) return;
      setMinBet(cfg.min_bet);
      setMaxBet(cfg.max_bet);
    });
  }, []);

  // Restore active session on mount
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const active = await getActiveSession('blackjack');
        if (!mounted || !active) return;
        setRestoring(true);
        const result = active.result as Record<string, unknown> | null;
        if (!result) { setRestoring(false); return; }
        const hands = (result.hands ?? []) as BjHand[];
        const dealer = (result.dealer ?? []) as BjCard[];
        const settled = result.settled as boolean;
        const s: BjState = {
          session_id: active.id,
          settled,
          hands,
          dealer,
          active: result.active as number,
          dealer_value: result.dealer_value as number | undefined,
          payout: result.payout as number | undefined,
          server_seed: active.server_seed ?? undefined,
          server_seed_hash: active.server_seed_hash,
          client_seed: active.client_seed,
          nonce: active.nonce,
        };
        setState(s);
        setSeedInfo({
          sessionId: active.id,
          hash: active.server_seed_hash,
          clientSeed: active.client_seed,
          nonce: active.nonce,
        });
        if (active.server_seed) setServerSeed(active.server_seed);
        // For restored games, show all cards immediately (no staggered animation)
        const total = hands.reduce((n, h) => n + h.cards.length, 0) + dealer.length;
        setDealtCount(total);
        if (settled) setRevealedCount(dealer.length);
        prevSettledRef.current = settled;
      } catch {
        // ignore
      } finally {
        if (mounted) setRestoring(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  // Staggered card-deal animation counter (only for new deals, not restores)
  useEffect(() => {
    if (!state || restoring) return;
    const total = state.hands.reduce((n, h) => n + h.cards.length, 0) + state.dealer.length;
    if (dealtCount >= total) return;
    const t = setTimeout(() => setDealtCount((c) => c + 1), 160);
    return () => clearTimeout(t);
  }, [state, dealtCount, restoring]);

  // Sequential dealer reveal when game settles
  useEffect(() => {
    if (!state || !state.settled) return;
    // Only animate if transitioning from not-settled to settled
    if (prevSettledRef.current) return;
    prevSettledRef.current = true;
    const dealerCount = state.dealer.length;
    if (revealedCount >= dealerCount) return;
    const t = setTimeout(() => setRevealedCount((c) => c + 1), 250);
    return () => clearTimeout(t);
  }, [state, revealedCount]);

  const applyState = useCallback((s: BjState) => {
    setState(s);
    if (s.settled) prevSettledRef.current = false;
    if (s.session_id) {
      setSeedInfo({
        sessionId: s.session_id,
        hash: s.server_seed_hash ?? '',
        clientSeed: s.client_seed ?? '',
        nonce: s.nonce ?? 0,
      });
    }
    if (s.server_seed) setServerSeed(s.server_seed);
    if (s.settled) {
      refreshWallet();
      refreshHistory();
      const totalBet = s.hands.reduce((n, h) => n + h.bet, 0);
      const payout = s.payout ?? s.hands.reduce((n, h) => n + h.payout, 0);
      if (payout > totalBet) toast.success(`You won ${formatCoins(payout)} RC`);
      else if (payout === totalBet && payout > 0) toast.info('Push — bet returned');
    }
  }, [refreshWallet, refreshHistory]);

  const handleDeal = useCallback(async () => {
    if (!user || busy) return;
    if (!wallet || wallet.balance < betAmount) { toast.error('Insufficient balance'); return; }
    setBusy(true);
    setServerSeed(null);
    setDealtCount(0);
    setRevealedCount(0);
    prevSettledRef.current = false;
    try {
      const s = await blackjackDeal(betAmount);
      applyState(s);
      refreshWallet();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Deal failed');
    } finally {
      setBusy(false);
    }
  }, [user, busy, wallet, betAmount, applyState, refreshWallet]);

  const handleAction = useCallback(async (action: 'hit' | 'stand' | 'double' | 'split') => {
    if (!state?.session_id || state.settled || busy) return;
    setBusy(true);
    try {
      const s = await blackjackAction(state.session_id, action);
      applyState({ ...s, session_id: state.session_id });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setBusy(false);
    }
  }, [state, busy, applyState]);

  const playing = !!state && !state.settled;
  const activeHand: BjHand | null = playing && state ? state.hands[state.active] ?? null : null;
  const canDouble = !!activeHand && activeHand.cards.length === 2 && (wallet?.balance ?? 0) >= activeHand.bet;
  const canSplit = !!activeHand && activeHand.cards.length === 2 && state!.hands.length < 4
    && Math.min(activeHand.cards[0].rank, 10) === Math.min(activeHand.cards[1].rank, 10)
    && (wallet?.balance ?? 0) >= activeHand.bet;

  const pfData: ProvablyFairData | null = state?.settled && seedInfo && serverSeed ? {
    roundId: seedInfo.sessionId,
    clientSeed: seedInfo.clientSeed,
    serverSeed,
    serverSeedHash: seedInfo.hash,
    nonce: seedInfo.nonce,
    gameType: 'Blackjack',
  } : null;

  const dealerVal = state ? handValue(state.dealer) : null;
  let cardIndex = 0;

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 animate-fade-in">
      <div className="flex flex-1 flex-col gap-4 overflow-hidden lg:flex-row">
        {/* ── LEFT PANEL ── */}
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
                <input
                  type="number" value={betInput} onChange={(e) => setBetInput(e.target.value)}
                  disabled={playing || busy} min={minBet} max={maxBet} step="0.01"
                  className="h-9 w-full rounded border border-border/60 bg-surface-2 pl-7 pr-2 text-[13px] font-mono font-semibold focus:border-primary/50 focus:outline-none disabled:opacity-50"
                />
              </div>
              <button onClick={() => setBetInput((v) => (parseFloat(v) / 2 || minBet).toFixed(2))} disabled={playing || busy}
                className="h-9 rounded border border-border/60 bg-surface-2 px-2.5 text-[12px] font-semibold text-muted-foreground hover:border-primary/40 disabled:opacity-40">1/2</button>
              <button onClick={() => setBetInput((v) => (parseFloat(v) * 2 || minBet).toFixed(2))} disabled={playing || busy}
                className="h-9 rounded border border-border/60 bg-surface-2 px-2.5 text-[12px] font-semibold text-muted-foreground hover:border-primary/40 disabled:opacity-40">2x</button>
            </div>
          </div>

          {/* Actions */}
          <div className="grid grid-cols-2 gap-1.5">
            <ActionButton label="Hit" onClick={() => handleAction('hit')} disabled={!playing || busy} />
            <ActionButton label="Stand" onClick={() => handleAction('stand')} disabled={!playing || busy} />
            <ActionButton label="Double" onClick={() => handleAction('double')} disabled={!playing || busy || !canDouble} />
            <ActionButton label="Split" onClick={() => handleAction('split')} disabled={!playing || busy || !canSplit} />
          </div>

          <div className="flex-1" />

          <button
            onClick={handleDeal}
            disabled={playing || busy}
            className={cn(
              'flex h-11 w-full items-center justify-center gap-2 rounded bg-primary text-[14px] font-bold text-primary-foreground transition-all hover:bg-primary/90',
              (playing || busy) && 'opacity-60',
              busy && 'animate-pulse'
            )}
          >
            <Spade className="h-4 w-4" />
            {playing ? 'Hand in progress' : busy ? 'Dealing…' : 'Start new game'}
          </button>

          {pfData && <ProvablyFairPanel data={pfData} />}
        </div>

        {/* ── TABLE ── */}
        <div className="relative flex flex-1 flex-col items-center justify-between gap-6 overflow-y-auto rounded border border-border/60 bg-surface-1 p-6 scrollbar-thin">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(245,158,11,0.05),transparent_70%)]" />

          {/* Dealer */}
          <div className="flex flex-col items-center gap-2">
            <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Dealer</span>
            <div className="flex items-center gap-1.5">
              {state ? (
                <>
                  {state.dealer.map((c, i) => {
                    const idx = cardIndex++;
                    const visible = state.settled ? revealedCount > i : dealtCount > idx;
                    return <PlayingCard key={i} card={c} dealt={visible} />;
                  })}
                  {!state.settled && <FaceDownCard />}
                </>
              ) : (
                <>
                  <FaceDownCard /><FaceDownCard />
                </>
              )}
            </div>
            {state && dealerVal && (
              <span className="font-mono text-[13px] font-bold">
                {state.settled ? state.dealer_value ?? dealerVal.value : handValue([state.dealer[0]]).value}
              </span>
            )}
          </div>

          <div className="text-center text-[11px] uppercase tracking-[0.2em] text-muted-foreground/60">
            Blackjack pays 3 to 2 · Dealer stands on 17
          </div>

          {/* Player hands */}
          <div className="flex flex-wrap items-end justify-center gap-6">
            {state ? state.hands.map((h, hi) => {
              const hv = handValue(h.cards);
              const isActive = playing && state.active === hi;
              const won = h.result && ['blackjack', 'win', 'dealer_bust'].includes(h.result);
              const lost = h.result && ['bust', 'lose'].includes(h.result);
              return (
                <div key={hi} className={cn(
                  'flex flex-col items-center gap-2 rounded-lg p-3 transition-all',
                  isActive && 'ring-2 ring-gold/70 bg-gold/5',
                )}>
                  <div className="flex items-center gap-1.5">
                    {h.cards.map((c, ci) => {
                      const idx = cardIndex++;
                      return <PlayingCard key={ci} card={c} dealt={dealtCount > idx} />;
                    })}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[13px] font-bold">{hv.value}{hv.soft && hv.value !== 21 ? ' (soft)' : ''}</span>
                    <span className="font-mono text-[11px] text-gold">{formatCoins(h.bet)} RC{h.doubled ? ' (2x)' : ''}</span>
                  </div>
                  {state.settled && h.result && (
                    <span className={cn(
                      'rounded px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide',
                      won ? 'bg-success/15 text-success' : lost ? 'bg-destructive/15 text-destructive' : 'bg-surface-2 text-muted-foreground'
                    )}>
                      {RESULT_LABEL[h.result] ?? h.result}{h.payout > 0 ? ` · +${formatCoins(h.payout)}` : ''}
                    </span>
                  )}
                </div>
              );
            }) : (
              <p className="pb-4 text-[13px] text-muted-foreground">Place a bet and start a new game</p>
            )}
          </div>
        </div>
      </div>

      {/* History */}
      {sessions.length > 0 && (
        <div className="space-y-1.5">
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Live Feed</h3>
          <div className="rounded border border-border/60 bg-surface-1">
            <div className="grid grid-cols-[1fr_80px_80px] gap-2 border-b border-border/60 px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              <span>Bet</span>
              <span className="text-right">Payout</span>
              <span className="text-right">Profit</span>
            </div>
            <div className="max-h-[200px] overflow-y-auto scrollbar-thin">
              {sessions.map((s) => {
                const won = (s.profit ?? 0) > 0;
                return (
                  <div key={s.id} className="grid grid-cols-[1fr_80px_80px] items-center gap-2 border-b border-border/40 px-3 py-1.5 text-[12px] last:border-0 hover:bg-surface-2">
                    <span className="font-mono">{formatCoins(s.bet_amount ?? 0)}</span>
                    <span className="text-right font-mono">{formatCoins(s.payout ?? 0)}</span>
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

function ActionButton({ label, onClick, disabled }: { label: string; onClick: () => void; disabled: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="h-10 rounded border border-border/60 bg-surface-2 text-[13px] font-semibold transition-all hover:border-primary/40 hover:bg-surface-2/80 disabled:opacity-35"
    >
      {label}
    </button>
  );
}

function PlayingCard({ card, dealt }: { card: BjCard; dealt: boolean }) {
  const red = card.suit === 1 || card.suit === 2;
  return (
    <div
      className={cn(
        'flex h-[72px] w-[52px] flex-col items-center justify-between rounded-md border bg-white p-1 shadow-md transition-all duration-300',
        red ? 'text-red-600' : 'text-slate-900',
        dealt ? 'translate-y-0 rotate-0 opacity-100' : '-translate-y-3 opacity-0'
      )}
    >
      <span className="self-start text-[13px] font-bold leading-none">{RANKS[card.rank]}</span>
      <span className="text-[20px] leading-none">{SUITS[card.suit]}</span>
      <span className="self-end rotate-180 text-[13px] font-bold leading-none">{RANKS[card.rank]}</span>
    </div>
  );
}

function FaceDownCard() {
  return (
    <div className="flex h-[72px] w-[52px] items-center justify-center rounded-md border border-border/60 bg-gradient-to-br from-surface-2 to-background shadow-md">
      <div className="h-[56px] w-[38px] rounded-sm border border-gold/30 bg-[repeating-linear-gradient(45deg,rgba(245,158,11,0.15),rgba(245,158,11,0.15)_4px,transparent_4px,transparent_8px)]" />
    </div>
  );
}
