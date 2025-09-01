import yahooFinance from "yahoo-finance2";

async function fetchQuote(symbol) {
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

    // Show everything with proper formatting
    console.log(JSON.stringify(quote, null, 2));

    return quote;
  } catch (err) {
    console.error("Error fetching quote:", err);
  }
}

fetchQuote("NFLX");
