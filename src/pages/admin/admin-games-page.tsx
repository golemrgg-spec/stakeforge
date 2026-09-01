import { useState, useEffect } from 'react';
import { Settings, Loader2, Save } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { cn, formatCoins } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader } from '@/components/loader';
import { toast } from 'sonner';

interface GameConfig {
  game_type: string;
  house_edge: number;
  rtp: number;
  min_bet: number;
  max_bet: number;
  max_payout: number;
  custom: Record<string, unknown> | null;
  updated_at?: string;
}

export function AdminGamesPage() {
  const [configs, setConfigs] = useState<GameConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadConfigs();
  }, []);

  const loadConfigs = async () => {
    try {
      const { data, error } = await supabase.from('game_configs').select('*').order('game_type');
      if (error) throw new Error(error.message);
      setConfigs(data as GameConfig[]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load configs');
    } finally {
      setLoading(false);
    }
  };

  const handleConfigChange = (gameType: string, field: string, value: string) => {
    setConfigs((prev) =>
      prev.map((c) =>
        c.game_type === gameType ? { ...c, [field]: parseFloat(value) } : c
      )
    );
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      for (const cfg of configs) {
        const { error } = await supabase
          .from('game_configs')
          .update({
            house_edge: cfg.house_edge,
            rtp: cfg.rtp,
            min_bet: cfg.min_bet,
            max_bet: cfg.max_bet,
            max_payout: cfg.max_payout,
          })
          .eq('game_type', cfg.game_type);
        if (error) throw new Error(error.message);
      }
      toast.success('Game configs saved');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="flex h-64 items-center justify-center"><Loader className="h-6 w-6" /></div>;
  }

  const fields = [
    { key: 'house_edge', label: 'House Edge', pct: true },
    { key: 'rtp', label: 'RTP', pct: true },
    { key: 'min_bet', label: 'Min Bet', dollar: true },
    { key: 'max_bet', label: 'Max Bet', dollar: true },
    { key: 'max_payout', label: 'Max Payout', dollar: true },
  ];

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[15px] font-bold tracking-tight">Game Configs</h1>
          <p className="mt-0.5 text-[12px] text-muted-foreground">House edge and limits per game</p>
        </div>
        <Button size="sm" onClick={handleSave} disabled={saving}>
          <Save className="mr-1.5 h-3.5 w-3.5" />
          {saving ? 'Saving…' : 'Save All'}
        </Button>
      </div>

      <div className="grid gap-2 lg:grid-cols-2">
        {configs.map((cfg) => (
          <div key={cfg.game_type} className="rounded-lg border border-border/60 bg-surface-1 p-3">
            <div className="mb-2 flex items-center gap-2">
              <Settings className="h-4 w-4 text-primary" />
              <h2 className="text-[13px] font-bold capitalize">{cfg.game_type}</h2>
            </div>
            <div className="space-y-1.5">
              {fields.map((field) => {
                const val = cfg[field.key as keyof GameConfig] as number;
                const displayVal = field.pct ? (val * 100).toFixed(2) : val;
                return (
                  <div key={field.key} className="grid grid-cols-[100px_1fr] items-center gap-2">
                    <label className="text-[11px] uppercase tracking-wide text-muted-foreground">{field.label}</label>
                    <div className="relative">
                      {(field.pct || field.dollar) && (
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[12px] text-muted-foreground">
                          {field.pct ? '%' : '$'}
                        </span>
                      )}
                      <input
                        type="number"
                        defaultValue={displayVal}
                        step={field.pct ? 0.01 : 1}
                        min={0}
                        onChange={(e) => {
                          const raw = parseFloat(e.target.value);
                          const stored = field.pct ? raw / 100 : raw;
                          handleConfigChange(cfg.game_type, field.key, String(stored));
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
        ))}
      </div>
    </div>
  );
}
