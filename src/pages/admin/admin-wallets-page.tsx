import { useEffect, useState, useCallback } from 'react';
import { Loader2, Wallet as WalletIcon, Lock } from 'lucide-react';
import { getAllWallets } from '@/admin/admin-service';
import { AdminWalletDialog } from '@/admin/admin-wallet-dialog';
import { formatCoins } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface WalletRow {
  id: string;
  user_id: string;
  username: string;
  balance: number;
  locked_balance: number;
  total_wagered: number;
  lifetime_pnl: number;
}

export function AdminWalletsPage() {
  const [wallets, setWallets] = useState<WalletRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogState, setDialogState] = useState<{ open: boolean; userId: string; username: string; balance: number; locked: number }>({
    open: false,
    userId: '',
    username: '',
    balance: 0,
    locked: 0,
  });

  const loadWallets = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getAllWallets(100, 0);
      setWallets(data as WalletRow[]);
    } catch (err) {
      console.error('Failed to load wallets:', err);
      setWallets([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadWallets();
  }, [loadWallets]);

  if (loading) {
    return (
      <div className="flex h-32 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <>
      <div className="rounded border border-border/60 bg-surface-1">
        <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-2 border-b border-border/60 px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          <span>User</span>
          <span className="text-right">Balance</span>
          <span className="text-right">Locked</span>
          <span className="text-right">Wagered</span>
          <span className="text-right">P/L</span>
        </div>
        <div className="max-h-[500px] overflow-y-auto scrollbar-thin">
          {wallets.length === 0 ? (
            <div className="flex h-24 items-center justify-center text-[13px] text-muted-foreground">
              No wallets found
            </div>
          ) : (
            wallets.map((wallet) => (
              <div
                key={wallet.id}
                className="grid grid-cols-[1fr_auto_auto_auto_auto] items-center gap-2 border-b border-border/40 px-3 py-2 text-[13px] last:border-0 hover:bg-surface-2"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{wallet.username}</p>
                  <p className="truncate text-[11px] text-muted-foreground font-mono">{wallet.user_id.slice(0, 8)}</p>
                </div>
                <span className="text-right font-mono text-gold">{formatCoins(wallet.balance)}</span>
                <span className="text-right font-mono text-muted-foreground">{formatCoins(wallet.locked_balance)}</span>
                <span className="text-right font-mono">{formatCoins(wallet.total_wagered)}</span>
                <div className="flex items-center justify-end gap-2">
                  <span className={`font-mono text-[13px] font-semibold ${wallet.lifetime_pnl >= 0 ? 'text-success' : 'text-destructive'}`}>
                    {wallet.lifetime_pnl >= 0 ? '+' : ''}{formatCoins(wallet.lifetime_pnl)}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 gap-1 px-2"
                    onClick={() =>
                      setDialogState({
                        open: true,
                        userId: wallet.user_id,
                        username: wallet.username,
                        balance: wallet.balance,
                        locked: wallet.locked_balance,
                      })
                    }
                  >
                    <Lock className="h-3 w-3" />
                    Manage
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <AdminWalletDialog
        open={dialogState.open}
        onOpenChange={(open) => setDialogState((prev) => ({ ...prev, open }))}
        userId={dialogState.userId}
        username={dialogState.username}
        currentBalance={dialogState.balance}
        currentLocked={dialogState.locked}
        onSuccess={loadWallets}
      />
    </>
  );
}
