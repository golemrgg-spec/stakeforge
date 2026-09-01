import { useEffect, useState } from 'react';
import { Loader2, Shield } from 'lucide-react';
import { getPlatformStats, type PlatformStats } from '@/admin/admin-service';
import { cn, formatCoins } from '@/lib/utils';

function StatInline({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="flex items-baseline gap-1.5 px-3">
      <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className={cn('font-mono text-[13px] font-semibold', accent)}>{value}</span>
    </div>
  );
}

export function AdminOverviewPage() {
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const data = await getPlatformStats();
        setStats(data);
      } catch (err) {
        console.error('Failed to load stats:', err);
        setStats(null);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex h-32 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Compact stat strip */}
      <div className="flex h-10 items-center divide-x divide-border/60 rounded border border-border/60 bg-surface-1">
        <StatInline label="Users" value={String(stats?.totalUsers ?? 0)} accent="text-primary" />
        <StatInline label="Balance" value={formatCoins(stats?.totalBalance ?? 0)} accent="text-gold" />
        <StatInline label="Wagered" value={formatCoins(stats?.totalWagered ?? 0)} accent="text-success" />
        <StatInline label="Txns" value={String(stats?.totalTransactions ?? 0)} accent="text-accent" />
      </div>

      {/* Analytics — will populate once game data is available */}
      <div className="flex items-center gap-2 border-l-2 border-border/40 px-3 py-2">
        <Shield className="h-3.5 w-3.5 text-muted-foreground" />
        <p className="text-[12px] text-muted-foreground">
          Detailed analytics charts will appear here once game data is available.
        </p>
      </div>
    </div>
  );
}
