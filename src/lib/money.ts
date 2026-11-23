export function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export function formatCoins(value: number): string {
  const rounded = round1(value);
  if (Math.abs(rounded - Math.round(rounded)) < 0.001) {
    return String(Math.round(rounded));
  }
  return rounded.toFixed(1);
}

export function coinsFromMinutes(
  minutes: number,
  coinsPerHour: number,
): number {
  return round1((minutes / 60) * coinsPerHour);
}

export function formatRate(coinsPerHour: number): string {
  return `每小时存 ${formatCoins(coinsPerHour)} 枚`;
}