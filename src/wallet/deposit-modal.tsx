import { useEffect, useState } from 'react';
import { CreditCard, Bitcoin, Wallet, ArrowRight, Lock } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';

interface DepositModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface PaymentProviderSection {
  id: string;
  label: string;
  icon: typeof CreditCard;
  description: string;
}

const FUTURE_PROVIDERS: PaymentProviderSection[] = [
  { id: 'card', label: 'Credit Card', icon: CreditCard, description: 'Visa, Mastercard, and more' },
  { id: 'crypto', label: 'Cryptocurrency', icon: Bitcoin, description: 'BTC, ETH, USDT, and more' },
  { id: 'other', label: 'Other Providers', icon: Wallet, description: 'Additional payment methods' },
];

export function DepositModal({ open, onOpenChange }: DepositModalProps) {
  const [rate, setRate] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!open) return;
    let active = true;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from('conversion_rates')
        .select('rate')
        .eq('from_currency', 'USD')
        .eq('to_currency', 'R_COINS')
        .maybeSingle();
      if (active) {
        setRate(data?.rate ?? 500);
        setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wallet className="h-4 w-4 text-gold" />
            Deposit R Coins
          </DialogTitle>
          <DialogDescription>
            Purchase R Coins to play games on the platform.
          </DialogDescription>
        </DialogHeader>

        {/* Conversion Rate */}
        <div className="rounded-lg border border-border/60 bg-surface-1 p-4">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Conversion Rate
          </p>
          <div className="mt-1.5 flex items-center gap-2">
            <span className="font-mono text-lg font-bold text-gold">1 USD</span>
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
            <span className="font-mono text-lg font-bold text-gold">
              {loading ? '…' : `${rate?.toLocaleString()} RC`}
            </span>
          </div>
          <p className="mt-1.5 text-[12px] text-muted-foreground">
            R Coins are the platform's internal currency. You can only hold R Coins, not USD.
          </p>
        </div>

        {/* Coming Soon Notice */}
        <div className="flex items-start gap-2.5 rounded-lg border border-border/60 bg-surface-1 p-3">
          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div>
            <p className="text-[13px] font-medium">External payments coming soon</p>
            <p className="text-[12px] text-muted-foreground">
              Payment integrations are under development. Once available, you'll be able to
              purchase R Coins directly through the providers below.
            </p>
          </div>
        </div>

        {/* Future Provider Sections */}
        <div className="space-y-2">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Payment Methods
          </p>
          {FUTURE_PROVIDERS.map((provider) => (
            <div
              key={provider.id}
              className="flex items-center gap-3 rounded-lg border border-border/40 bg-surface-1 px-3 py-2.5 opacity-60"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-surface-2">
                <provider.icon className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium">{provider.label}</p>
                <p className="text-[11px] text-muted-foreground">{provider.description}</p>
              </div>
              <Badge variant="outline" className="shrink-0 gap-1 text-[10px]">
                <Lock className="h-2.5 w-2.5" />
                Soon
              </Badge>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
