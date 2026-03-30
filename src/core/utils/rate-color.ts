import {
  GROSS_RATE_GREEN_MULTIPLIER,
  GROSS_RATE_YELLOW_MULTIPLIER,
  NET_RATE_GREEN,
  NET_RATE_YELLOW,
  profitThresholds,
} from "@mwbhtx/haulvisor-core";

/**
 * Returns a Tailwind text color class for a GROSS rate per mile value
 * based on the user's cost per mile setting.
 */
export function rateColor(ratePerMile: number, costPerMile: number): string {
  const ratio = ratePerMile / costPerMile;
  if (ratio >= GROSS_RATE_GREEN_MULTIPLIER) return "text-green-500";
  if (ratio >= GROSS_RATE_YELLOW_MULTIPLIER) return "text-yellow-500";
  return "text-red-500";
}

/**
 * Returns a Tailwind text color class for a NET (after costs) rate per mile.
 */
export function netRateColor(netPerMile: number): string {
  if (netPerMile >= NET_RATE_GREEN) return "text-green-500";
  if (netPerMile >= NET_RATE_YELLOW) return "text-yellow-500";
  return "text-red-500";
}

/**
 * Returns a Tailwind text color class for route profitability metrics
 * based on daily net profit. Thresholds from design tokens.
 */
export function routeProfitColor(dailyNetProfit: number): string {
  if (dailyNetProfit >= profitThresholds.good) return "text-green-400";
  if (dailyNetProfit >= profitThresholds.okay) return "text-yellow-500";
  return "text-red-500";
}
