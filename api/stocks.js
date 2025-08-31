export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const { symbol } = req.query;

  if (!symbol) {
    return res.status(400).json({ error: 'Symbol parameter is required' });
  }

  try {
    // Yahoo Finance API endpoints
    const quoteUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}`;
    const statsUrl = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${symbol}?modules=summaryDetail,financialData,defaultKeyStatistics,earnings`;

    // Fetch quote data
    const quoteResponse = await fetch(quoteUrl);
    const quoteData = await quoteResponse.json();

    // Fetch financial statistics
    const statsResponse = await fetch(statsUrl);
    const statsData = await statsResponse.json();

    if (!quoteData.chart?.result?.[0] || !statsData.quoteSummary?.result?.[0]) {
      throw new Error('Invalid data structure from Yahoo Finance');
    }

    const quote = quoteData.chart.result[0];
    const stats = statsData.quoteSummary.result[0];

    // Extract key financial metrics
    const currentPrice = quote.meta.regularMarketPrice || 0;
    const previousClose = quote.meta.previousClose || currentPrice;
    const marketCap = stats.summaryDetail?.marketCap?.raw || 0;
    const peRatio = stats.summaryDetail?.trailingPE?.raw || stats.defaultKeyStatistics?.forwardPE?.raw || 15;
    const bookValue = stats.defaultKeyStatistics?.bookValue?.raw || currentPrice * 0.5;
    const eps = stats.defaultKeyStatistics?.trailingEps?.raw || (currentPrice / peRatio);
    const dividendYield = stats.summaryDetail?.dividendYield?.raw || 0;
    const dividendRate = stats.summaryDetail?.dividendRate?.raw || 0;
    const beta = stats.defaultKeyStatistics?.beta?.raw || 1;
    const freeCashflow = stats.financialData?.freeCashflow?.raw || 0;
    const totalRevenue = stats.financialData?.totalRevenue?.raw || 0;
    const profitMargins = stats.financialData?.profitMargins?.raw || 0;
    const operatingCashflow = stats.financialData?.operatingCashflow?.raw || 0;

    // Additional metrics for better valuation
    const sharesOutstanding = stats.defaultKeyStatistics?.sharesOutstanding?.raw || (marketCap / currentPrice);
    const enterpriseValue = stats.defaultKeyStatistics?.enterpriseValue?.raw || marketCap;
    const priceToSales = stats.summaryDetail?.priceToSalesTrailing12Months?.raw || 0;
    const pegRatio = stats.defaultKeyStatistics?.pegRatio?.raw || 0;

    // Return structured data
    const stockData = {
      symbol: symbol.toUpperCase(),
      currentPrice,
      previousClose,
      marketCap,
      peRatio,
      bookValue,
      eps,
      dividendYield,
      dividendRate,
      beta,
      freeCashflow,
      totalRevenue,
      profitMargins,
      operatingCashflow,
      sharesOutstanding,
      enterpriseValue,
      priceToSales,
      pegRatio,
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
