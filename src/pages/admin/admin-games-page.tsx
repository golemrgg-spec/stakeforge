import { useState, useEffect, useCallback } from 'react';
import {
  Gamepad2, Shield, RefreshCw, Bomb, Dice5,
  TrendingUp, Users, Activity, X, Loader2,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/authentication/auth-context';
import {
  getAllGameConfigs,
  updateGameConfig,
  clearConfigCache,
  type GameConfig,
} from '@/game-engine/game-config-service';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { cn, formatCoins } from '@/lib/utils';
import { toast } from 'sonner';

interface ActiveSession {
  session_id: string;
  user_id: string;
  username: string;
  game_type: string;
  bet_amount: number;
  current_mult: number;
  started_at: string;
  board_state: Record<string, unknown>;
}

export function AdminGamesPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState('overview');
  const [configs, setConfigs] = useState<GameConfig[]>([]);
  const [activeSessions, setActiveSessions] = useState<ActiveSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [editingConfig, setEditingConfig] = useState<Record<string, Partial<GameConfig>>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setRefreshing(true);
    try {
      clearConfigCache();
      const [cfgs, sessRes] = await Promise.all([
        getAllGameConfigs(),
        supabase.rpc('get_active_game_sessions'),
      ]);
      setConfigs(cfgs);
      setActiveSessions((sessRes.data as ActiveSession[] | null) ?? []);
    } catch (err) {
      toast.error('Failed to load game data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleConfigChange = (gameType: string, field: string, value: string) => {
    setEditingConfig((prev) => ({
      ...prev,
      [gameType]: { ...(prev[gameType] ?? {}), [field]: parseFloat(value) },
    }));
  };

  const handleSaveConfig = async (gameType: string) => {
    const edits = editingConfig[gameType];
    if (!edits) return;
    setSaving(gameType);
    try {
      await updateGameConfig(gameType, edits);
      clearConfigCache();
      toast.success(`${gameType} config updated — live immediately`);
      setEditingConfig((prev) => { const n = { ...prev }; delete n[gameType]; return n; });
      await loadData();
    } catch (err) {
      toast.error('Failed to save config');
    } finally {
      setSaving(null);
    }
  };

  const handleCancelSession = async (sessionId: string) => {
    if (!user) return;
    setCancelling(sessionId);
    try {
      const { error } = await supabase.rpc('admin_cancel_game_session', {
        p_admin_id: user.id,
        p_session_id: sessionId,
      });
      if (error) throw new Error(error.message);
      toast.success('Session cancelled and funds refunded');
      await loadData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message.replace(/_/g, ' ') : 'Cancel failed');
    } finally {
      setCancelling(null);
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[15px] font-bold">Game Management</h1>
          <p className="text-[12px] text-muted-foreground">
            Live sessions and risk configuration. Changes take effect immediately.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={loadData} disabled={refreshing}>
          <RefreshCw className={cn('mr-1.5 h-3.5 w-3.5', refreshing && 'animate-spin')} />
          Refresh
        </Button>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="overview">
            <Activity className="mr-1.5 h-3.5 w-3.5" />
            Active Sessions
            {activeSessions.length > 0 && (
              <span className="ml-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-primary/20 px-1 text-[10px] font-bold text-primary">
                {activeSessions.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="config">
            <Shield className="mr-1.5 h-3.5 w-3.5" />
            Risk Config
          </TabsTrigger>
        </TabsList>

        {/* ── ACTIVE SESSIONS ────────────────────────────────────────────── */}
        <TabsContent value="overview">
          {activeSessions.length === 0 ? (
            <div className="flex h-32 flex-col items-center justify-center gap-2 text-muted-foreground">
              <Gamepad2 className="h-5 w-5 opacity-40" />
              <p className="text-[13px]">No active game sessions</p>
            </div>
          ) : (
            <div className="rounded border border-border/60 bg-surface-1">
              <div className="grid grid-cols-[100px_1fr_90px_90px_90px_80px] gap-2 border-b border-border/60 px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                <span>Game</span>
                <span>Player</span>
                <span className="text-right">Bet</span>
                <span className="text-right">Multiplier</span>
                <span className="text-right">Started</span>
                <span className="text-right">Action</span>
              </div>
              {activeSessions.map((s) => (
                <div key={s.session_id} className="grid grid-cols-[100px_1fr_90px_90px_90px_80px] items-center gap-2 border-b border-border/40 px-3 py-2 text-[12px] last:border-0">
                  <span className="flex items-center gap-1.5">
                    {s.game_type === 'mines' ? <Bomb className="h-3.5 w-3.5 text-amber-400" /> : <Dice5 className="h-3.5 w-3.5 text-emerald-400" />}
                    <span className="font-medium capitalize">{s.game_type}</span>
                  </span>
                  <span className="truncate font-medium">{s.username}</span>
                  <span className="text-right font-mono">{formatCoins(s.bet_amount)}</span>
                  <span className="text-right font-mono font-semibold text-primary">
                    {(s.current_mult ?? 1).toFixed(4)}x
                  </span>
                  <span className="text-right text-muted-foreground">
                    {new Date(s.started_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <div className="flex justify-end">
                    <button
                      onClick={() => handleCancelSession(s.session_id)}
                      disabled={cancelling === s.session_id}
                      className="flex h-6 w-6 items-center justify-center rounded bg-destructive/15 text-destructive hover:bg-destructive/30 disabled:opacity-50"
                      title="Cancel and refund"
                    >
                      {cancelling === s.session_id ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── RISK CONFIG ────────────────────────────────────────────────── */}
        <TabsContent value="config">
          <div className="space-y-3">
            {configs.map((cfg) => {
              const edits = editingConfig[cfg.game_type] ?? {};
              const isDirty = Object.keys(edits).length > 0;

              return (
                <div key={cfg.game_type} className="rounded border border-border/60 bg-surface-1">
                  <div className="flex items-center justify-between border-b border-border/60 px-3 py-2">
                    <div className="flex items-center gap-2">
                      {cfg.game_type === 'mines'
                        ? <Bomb className="h-4 w-4 text-amber-400" />
                        : <Dice5 className="h-4 w-4 text-emerald-400" />}
                      <span className="font-semibold capitalize">{cfg.game_type}</span>
                    </div>
                    {isDirty && (
                      <Button
                        size="sm"
                        className="h-7"
                        onClick={() => handleSaveConfig(cfg.game_type)}
                        disabled={saving === cfg.game_type}
                      >
                        {saving === cfg.game_type && <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />}
                        Save & Apply Live
                      </Button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3 p-3 sm:grid-cols-3 lg:grid-cols-5">
                    {(
                      [
                        { field: 'house_edge', label: 'House Edge', pct: true },
                        { field: 'rtp', label: 'RTP', pct: true },
                        { field: 'min_bet', label: 'Min Bet', dollar: true },
                        { field: 'max_bet', label: 'Max Bet', dollar: true },
                        { field: 'max_payout', label: 'Max Payout', dollar: true },
                      ] as Array<{ field: keyof GameConfig; label: string; pct?: boolean; dollar?: boolean }>
                    ).map(({ field, label, pct, dollar }) => {
                      const currentVal = (edits[field as keyof typeof edits] ?? cfg[field]) as number;
                      const displayVal = pct ? (currentVal * 100).toFixed(2) : currentVal.toFixed(2);
                      return (
                        <div key={field} className="space-y-1">
                          <label className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</label>
                          <div className="relative">
                            {(pct || dollar) && (
                              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[12px] text-muted-foreground">
                                {pct ? '%' : 'RC'}
                              </span>
                            )}
                            <input
                              type="number"
                              defaultValue={displayVal}
                              step={pct ? 0.01 : 1}
                              min={0}
                              onChange={(e) => {
                                const raw = parseFloat(e.target.value);
                                const stored = pct ? raw / 100 : raw;
                                handleConfigChange(cfg.game_type, field, String(stored));
                              }}
                              className="h-8 w-full rounded border border-border/60 bg-surface-2 pl-6 pr-2 text-[12px] font-mono focus:border-primary/50 focus:outline-none"
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="border-t border-border/60 px-3 py-1.5">
                    <p className="text-[11px] text-muted-foreground">
                      Last updated: {new Date(cfg.updated_at ?? Date.now()).toLocaleString()}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
