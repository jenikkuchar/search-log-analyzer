import { LogEntry, ToolCall } from "./types";

/**
 * Parses the Python-like dictionary string from the log message.
 * Example: "{'query': 'lampa', 'order_by': 'asc'}"
 */
export function parseToolCall(message: string, logTimestamp: string): ToolCall | null {
  if (!message.includes('search_datart_tool')) return null;

  // Try to extract arguments from different formats:
  // 1. search_datart_tool(query='...', ...)
  // 2. search_datart_tool called with query='...', ...
  let argsStr = "";
  const parenMatch = message.match(/search_datart_tool\s*\(\s*(.*?)\s*\)/);
  const calledWithMatch = message.match(/search_datart_tool\s+called\s+with\s+(.*)/);

  if (parenMatch) {
    argsStr = parenMatch[1];
  } else if (calledWithMatch) {
    argsStr = calledWithMatch[1];
  } else {
    console.debug("Found 'search_datart_tool' but couldn't extract arguments:", message);
    return null;
  }

  try {
    // Robust parsing of key=value pairs
    // Example: query='Sony WH-1000XM5', price_min=None, price_max=None, order_by=None
    const data: any = {};
    
    // Split by comma followed by a key= pattern
    const pairs = argsStr.split(/,\s*(?=\w+\s*=)/);
    
    pairs.forEach(pair => {
      const eqIndex = pair.indexOf('=');
      if (eqIndex === -1) return;
      
      const key = pair.substring(0, eqIndex).trim();
      let value = pair.substring(eqIndex + 1).trim();
      
      // Remove quotes if present
      if ((value.startsWith("'") && value.endsWith("'")) || (value.startsWith('"') && value.endsWith('"'))) {
        value = value.substring(1, value.length - 1);
      }
      
      // Handle special values
      let finalValue: any = value;
      if (value === 'None' || value === 'null') finalValue = undefined;
      else if (value === 'True' || value === 'true') finalValue = true;
      else if (value === 'False' || value === 'false') finalValue = false;
      else if (!isNaN(Number(value)) && value !== "") finalValue = Number(value);
      
      data[key] = finalValue;
    });

    if (!data.query && data.query !== "") {
       // If regex failed, try JSON-like fallback (the old way)
       try {
         const jsonStr = argsStr
          .replace(/'/g, '"')
          .replace(/None/g, 'null')
          .replace(/True/g, 'true')
          .replace(/False/g, 'false');
         const jsonData = JSON.parse(jsonStr);
         Object.assign(data, jsonData);
       } catch (e) {
         // Fallback failed too
       }
    }
    
    return {
      query: data.query || "",
      price_min: data.price_min,
      price_max: data.price_max,
      order_by: data.order_by,
      timestamp: new Date(logTimestamp),
      originalLog: {} as any
    };
  } catch (e) {
    console.error("Failed to parse tool call arguments:", argsStr);
    console.error("Parsing error:", e);
    return null;
  }
}

export function convertToCSV(data: ToolCall[]): string {
  const headers = ["Timestamp", "Query", "Price Min", "Price Max", "Order By"];
  const rows = data.map(call => [
    call.timestamp.toISOString(),
    `"${String(call.query || '').replace(/"/g, '""')}"`,
    call.price_min ?? "",
    call.price_max ?? "",
    call.order_by ?? ""
  ]);

  return [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
}

export function downloadCSV(csvContent: string, fileName: string = "report.csv") {
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.setAttribute("href", url);
  link.setAttribute("download", fileName);
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
