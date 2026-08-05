import { useState } from 'react';
import { Shield, ChevronDown, ChevronUp, Check, X, Loader2 } from 'lucide-react';
import { verifyServerSeed, generateProvablyFairFloat } from '@/game-engine/provably-fair';
import { cn } from '@/lib/utils';

export interface ProvablyFairData {
  roundId: string;
  clientSeed: string;
  serverSeed: string | null;
  serverSeedHash: string;
  nonce: number;
  gameType: string;
}

export function ProvablyFairPanel({ data }: { data: ProvablyFairData }) {
  const [expanded, setExpanded] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [result, setResult] = useState<'pending' | 'pass' | 'fail'>('pending');

  const handleVerify = async () => {
    if (!data.serverSeed) return;
    setVerifying(true);
    setResult('pending');
    try {
      const hashOk = await verifyServerSeed(data.serverSeed, data.serverSeedHash);
      setResult(hashOk ? 'pass' : 'fail');
    } catch {
      setResult('fail');
    } finally {
      setVerifying(false);
    }
  };

  const handleVerifyFloat = async () => {
    if (!data.serverSeed) return;
    setVerifying(true);
    setResult('pending');
    try {
      const { float } = await generateProvablyFairFloat(data.clientSeed, data.serverSeed, data.nonce);
      const hashOk = await verifyServerSeed(data.serverSeed, data.serverSeedHash);
      setResult(hashOk ? 'pass' : 'fail');
      return float;
    } catch {
      setResult('fail');
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="rounded border border-border/60 bg-surface-1">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between px-3 py-2"
      >
        <span className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
          <Shield className="h-3.5 w-3.5 text-primary" />
          Provably Fair
        </span>
        {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>

      {expanded && (
        <div className="space-y-2 border-t border-border/60 px-3 py-2.5">
          <PFRow label="Round ID" value={data.roundId} mono />
          <PFRow label="Game" value={data.gameType} />
          <PFRow label="Client Seed" value={data.clientSeed} mono />
          <PFRow label="Server Seed Hash" value={data.serverSeedHash} mono />
          <PFRow
            label="Server Seed"
            value={data.serverSeed ?? 'Revealed after game ends'}
            mono={!!data.serverSeed}
            dimmed={!data.serverSeed}
          />
          <PFRow label="Nonce" value={String(data.nonce)} mono />

          {data.serverSeed && (
            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={handleVerify}
                disabled={verifying}
                className="flex items-center gap-1.5 rounded border border-border/60 bg-surface-2 px-2.5 py-1 text-[12px] font-medium hover:border-primary/40 disabled:opacity-50"
              >
                {verifying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Shield className="h-3.5 w-3.5" />}
                Verify SHA-256
              </button>
              <button
                onClick={handleVerifyFloat}
                disabled={verifying}
                className="flex items-center gap-1.5 rounded border border-border/60 bg-surface-2 px-2.5 py-1 text-[12px] font-medium hover:border-primary/40 disabled:opacity-50"
              >
                Verify Float
              </button>
              {result === 'pass' && (
                <span className="flex items-center gap-1 text-[12px] font-medium text-success">
                  <Check className="h-3.5 w-3.5" /> Verified
                </span>
              )}
              {result === 'fail' && (
                <span className="flex items-center gap-1 text-[12px] font-medium text-destructive">
                  <X className="h-3.5 w-3.5" /> Failed
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PFRow({ label, value, mono, dimmed }: { label: string; value: string; mono?: boolean; dimmed?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <span className="shrink-0 text-[11px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className={cn('break-all text-right text-[11px]', mono && 'font-mono', dimmed && 'text-muted-foreground/50')}>
        {value}
      </span>
    </div>
  );
}
