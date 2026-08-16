import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const COIN_FORMATTER = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

export function formatCoins(amount: number): string {
  return `${COIN_FORMATTER.format(amount)} RC`;
}

export function formatCoinsShort(amount: number): string {
  if (Math.abs(amount) >= 1_000_000) {
    return `${(amount / 1_000_000).toFixed(1)}M RC`;
  }
  if (Math.abs(amount) >= 1_000) {
    return `${(amount / 1_000).toFixed(1)}K RC`;
  }
  return `${COIN_FORMATTER.format(amount)} RC`;
}

export function formatUsd(amount: number): string {
  return `${amount.toFixed(2)}`;
}

export const R_COINS_PER_USD = 500;
