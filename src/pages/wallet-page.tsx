import { useState, useEffect } from 'react';
import {
  Wallet,
  TrendingUp,
  ArrowDownToLine,
  ArrowUpFromLine,
  Gamepad2,
  Gift,
  RefreshCw,
} from 'lucide-react';
import { useWallet } from '@/wallet/wallet-context';
import { getTransactions } from '@/wallet/wallet-service';
import type { WalletTransaction, WalletTxType } from '@/types';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader } from '@/components/loader';
import { cn, formatCoins } from '@/lib/utils';
import { DepositModal } from '@/wallet/deposit-modal';

const txTypeConfig: Record<WalletTxType, { icon: typeof Wallet; color: string; label: string }> = {
  deposit: { icon: ArrowDownToLine, color: 'text-success', label: 'Deposit' },
  withdrawal: { icon: ArrowUpFromLine, color: 'text-destructive', label: 'Withdrawal' },
  bet: { icon: Gamepad2, color: 'text-warning', label: 'Bet' },
  win: { icon: TrendingUp, color: 'text-success', label: 'Win' },
  refund: { icon: RefreshCw, color: 'text-accent', label: 'Refund' },
  bonus: { icon: Gift, color: 'text-gold', label: 'Bonus' },
  adjustment: { icon: Wallet, color: 'text-muted-foreground', label: 'Adjustment' },
};

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function StatInline({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="flex items-baseline gap-1.5 px-3">
      <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className={cn('font-mono text-[13px] font-semibold', accent)}>{value}</span>
    </div>
  );
}

function TransactionRow({ tx }: { tx: WalletTransaction }) {
  const config = txTypeConfig[tx.type];
  const isPositive = tx.amount >= 0;

  return (
    <div className="grid grid-cols-[28px_1fr_auto_auto_140px] items-center gap-2.5 border-b border-border/40 px-3 py-2 text-[13px] last:border-0 hover:bg-surface-2">
      <div className={cn('flex h-6 w-6 items-center justify-center rounded bg-surface-3', config.color)}>
        <config.icon className="h-3.5 w-3.5" />
      </div>
      <div className="min-w-0">
        <p className="truncate font-medium">{config.label}</p>
        <p className="truncate text-[11px] text-muted-foreground">{tx.reference_type || '—'}</p>
      </div>
      <p className={cn('text-right font-mono font-semibold', isPositive ? 'text-success' : 'text-destructive')}>
        {isPositive ? '+' : ''}{formatCoins(Math.abs(tx.amount))}
      </p>
      <p className="text-right font-mono text-[12px] text-muted-foreground">
        {formatCoins(tx.balance_after)}
      </p>
      <p className="text-right text-[11px] text-muted-foreground">
        {formatDate(tx.created_at)}
      </p>
    </div>
  );
}

export function WalletPage() {
  const { wallet, loading, refresh } = useWallet();
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [txLoading, setTxLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');
  const [depositOpen, setDepositOpen] = useState(false);

  useEffect(() => {
    const load = async () => {
      if (!wallet) return;
      try {
        const txs = await getTransactions(wallet.user_id, filter !== 'all' ? { type: filter as WalletTxType, limit: 100 } : { limit: 100 });
        setTransactions(txs);
      } catch {
        setTransactions([]);
      } finally {
        setTxLoading(false);
      }
    };
    load();
  }, [wallet, filter]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader className="h-6 w-6" />
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[15px] font-bold tracking-tight">Wallet</h1>
          <p className="mt-0.5 text-[12px] text-muted-foreground">Balance and transaction history</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={refresh}>
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            Refresh
          </Button>
          <Button size="sm" onClick={() => setDepositOpen(true)}>
            <ArrowDownToLine className="mr-1.5 h-3.5 w-3.5" />
            Deposit
          </Button>
        </div>
      </div>

      {/* Compact stat strip — no individual cards */}
      <div className="flex h-10 items-center divide-x divide-border/60 rounded border border-border/60 bg-surface-1">
        <StatInline label="Balance" value={wallet ? formatCoins(wallet.balance) : '—'} accent="text-gold" />
        <StatInline label="Locked" value={wallet ? formatCoins(wallet.locked_balance) : '—'} />
        <StatInline label="Wagered" value={wallet ? formatCoins(wallet.total_wagered) : '—'} />
        <StatInline
          label="P/L"
          value={wallet ? `${wallet.lifetime_pnl >= 0 ? '+' : ''}${formatCoins(wallet.lifetime_pnl)}` : '—'}
          accent={wallet && wallet.lifetime_pnl >= 0 ? 'text-success' : 'text-destructive'}
        />
      </div>

      {/* Transaction history — flat table, no card wrapper */}
      <div className="space-y-2.5">
        <Tabs value={filter} onValueChange={setFilter}>
          <div className="flex items-center justify-between">
            <h2 className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
              Transactions
            </h2>
            <TabsList>
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="bet">Bets</TabsTrigger>
              <TabsTrigger value="win">Wins</TabsTrigger>
              <TabsTrigger value="deposit">Deposits</TabsTrigger>
              <TabsTrigger value="withdrawal">Withdrawals</TabsTrigger>
            </TabsList>
          </div>
          <TabsContent value={filter}>
            {txLoading ? (
              <div className="flex h-32 items-center justify-center">
                <Loader className="h-5 w-5" />
              </div>
            ) : transactions.length === 0 ? (
              <div className="flex h-32 flex-col items-center justify-center gap-2 text-muted-foreground">
                <Wallet className="h-6 w-6 opacity-40" />
                <p className="text-[13px]">No transactions yet</p>
              </div>
            ) : (
              <div className="rounded border border-border/60 bg-surface-1">
                <div className="grid grid-cols-[28px_1fr_auto_auto_140px] gap-2.5 border-b border-border/60 px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  <span />
                  <span>Type</span>
                  <span className="text-right">Amount</span>
                  <span className="text-right">Balance</span>
                  <span className="text-right">Date</span>
                </div>
                <div className="max-h-[500px] overflow-y-auto scrollbar-thin">
                  {transactions.map((tx) => (
                    <TransactionRow key={tx.id} tx={tx} />
                  ))}
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      <DepositModal open={depositOpen} onOpenChange={setDepositOpen} />
    </div>
  );
}
