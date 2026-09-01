import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const CURRENCY_FORMATTER = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const CURRENCY_FORMATTER_SHORT = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

export function formatMD(amountInCents: number): string {
  return `$${CURRENCY_FORMATTER.format(amountInCents / 100)}`;
}

export function formatMDShort(amountInCents: number): string {
  const amount = amountInCents / 100;

  if (Math.abs(amount) >= 1_000_000) {
    return `$${(amount / 1_000_000).toFixed(1)}M`;
  }

  if (Math.abs(amount) >= 1_000) {
    return `$${(amount / 1_000).toFixed(1)}K`;
  }

  return `$${CURRENCY_FORMATTER_SHORT.format(amount)}`;
}

export function formatMDRaw(amountInCents: number): string {
  return CURRENCY_FORMATTER.format(amountInCents / 100);
}

export function formatCoins(amountInCents: number): string {
  return formatMD(amountInCents);
}

export function formatCoinsShort(amountInCents: number): string {
  return formatMDShort(amountInCents);
}

export function formatUsd(amountInCents: number): string {
  return formatMD(amountInCents);
}

export const R_COINS_PER_USD = 1;

export function dollarsToCents(dollars: number): number {
  return Math.round(dollars * 100);
}

export function centsToDollars(cents: number): number {
  return cents / 100;
}