import {
  Bomb,
  Club,
  Dice5,
  CircleSlash,
  TowerControl,
  Disc,
  Coins,
  Swords,
  Gamepad2,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const games = [
  { name: 'Blackjack', icon: Club, description: 'Beat the dealer to 21.', color: 'text-lime-400', tint: 'bg-lime-400/10', playable: true, path: '/games/blackjack' },
  { name: 'Plinko', icon: CircleSlash, description: 'Drop the ball through a field of pegs.', color: 'text-cyan-400', tint: 'bg-cyan-400/10', playable: true, path: '/games/plinko' },
  { name: 'Towers', icon: TowerControl, description: 'Climb the tower by picking safe tiles.', color: 'text-violet-400', tint: 'bg-violet-400/10', playable: true, path: '/games/towers' },
  { name: 'Roulette', icon: Disc, description: 'Bet on red, purple, or yellow.', color: 'text-rose-400', tint: 'bg-rose-400/10', playable: true, path: '/games/roulette' },
  { name: 'Coinflip', icon: Coins, description: 'Heads or tails — flip the coin.', color: 'text-yellow-400', tint: 'bg-yellow-400/10', playable: true, path: '/games/coinflip' },
  { name: 'Case Battle', icon: Swords, description: 'Open cases against other players.', color: 'text-orange-400', tint: 'bg-orange-400/10', playable: true, path: '/games/case-battle' },
  { name: 'Mines', icon: Bomb, description: 'Find the gems, avoid the mines.', color: 'text-amber-400', tint: 'bg-amber-400/10', playable: true, path: '/games/mines' },
  { name: 'Dice', icon: Dice5, description: 'Roll and beat the target number.', color: 'text-emerald-400', tint: 'bg-emerald-400/10', playable: true, path: '/games/dice' },
];

export function GamesPage() {
  const navigate = useNavigate();

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[15px] font-bold tracking-tight">Games</h1>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            All games run on the Stakeforge Provably Fair engine
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
        {games.map((game) => (
          <button
            key={game.name}
            onClick={() => game.playable && navigate(game.path)}
            className={cn(
              'group relative flex flex-col overflow-hidden rounded border border-border/60 bg-surface-1 transition-all duration-150',
              game.playable
                ? 'cursor-pointer hover:border-primary/40 hover:scale-[1.02]'
                : 'cursor-default'
            )}
          >
            <div className={cn('flex h-[88px] items-center justify-center', game.tint)}>
              <game.icon className={cn('h-8 w-8 transition-transform duration-200', game.color, game.playable && 'group-hover:scale-110')} />
            </div>
            <div className="flex items-center justify-between border-t border-border/60 px-2.5 py-2">
              <div className="min-w-0">
                <p className="truncate text-[13px] font-semibold">{game.name}</p>
                <p className="truncate text-[11px] text-muted-foreground">{game.description}</p>
              </div>
            </div>
            <div className="absolute right-1.5 top-1.5">
              {game.playable ? (
                <Badge variant="outline" className="gap-1 bg-success/10 text-[10px] text-success border-success/30">
                  <span className="h-1.5 w-1.5 rounded-full bg-success" />
                  Live
                </Badge>
              ) : (
                <Badge variant="outline" className="gap-1 bg-background/80 text-[10px]">
                  Soon
                </Badge>
              )}
            </div>
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2 rounded border border-border/60 bg-surface-1 px-3 py-2.5">
        <Gamepad2 className="h-4 w-4 shrink-0 text-primary" />
        <p className="text-[12px] text-muted-foreground">
          All games are live and powered by the provably fair engine. Deposit via Minecraft using /deposit.
        </p>
      </div>
    </div>
  );
}
