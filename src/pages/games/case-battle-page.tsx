import { useState, useEffect, useCallback, useRef } from 'react';
import { Swords, Plus, Bot, X, Trophy, Zap, Users, Loader2, Coins } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/authentication/auth-context';
import { useWallet } from '@/wallet/wallet-context';
import {
  getCaseCatalog, getOpenBattles, getBattleParticipants,
  createCaseBattle, joinCaseBattle, cancelCaseBattle,
  callCaseBattleBot, generateCasePull, settleCaseBattle,
  createBattleRound, recordCasePull, getBattlePulls,
  type CaseCatalogItem, type CaseBattle, type CaseBattleParticipant,
  type CasePullResult,
} from '@/game-engine/game-service';
import { supabase } from '@/lib/supabase';
import { cn, formatMD } from '@/lib/utils';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Loader } from '@/components/loader';

const RARITY_COLORS: Record<string, string> = {
  common: 'text-slate-400 border-slate-500/30 bg-slate-500/10',
  uncommon: 'text-green-400 border-green-500/30 bg-green-500/10',
  rare: 'text-blue-400 border-blue-500/30 bg-blue-500/10',
  epic: 'text-purple-400 border-purple-500/30 bg-purple-500/10',
  legendary: 'text-amber-400 border-amber-500/30 bg-amber-500/10',
  mythical: 'text-rose-400 border-rose-500/30 bg-rose-500/10',
};

type View = 'lobby' | 'battle';

export function CaseBattlePage() {
  const { user } = useAuth();
  const { wallet, refresh: refreshWallet } = useWallet();
  const navigate = useNavigate();

  const [view, setView] = useState<View>('lobby');
  const [catalog, setCatalog] = useState<CaseCatalogItem[]>([]);
  const [battles, setBattles] = useState<CaseBattle[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [activeBattleId, setActiveBattleId] = useState<string | null>(null);

  // Create form state
  const [selectedCases, setSelectedCases] = useState<string[]>([]);
  const [mode, setMode] = useState<'normal' | 'crazy' | 'jackpot'>('normal');
  const [format, setFormat] = useState<'1v1' | '2v2'>('1v1');
  const [fastMode, setFastMode] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    getCaseCatalog().then(setCatalog).catch(() => {});
    loadBattles();
    setLoading(false);

    const channel = supabase
      .channel('case_battles_live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'case_battles' }, () => loadBattles())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'case_battle_participants' }, () => {
        if (activeBattleId) loadBattleState(activeBattleId);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [activeBattleId]);

  const loadBattles = useCallback(async () => {
    try {
      const open = await getOpenBattles();
      setBattles(open);
    } catch { /* ignore */ }
  }, []);

  const loadBattleState = useCallback(async (battleId: string) => {
    // Refresh participants via realtime
  }, []);

  const entryCost = selectedCases.reduce((sum, slug) => {
    const c = catalog.find((c) => c.slug === slug);
    return sum + (c?.price ?? 0);
  }, 0);

  const handleCreate = useCallback(async () => {
    if (!user || selectedCases.length === 0) return;
    if (!wallet || wallet.balance < entryCost) { toast.error('Insufficient balance'); return; }
    setCreating(true);
    try {
      const res = await createCaseBattle(mode, format, fastMode, selectedCases, entryCost);
      toast.success('Battle created!');
      setCreateOpen(false);
      setSelectedCases([]);
      refreshWallet();
      setActiveBattleId(res.battle_id);
      setView('battle');
      loadBattles();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create battle');
    } finally {
      setCreating(false);
    }
  }, [user, wallet, selectedCases, entryCost, mode, format, fastMode, refreshWallet, loadBattles]);

  const handleJoin = useCallback(async (battle: CaseBattle, team: string, slot: number) => {
    if (!user) return;
    if (!wallet || wallet.balance < battle.entry_cost) { toast.error('Insufficient balance'); return; }
    try {
      await joinCaseBattle(battle.id, team, slot);
      toast.success('Joined battle!');
      refreshWallet();
      setActiveBattleId(battle.id);
      setView('battle');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to join');
    }
  }, [user, wallet, refreshWallet]);

  const handleCancel = useCallback(async (battleId: string) => {
    try {
      await cancelCaseBattle(battleId);
      toast.success('Battle cancelled, entry refunded');
      refreshWallet();
      loadBattles();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to cancel');
    }
  }, [refreshWallet, loadBattles]);

  const handleCallBot = useCallback(async (battleId: string, team: string, slot: number) => {
    try {
      const res = await callCaseBattleBot(battleId, team, slot);
      toast.success(`Bot ${res.bot_name} joined!`);
      loadBattles();
      if (res.status === 'in_progress') {
        setActiveBattleId(battleId);
        setView('battle');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to call bot');
    }
  }, [loadBattles]);

  if (loading) {
    return <div className="flex h-64 items-center justify-center"><Loader className="h-6 w-6" /></div>;
  }

  if (view === 'battle' && activeBattleId) {
    return <BattleView battleId={activeBattleId} onExit={() => { setView('lobby'); setActiveBattleId(null); loadBattles(); }} />;
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[15px] font-bold tracking-tight">Case Battle</h1>
          <p className="mt-0.5 text-[12px] text-muted-foreground">Create or join a case opening battle</p>
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />Create Battle
        </Button>
      </div>

      {/* Open battles */}
      <div className="space-y-2">
        {battles.length === 0 ? (
          <div className="flex h-48 flex-col items-center justify-center gap-3 rounded border border-border/60 bg-surface-1">
            <Swords className="h-10 w-10 text-muted-foreground/30" />
            <p className="text-[13px] text-muted-foreground">No open battles. Create one to get started!</p>
          </div>
        ) : (
          battles.map((battle) => (
            <BattleCard key={battle.id} battle={battle} catalog={catalog} userId={user?.id ?? ''} onJoin={handleJoin} onCancel={handleCancel} onCallBot={handleCallBot} />
          ))
        )}
      </div>

      {/* Create Battle Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Case Battle</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Mode selection */}
            <div className="grid grid-cols-3 gap-2">
              {(['normal', 'crazy', 'jackpot'] as const).map((m) => (
                <button key={m} onClick={() => setMode(m)}
                  className={cn('h-11 rounded-lg border text-[13px] font-bold capitalize transition-all',
                    mode === m ? 'border-primary/60 bg-primary/15 text-primary' : 'border-border/60 bg-surface-2 text-muted-foreground hover:border-primary/30')}>
                  {m}
                </button>
              ))}
            </div>
            {mode === 'crazy' && (
              <div className="rounded border border-destructive/40 bg-destructive/10 px-3 py-2 text-[12px] text-destructive">
                <b>Crazy Mode:</b> Lowest total value wins! The win condition is reversed.
              </div>
            )}
            {mode === 'jackpot' && (
              <div className="rounded border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-400">
                <b>Jackpot Mode:</b> All cases opened normally, then totals become weighted probabilities for a final spin.
              </div>
            )}

            {/* Format */}
            <div className="grid grid-cols-2 gap-2">
              {(['1v1', '2v2'] as const).map((f) => (
                <button key={f} onClick={() => setFormat(f)}
                  className={cn('h-11 rounded-lg border text-[13px] font-bold transition-all',
                    format === f ? 'border-primary/60 bg-primary/15 text-primary' : 'border-border/60 bg-surface-2 text-muted-foreground hover:border-primary/30')}>
                  {f}
                </button>
              ))}
            </div>

            {/* Fast mode */}
            <button onClick={() => setFastMode(!fastMode)}
              className={cn('flex h-10 w-full items-center justify-center gap-2 rounded-lg border text-[13px] font-bold transition-all',
                fastMode ? 'border-primary/60 bg-primary/15 text-primary' : 'border-border/60 bg-surface-2 text-muted-foreground')}>
              <Zap className="h-4 w-4" />Fast Mode {fastMode ? 'ON' : 'OFF'}
            </button>

            {/* Case selection */}
            <div>
              <p className="mb-2 text-[11px] uppercase tracking-wide text-muted-foreground">Select Cases (rounds)</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {catalog.map((c) => {
                  const count = selectedCases.filter((s) => s === c.slug).length;
                  return (
                    <button key={c.slug} onClick={() => setSelectedCases((prev) => [...prev, c.slug])}
                      className={cn('relative flex flex-col items-center rounded-lg border p-3 transition-all',
                        count > 0 ? 'border-primary/60 bg-primary/10' : 'border-border/60 bg-surface-2 hover:border-primary/30')}>
                      <p className="text-[13px] font-bold">{c.name}</p>
                      <p className="text-[11px] text-muted-foreground">{formatMD(c.price)}</p>
                      {count > 0 && (
                        <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">{count}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Selected rounds */}
            {selectedCases.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {selectedCases.map((slug, i) => {
                  const c = catalog.find((c) => c.slug === slug);
                  return (
                    <div key={i} className="flex items-center gap-1 rounded border border-border/40 bg-surface-2 px-2 py-1 text-[11px]">
                      <span>{i + 1}. {c?.name ?? slug}</span>
                      <button onClick={() => setSelectedCases((prev) => { const copy = [...prev]; copy.splice(i, 1); return copy; })}>
                        <X className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Total */}
            <div className="rounded-lg border border-border/60 bg-surface-1 px-4 py-3">
              <div className="flex items-center justify-between">
                <span className="text-[13px] font-semibold">Entry Cost Per Player</span>
                <span className="font-mono text-[16px] font-bold text-gold">{formatMD(entryCost)}</span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={creating || selectedCases.length === 0 || (wallet?.balance ?? 0) < entryCost}>
              {creating ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Creating…</> : `Create — ${formatMD(entryCost)}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function BattleCard({
  battle, catalog, userId, onJoin, onCancel, onCallBot,
}: {
  battle: CaseBattle; catalog: CaseCatalogItem[]; userId: string;
  onJoin: (b: CaseBattle, team: string, slot: number) => void;
  onCancel: (id: string) => void;
  onCallBot: (id: string, team: string, slot: number) => void;
}) {
  const [participants, setParticipants] = useState<CaseBattleParticipant[]>([]);
  const maxSlots = battle.format === '1v1' ? 2 : 4;

  useEffect(() => {
    getBattleParticipants(battle.id).then(setParticipants).catch(() => {});
    const channel = supabase
      .channel(`battle_${battle.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'case_battle_participants', filter: `battle_id=eq.${battle.id}` },
        () => getBattleParticipants(battle.id).then(setParticipants))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [battle.id]);

  const filledSlots = participants.length;
  const isCreator = battle.creator_id === userId;
  const canCancel = isCreator && filledSlots <= 1;
  const rounds = (battle.rounds_config as unknown as string[]) ?? [];

  return (
    <div className="rounded-lg border border-border/60 bg-surface-1 p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* Creator */}
          <div className="flex items-center gap-1.5">
            <div className="flex h-7 w-7 items-center justify-center rounded bg-primary/15 text-[11px] font-bold text-primary">
              {participants[0]?.is_bot ? 'B' : (battle.creator_id.slice(0, 2).toUpperCase())}
            </div>
            <span className="text-[12px] font-semibold">{participants[0]?.bot_name ?? 'Creator'}</span>
          </div>
          {/* Badges */}
          <div className="flex items-center gap-1.5">
            <Badge variant="outline" className="text-[10px] capitalize">{battle.mode}</Badge>
            <Badge variant="outline" className="text-[10px]">{battle.format}</Badge>
            {battle.fast_mode && <Badge variant="outline" className="text-[10px] text-primary"><Zap className="h-2.5 w-2.5" />Fast</Badge>}
          </div>
        </div>
        <span className="font-mono text-[14px] font-bold text-gold">{formatMD(battle.entry_cost)}</span>
      </div>

      {/* Cases */}
      <div className="mt-2 flex flex-wrap gap-1">
        {rounds.map((slug, i) => {
          const c = catalog.find((c) => c.slug === slug);
          return (
            <span key={i} className="rounded border border-border/40 bg-surface-2 px-2 py-0.5 text-[11px]">
              {i + 1}. {c?.name ?? slug}
            </span>
          );
        })}
      </div>

      {/* Slots */}
      <div className="mt-2 flex items-center gap-2">
        {Array.from({ length: maxSlots }, (_, i) => {
          const p = participants[i];
          if (p) {
            return (
              <div key={i} className={cn('flex h-8 items-center gap-1.5 rounded border px-2',
                p.team === 'A' ? 'border-primary/30 bg-primary/5' : 'border-amber-500/30 bg-amber-500/5')}>
                <span className="text-[11px] font-bold">{p.is_bot ? p.bot_name : `Player ${i + 1}`}</span>
                {p.is_bot && <Badge variant="outline" className="text-[9px] text-primary">BOT</Badge>}
              </div>
            );
          }
          return (
            <button key={i} onClick={() => onJoin(battle, i < (maxSlots / 2) ? 'B' : 'A', i)}
              className="flex h-8 w-20 items-center justify-center rounded border border-dashed border-border/60 text-[11px] text-muted-foreground hover:border-primary/40 hover:text-primary">
              <Users className="h-3 w-3" /> Join
            </button>
          );
        })}
      </div>

      {/* Actions */}
      <div className="mt-2 flex items-center justify-between">
        <span className="text-[11px] text-muted-foreground">{filledSlots}/{maxSlots} players · {rounds.length} rounds</span>
        <div className="flex gap-1.5">
          {canCancel && <Button size="sm" variant="outline" onClick={() => onCancel(battle.id)}>Cancel</Button>}
          {isCreator && filledSlots < maxSlots && (
            <Button size="sm" variant="outline" onClick={() => {
              const team = filledSlots < maxSlots / 2 ? 'B' : 'A';
              onCallBot(battle.id, team, filledSlots);
            }}>
              <Bot className="mr-1 h-3 w-3" />Call Bot
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function BattleView({ battleId, onExit }: { battleId: string; onExit: () => void }) {
  const { user } = useAuth();
  const { refresh: refreshWallet } = useWallet();
  const [battle, setBattle] = useState<CaseBattle | null>(null);
  const [participants, setParticipants] = useState<CaseBattleParticipant[]>([]);
  const [pulls, setPulls] = useState<Record<string, CasePullResult[]>>({});
  const [currentRound, setCurrentRound] = useState(0);
  const [phase, setPhase] = useState<'waiting' | 'opening' | 'settled'>('waiting');
  const [revealedItems, setRevealedItems] = useState<Record<string, number>>({});
  const [settling, setSettling] = useState(false);
  const animTimers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const channel = supabase
      .channel(`battle_view_${battleId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'case_battles', filter: `id=eq.${battleId}` },
        () => loadBattle())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'case_battle_participants', filter: `battle_id=eq.${battleId}` },
        () => loadParticipants())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'case_battle_pulls', filter: `round_id=eq.${currentRound}` },
        () => loadPulls())
      .subscribe();

    loadBattle();
    loadParticipants();

    return () => {
      supabase.removeChannel(channel);
      animTimers.current.forEach(clearTimeout);
    };
  }, [battleId, currentRound]);

  const loadBattle = useCallback(async () => {
    const { data } = await supabase.from('case_battles').select('*').eq('id', battleId).single();
    if (data) {
      setBattle(data as CaseBattle);
      if ((data as CaseBattle).status === 'in_progress' && phase === 'waiting') {
        setPhase('opening');
        startRound((data as CaseBattle).current_round);
      }
      if ((data as CaseBattle).status === 'completed') {
        setPhase('settled');
      }
    }
  }, [phase]);

  const loadParticipants = useCallback(async () => {
    const p = await getBattleParticipants(battleId);
    setParticipants(p);
  }, [battleId]);

  const loadPulls = useCallback(async () => {
    // Load pulls for current round
  }, [currentRound]);

  const startRound = useCallback(async (roundNum: number) => {
    if (!battle || !user) return;
    const rounds = (battle.rounds_config as unknown as string[]) ?? [];
    if (roundNum >= rounds.length) {
      // All rounds done — settle
      settleBattle();
      return;
    }

    const caseSlug = rounds[roundNum];
    const roundId = await createBattleRound(battleId, roundNum, caseSlug);

    // Generate pulls for each participant
    const newPulls: Record<string, CasePullResult[]> = {};
    for (const p of participants) {
      try {
        const pull = await generateCasePull(caseSlug, `seed_${battleId}_${roundNum}`, p.slot);
        newPulls[p.id] = [pull];
        await recordCasePull(roundId, p.id, pull.item.name, pull.item.rarity, pull.item.value, pull.item.image_url, 0);
      } catch { /* ignore */ }
    }
    setPulls(newPulls);
    setRevealedItems({});

    // Animate reveals after delay
    const revealDelay = battle.fast_mode ? 500 : 2500;
    participants.forEach((p, i) => {
      const t = setTimeout(() => {
        setRevealedItems((prev) => ({ ...prev, [p.id]: 0 }));
      }, i * (battle.fast_mode ? 200 : 800));
      animTimers.current.push(t);
    });

    const t = setTimeout(() => {
      setCurrentRound(roundNum + 1);
      startRound(roundNum + 1);
    }, revealDelay + (battle.fast_mode ? 500 : 1500));
    animTimers.current.push(t);
  }, [battle, user, participants, battleId]);

  const settleBattle = useCallback(async () => {
    if (settling) return;
    setSettling(true);
    try {
      const res = await settleCaseBattle(battleId);
      refreshWallet();
      if (res.winner_id === user?.id) {
        toast.success(`You won the battle! +${formatMD(res.payout)}`);
      } else {
        toast.error('You lost the battle');
      }
      setPhase('settled');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Settlement failed');
    } finally {
      setSettling(false);
    }
  }, [battleId, user, refreshWallet, settling]);

  if (!battle) {
    return <div className="flex h-64 items-center justify-center"><Loader className="h-6 w-6" /></div>;
  }

  const rounds = (battle.rounds_config as unknown as string[]) ?? [];
  const maxSlots = battle.format === '1v1' ? 2 : 4;

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onExit}><X className="h-4 w-4" /></Button>
          <div>
            <h1 className="text-[15px] font-bold tracking-tight">Case Battle</h1>
            <p className="text-[12px] text-muted-foreground capitalize">{battle.mode} · {battle.format} {battle.fast_mode && '· Fast'}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-[12px]">
          <span className="text-muted-foreground">Round</span>
          <span className="font-mono font-bold">{Math.min(currentRound + 1, rounds.length)} / {rounds.length}</span>
        </div>
      </div>

      {/* Round sequence */}
      <div className="flex flex-wrap gap-1.5">
        {rounds.map((slug, i) => (
          <div key={i} className={cn('rounded border px-2 py-1 text-[11px]',
            i < currentRound ? 'border-success/30 bg-success/10 text-success' :
            i === currentRound ? 'border-primary/40 bg-primary/10 text-primary' : 'border-border/40 bg-surface-2 text-muted-foreground')}>
            {i + 1}. {slug}
          </div>
        ))}
      </div>

      {/* Player lanes */}
      <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${maxSlots}, 1fr)` }}>
        {participants.map((p) => {
          const teamPulls = pulls[p.id] ?? [];
          const revealedIdx = revealedItems[p.id] ?? -1;
          const totalValue = teamPulls.slice(0, revealedIdx + 1).reduce((sum, pr) => sum + pr.item.value, 0);
          return (
            <div key={p.id} className={cn('rounded-lg border p-3',
              p.team === 'A' ? 'border-primary/30 bg-primary/5' : 'border-amber-500/30 bg-amber-500/5')}>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[13px] font-bold">{p.is_bot ? p.bot_name : `Player ${p.slot + 1}`}</span>
                {p.is_bot && <Badge variant="outline" className="text-[9px] text-primary">BOT</Badge>}
              </div>
              <div className="font-mono text-[14px] font-bold text-gold">{formatMD(totalValue)}</div>
              {/* Item reveal */}
              {teamPulls.length > 0 && revealedIdx >= 0 && (
                <div className="mt-2 rounded border border-border/40 bg-surface-2 p-2">
                  <div className={cn('flex items-center gap-2 rounded px-2 py-1.5', RARITY_COLORS[teamPulls[revealedIdx].item.rarity])}>
                    <Coins className="h-4 w-4" />
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-[12px] font-bold">{teamPulls[revealedIdx].item.name}</p>
                      <p className="text-[10px] capitalize opacity-70">{teamPulls[revealedIdx].item.rarity}</p>
                    </div>
                    <span className="font-mono text-[12px] font-bold">{formatMD(teamPulls[revealedIdx].item.value)}</span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Settled result */}
      {phase === 'settled' && battle.winner_team && (
        <div className="flex items-center justify-center gap-2 rounded-lg border border-gold/40 bg-gold/10 px-4 py-3">
          <Trophy className="h-5 w-5 text-gold" />
          <span className="text-[14px] font-bold text-gold">
            Team {battle.winner_team.toUpperCase()} wins!
          </span>
        </div>
      )}

      {phase === 'settled' && (
        <div className="flex justify-center">
          <Button onClick={onExit}>Back to Lobby</Button>
        </div>
      )}
    </div>
  );
}
