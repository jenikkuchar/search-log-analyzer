
export interface LogEntry {
  insertId?: string;
  jsonPayload?: {
    message?: string;
    timestamp?: string;
    logger_name?: string;
    line?: number;
    context?: {
      request_id?: string;
      request_url?: string;
    };
  };
  message?: string;
  textPayload?: string;
  timestamp?: string;
  severity?: string;
  [key: string]: any; // Allow other fields
}

export interface ToolCall {
  query: string;
  price_min?: number;
  price_max?: number;
  order_by?: 'asc' | 'desc';
  timestamp: Date;
  originalLog: LogEntry;
}

export interface UploadedFile {
  id: string;
  name: string;
  size: number;
  extractedCount: number;
  toolCalls: ToolCall[];
}

export interface DailyTimelinePoint {
  date: Date;
  dateStr: string;
  displayDate: string;
  fullDate: string;
  dayOfWeek: string;
  label: string;
  count: number;
  isZero: boolean;
  priceCount: number;
  sortCount: number;
  displayCount: number;
}

export interface ZeroArea {
  id: string;
  startDateStr: string;
  endDateStr: string;
  startDisplay: string;
  endDisplay: string;
  daysCount: number;
  days: DailyTimelinePoint[];
}

export interface Stats {
  totalSearches: number;
  topPhrases: { phrase: string; count: number; percentage: number }[];
  priceRangePercentage: number;
  sortingPercentage: number;
  cheapestCount: number;
  mostExpensiveCount: number;
  multiQuerySessions: number;
  multiQueryPercentage: number;
  avgQueriesPerMultiSession: number;
  priceConsiderationCount: number;
}
