import { useState, useEffect, useCallback, useRef } from 'react';
import { Spade } from 'lucide-react';
import { useAuth } from '@/authentication/auth-context';
import { useWallet } from '@/wallet/wallet-context';
import { getGameConfig } from '@/game-engine/game-config-service';
import { blackjackDeal, blackjackAction, getActiveSession, type BjCard, type BjHand, type BjState } from '@/game-engine/game-service';
import { ProvablyFairPanel, type ProvablyFairData } from '@/game-engine/provably-fair-panel';
import { useGameHistory } from '@/game-engine/use-game-history';
import { cn, formatMD, dollarsToCents, centsToDollars } from '@/lib/utils';
import { toast } from 'sonner';
import type { GameSession } from '@/types';

const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const DEAL_DELAY = 600;

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
  blackjack: 'Blackjack!', win: 'Win', dealer_bust: 'Dealer Bust',
  push: 'Push', bust: 'Bust', lose: 'Lose',
};

type GameState = 'idle' | 'dealing' | 'playing' | 'settling' | 'complete';

export function BlackjackPage() {
  const { user } = useAuth();
  const { wallet, refresh: refreshWallet } = useWallet();
  const { sessions, refresh: refreshHistory } = useGameHistory('blackjack', 20);

  const [minBet, setMinBet] = useState(10);
  const [maxBet, setMaxBet] = useState(1000000000);
  const [betInput, setBetInput] = useState('1.00');
  const [state, setState] = useState<BjState | null>(null);
  const [seedInfo, setSeedInfo] = useState<{ sessionId: string; hash: string; clientSeed: string; nonce: number } | null>(null);
  const [serverSeed, setServerSeed] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [gameState, setGameState] = useState<GameState>('idle');
  const [visibleCards, setVisibleCards] = useState(0);
  const [revealedHole, setRevealedHole] = useState(false);
  const [displayedPlayerScore, setDisplayedPlayerScore] = useState(0);
  const [displayedDealerScore, setDisplayedDealerScore] = useState(0);
  const animTimers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const betAmount = Math.max(minBet, Math.min(maxBet, dollarsToCents(parseFloat(betInput) || 0)));

  useEffect(() => {
    getGameConfig('blackjack').then((cfg) => {
      if (!cfg) return;
      setMinBet(cfg.min_bet);
      setMaxBet(cfg.max_bet);
    });
  }, []);

  const clearTimers = useCallback(() => {
    animTimers.current.forEach(clearTimeout);
    animTimers.current = [];
  }, []);

  useEffect(() => () => clearTimers(), [clearTimers]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const active = await getActiveSession('blackjack');
        if (!mounted || !active) return;
        const result = active.result as Record<string, unknown> | null;
        if (!result) return;
        const hands = (result.hands ?? []) as BjHand[];
        const dealer = (result.dealer ?? []) as BjCard[];
        const settled = result.settled as boolean;
        const s: BjState = {
          session_id: active.id, settled,
          hands, dealer,
          active: result.active as number,
          dealer_value: result.dealer_value as number | undefined,
          payout: result.payout as number | undefined,
          server_seed: active.server_seed ?? undefined,
          server_seed_hash: active.server_seed_hash,
          client_seed: active.client_seed,
          nonce: active.nonce,
        };
        setState(s);
        setSeedInfo({ sessionId: active.id, hash: active.server_seed_hash, clientSeed: active.client_seed, nonce: active.nonce });
        if (active.server_seed) setServerSeed(active.server_seed);
        const total = hands.reduce((n, h) => n + h.cards.length, 0) + dealer.length;
        setVisibleCards(total);
        setRevealedHole(settled);
        setDisplayedPlayerScore(handValue(hands[0]?.cards ?? []).value);
        setDisplayedDealerScore(handValue([dealer[0]]).value);
        setGameState(settled ? 'complete' : 'playing');
      } catch { /* ignore */ }
    })();
    return () => { mounted = false; };
  }, []);

  const applyState = useCallback((s: BjState) => {
    setState(s);
    if (s.session_id) {
      setSeedInfo({ sessionId: s.session_id, hash: s.server_seed_hash ?? '', clientSeed: s.client_seed ?? '', nonce: s.nonce ?? 0 });
    }
    if (s.server_seed) setServerSeed(s.server_seed);
    if (s.settled) {
      refreshWallet();
      refreshHistory();
      const totalBet = s.hands.reduce((n, h) => n + h.bet, 0);
      const payout = s.payout ?? s.hands.reduce((n, h) => n + h.payout, 0);
      if (payout > totalBet) toast.success(`You won ${formatMD(payout)}`);
      else if (payout === totalBet && payout > 0) toast.info('Push — bet returned');
    }
  }, [refreshWallet, refreshHistory]);

  const playing = !!state && !state.settled;
  const activeHand: BjHand | null = playing && state ? state.hands[state.active] ?? null : null;
  const canDouble = !!activeHand && activeHand.cards.length === 2 && (wallet?.balance ?? 0) >= activeHand.bet;

  const handleDeal = useCallback(async () => {
    if (!user || busy || playing) return;
    if (!wallet || wallet.balance < betAmount) { toast.error('Insufficient balance'); return; }
    setBusy(true);
    setServerSeed(null);
    setVisibleCards(0);
    setRevealedHole(false);
    setDisplayedPlayerScore(0);
    setDisplayedDealerScore(0);
    setGameState('dealing');
    clearTimers();
    try {
      const s = await blackjackDeal(betAmount);
      applyState(s);
      refreshWallet();
      const totalCards = s.hands.reduce((n, h) => n + h.cards.length, 0) + s.dealer.length;
      for (let i = 1; i <= totalCards; i++) {
        const t = setTimeout(() => {
          setVisibleCards(i);
          if (i === 1) setDisplayedPlayerScore(handValue([s.hands[0].cards[0]]).value);
          if (i === 2) setDisplayedDealerScore(handValue([s.dealer[0]]).value);
          if (i === 3) setDisplayedPlayerScore(handValue([s.hands[0].cards[0], s.hands[0].cards[1]]).value);
        }, i * DEAL_DELAY);
        animTimers.current.push(t);
      }
      const settleTime = totalCards * DEAL_DELAY + 200;
      const t = setTimeout(() => {
        setGameState(s.settled ? 'complete' : 'playing');
        setBusy(false);
      }, settleTime);
      animTimers.current.push(t);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Deal failed');
      setGameState('idle');
      setBusy(false);
    }
  }, [user, busy, playing, wallet, betAmount, applyState, refreshWallet, clearTimers]);

  const handleAction = useCallback(async (action: 'hit' | 'stand' | 'double' | 'split') => {
    if (!state?.session_id || state.settled || busy) return;
    setBusy(true);
    setGameState('settling');
    try {
      const s = await blackjackAction(state.session_id, action);
      const prevVisible = visibleCards;
      const newTotal = s.hands.reduce((n, h) => n + h.cards.length, 0) + s.dealer.length;

      if (s.settled) {
        const t1 = setTimeout(() => {
          setRevealedHole(true);
          setVisibleCards(prevVisible + 1);
          setDisplayedDealerScore(handValue(s.dealer).value);
        }, DEAL_DELAY);
        animTimers.current.push(t1);

        const remaining = newTotal - prevVisible - 1;
        for (let i = 0; i < remaining; i++) {
          const t = setTimeout(() => {
            setVisibleCards(prevVisible + 2 + i);
            setDisplayedDealerScore(handValue(s.dealer.slice(0, prevVisible - visibleCards + 2 + i + 1)).value);
          }, (i + 1) * DEAL_DELAY + DEAL_DELAY);
          animTimers.current.push(t);
        }

        const finalTime = (remaining + 2) * DEAL_DELAY + 200;
        const tFinal = setTimeout(() => {
          applyState(s);
          setDisplayedDealerScore(s.dealer_value ?? handValue(s.dealer).value);
          setGameState('complete');
          setBusy(false);
        }, finalTime);
        animTimers.current.push(tFinal);
      } else {
        const cardsAdded = newTotal - prevVisible;
        for (let i = 1; i <= cardsAdded; i++) {
          const t = setTimeout(() => {
            setVisibleCards(prevVisible + i);
            setDisplayedPlayerScore(handValue(s.hands[s.active]?.cards.slice(0, prevVisible - visibleCards + i + 1) ?? []).value);
          }, i * DEAL_DELAY);
          animTimers.current.push(t);
        }
        const t = setTimeout(() => {
          applyState(s);
          setDisplayedPlayerScore(handValue(s.hands[s.active]?.cards ?? []).value);
          setGameState('playing');
          setBusy(false);
        }, cardsAdded * DEAL_DELAY + 200);
        animTimers.current.push(t);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Action failed');
      setGameState('playing');
      setBusy(false);
    }
  }, [state, busy, applyState, clearTimers]);

  const handleNewGame = useCallback(() => {
    clearTimers();
    setState(null);
    setVisibleCards(0);
    setRevealedHole(false);
    setDisplayedPlayerScore(0);
    setDisplayedDealerScore(0);
    setServerSeed(null);
    setGameState('idle');
    setBusy(false);
  }, [clearTimers]);

  const pfData: ProvablyFairData | null = state?.settled && seedInfo && serverSeed ? {
    roundId: seedInfo.sessionId, clientSeed: seedInfo.clientSeed, serverSeed,
    serverSeedHash: seedInfo.hash, nonce: seedInfo.nonce, gameType: 'Blackjack',
  } : null;

  let cardIndex = 0;

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
                <input type="number" value={betInput} onChange={(e) => setBetInput(e.target.value)}
                  disabled={playing || busy} min={centsToDollars(minBet)} max={centsToDollars(maxBet)} step="0.01"
                  className="h-9 w-full rounded border border-border/60 bg-surface-2 pl-7 pr-2 text-[13px] font-mono font-semibold focus:border-primary/50 focus:outline-none disabled:opacity-50" />
              </div>
              <button onClick={() => setBetInput((v) => (parseFloat(v) / 2 || centsToDollars(minBet)).toFixed(2))} disabled={playing || busy}
                className="h-9 rounded border border-border/60 bg-surface-2 px-2.5 text-[12px] font-semibold text-muted-foreground hover:border-primary/40 disabled:opacity-40">1/2</button>
              <button onClick={() => setBetInput((v) => (parseFloat(v) * 2 || centsToDollars(minBet)).toFixed(2))} disabled={playing || busy}
                className="h-9 rounded border border-border/60 bg-surface-2 px-2.5 text-[12px] font-semibold text-muted-foreground hover:border-primary/40 disabled:opacity-40">2x</button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            <ActionButton label="Hit" onClick={() => handleAction('hit')} disabled={!playing || busy} />
            <ActionButton label="Stand" onClick={() => handleAction('stand')} disabled={!playing || busy} />
            <ActionButton label="Double" onClick={() => handleAction('double')} disabled={!playing || busy || !canDouble} />
          </div>

          <div className="flex-1" />

          {gameState === 'complete' && state?.settled ? (
            <button onClick={handleNewGame} className="flex h-11 w-full items-center justify-center gap-2 rounded bg-primary text-[14px] font-bold text-primary-foreground transition-all hover:bg-primary/90">
              <Spade className="h-4 w-4" /> New Game
            </button>
          ) : (
            <button onClick={handleDeal} disabled={playing || busy}
              className={cn('flex h-11 w-full items-center justify-center gap-2 rounded bg-primary text-[14px] font-bold text-primary-foreground transition-all hover:bg-primary/90',
                (playing || busy) && 'opacity-60', busy && 'animate-pulse')}>
              <Spade className="h-4 w-4" />{busy ? (gameState === 'dealing' ? 'Dealing…' : 'Processing…') : 'Deal'}
            </button>
          )}

          {pfData && <ProvablyFairPanel data={pfData} />}
        </div>

        {/* TABLE */}
        <div className="relative flex flex-1 flex-col items-center justify-between gap-6 overflow-y-auto rounded border border-border/60 bg-gradient-to-b from-emerald-950/40 to-surface-1 p-6 scrollbar-thin">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(20,83,45,0.08),transparent_70%)]" />

          {/* Dealer */}
          <div className="flex flex-col items-center gap-2">
            <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Dealer</span>
            <div className="flex items-center gap-2">
              {state ? (
                <>
                  {state.dealer.map((c, i) => {
                    const idx = cardIndex++;
                    const isHole = i === 1 && !state.settled;
                    const visible = state.settled ? revealedHole && visibleCards > idx : visibleCards > idx;
                    return isHole && !state.settled ? (
                      <FaceDownCard key={i} dealt={visibleCards > idx} />
                    ) : (
                      <PlayingCard key={i} card={c} dealt={visible} />
                    );
                  })}
                </>
              ) : (<><FaceDownCard dealt={false} /><FaceDownCard dealt={false} /></>)}
            </div>
            {state && (
              <span className="font-mono text-[14px] font-bold text-foreground/90">{displayedDealerScore || '—'}</span>
            )}
          </div>

          <div className="text-center text-[11px] uppercase tracking-[0.2em] text-muted-foreground/50">
            Blackjack pays 6:5 · Dealer stands on 17
          </div>

          {/* Player */}
          <div className="flex flex-wrap items-end justify-center gap-6">
            {state ? state.hands.map((h, hi) => {
              const hv = handValue(h.cards);
              const isActive = playing && state.active === hi;
              const won = h.result && ['blackjack', 'win', 'dealer_bust'].includes(h.result);
              const lost = h.result && ['bust', 'lose'].includes(h.result);
              return (
                <div key={hi} className={cn('flex flex-col items-center gap-2 rounded-lg p-3 transition-all', isActive && 'ring-2 ring-gold/70 bg-gold/5')}>
                  <div className="flex items-center gap-2">
                    {h.cards.map((c, ci) => {
                      const idx = cardIndex++;
                      return <PlayingCard key={ci} card={c} dealt={visibleCards > idx} />;
                    })}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[14px] font-bold">{displayedPlayerScore || '—'}</span>
                    <span className="font-mono text-[11px] text-gold">{formatMD(h.bet)}</span>
                  </div>
                  {state.settled && h.result && (
                    <span className={cn('rounded px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide',
                      won ? 'bg-success/15 text-success' : lost ? 'bg-destructive/15 text-destructive' : 'bg-surface-2 text-muted-foreground')}>
                      {RESULT_LABEL[h.result] ?? h.result}{h.payout > 0 ? ` · +${formatMD(h.payout)}` : ''}
                    </span>
                  )}
                </div>
              );
            }) : <p className="pb-4 text-[13px] text-muted-foreground">Place a bet and deal</p>}
          </div>
        </div>
      </div>

      {sessions.length > 0 && (
        <div className="space-y-1.5">
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Live Feed</h3>
          <div className="rounded border border-border/60 bg-surface-1">
            <div className="grid grid-cols-[1fr_80px_80px] gap-2 border-b border-border/60 px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              <span>Bet</span><span className="text-right">Payout</span><span className="text-right">Profit</span>
            </div>
            <div className="max-h-[200px] overflow-y-auto scrollbar-thin">
              {sessions.map((s) => (
                <div key={s.id} className="grid grid-cols-[1fr_80px_80px] items-center gap-2 border-b border-border/40 px-3 py-1.5 text-[12px] last:border-0 hover:bg-surface-2">
                  <span className="font-mono">{formatMD(s.bet_amount ?? 0)}</span>
                  <span className="text-right font-mono">{formatMD(s.payout ?? 0)}</span>
                  <span className={cn('text-right font-mono font-semibold', (s.profit ?? 0) > 0 ? 'text-success' : 'text-destructive')}>
                    {(s.profit ?? 0) > 0 ? '+' : ''}{formatMD(s.profit ?? 0)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ActionButton({ label, onClick, disabled }: { label: string; onClick: () => void; disabled: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled}
      className="h-10 rounded border border-border/60 bg-surface-2 text-[13px] font-semibold transition-all hover:border-primary/40 hover:bg-surface-2/80 disabled:opacity-35">
      {label}
    </button>
  );
}

function PlayingCard({ card, dealt }: { card: BjCard; dealt: boolean }) {
  const red = card.suit === 1 || card.suit === 2;
  return (
    <div className={cn(
      'relative flex h-[88px] w-[64px] flex-col items-center justify-between rounded-lg shadow-lg transition-all duration-500',
      'border border-slate-300/80 bg-gradient-to-br from-white to-slate-50',
      red ? 'text-red-600' : 'text-slate-900',
      dealt ? 'translate-y-0 rotate-0 opacity-100' : '-translate-y-8 opacity-0'
    )}>
      <span className="absolute left-1.5 top-1 text-[14px] font-bold leading-none">{RANKS[card.rank]}</span>
      <span className="absolute left-1.5 top-6 text-[12px] leading-none">{SUITS[card.suit]}</span>
      <span className="text-[28px] leading-none">{SUITS[card.suit]}</span>
      <span className="absolute bottom-1.5 right-1.5 rotate-180 text-[14px] font-bold leading-none">{RANKS[card.rank]}</span>
      <span className="absolute bottom-6 right-1.5 rotate-180 text-[12px] leading-none">{SUITS[card.suit]}</span>
    </div>
  );
}

function FaceDownCard({ dealt }: { dealt: boolean }) {
  return (
    <div className={cn(
      'flex h-[88px] w-[64px] items-center justify-center rounded-lg shadow-lg transition-all duration-500',
      'border border-border/60 bg-gradient-to-br from-slate-800 to-slate-900',
      dealt ? 'translate-y-0 opacity-100' : '-translate-y-8 opacity-0'
    )}>
      <div className="h-[72px] w-[48px] rounded-md border border-gold/20 bg-[repeating-linear-gradient(45deg,rgba(245,158,11,0.12),rgba(245,158,11,0.12)_4px,transparent_4px,transparent_8px)]" />
    </div>
  );
}
