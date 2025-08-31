// /api/stocks.js - Updated Vercel serverless function
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
    // Yahoo Finance API endpoints - using different approach
    const quoteUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}`;
    
    console.log(`Fetching data for ${symbol} from: ${quoteUrl}`);

    // Fetch quote data first
    const quoteResponse = await fetch(quoteUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json'
      }
    });

    if (!quoteResponse.ok) {
      console.error(`Quote API failed: ${quoteResponse.status} ${quoteResponse.statusText}`);
      throw new Error(`Quote API returned ${quoteResponse.status}: ${quoteResponse.statusText}`);
    }

    const quoteText = await quoteResponse.text();
    console.log(`Raw quote response for ${symbol}:`, quoteText.substring(0, 200));

    let quoteData;
    try {
      quoteData = JSON.parse(quoteText);
    } catch (parseError) {
      console.error(`JSON parse error for ${symbol}:`, parseError);
      throw new Error(`Failed to parse quote response: ${parseError.message}`);
    }

    // Check if we have valid chart data
    if (!quoteData.chart) {
      console.error(`No chart data for ${symbol}:`, quoteData);
      throw new Error(`No chart data found. Response: ${JSON.stringify(quoteData)}`);
    }

    if (quoteData.chart.error) {
      console.error(`Yahoo Finance error for ${symbol}:`, quoteData.chart.error);
      throw new Error(`Yahoo Finance error: ${quoteData.chart.error.description}`);
    }

    if (!quoteData.chart.result || quoteData.chart.result.length === 0) {
      console.error(`No chart results for ${symbol}:`, quoteData.chart);
      throw new Error(`No chart results found for symbol ${symbol}`);
    }

    const quote = quoteData.chart.result[0];
    console.log(`Quote data structure for ${symbol}:`, Object.keys(quote));

    // Extract basic price data
    const meta = quote.meta || {};
    const currentPrice = meta.regularMarketPrice || meta.previousClose;
    
    if (!currentPrice || currentPrice <= 0) {
      console.error(`Invalid price for ${symbol}:`, meta);
      throw new Error(`No valid price found. Meta: ${JSON.stringify(meta)}`);
    }

    // Now try to get additional financial data
    let financialData = {};
    try {
      const statsUrl = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${symbol}?modules=summaryDetail,financialData,defaultKeyStatistics,earnings`;
      
      const statsResponse = await fetch(statsUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json'
        }
      });

      if (statsResponse.ok) {
        const statsData = await statsResponse.json();
        
        if (statsData.quoteSummary?.result?.[0]) {
          const stats = statsData.quoteSummary.result[0];
          
          // Extract financial metrics with safe access
          financialData = {
            peRatio: stats.summaryDetail?.trailingPE?.raw || stats.defaultKeyStatistics?.forwardPE?.raw || 15,
            bookValue: stats.defaultKeyStatistics?.bookValue?.raw || currentPrice * 0.6,
            eps: stats.defaultKeyStatistics?.trailingEps?.raw,
            dividendYield: stats.summaryDetail?.dividendYield?.raw || 0,
            dividendRate: stats.summaryDetail?.dividendRate?.raw || 0,
            marketCap: stats.summaryDetail?.marketCap?.raw,
            beta: stats.defaultKeyStatistics?.beta?.raw || 1,
            freeCashflow: stats.financialData?.freeCashflow?.raw,
            totalRevenue: stats.financialData?.totalRevenue?.raw,
            profitMargins: stats.financialData?.profitMargins?.raw || 0.1,
            operatingCashflow: stats.financialData?.operatingCashflow?.raw,
            sharesOutstanding: stats.defaultKeyStatistics?.sharesOutstanding?.raw,
            enterpriseValue: stats.defaultKeyStatistics?.enterpriseValue?.raw,
            priceToSales: stats.summaryDetail?.priceToSalesTrailing12Months?.raw,
            pegRatio: stats.defaultKeyStatistics?.pegRatio?.raw
          };
        }
      } else {
        console.warn(`Stats API failed for ${symbol}:`, statsResponse.status);
      }
    } catch (statsError) {
      console.warn(`Error fetching stats for ${symbol}:`, statsError.message);
    }

    // Calculate EPS if not available
    if (!financialData.eps && financialData.peRatio) {
      financialData.eps = currentPrice / financialData.peRatio;
    }

    // Calculate market cap if not available
    if (!financialData.marketCap && financialData.sharesOutstanding) {
      financialData.marketCap = currentPrice * financialData.sharesOutstanding;
    } else if (!financialData.marketCap) {
      financialData.marketCap = currentPrice * 1000000000; // Estimate 1B shares
    }

    // Calculate shares outstanding if not available
    if (!financialData.sharesOutstanding) {
      financialData.sharesOutstanding = financialData.marketCap / currentPrice;
    }

    // Estimate free cash flow if not available
    if (!financialData.freeCashflow) {
      financialData.freeCashflow = financialData.marketCap * 0.05; // 5% of market cap estimate
    }

    // Return structured data
    const stockData = {
      symbol: symbol.toUpperCase(),
      currentPrice,
      previousClose: meta.previousClose || currentPrice,
      marketCap: financialData.marketCap,
      peRatio: financialData.peRatio,
      bookValue: financialData.bookValue,
      eps: financialData.eps,
      dividendYield: financialData.dividendYield,
      dividendRate: financialData.dividendRate,
      beta: financialData.beta,
      freeCashflow: financialData.freeCashflow,
      totalRevenue: financialData.totalRevenue,
      profitMargins: financialData.profitMargins,
      operatingCashflow: financialData.operatingCashflow,
      sharesOutstanding: financialData.sharesOutstanding,
      enterpriseValue: financialData.enterpriseValue,
      priceToSales: financialData.priceToSales,
      pegRatio: financialData.pegRatio,
      timestamp: new Date().toISOString()
    };

    console.log(`Successfully processed ${symbol}:`, stockData);
    res.status(200).json(stockData);

  } catch (error) {
    console.error(`Error fetching data for ${symbol}:`, error);
    res.status(500).json({ 
      error: 'Failed to fetch stock data',
      symbol,
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}
