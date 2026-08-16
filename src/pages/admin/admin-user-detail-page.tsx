import { useEffect, useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, Loader2, Copy, Check, Wallet as WalletIcon,
  Gamepad2, ArrowLeftRight, History, Lock, Search,
  ChevronDown, ChevronRight, Shield,
} from 'lucide-react';
import {
  getUserProfileSummary,
  getUserActivityTimeline,
  getUserGameHistory,
  type UserProfileSummary,
  type TimelineItem,
  type GameHistoryItem,
} from '@/admin/admin-service';
import { AdminWalletDialog } from '@/admin/admin-wallet-dialog';
import { formatCoins } from '@/lib/utils';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function StatCard({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-surface-1 px-3 py-2.5">
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-1 font-mono text-[15px] font-bold ${accent ?? 'text-foreground'}`}>{value}</p>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-[12px] text-muted-foreground">{label}</span>
      <span className="text-[13px] font-medium">{value}</span>
    </div>
  );
}

function TimelineEntry({ item }: { item: TimelineItem }) {
  const [expanded, setExpanded] = useState(false);

  const icon = item.source === 'wallet' ? ArrowLeftRight : item.source === 'game' ? Gamepad2 : Shield;
  const Icon = icon;
  const iconColor = item.source === 'wallet' ? 'text-success' : item.source === 'game' ? 'text-primary' : 'text-gold';

  const amountDisplay = item.amount != null
    ? `${item.amount >= 0 ? '+' : ''}${formatCoins(Math.abs(item.amount))}`
    : null;

  return (
    <div className="border-b border-border/40 last:border-0">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-surface-2"
      >
        {expanded ? <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />}
        <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded bg-surface-2`}>
          <Icon className={`h-3.5 w-3.5 ${iconColor}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="shrink-0 text-[10px]">{item.source}</Badge>
            <span className="text-[13px] font-medium truncate">{item.event_type}</span>
          </div>
          <p className="text-[11px] text-muted-foreground">{formatDate(item.created_at)}</p>
        </div>
        {amountDisplay && (
          <span className={`shrink-0 font-mono text-[13px] font-semibold ${item.amount! >= 0 ? 'text-success' : 'text-destructive'}`}>
            {amountDisplay}
          </span>
        )}
      </button>
      {expanded && (
        <div className="px-3 pb-2.5 pl-12 space-y-1 text-[12px]">
          {item.description && (
            <p className="text-muted-foreground"><span className="font-medium text-foreground">Description:</span> {item.description}</p>
          )}
          {item.balance_before != null && (
            <p className="text-muted-foreground"><span className="font-medium text-foreground">Before:</span> {formatCoins(item.balance_before)}</p>
          )}
          {item.balance_after != null && (
            <p className="text-muted-foreground"><span className="font-medium text-foreground">After:</span> {formatCoins(item.balance_after)}</p>
          )}
          {item.reference_type && (
            <p className="text-muted-foreground"><span className="font-medium text-foreground">Reference:</span> {item.reference_type}</p>
          )}
          {item.metadata && Object.keys(item.metadata).length > 0 && (
            <p className="text-muted-foreground break-all"><span className="font-medium text-foreground">Metadata:</span> {JSON.stringify(item.metadata)}</p>
          )}
        </div>
      )}
    </div>
  );
}

function GameHistoryEntry({ game }: { game: GameHistoryItem }) {
  const [expanded, setExpanded] = useState(false);
  const won = (game.profit ?? 0) > 0;

  return (
    <div className="border-b border-border/40 last:border-0">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-surface-2"
      >
        {expanded ? <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />}
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-surface-2">
          <Gamepad2 className="h-3.5 w-3.5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-medium capitalize">{game.game_type}</span>
            <Badge variant={game.status === 'completed' ? 'success' : 'secondary'} className="text-[10px]">{game.status}</Badge>
          </div>
          <p className="text-[11px] text-muted-foreground">{formatDate(game.created_at)}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="font-mono text-[13px]">{formatCoins(game.bet_amount)}</p>
          <p className={`font-mono text-[12px] font-semibold ${won ? 'text-success' : 'text-destructive'}`}>
            {game.profit != null ? `${won ? '+' : ''}${formatCoins(game.profit)}` : '—'}
          </p>
        </div>
      </button>
      {expanded && (
        <div className="px-3 pb-2.5 pl-12 space-y-1.5 text-[12px]">
          <div className="rounded border border-border/40 bg-surface-2 p-2">
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground mb-1">Provably Fair</p>
            <p className="text-muted-foreground break-all"><span className="font-medium text-foreground">Client Seed:</span> {game.client_seed}</p>
            <p className="text-muted-foreground break-all"><span className="font-medium text-foreground">Server Seed Hash:</span> {game.server_seed_hash}</p>
            {game.server_seed && (
              <p className="text-muted-foreground break-all"><span className="font-medium text-foreground">Server Seed:</span> {game.server_seed}</p>
            )}
          </div>
          {game.payout != null && (
            <p className="text-muted-foreground"><span className="font-medium text-foreground">Payout:</span> {formatCoins(game.payout)}</p>
          )}
          {game.result && (
            <p className="text-muted-foreground break-all"><span className="font-medium text-foreground">Result:</span> {JSON.stringify(game.result)}</p>
          )}
          {game.config && Object.keys(game.config).length > 0 && (
            <p className="text-muted-foreground break-all"><span className="font-medium text-foreground">Config:</span> {JSON.stringify(game.config)}</p>
          )}
        </div>
      )}
    </div>
  );
}

export function AdminUserDetailPage() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const [summary, setSummary] = useState<UserProfileSummary | null>(null);
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [games, setGames] = useState<GameHistoryItem[]>([]);
  const [transactions, setTransactions] = useState<TimelineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [timelineFilter, setTimelineFilter] = useState<'all' | 'wallet' | 'game' | 'admin'>('all');
  const [timelineSearch, setTimelineSearch] = useState('');
  const [walletDialogOpen, setWalletDialogOpen] = useState(false);

  const loadAll = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const [sum, tl, gh] = await Promise.all([
        getUserProfileSummary(userId),
        getUserActivityTimeline(userId, 100),
        getUserGameHistory(userId, 100),
      ]);
      setSummary(sum);
      setTimeline(tl);
      setGames(gh);
      setTransactions(tl.filter((t) => t.source === 'wallet'));
    } catch (err) {
      console.error('Failed to load user detail:', err);
      toast.error('Failed to load user', {
        description: err instanceof Error ? err.message : 'Unknown error',
      });
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const copyId = () => {
    if (userId) {
      navigator.clipboard.writeText(userId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-2">
        <p className="text-[14px] text-muted-foreground">User not found</p>
        <Button variant="outline" size="sm" onClick={() => navigate('/admin/users')}>
          Back to Users
        </Button>
      </div>
    );
  }

  const filteredTimeline = timeline
    .filter((t) => timelineFilter === 'all' || t.source === timelineFilter)
    .filter((t) => {
      if (!timelineSearch) return true;
      const q = timelineSearch.toLowerCase();
      return (
        t.event_type.toLowerCase().includes(q) ||
        (t.description ?? '').toLowerCase().includes(q)
      );
    });

  const wallet = summary.wallet;
  const stats = summary.game_stats;

  return (
    <div className="space-y-4">
      {/* Back button */}
      <Button variant="ghost" size="sm" onClick={() => navigate('/admin/users')} className="gap-1.5">
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to Users
      </Button>

      {/* Profile Header */}
      <div className="rounded-lg border border-border/60 bg-surface-1 p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-lg font-bold text-primary">
            {summary.profile.username.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-[17px] font-bold">{summary.profile.username}</h2>
            <p className="text-[13px] text-muted-foreground">{summary.profile.display_name || 'No display name'}</p>
            <div className="mt-1.5 flex items-center gap-2">
              <Badge variant={summary.profile.role === 'admin' ? 'gold' : 'secondary'}>{summary.profile.role}</Badge>
              <Badge variant={summary.profile.status === 'active' ? 'success' : 'destructive'}>{summary.profile.status}</Badge>
            </div>
          </div>
          <Button size="sm" onClick={() => setWalletDialogOpen(true)} className="gap-1.5">
            <WalletIcon className="h-3.5 w-3.5" />
            Manage Wallet
          </Button>
        </div>

        <div className="mt-4 space-y-0.5 border-t border-border/40 pt-3">
          <DetailRow label="User ID" value={
            <button onClick={copyId} className="flex items-center gap-1.5 font-mono text-[12px] text-muted-foreground hover:text-foreground">
              {userId?.slice(0, 8)}…
              {copied ? <Check className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3" />}
            </button>
          } />
          <DetailRow label="Email" value={summary.email ?? '—'} />
          <DetailRow label="Created" value={formatDate(summary.profile.created_at)} />
          <DetailRow label="Last Login" value={summary.profile.last_login_at ? formatDate(summary.profile.last_login_at) : 'Never'} />
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        <StatCard label="Total Games" value={String(stats.total_games)} />
        <StatCard label="Total Wagered" value={formatCoins(stats.total_wagered)} />
        <StatCard label="P/L" value={`${(wallet?.lifetime_pnl ?? 0) >= 0 ? '+' : ''}${formatCoins(wallet?.lifetime_pnl ?? 0)}`} accent={(wallet?.lifetime_pnl ?? 0) >= 0 ? 'text-success' : 'text-destructive'} />
        <StatCard label="Balance" value={formatCoins(wallet?.balance ?? 0)} accent="text-gold" />
        <StatCard label="Locked" value={formatCoins(wallet?.locked_balance ?? 0)} />
        <StatCard label="Lifetime Wins" value={String(wallet?.lifetime_wins ?? 0)} accent="text-success" />
        <StatCard label="Lifetime Losses" value={String(wallet?.lifetime_losses ?? 0)} accent="text-destructive" />
      </div>

      {/* Tabbed Content */}
      <Tabs defaultValue="timeline">
        <TabsList>
          <TabsTrigger value="timeline" className="gap-1.5"><History className="h-3.5 w-3.5" /> Timeline</TabsTrigger>
          <TabsTrigger value="games" className="gap-1.5"><Gamepad2 className="h-3.5 w-3.5" /> Games</TabsTrigger>
          <TabsTrigger value="transactions" className="gap-1.5"><ArrowLeftRight className="h-3.5 w-3.5" /> Transactions</TabsTrigger>
        </TabsList>

        {/* Timeline Tab */}
        <TabsContent value="timeline" className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search timeline…"
                value={timelineSearch}
                onChange={(e) => setTimelineSearch(e.target.value)}
                className="pl-8 h-8 text-[13px]"
              />
            </div>
            <Select value={timelineFilter} onValueChange={(v) => setTimelineFilter(v as 'all' | 'wallet' | 'game' | 'admin')}>
              <SelectTrigger className="h-8 w-[120px] text-[13px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Events</SelectItem>
                <SelectItem value="wallet">Wallet</SelectItem>
                <SelectItem value="game">Games</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {filteredTimeline.length === 0 ? (
            <div className="flex h-24 items-center justify-center text-[13px] text-muted-foreground">
              No activity found
            </div>
          ) : (
            <div className="rounded-lg border border-border/60 bg-surface-1">
              {filteredTimeline.map((item) => (
                <TimelineEntry key={`${item.source}-${item.id}`} item={item} />
              ))}
            </div>
          )}
        </TabsContent>

        {/* Games Tab */}
        <TabsContent value="games">
          {games.length === 0 ? (
            <div className="flex h-24 items-center justify-center text-[13px] text-muted-foreground">
              No games played
            </div>
          ) : (
            <div className="rounded-lg border border-border/60 bg-surface-1">
              {games.map((game) => (
                <GameHistoryEntry key={game.id} game={game} />
              ))}
            </div>
          )}
        </TabsContent>

        {/* Transactions Tab */}
        <TabsContent value="transactions">
          {transactions.length === 0 ? (
            <div className="flex h-24 items-center justify-center text-[13px] text-muted-foreground">
              No transactions found
            </div>
          ) : (
            <div className="rounded-lg border border-border/60 bg-surface-1">
              {transactions.map((item) => (
                <TimelineEntry key={`${item.source}-${item.id}`} item={item} />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Wallet Management Dialog */}
      <AdminWalletDialog
        open={walletDialogOpen}
        onOpenChange={setWalletDialogOpen}
        userId={userId!}
        username={summary.profile.username}
        currentBalance={wallet?.balance ?? 0}
        currentLocked={wallet?.locked_balance ?? 0}
        onSuccess={loadAll}
      />
    </div>
  );
}
