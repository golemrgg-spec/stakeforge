import { useState } from 'react';
import { Plus, Minus, Equal, Lock, Unlock, AlertTriangle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { formatCoins } from '@/lib/utils';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

type WalletAction = 'add' | 'remove' | 'set' | 'lock' | 'unlock';

interface AdminWalletDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  username: string;
  currentBalance: number;
  currentLocked: number;
  onSuccess: () => void;
}

const ACTIONS: Array<{ id: WalletAction; label: string; icon: typeof Plus; description: string; needsAmount: boolean; destructive?: boolean }> = [
  { id: 'add', label: 'Add R Coins', icon: Plus, description: 'Increase the user\'s balance', needsAmount: true },
  { id: 'remove', label: 'Remove R Coins', icon: Minus, description: 'Decrease the user\'s balance', needsAmount: true, destructive: true },
  { id: 'set', label: 'Set Exact Balance', icon: Equal, description: 'Set balance to a specific amount', needsAmount: true, destructive: true },
  { id: 'lock', label: 'Lock Balance', icon: Lock, description: 'Move coins from balance to locked', needsAmount: true },
  { id: 'unlock', label: 'Unlock Balance', icon: Unlock, description: 'Move coins from locked to balance', needsAmount: true },
];

export function AdminWalletDialog({
  open,
  onOpenChange,
  userId,
  username,
  currentBalance,
  currentLocked,
  onSuccess,
}: AdminWalletDialogProps) {
  const [action, setAction] = useState<WalletAction | null>(null);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [confirmStep, setConfirmStep] = useState(false);

  const selectedAction = ACTIONS.find((a) => a.id === action);
  const numericAmount = parseFloat(amount) || 0;

  const reset = () => {
    setAction(null);
    setAmount('');
    setReason('');
    setConfirmStep(false);
  };

  const handleClose = (open: boolean) => {
    if (!open) reset();
    onOpenChange(open);
  };

  const previewBalance = (): string => {
    if (!selectedAction || !selectedAction.needsAmount) return formatCoins(currentBalance);
    if (action === 'add') return formatCoins(currentBalance + numericAmount);
    if (action === 'remove') return formatCoins(currentBalance - numericAmount);
    if (action === 'set') return formatCoins(numericAmount);
    if (action === 'lock') return formatCoins(currentBalance - numericAmount);
    if (action === 'unlock') return formatCoins(currentBalance + numericAmount);
    return formatCoins(currentBalance);
  };

  const handleSubmit = async () => {
    if (!action) return;
    if (!reason.trim()) {
      toast.error('Reason required', { description: 'A reason is required for all wallet modifications.' });
      return;
    }
    if (selectedAction?.needsAmount && (numericAmount <= 0 || isNaN(numericAmount))) {
      toast.error('Invalid amount', { description: 'Please enter a valid positive amount.' });
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('admin_adjust_wallet', {
        p_target_user_id: userId,
        p_action: action,
        p_amount: selectedAction?.needsAmount ? numericAmount : null,
        p_reason: reason.trim(),
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast.success('Wallet updated', {
        description: `Successfully ${action === 'add' ? 'added' : action === 'remove' ? 'removed' : action === 'set' ? 'set' : action === 'lock' ? 'locked' : 'unlocked'} R Coins for ${username}.`,
      });
      reset();
      handleClose(false);
      onSuccess();
    } catch (err) {
      toast.error('Action failed', {
        description: err instanceof Error ? err.message : 'An unexpected error occurred.',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="h-4 w-4 text-gold" />
            Manage Wallet — {username}
          </DialogTitle>
          <DialogDescription>
            Current balance: {formatCoins(currentBalance)} · Locked: {formatCoins(currentLocked)}
          </DialogDescription>
        </DialogHeader>

        {!action && !confirmStep && (
          <div className="space-y-2">
            <Label className="text-[12px] font-medium uppercase tracking-wide text-muted-foreground">
              Select Action
            </Label>
            {ACTIONS.map((a) => (
              <button
                key={a.id}
                onClick={() => setAction(a.id)}
                className="flex w-full items-center gap-3 rounded-lg border border-border/60 bg-surface-1 px-3 py-2.5 text-left transition-colors hover:bg-surface-2"
              >
                <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded ${a.destructive ? 'bg-destructive/10' : 'bg-primary/10'}`}>
                  <a.icon className={`h-4 w-4 ${a.destructive ? 'text-destructive' : 'text-primary'}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium">{a.label}</p>
                  <p className="text-[11px] text-muted-foreground">{a.description}</p>
                </div>
              </button>
            ))}
          </div>
        )}

        {action && !confirmStep && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => setAction(null)}>
                Back
              </Button>
              <span className="text-[13px] font-medium">{selectedAction?.label}</span>
            </div>

            {selectedAction?.needsAmount && (
              <div className="space-y-1.5">
                <Label htmlFor="amount">
                  {action === 'set' ? 'New Balance' : action === 'lock' ? 'Amount to Lock' : action === 'unlock' ? 'Amount to Unlock' : 'Amount'}
                </Label>
                <div className="relative">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[13px] font-bold text-gold">RC</span>
                  <Input
                    id="amount"
                    type="number"
                    placeholder="0"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="reason">Reason</Label>
              <Textarea
                id="reason"
                placeholder="Explain why this modification is being made…"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
              />
              <p className="text-[11px] text-muted-foreground">
                This reason is permanently recorded in the audit log.
              </p>
            </div>

            <Button onClick={() => setConfirmStep(true)} className="w-full" disabled={!reason.trim()}>
              Review
            </Button>
          </div>
        )}

        {confirmStep && (
          <div className="space-y-3">
            <div className="flex items-start gap-2.5 rounded-lg border border-warning/40 bg-warning/10 p-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
              <div>
                <p className="text-[13px] font-medium">Confirm Wallet Modification</p>
                <p className="text-[12px] text-muted-foreground">
                  This action is permanent and will be recorded in the audit log.
                </p>
              </div>
            </div>

            <div className="space-y-2 rounded-lg border border-border/60 bg-surface-1 p-3 text-[13px]">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Action</span>
                <span className="font-medium">{selectedAction?.label}</span>
              </div>
              {selectedAction?.needsAmount && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Amount</span>
                  <span className="font-mono font-medium">{formatCoins(numericAmount)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Current Balance</span>
                <span className="font-mono">{formatCoins(currentBalance)}</span>
              </div>
              <div className="flex justify-between border-t border-border/40 pt-2">
                <span className="text-muted-foreground">Resulting Balance</span>
                <span className="font-mono font-bold text-gold">{previewBalance()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Reason</span>
                <span className="max-w-[200px] text-right text-[12px]">{reason}</span>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setConfirmStep(false)} disabled={loading}>
                Back
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={loading}
                variant={selectedAction?.destructive ? 'destructive' : 'default'}
              >
                {loading ? 'Processing…' : 'Confirm & Execute'}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
