// /api/stocks.js - robust Yahoo quote + fundamentals fetcher (no aggressive defaults)
export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const { symbol } = req.query;
  if (!symbol) return res.status(400).json({ error: 'Symbol parameter is required' });

  const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
  const enc = s => encodeURIComponent(String(s).trim().toUpperCase());

  try {
    // ---- 1) Get price/chart meta
    const chartUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${enc(symbol)}`;
    const chartResp = await fetch(chartUrl, { headers: { 'User-Agent': ua, 'Accept': 'application/json' } });
    if (!chartResp.ok) throw new Error(`Chart endpoint failed: ${chartResp.status}`);
    const chartJson = await chartResp.json();
    const chartResult = chartJson?.chart?.result?.[0];
    if (!chartResult) throw new Error('No chart result from Yahoo');

    const meta = chartResult.meta || {};
    const currentPrice = (meta.regularMarketPrice ?? meta.chartPreviousClose ?? meta.previousClose) ?? null;
    const previousClose = meta.previousClose ?? null;

    // ---- 2) Try quoteSummary with multiple modules (and fallback domains)
    const modules = [
      'price',
      'summaryDetail',
      'defaultKeyStatistics',
      'financialData',
      'earnings',
      'balanceSheetHistory',
      'assetProfile'
    ].join(',');

    const endpoints = [
      `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${enc(symbol)}?modules=${modules}`,
      `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${enc(symbol)}?modules=${modules}`
    ];

    let stats = null;
    for (const url of endpoints) {
      try {
        const r = await fetch(url, { headers: { 'User-Agent': ua, 'Accept': 'application/json' } });
        if (!r.ok) {
          // try next endpoint
          continue;
        }
        const txt = await r.text();
        let parsed;
        try { parsed = JSON.parse(txt); } catch (e) { parsed = null; }
        const candidate = parsed?.quoteSummary?.result?.[0];
        if (candidate) { stats = candidate; break; }
      } catch (e) {
        // continue to next endpoint
      }
    }

    // Helper to safely pull .raw when available
    const raw = (obj) => {
      if (obj === undefined || obj === null) return null;
      if (typeof obj === 'object' && 'raw' in obj) return obj.raw;
      if (typeof obj === 'number' || typeof obj === 'string') return obj;
      return null;
    };

    // ---- 3) Extract fundamentals (null if not available)
    const out = {
      symbol: String(symbol).toUpperCase(),
      currentPrice: currentPrice ?? null,
      previousClose: previousClose ?? null,
      timestamp: new Date().toISOString(),

      // fundamentals (may be null)
      marketCap: null,
      peRatio: null,
      bookValue: null,
      eps: null,
      dividendYield: null,
      dividendRate: null,
      beta: null,
      freeCashflow: null,
      totalRevenue: null,
      profitMargins: null,
      operatingCashflow: null,
      sharesOutstanding: null,
      enterpriseValue: null,
      priceToSales: null,
      pegRatio: null
    };

    if (stats) {
      out.peRatio = raw(stats.summaryDetail?.trailingPE) ?? raw(stats.defaultKeyStatistics?.forwardPE) ?? null;
      out.bookValue = raw(stats.defaultKeyStatistics?.bookValue) ?? null;
      out.eps = raw(stats.defaultKeyStatistics?.trailingEps) ?? null;
      out.dividendYield = raw(stats.summaryDetail?.dividendYield) ?? null;
      out.dividendRate = raw(stats.summaryDetail?.dividendRate) ?? null;
      out.beta = raw(stats.summaryDetail?.beta) ?? raw(stats.defaultKeyStatistics?.beta) ?? null;
      out.freeCashflow = raw(stats.financialData?.freeCashflow) ?? null;
      out.totalRevenue = raw(stats.financialData?.totalRevenue) ?? null;
      out.profitMargins = raw(stats.financialData?.profitMargins) ?? null;
      out.operatingCashflow = raw(stats.financialData?.operatingCashflow) ?? null;
      out.sharesOutstanding = raw(stats.defaultKeyStatistics?.sharesOutstanding) ?? null;
      out.enterpriseValue = raw(stats.defaultKeyStatistics?.enterpriseValue) ?? null;
      out.priceToSales = raw(stats.summaryDetail?.priceToSalesTrailing12Months) ?? null;
      out.pegRatio = raw(stats.defaultKeyStatistics?.pegRatio) ?? null;

      // Try to pull marketCap from 'price' or 'summaryDetail'
      out.marketCap = raw(stats.price?.marketCap) ?? raw(stats.summaryDetail?.marketCap) ?? out.marketCap;
    }

    // ---- 4) Reasonable derived values only when source data present
    if (!out.marketCap && out.sharesOutstanding && out.currentPrice) {
      out.marketCap = out.sharesOutstanding * out.currentPrice;
    }
    if (!out.sharesOutstanding && out.marketCap && out.currentPrice) {
      out.sharesOutstanding = out.marketCap / out.currentPrice;
    }

    // NOTE: DO NOT invent bookValue / freeCashflow defaults here — return null instead.
    res.status(200).json(out);

  } catch (err) {
    console.error('stocks handler error:', err && err.stack ? err.stack : err);
    res.status(500).json({ error: 'Failed to fetch stock data', message: err?.message ?? String(err) });
  }
}
