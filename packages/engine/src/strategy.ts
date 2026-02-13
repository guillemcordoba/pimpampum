export enum AIStrategy {
  Aggro = 'Aggro',
  Protect = 'Protect',
  Power = 'Power',
}

export interface StrategyStats {
  games: number;
  wins: number;
}
