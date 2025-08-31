// /api/stocks.js - Fixed Vercel serverless function
export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const { symbol } = req.query;
  if (!symbol) {
    return res.status(400).json({ error: 'Symbol parameter is required' });
  }

  try {
    // ---- Step 1: Get Quote (price, previous close etc.)
    const quoteUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}`;
    const quoteResponse = await fetch(quoteUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' }
    });

    if (!quoteResponse.ok) {
      throw new Error(`Quote API failed: ${quoteResponse.status} ${quoteResponse.statusText}`);
    }

    const quoteData = await quoteResponse.json();
    const result = quoteData?.chart?.result?.[0];
    if (!result) throw new Error("No chart result data found");

    const meta = result.meta || {};
    const currentPrice = meta.regularMarketPrice || meta.previousClose;

    if (!currentPrice) throw new Error("No valid price found");

    // ---- Step 2: Get Fundamentals (P/E, Book value, EPS, etc.)
    const statsUrl = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${symbol}?modules=summaryDetail,financialData,defaultKeyStatistics,earnings,balanceSheetHistoryQuarterly`;
    const statsResponse = await fetch(statsUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' }
    });

    let financialData = {};
    if (statsResponse.ok) {
      const statsData = await statsResponse.json();
      const stats = statsData.quoteSummary?.result?.[0];

      if (stats) {
        financialData = {
          peRatio: stats.summaryDetail?.trailingPE?.raw ?? stats.defaultKeyStatistics?.forwardPE?.raw,
          bookValue: stats.defaultKeyStatistics?.bookValue?.raw,
          eps: stats.defaultKeyStatistics?.trailingEps?.raw,
          dividendYield: stats.summaryDetail?.dividendYield?.raw,
          dividendRate: stats.summaryDetail?.dividendRate?.raw,
          marketCap: stats.summaryDetail?.marketCap?.raw,
          beta: stats.defaultKeyStatistics?.beta?.raw,
          freeCashflow: stats.financialData?.freeCashflow?.raw,
          operatingCashflow: stats.financialData?.operatingCashflow?.raw,
          totalRevenue: stats.financialData?.totalRevenue?.raw,
          profitMargins: stats.financialData?.profitMargins?.raw,
          sharesOutstanding: stats.defaultKeyStatistics?.sharesOutstanding?.raw,
          enterpriseValue: stats.defaultKeyStatistics?.enterpriseValue?.raw,
          priceToSales: stats.summaryDetail?.priceToSalesTrailing12Months?.raw,
          pegRatio: stats.defaultKeyStatistics?.pegRatio?.raw
        };
      }
    }

    // ---- Step 3: Fallback calculations if API misses some values
    if (!financialData.eps && financialData.peRatio) {
      financialData.eps = currentPrice / financialData.peRatio;
    }
    if (!financialData.marketCap && financialData.sharesOutstanding) {
      financialData.marketCap = currentPrice * financialData.sharesOutstanding;
    }
    if (!financialData.sharesOutstanding && financialData.marketCap) {
      financialData.sharesOutstanding = financialData.marketCap / currentPrice;
    }

    // ---- Step 4: Return structured JSON
    const stockData = {
      symbol: symbol.toUpperCase(),
      currentPrice,
      previousClose: meta.previousClose,
      marketCap: financialData.marketCap,
      peRatio: financialData.peRatio,
      eps: financialData.eps,
      bookValue: financialData.bookValue,
      dividendYield: financialData.dividendYield,
      dividendRate: financialData.dividendRate,
      beta: financialData.beta,
      freeCashflow: financialData.freeCashflow,
      operatingCashflow: financialData.operatingCashflow,
      totalRevenue: financialData.totalRevenue,
      profitMargins: financialData.profitMargins,
      sharesOutstanding: financialData.sharesOutstanding,
      enterpriseValue: financialData.enterpriseValue,
      priceToSales: financialData.priceToSales,
      pegRatio: financialData.pegRatio,
      timestamp: new Date().toISOString()
    };

    res.status(200).json(stockData);

  } catch (error) {
    console.error(`Error fetching data for ${symbol}:`, error);
    res.status(500).json({
      error: 'Failed to fetch stock data',
      symbol,
      message: error.message
    });
  }
}
