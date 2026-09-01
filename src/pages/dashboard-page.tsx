import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Wallet,
  Bomb,
  Dice5,
  CircleSlash,
  TowerControl,
  Disc,
  Coins,
  Club,
  Swords,
  Trophy,
  ArrowRight,
  Zap,
  Clock,
  Loader2,
} from 'lucide-react';
import { useWallet } from '@/wallet/wallet-context';
import { getRecentWins, getLeaderboardPreview, type RecentWin, type LeaderboardPreviewEntry } from '@/features/dashboard/dashboard-service';
import { Badge } from '@/components/ui/badge';
import { cn, formatCoins } from '@/lib/utils';

const quickGames = [
  { name: 'Blackjack', icon: Club, to: '/games/blackjack', color: 'text-lime-400', tint: 'bg-lime-400/10' },
  { name: 'Plinko', icon: CircleSlash, to: '/games/plinko', color: 'text-cyan-400', tint: 'bg-cyan-400/10' },
  { name: 'Towers', icon: TowerControl, to: '/games/towers', color: 'text-violet-400', tint: 'bg-violet-400/10' },
  { name: 'Roulette', icon: Disc, to: '/games/roulette', color: 'text-rose-400', tint: 'bg-rose-400/10' },
  { name: 'Coinflip', icon: Coins, to: '/games/coinflip', color: 'text-yellow-400', tint: 'bg-yellow-400/10' },
  { name: 'Case Battle', icon: Swords, to: '/games/case-battle', color: 'text-orange-400', tint: 'bg-orange-400/10' },
  { name: 'Mines', icon: Bomb, to: '/games/mines', color: 'text-amber-400', tint: 'bg-amber-400/10' },
  { name: 'Dice', icon: Dice5, to: '/games/dice', color: 'text-emerald-400', tint: 'bg-emerald-400/10' },
];

function SectionLabel({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <h2 className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
        {children}
      </h2>
      {action}
    </div>
  );
}

function StatInline({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="flex items-baseline gap-1.5 px-3">
      <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className={cn('font-mono text-[13px] font-semibold', accent)}>{value}</span>
    </div>
  );
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMin / 60);

  if (diffMin < 1) return 'now';
  if (diffMin < 60) return `${diffMin}m`;
  if (diffHr < 24) return `${diffHr}h`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function DashboardPage() {
  const { wallet } = useWallet();
  const [recentWins, setRecentWins] = useState<RecentWin[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardPreviewEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const [wins, leaders] = await Promise.all([
        getRecentWins(6),
        getLeaderboardPreview('profit', 'all_time', 5),
      ]);
      setRecentWins(wins);
      setLeaderboard(leaders);
      setLoading(false);
    };
    load();
  }, []);

  const balance = wallet ? formatCoins(wallet.balance) : '—';
  const wagered = wallet ? formatCoins(wallet.total_wagered) : '—';
  const pnl = wallet ? `${wallet.lifetime_pnl >= 0 ? '+' : ''}${formatCoins(wallet.lifetime_pnl)}` : '—';
  const pnlPositive = wallet ? wallet.lifetime_pnl >= 0 : true;

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Compact balance strip */}
      <div className="flex h-10 items-center divide-x divide-border/60 rounded border border-border/60 bg-surface-1">
        <StatInline label="Balance" value={balance} accent="text-gold" />
        <StatInline label="Wagered" value={wagered} />
        <StatInline
          label="P/L"
          value={pnl}
          accent={pnlPositive ? 'text-success' : 'text-destructive'}
        />
        <div className="ml-auto flex items-center pr-3">
          <Link to="/wallet">
            <Badge variant="outline" className="gap-1 hover:border-primary/40">
              <Wallet className="h-3 w-3" />
              Wallet
            </Badge>
          </Link>
        </div>
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_320px]">
        {/* Left column */}
        <div className="space-y-4">
          {/* Quick play */}
          <div className="space-y-2.5">
            <SectionLabel
              action={
                <Link to="/games">
                  <button className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-primary">
                    All games <ArrowRight className="h-3 w-3" />
                  </button>
                </Link>
              }
            >
              Quick Play
            </SectionLabel>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-9 xl:grid-cols-5 2xl:grid-cols-9">
              {quickGames.map((game) => (
                <Link
                  key={game.name}
                  to={game.to}
                  className="group relative flex h-[80px] flex-col items-center justify-center gap-1.5 rounded border border-border/60 bg-surface-1 transition-colors duration-150 hover:border-primary/40 hover:bg-surface-2"
                >
                  <div className={cn('flex h-8 w-8 items-center justify-center rounded', game.tint)}>
                    <game.icon className={cn('h-4 w-4', game.color)} />
                  </div>
                  <span className="text-[11px] font-medium">{game.name}</span>
                  {game.to !== '/games' && (
                    <span className="absolute right-1 top-1 text-[8px] uppercase tracking-wide text-muted-foreground/50">
                      soon
                    </span>
                  )}
                </Link>
              ))}
            </div>
          </div>

          {/* Recent activity */}
          <div className="space-y-2.5">
            <SectionLabel>Recent Activity</SectionLabel>
            {loading ? (
              <div className="flex h-24 items-center justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : recentWins.length === 0 ? (
              <div className="flex h-24 flex-col items-center justify-center gap-1.5 rounded border border-border/60 bg-surface-1 text-muted-foreground">
                <Zap className="h-5 w-5 opacity-40" />
                <p className="text-[13px]">No games played yet</p>
              </div>
            ) : (
              <div className="rounded border border-border/60 bg-surface-1">
                <div className="grid grid-cols-[1fr_auto_auto_120px] gap-2 border-b border-border/60 px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  <span>Game</span>
                  <span className="text-right">Payout</span>
                  <span className="text-right">Profit</span>
                  <span className="text-right">Time</span>
                </div>
                {recentWins.map((win) => (
                  <div
                    key={win.id}
                    className="grid grid-cols-[1fr_auto_auto_120px] items-center gap-2 border-b border-border/40 px-3 py-2 text-[13px] last:border-0 hover:bg-surface-2"
                  >
                    <span className="flex items-center gap-2">
                      <span className="flex h-5 w-5 items-center justify-center rounded bg-surface-3">
                        <Zap className="h-3 w-3 text-primary/70" />
                      </span>
                      <span className="font-medium capitalize">{win.game_type}</span>
                      <span className="text-muted-foreground">· {win.username}</span>
                    </span>
                    <span className="text-right font-mono text-muted-foreground">
                      {formatCoins(win.payout)}
                    </span>
                    <span className={cn(
                      'text-right font-mono font-semibold',
                      win.profit >= 0 ? 'text-success' : 'text-destructive'
                    )}>
                      {win.profit >= 0 ? '+' : ''}{formatCoins(win.profit)}
                    </span>
                    <span className="flex items-center justify-end gap-1 text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {formatRelativeTime(win.created_at)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right rail */}
        <div className="space-y-4">
          {/* Leaderboard preview */}
          <div className="space-y-2.5">
            <SectionLabel
              action={
                <Link to="/leaderboard">
                  <button className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-primary">
                    Full <ArrowRight className="h-3 w-3" />
                  </button>
                </Link>
              }
            >
              <span className="flex items-center gap-1.5">
                <Trophy className="h-3.5 w-3.5 text-gold" />
                Top Players
              </span>
            </SectionLabel>
            {loading ? (
              <div className="flex h-24 items-center justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : leaderboard.length === 0 ? (
              <div className="flex h-24 flex-col items-center justify-center gap-1.5 rounded border border-border/60 bg-surface-1 text-muted-foreground">
                <Trophy className="h-5 w-5 opacity-40" />
                <p className="text-[13px]">No leaderboard entries yet</p>
              </div>
            ) : (
              <div className="rounded border border-border/60 bg-surface-1">
                {leaderboard.map((entry, index) => {
                  const rank = entry.rank ?? index + 1;
                  return (
                    <div
                      key={entry.user_id}
                      className="flex items-center gap-2.5 border-b border-border/40 px-3 py-2 text-[13px] last:border-0 hover:bg-surface-2"
                    >
                      <span
                        className={cn(
                          'flex h-5 w-5 items-center justify-center rounded text-[11px] font-bold',
                          rank === 1
                            ? 'bg-gold/20 text-gold'
                            : rank === 2
                              ? 'bg-muted-foreground/20 text-muted-foreground'
                              : rank === 3
                                ? 'bg-orange-400/20 text-orange-400'
                                : 'bg-surface-3 text-muted-foreground'
                        )}
                      >
                        {rank}
                      </span>
                      <span className="flex-1 truncate font-medium">{entry.username}</span>
                      <span className="font-mono text-[13px] font-semibold text-gold">
                        {formatCoins(entry.value)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Announcement */}
          <div className="space-y-2.5">
            <SectionLabel>Announcements</SectionLabel>
            <div className="space-y-2 rounded border border-border/60 bg-surface-1 p-3">
                <div className="flex items-start gap-2">
                <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded bg-primary/15">
                  <Zap className="h-3 w-3 text-primary" />
                </div>
                <div className="flex-1">
                  <p className="text-[13px] font-medium">All games are live</p>
                  <p className="mt-0.5 text-[12px] text-muted-foreground">
                    Blackjack, Plinko, Towers, Roulette, Coinflip, and Case Battle are ready to play. Deposit via Minecraft.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
