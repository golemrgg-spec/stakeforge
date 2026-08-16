import { useEffect, useState } from 'react';
import { Trophy, Crown, Medal, Loader2 } from 'lucide-react';
import { getLeaderboard } from '@/features/profile/profile-service';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn, formatCoins } from '@/lib/utils';

interface LeaderboardEntry {
  user_id: string;
  value: number;
  rank: number | null;
}

const rankColors = ['text-gold', 'text-muted-foreground', 'text-orange-400'];
const rankBorders = ['border-l-gold', 'border-l-muted-foreground', 'border-l-orange-400'];

export function LeaderboardPage() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [metric, setMetric] = useState('profit');
  const [period, setPeriod] = useState('all_time');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const data = await getLeaderboard(metric, period, 100);
        setEntries(data);
      } catch {
        setEntries([]);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [metric, period]);

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header + filters in one row */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-[15px] font-bold tracking-tight">Leaderboard</h1>
          <p className="mt-0.5 text-[12px] text-muted-foreground">Top players across the platform</p>
        </div>
        <div className="flex gap-1.5">
          <Tabs value={metric} onValueChange={setMetric}>
            <TabsList>
              <TabsTrigger value="profit">Profit</TabsTrigger>
              <TabsTrigger value="wagered">Wagered</TabsTrigger>
              <TabsTrigger value="wins">Wins</TabsTrigger>
            </TabsList>
          </Tabs>
          <Tabs value={period} onValueChange={setPeriod}>
            <TabsList>
              <TabsTrigger value="all_time">All</TabsTrigger>
              <TabsTrigger value="weekly">Week</TabsTrigger>
              <TabsTrigger value="daily">Day</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      {/* Flat table — no card wrapper */}
      {loading ? (
        <div className="flex h-32 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : entries.length === 0 ? (
        <div className="flex h-32 flex-col items-center justify-center gap-2 text-muted-foreground">
          <Trophy className="h-6 w-6 opacity-40" />
          <p className="text-[13px]">No entries yet — be the first!</p>
        </div>
      ) : (
        <div className="rounded border border-border/60 bg-surface-1">
          <div className="grid grid-cols-[48px_1fr_auto] gap-2 border-b border-border/60 px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            <span>Rank</span>
            <span>Player</span>
            <span className="text-right">Value</span>
          </div>
          <div className="max-h-[600px] overflow-y-auto scrollbar-thin">
            {entries.map((entry, index) => {
              const rank = entry.rank ?? index + 1;
              const isTop3 = rank <= 3;
              const RankIcon = rank === 1 ? Crown : rank === 2 || rank === 3 ? Medal : null;
              return (
                <div
                  key={entry.user_id}
                  className={cn(
                    'grid grid-cols-[48px_1fr_auto] items-center gap-2 border-b border-border/40 px-3 py-2 text-[13px] last:border-0 hover:bg-surface-2',
                    isTop3 && rankBorders[rank - 1],
                    isTop3 && 'border-l-2'
                  )}
                >
                  <span className="flex h-6 w-6 items-center justify-center">
                    {RankIcon ? (
                      <RankIcon className={cn('h-4 w-4', rankColors[rank - 1])} />
                    ) : (
                      <span className="text-[12px] font-medium text-muted-foreground">{rank}</span>
                    )}
                  </span>
                  <span className="truncate font-medium">Player #{entry.user_id.slice(0, 8)}</span>
                  <span className="text-right font-mono font-semibold text-gold">
                    {formatCoins(entry.value)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
