// /api/stocks.js
export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { symbol } = req.query;
  if (!symbol) {
    return res.status(400).json({ error: 'Symbol parameter is required' });
  }

  const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
  const s = str => String(str || '').trim().toUpperCase();
  const enc = v => encodeURIComponent(s(v));

  try {
    // 1) Get price / chart meta
    const chartUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${enc(symbol)}`;
    console.log(`Fetching chart: ${chartUrl}`);
    const chartResp = await fetch(chartUrl, { headers: { 'User-Agent': ua, 'Accept': 'application/json' } });
    if (!chartResp.ok) {
      throw new Error(`Chart endpoint returned ${chartResp.status}`);
    }
    const chartJson = await chartResp.json();
    const chartResult = chartJson?.chart?.result?.[0];
    if (!chartResult) throw new Error('No chart result from Yahoo');

    const meta = chartResult.meta || {};
    const currentPrice = meta.regularMarketPrice ?? meta.previousClose ?? null;
    const previousClose = meta.previousClose ?? null;

    // 2) Try quoteSummary endpoints for fundamentals (use two endpoints as fallback)
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
        console.log(`Trying fundamentals endpoint: ${url}`);
        const r = await fetch(url, { headers: { 'User-Agent': ua, 'Accept': 'application/json' } });
        if (!r.ok) {
          console.warn(`Endpoint returned ${r.status} for ${url}`);
          continue;
        }
        const parsed = await r.json();
        const candidate = parsed?.quoteSummary?.result?.[0];
        if (candidate) {
          stats = candidate;
          break;
        }
      } catch (e) {
        console.warn(`Fundamentals fetch error for ${url}:`, e && e.message ? e.message : e);
      }
    }

    // helper to extract .raw safely
    const raw = (obj) => {
      if (obj === undefined || obj === null) return null;
      if (typeof obj === 'object' && 'raw' in obj) return obj.raw;
      if (typeof obj === 'number') return obj;
      return null;
    };

    // 3) Build output with null defaults (no aggressive estimates)
    const out = {
      symbol: s(symbol),
      currentPrice: currentPrice ?? null,
      previousClose: previousClose ?? null,
      timestamp: new Date().toISOString(),

      // fundamentals (null when not available)
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

      // marketCap may be present in price or summaryDetail
      out.marketCap = raw(stats.price?.marketCap) ?? raw(stats.summaryDetail?.marketCap) ?? out.marketCap;
    }

    // 4) Derivations ONLY when source pieces exist
    if (!out.marketCap && out.sharesOutstanding && out.currentPrice) {
      out.marketCap = out.sharesOutstanding * out.currentPrice;
    }
    if (!out.sharesOutstanding && out.marketCap && out.currentPrice) {
      out.sharesOutstanding = out.marketCap / out.currentPrice;
    }

    // DO NOT invent bookValue or freeCashflow defaults here.
    console.log(`Processed ${out.symbol}:`, {
      price: out.currentPrice,
      pe: out.peRatio,
      eps: out.eps,
      book: out.bookValue
    });

    return res.status(200).json(out);

  } catch (error) {
    console.error(`Error in /api/stocks for ${symbol}:`, error && error.stack ? error.stack : error);
    return res.status(500).json({
      error: 'Failed to fetch stock data',
      symbol: symbol ? String(symbol).toUpperCase() : undefined,
      message: error?.message ?? String(error)
    });
  }
}
