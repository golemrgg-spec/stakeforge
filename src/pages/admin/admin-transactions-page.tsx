import { useEffect, useState } from 'react';
import { Loader2, ArrowLeftRight } from 'lucide-react';
import { getAllTransactions } from '@/admin/admin-service';
import type { WalletTransaction } from '@/types';
import { Badge } from '@/components/ui/badge';
import { cn, formatCoins } from '@/lib/utils';

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function AdminTransactionsPage() {
  const [transactions, setTransactions] = useState<Array<WalletTransaction & { username: string }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const data = await getAllTransactions(100, 0);
        setTransactions(data);
      } catch (err) {
        console.error('Failed to load transactions:', err);
        setTransactions([]);
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

  if (transactions.length === 0) {
    return (
      <div className="flex h-24 flex-col items-center justify-center gap-1.5 text-muted-foreground">
        <ArrowLeftRight className="h-5 w-5 opacity-40" />
        <p className="text-[13px]">No transactions found</p>
      </div>
    );
  }

  return (
    <div className="rounded border border-border/60 bg-surface-1">
      <div className="overflow-x-auto scrollbar-thin">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border/60 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <th className="px-3 py-1.5 font-medium">User</th>
              <th className="px-3 py-1.5 font-medium">Type</th>
              <th className="px-3 py-1.5 text-right font-medium">Amount</th>
              <th className="px-3 py-1.5 text-right font-medium">Balance After</th>
              <th className="px-3 py-1.5 font-medium">Reference</th>
              <th className="px-3 py-1.5 text-right font-medium">Date</th>
            </tr>
          </thead>
          <tbody>
            {transactions.map((tx) => (
              <tr key={tx.id} className="border-b border-border/40 last:border-0 hover:bg-surface-2">
                <td className="px-3 py-2 text-[13px] font-medium">{tx.username}</td>
                <td className="px-3 py-2">
                  <Badge variant="secondary">{tx.type}</Badge>
                </td>
                <td className={cn('px-3 py-2 text-right font-mono text-[13px]', tx.amount >= 0 ? 'text-success' : 'text-destructive')}>
                  {tx.amount >= 0 ? '+' : ''}{formatCoins(Math.abs(tx.amount))}
                </td>
                <td className="px-3 py-2 text-right font-mono text-[13px] text-muted-foreground">{formatCoins(tx.balance_after)}</td>
                <td className="px-3 py-2 text-[13px] text-muted-foreground">{tx.reference_type || '—'}</td>
                <td className="px-3 py-2 text-right text-[12px] text-muted-foreground">{formatDate(tx.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
