import yahooFinance from "yahoo-finance2";

export default async function handler(req, res) {
  const { symbol } = req.query;

  if (!symbol) {
    return res.status(400).json({ error: "Missing stock symbol" });
  }

  try {
    const quote = await yahooFinance.quoteSummary(symbol, {
      modules: [
        "price",
        "summaryDetail",
        "defaultKeyStatistics",
        "financialData",
        "incomeStatementHistory",
        "balanceSheetHistory",
        "cashflowStatementHistory",
        "earnings",
      ],
    });

    const result = {
      symbol,
      currentPrice: quote.price?.regularMarketPrice || null,
      previousClose: quote.price?.regularMarketPreviousClose || null,
      marketCap: quote.price?.marketCap || null,
      sharesOutstanding: quote.defaultKeyStatistics?.sharesOutstanding || null,
      freeCashflow: quote.financialData?.freeCashflow || null,
      eps: quote.defaultKeyStatistics?.trailingEps || null,
      peRatio: quote.summaryDetail?.trailingPE || null,
      forwardPE: quote.summaryDetail?.forwardPE || null,
      pegRatio: quote.defaultKeyStatistics?.pegRatio || null,
      bookValue: quote.defaultKeyStatistics?.bookValue || null,
      totalRevenue: quote.financialData?.totalRevenue || null,
      profitMargins: quote.financialData?.profitMargins || null,
      dividendRate: quote.summaryDetail?.dividendRate || null,
      dividendYield: quote.summaryDetail?.dividendYield || null,
      beta: quote.summaryDetail?.beta || null,
      timestamp: new Date().toISOString(),
    };

    res.status(200).json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}


