export enum RetailPair {
  XAUUSD = 'XAUUSD',
  EURUSD = 'EURUSD',
  GBPUSD = 'GBPUSD',
  EURAUD = 'EURAUD',
  USDJPY = 'USDJPY',
  USDCAD = 'USDCAD',
  EURGBP = 'EURGBP',
  GBPCHF = 'GBPCHF',
  EURCHF = 'EURCHF',
  USDCHF = 'USDCHF',
  XAGUSD = 'XAGUSD',
  USDX   = 'USDX',
}

// convenient lists/sets if needed
export const ALL_RETAIL_PAIRS: RetailPair[] = Object.values(RetailPair);
export const RETAIL_PAIRS_SET = new Set(ALL_RETAIL_PAIRS);

// narrow helper
export function isRetailPair(v: string): v is RetailPair {
  return RETAIL_PAIRS_SET.has(v.toUpperCase() as RetailPair);
}
