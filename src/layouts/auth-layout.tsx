import { Disc, ShieldCheck } from 'lucide-react';

export function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-background">
      {/* Left: Branding */}
      <div className="hidden flex-col justify-between border-r border-border/60 bg-grid p-8 lg:flex lg:w-[44%]">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded bg-primary/15">
            <Disc className="h-4 w-4 text-primary" />
          </div>
          <span className="text-[15px] font-bold tracking-tight">Stakeforge</span>
        </div>
        <div className="space-y-4">
          <h1 className="text-balance text-[22px] font-bold leading-tight tracking-tight">
            Provably fair gaming, built for desktop.
          </h1>
          <p className="text-balance text-[13px] leading-relaxed text-muted-foreground">
            Every outcome verifiable. Every transaction transparent. Built on a
            foundation of cryptographic fairness.
          </p>
          <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5 text-primary" />
            <span>Verify every result yourself</span>
          </div>
        </div>
        <div className="text-[11px] text-muted-foreground">
          © 2026 Stakeforge. All rights reserved.
        </div>
      </div>

      {/* Right: Form */}
      <div className="flex flex-1 items-center justify-center px-4 py-8">
        <div className="w-full max-w-[340px]">
          <div className="mb-6 flex items-center gap-2 lg:hidden">
            <div className="flex h-7 w-7 items-center justify-center rounded bg-primary/15">
              <Disc className="h-4 w-4 text-primary" />
            </div>
            <span className="text-[15px] font-bold tracking-tight">Stakeforge</span>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
