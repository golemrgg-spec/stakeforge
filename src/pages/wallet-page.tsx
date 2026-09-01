import { useState, useEffect, useCallback } from 'react';
import {
  Wallet,
  TrendingUp,
  ArrowUpFromLine,
  Gamepad2,
  Gift,
  RefreshCw,
  Boxes,
  Link2,
  Unlink,
  Check,
  Clock,
  X,
  Loader2,
} from 'lucide-react';
import { useWallet } from '@/wallet/wallet-context';
import { useAuth } from '@/authentication/auth-context';
import { getTransactions } from '@/wallet/wallet-service';
import {
  generateLinkCode,
  getMinecraftLink,
  withdrawToMinecraft,
  getWalletTransfers,
  type MinecraftLinkInfo,
  type WalletTransferInfo,
} from '@/wallet/minecraft-service';
import type { WalletTransaction, WalletTxType } from '@/types';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader } from '@/components/loader';
import { cn, formatMD } from '@/lib/utils';
import { toast } from 'sonner';

const txTypeConfig: Record<WalletTxType, { icon: typeof Wallet; color: string; label: string }> = {
  deposit: { icon: TrendingUp, color: 'text-success', label: 'Deposit' },
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
        <p className="truncate text-[11px] text-muted-foreground">{tx.description || tx.reference_type || '—'}</p>
      </div>
      <p className={cn('text-right font-mono font-semibold', isPositive ? 'text-success' : 'text-destructive')}>
        {isPositive ? '+' : ''}{formatMD(Math.abs(tx.amount))}
      </p>
      <p className="text-right font-mono text-[12px] text-muted-foreground">
        {formatMD(tx.balance_after)}
      </p>
      <p className="text-right text-[11px] text-muted-foreground">
        {formatDate(tx.created_at)}
      </p>
    </div>
  );
}

function TransferRow({ transfer }: { transfer: WalletTransferInfo }) {
  const isDeposit = transfer.direction === 'minecraft_to_web';
  const isPending = transfer.status === 'pending';
  const isCompleted = transfer.status === 'completed';
  const isFailed = transfer.status === 'failed';

  return (
    <div className="grid grid-cols-[28px_1fr_auto_auto_140px] items-center gap-2.5 border-b border-border/40 px-3 py-2 text-[13px] last:border-0 hover:bg-surface-2">
      <div className={cn(
        'flex h-6 w-6 items-center justify-center rounded bg-surface-3',
        isDeposit ? 'text-success' : 'text-destructive'
      )}>
        {isDeposit ? <TrendingUp className="h-3.5 w-3.5" /> : <ArrowUpFromLine className="h-3.5 w-3.5" />}
      </div>
      <div className="min-w-0">
        <p className="truncate font-medium">
          {isDeposit ? 'Minecraft Deposit' : 'Minecraft Cash Out'}
        </p>
        <p className="truncate text-[11px] text-muted-foreground">
          {isPending && <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> Pending</span>}
          {isCompleted && <span className="flex items-center gap-1 text-success"><Check className="h-3 w-3" /> Completed</span>}
          {isFailed && <span className="flex items-center gap-1 text-destructive"><X className="h-3 w-3" /> Failed</span>}
        </p>
      </div>
      <p className={cn('text-right font-mono font-semibold', isDeposit ? 'text-success' : 'text-destructive')}>
        {isDeposit ? '+' : '-'}{formatMD(transfer.amount)}
      </p>
      <p className="text-right font-mono text-[12px] text-muted-foreground">
        {transfer.completed_at ? formatDate(transfer.completed_at) : '—'}
      </p>
      <p className="text-right text-[11px] text-muted-foreground">
        {formatDate(transfer.created_at)}
      </p>
    </div>
  );
}

export function WalletPage() {
  const { wallet, loading, refresh } = useWallet();
  const { session } = useAuth();
  const accessToken = session?.access_token ?? '';

  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [txLoading, setTxLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');

  // Minecraft state
  const [mcLink, setMcLink] = useState<MinecraftLinkInfo | null>(null);
  const [mcTransfers, setMcTransfers] = useState<WalletTransferInfo[]>([]);
  const [mcLoading, setMcLoading] = useState(true);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [cashoutDialogOpen, setCashoutDialogOpen] = useState(false);
  const [mcIgn, setMcIgn] = useState('');
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [linking, setLinking] = useState(false);
  const [cashoutAmount, setCashoutAmount] = useState('');
  const [cashingOut, setCashingOut] = useState(false);

  const loadMinecraftData = useCallback(async () => {
    if (!accessToken) { setMcLoading(false); return; }
    try {
      const [link, transfers] = await Promise.all([
        getMinecraftLink(accessToken),
        getWalletTransfers(accessToken, 50),
      ]);
      setMcLink(link);
      setMcTransfers(transfers);
    } catch {
      // ignore
    } finally {
      setMcLoading(false);
    }
  }, [accessToken]);

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

  useEffect(() => {
    loadMinecraftData();
  }, [loadMinecraftData]);

  const handleGenerateCode = async () => {
    if (!accessToken || !mcIgn.trim()) return;
    setLinking(true);
    try {
      const result = await generateLinkCode(accessToken, mcIgn.trim());
      setGeneratedCode(result.code);
      toast.success(`Code generated! Run /link ${result.code} on your Minecraft server.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to generate code');
    } finally {
      setLinking(false);
    }
  };

  const handleCashout = async () => {
    if (!accessToken) return;
    const amount = parseFloat(cashoutAmount);
    if (!amount || amount <= 0) { toast.error('Enter a valid amount'); return; }
    const centsAmount = Math.round(amount * 100);
    if (!wallet || wallet.balance < centsAmount) { toast.error('Insufficient balance'); return; }

    setCashingOut(true);
    try {
      await withdrawToMinecraft(accessToken, amount);
      toast.success(`Cash out initiated: $${amount.toFixed(2)} to Minecraft`);
      setCashoutDialogOpen(false);
      setCashoutAmount('');
      refresh();
      loadMinecraftData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Cash out failed');
    } finally {
      setCashingOut(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader className="h-6 w-6" />
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[15px] font-bold tracking-tight">Wallet</h1>
          <p className="mt-0.5 text-[12px] text-muted-foreground">Balance and transaction history</p>
        </div>
        <Button variant="outline" size="sm" onClick={refresh}>
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
          Refresh
        </Button>
      </div>

      {/* Main balance card */}
      <div className="rounded-lg border border-border/60 bg-surface-1 p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Playable Balance</p>
            <p className="mt-1 font-mono text-[28px] font-bold text-gold">
              {wallet ? formatMD(wallet.balance) : '—'}
            </p>
            <p className="mt-0.5 text-[12px] text-muted-foreground">
              Minecraft Dollars (MD)
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="flex items-center gap-3 text-[12px]">
              <div className="flex items-center gap-1.5">
                <span className="text-muted-foreground">Wagered</span>
                <span className="font-mono font-semibold">{wallet ? formatMD(wallet.total_wagered) : '—'}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-muted-foreground">P/L</span>
                <span className={cn('font-mono font-semibold', wallet && wallet.lifetime_pnl >= 0 ? 'text-success' : 'text-destructive')}>
                  {wallet ? `${wallet.lifetime_pnl >= 0 ? '+' : ''}${formatMD(wallet.lifetime_pnl)}` : '—'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Minecraft Integration Section */}
      <div className="rounded-lg border border-border/60 bg-surface-1 p-4">
        <div className="mb-3 flex items-center gap-2">
          <Boxes className="h-4 w-4 text-primary" />
          <h2 className="text-[13px] font-bold">Minecraft Economy</h2>
        </div>

        {mcLoading ? (
          <div className="flex h-16 items-center justify-center">
            <Loader className="h-5 w-5" />
          </div>
        ) : (
          <>
            {/* Link status */}
            <div className="mb-3 flex items-center justify-between rounded-lg border border-border/40 bg-surface-2 px-3 py-2.5">
              <div className="flex items-center gap-2.5">
                {mcLink?.linked ? (
                  <>
                    <div className="flex h-8 w-8 items-center justify-center rounded bg-success/15">
                      <Link2 className="h-4 w-4 text-success" />
                    </div>
                    <div>
                      <p className="text-[13px] font-semibold">{mcLink.minecraft_ign}</p>
                      <p className="text-[11px] text-muted-foreground">
                        Linked {mcLink.verified_at ? formatDate(mcLink.verified_at) : ''}
                      </p>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex h-8 w-8 items-center justify-center rounded bg-surface-3">
                      <Unlink className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-[13px] font-semibold text-muted-foreground">Not linked</p>
                      <p className="text-[11px] text-muted-foreground">Link your Minecraft account to transfer</p>
                    </div>
                  </>
                )}
              </div>
              {mcLink?.linked ? (
                <span className="flex items-center gap-1 rounded bg-success/10 px-2 py-1 text-[11px] font-semibold text-success">
                  <Check className="h-3 w-3" /> Linked
                </span>
              ) : (
                <Button size="sm" variant="outline" onClick={() => { setLinkDialogOpen(true); setGeneratedCode(null); setMcIgn(''); }}>
                  <Link2 className="mr-1.5 h-3.5 w-3.5" />
                  Link Account
                </Button>
              )}
            </div>

            {/* Cash out button */}
            {mcLink?.linked && (
              <Button
                size="sm"
                variant="default"
                className="w-full"
                onClick={() => setCashoutDialogOpen(true)}
                disabled={!wallet || wallet.balance <= 0}
              >
                <ArrowUpFromLine className="mr-1.5 h-3.5 w-3.5" />
                Cash Out to Minecraft
              </Button>
            )}
          </>
        )}
      </div>

      {/* Transaction history */}
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
              <div className="rounded-lg border border-border/60 bg-surface-1">
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

      {/* Minecraft transfers */}
      {mcTransfers.length > 0 && (
        <div className="space-y-2.5">
          <h2 className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
            Minecraft Transfers
          </h2>
          <div className="rounded-lg border border-border/60 bg-surface-1">
            <div className="grid grid-cols-[28px_1fr_auto_auto_140px] gap-2.5 border-b border-border/60 px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              <span />
              <span>Type</span>
              <span className="text-right">Amount</span>
              <span className="text-right">Completed</span>
              <span className="text-right">Date</span>
            </div>
            <div className="max-h-[300px] overflow-y-auto scrollbar-thin">
              {mcTransfers.map((transfer) => (
                <TransferRow key={transfer.id} transfer={transfer} />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Link Minecraft Account Dialog */}
      <Dialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Link Minecraft Account</DialogTitle>
          </DialogHeader>
          {!generatedCode ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="mc-ign">Minecraft Username (IGN)</Label>
                <Input
                  id="mc-ign"
                  value={mcIgn}
                  onChange={(e) => setMcIgn(e.target.value)}
                  placeholder="Enter your Minecraft username"
                  disabled={linking}
                />
                <p className="text-[11px] text-muted-foreground">
                  Enter the username you use in Minecraft. You'll get a code to verify ownership.
                </p>
              </div>
              <Button onClick={handleGenerateCode} disabled={linking || !mcIgn.trim()} className="w-full">
                {linking ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Generating…</> : 'Generate Verification Code'}
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-lg border border-success/40 bg-success/10 p-4 text-center">
                <p className="text-[12px] text-muted-foreground">Your verification code:</p>
                <p className="mt-1 font-mono text-[28px] font-bold tracking-[0.3em] text-success">{generatedCode}</p>
                <p className="mt-2 text-[11px] text-muted-foreground">Expires in 10 minutes</p>
              </div>
              <div className="rounded-lg border border-border/40 bg-surface-2 p-3 text-[12px] text-muted-foreground">
                <p className="font-semibold text-foreground">Instructions:</p>
                <ol className="mt-1.5 list-decimal space-y-1 pl-4">
                  <li>Join your Minecraft Paper server</li>
                  <li>Type <code className="rounded bg-surface-3 px-1 font-mono text-success">/link {generatedCode}</code> in chat</li>
                  <li>Your account will be linked automatically</li>
                </ol>
              </div>
              <Button onClick={() => { setLinkDialogOpen(false); loadMinecraftData(); }} className="w-full">
                Done
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Cash Out to Minecraft Dialog */}
      <Dialog open={cashoutDialogOpen} onOpenChange={setCashoutDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Cash Out to Minecraft</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg border border-border/40 bg-surface-2 px-3 py-2">
              <div className="flex items-center justify-between text-[12px]">
                <span className="text-muted-foreground">Available Balance</span>
                <span className="font-mono font-bold text-gold">
                  {wallet ? formatMD(wallet.balance) : '—'}
                </span>
              </div>
              <div className="mt-1 flex items-center justify-between text-[12px]">
                <span className="text-muted-foreground">In USD</span>
                <span className="font-mono font-semibold">
                  {wallet ? formatMD(wallet.balance) : '—'}
                </span>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="cashout-amount">Amount to Cash Out (USD)</Label>
              <Input
                id="cashout-amount"
                type="number"
                value={cashoutAmount}
                onChange={(e) => setCashoutAmount(e.target.value)}
                placeholder="0.00"
                min="0.01"
                step="0.01"
                disabled={cashingOut}
              />
              <p className="text-[11px] text-muted-foreground">
                This will be added to your Minecraft Scarcity Market balance. The transfer is processed by your Minecraft server.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCashoutDialogOpen(false)} disabled={cashingOut}>
              Cancel
            </Button>
            <Button onClick={handleCashout} disabled={cashingOut || !cashoutAmount}>
              {cashingOut ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Processing…</> : 'Cash Out'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
