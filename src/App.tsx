import React, { useState, useMemo, useRef, useEffect } from 'react';
import { 
  FileUp, 
  Download, 
  Filter, 
  Search, 
  TrendingUp, 
  DollarSign, 
  ArrowUpDown, 
  Calendar,
  Clock,
  ChevronLeft,
  ChevronRight,
  BarChart3,
  Trash2,
  Files,
  AlertTriangle,
  CalendarDays,
  Activity,
  X,
  Upload,
  Lightbulb
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Cell,
  PieChart,
  Pie
} from 'recharts';
import { format, isWithinInterval, parseISO, startOfDay, endOfDay, eachDayOfInterval } from 'date-fns';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

import { LogEntry, ToolCall, Stats, UploadedFile, DailyTimelinePoint, ZeroArea } from './types';
import { parseToolCall, convertToCSV, downloadCSV } from './utils';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Barvy grafů dle manuálu – pevné pořadí sérií
const CHART = ['#0a84ff', '#30d158', '#ff9f0a', '#bf5af2', '#ff375f', '#64d2ff', '#ffd60a', '#ac8e68'];
const DANGER = '#ff453a';
const CHART_GRID = 'rgba(255,255,255,.08)';
const CHART_AXIS = 'rgba(235,235,245,.38)';
const TOOLTIP_STYLE = {
  backgroundColor: 'rgba(32,32,40,.92)',
  borderRadius: '14px',
  border: 'none',
  boxShadow: '0 0 0 .5px rgba(255,255,255,.14) inset, 0 40px 100px -20px rgba(0,0,0,.8)',
  fontSize: '12px'
};

// Český formát čísel
const nf = (n: number, digits = 0) =>
  n.toLocaleString('cs-CZ', { minimumFractionDigits: digits, maximumFractionDigits: digits });
const pf = (n: number, digits = 1) => `${nf(n, digits)} %`;

interface TimelineTooltipProps {
  active?: boolean;
  payload?: any[];
  filteredCount: number;
  selectedDay: string | null;
}

function TimelineTooltip({ active, payload, filteredCount }: TimelineTooltipProps) {
  if (!active || !payload || !payload.length) return null;
  const data = payload[0].payload as DailyTimelinePoint;
  if (!data) return null;

  return (
    <div className="popover p-3.5 text-xs max-w-xs z-50 text-fg">
      <div className="flex items-center justify-between gap-3 mb-2 pb-2 border-b-[0.5px] border-line">
        <div>
          <span className="font-semibold text-fg text-sm tabular-nums">
            {data.dayOfWeek} {data.fullDate}
          </span>
        </div>
        {data.isZero ? (
          <span className="badge badge-dot b-err">
            Nulová oblast
          </span>
        ) : (
          <span className="badge badge-dot b-accent">
            Aktivní den
          </span>
        )}
      </div>

      {data.isZero ? (
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 font-semibold text-sm text-danger">
            <AlertTriangle size={14} className="shrink-0" />
            <span>0 vyhledávání</span>
          </div>
          <p className="text-fg-muted text-xs leading-relaxed">
            V tento den nebyla zaznamenána žádná aktivita vyhledávání (výpadek nebo období bez dotazů).
          </p>
          <div className="pt-1 text-xs text-fg-subtle">
            Kliknutím na sloupec vyberete tento den
          </div>
        </div>
      ) : (
        <div className="space-y-1.5 text-fg-muted">
          <div className="flex items-center justify-between gap-4">
            <span>Počet vyhledávání:</span>
            <span className="font-semibold text-fg text-sm tabular-nums">{nf(data.count)}</span>
          </div>
          {filteredCount > 0 && (
            <div className="flex items-center justify-between gap-4">
              <span>Podíl z vybraného období:</span>
              <span className="text-fg font-medium tabular-nums">{pf((data.count / filteredCount) * 100)}</span>
            </div>
          )}
          {data.priceCount > 0 && (
            <div className="flex items-center justify-between gap-4">
              <span>S filtrem ceny:</span>
              <span className="text-fg font-medium tabular-nums">{nf(data.priceCount)}</span>
            </div>
          )}
          {data.sortCount > 0 && (
            <div className="flex items-center justify-between gap-4">
              <span>S explicitním řazením:</span>
              <span className="text-fg font-medium tabular-nums">{nf(data.sortCount)}</span>
            </div>
          )}
          <div className="pt-1 text-xs text-fg-subtle">
            Kliknutím na sloupec vyfiltrujete dotazy tohoto dne
          </div>
        </div>
      )}
    </div>
  );
}

export default function App() {
  console.log("App component rendered");
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  
  const toolCalls = useMemo(() => {
    return uploadedFiles.flatMap(f => f.toolCalls);
  }, [uploadedFiles]);

  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [startTime, setStartTime] = useState<string>('00:00');
  const [endTime, setEndTime] = useState<string>('23:59');
  const [searchTerm, setSearchTerm] = useState<string>('');
  
  // Set initial dates based on loaded data automatically when new files are added
  useEffect(() => {
    if (toolCalls.length > 0 && !startDate && !endDate) {
      const dates = toolCalls.map(c => c.timestamp.getTime());
      const minDate = new Date(Math.min(...dates));
      const maxDate = new Date(Math.max(...dates));
      setStartDate(format(minDate, 'yyyy-MM-dd'));
      setEndDate(format(maxDate, 'yyyy-MM-dd'));
    }
  }, [toolCalls, startDate, endDate]);

  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [timelineFilterMode, setTimelineFilterMode] = useState<'all' | 'zero' | 'active'>('all');

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, startDate, endDate, startTime, endTime, selectedDay]);

  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(25);
  const [showAllPhrases, setShowAllPhrases] = useState<boolean>(false);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<{ type: 'success' | 'error' | 'info', message: string } | null>(null);
  const [debugLogs, setDebugLogs] = useState<string[]>([]);
  const [showDebug, setShowDebug] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addDebugLog = (msg: string) => {
    console.log("DEBUG LOG:", msg);
    setDebugLogs(prev => [msg, ...prev].slice(0, 50));
  };

  const handleReset = () => {
    setUploadedFiles([]);
    setUploadStatus(null);
    setDebugLogs([]);
    setSearchTerm('');
    setStartDate('');
    setEndDate('');
    setSelectedDay(null);
    setTimelineFilterMode('all');
    setCurrentPage(1);
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    console.log("File input change event triggered");
    if (event.target.files && event.target.files.length > 0) {
      const filesArray = Array.from(event.target.files) as File[];
      addDebugLog(`Selected ${filesArray.length} files via input`);
      processMultipleFiles(filesArray);
    }
    // Reset value to allow re-uploading the same files
    event.target.value = '';
  };

  const processSingleFile = (file: File): Promise<UploadedFile> => {
    return new Promise((resolve, reject) => {
      const logMsg = `Processing file: ${file.name} (${file.size} bytes)`;
      console.log(logMsg);
      addDebugLog(logMsg);
      
      const reader = new FileReader();
      
      reader.onprogress = (e) => {
        if (e.lengthComputable) {
          const percent = Math.round((e.loaded / e.total) * 100);
          addDebugLog(`Reading file ${file.name}: ${percent}%`);
        }
      };

      reader.onload = (e) => {
        try {
          const content = e.target?.result as string;
          addDebugLog(`File content of ${file.name} read successfully. Parsing...`);
          
          let logs: LogEntry[] = [];
          try {
            const json = JSON.parse(content);
            logs = Array.isArray(json) ? json : [json];
            addDebugLog(`[${file.name}] Parsed as standard JSON array. Found ${logs.length} entries.`);
          } catch (parseErr) {
            addDebugLog(`[${file.name}] Not a standard JSON array, trying NDJSON (line by line)...`);
            try {
              logs = content.split('\n')
                .filter(line => line.trim())
                .map((line, i) => {
                  try {
                    return JSON.parse(line);
                  } catch (lineErr) {
                    return null;
                  }
                })
                .filter((l): l is LogEntry => l !== null);
              addDebugLog(`[${file.name}] Parsed as NDJSON. Found ${logs.length} valid entries.`);
            } catch (ndErr) {
              reject(new Error(`Nepodařilo se parsovat soubor ${file.name} jako JSON ani NDJSON.`));
              return;
            }
          }
          
          if (logs.length === 0) {
            reject(new Error(`Soubor ${file.name} neobsahuje žádné platné JSON záznamy.`));
            return;
          }
          
          const calls = logs
            .map((log, index) => {
              const message = log.jsonPayload?.message || log.message || log.textPayload || (typeof log === 'string' ? log : null);
              const timestamp = log.timestamp || log.jsonPayload?.timestamp || new Date().toISOString();

              if (!message) {
                return null;
              }
              
              const call = parseToolCall(message, timestamp);
              if (call) {
                call.originalLog = log;
              }
              return call;
            })
            .filter((call): call is ToolCall => call !== null);
          
          addDebugLog(`[${file.name}] Successfully extracted ${calls.length} valid tool calls.`);
          
          if (calls.length === 0) {
            reject(new Error(`V souboru ${file.name} nebyly nalezeny žádné validní záznamy vyhledávání.`));
            return;
          }

          resolve({
            id: `${file.name}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
            name: file.name,
            size: file.size,
            extractedCount: calls.length,
            toolCalls: calls
          });
        } catch (err: any) {
          reject(err);
        }
      };

      reader.onerror = (err) => {
        reject(new Error(`Chyba při čtení souboru ${file.name}.`));
      };
      
      reader.readAsText(file);
    });
  };

  const processMultipleFiles = async (files: File[]) => {
    if (files.length === 0) return;
    
    setUploadStatus({ type: 'info', message: `Zpracovávám ${files.length} souborů...` });
    addDebugLog(`Starting processing for ${files.length} files...`);
    
    const results: UploadedFile[] = [];
    const errors: string[] = [];
    
    for (const file of files) {
      try {
        const result = await processSingleFile(file);
        results.push(result);
      } catch (err: any) {
        console.error(`Error processing file ${file.name}:`, err);
        errors.push(err.message || `Chyba při zpracování souboru ${file.name}`);
        addDebugLog(`Error on ${file.name}: ${err.message || err}`);
      }
    }
    
    if (results.length > 0) {
      setUploadedFiles(prev => {
        const updated = [...prev, ...results];
        return updated;
      });
      
      const successMsg = `Bylo úspěšně načteno ${results.length} souborů (celkem ${results.reduce((s, r) => s + r.extractedCount, 0)} záznamů).`;
      if (errors.length > 0) {
        setUploadStatus({ 
          type: 'error', 
          message: `${successMsg} Nepodařilo se však načíst: ${errors.join(', ')}` 
        });
      } else {
        setUploadStatus({ type: 'success', message: successMsg });
      }
    } else if (errors.length > 0) {
      setUploadStatus({ 
        type: 'error', 
        message: `Nepodařilo se načíst žádný soubor. Chyby: ${errors.join('; ')}` 
      });
    }
  };

  const handleRemoveFile = (id: string) => {
    setUploadedFiles(prev => {
      const filtered = prev.filter(f => f.id !== id);
      addDebugLog(`Removed file with id ${id}. Remaining files: ${filtered.length}`);
      
      if (filtered.length === 0) {
        setUploadStatus(null);
      } else {
        setUploadStatus({ 
          type: 'info', 
          message: `Odebrána data souboru. Aktuálně sloučeno ${filtered.length} souborů.` 
        });
      }
      return filtered;
    });
  };

  const filteredCalls = useMemo(() => {
    const filtered = toolCalls.filter(call => {
      let matchesTime = true;
      if (startDate && endDate) {
        const callDate = call.timestamp;
        const start = parseISO(`${startDate}T${startTime}`);
        const end = parseISO(`${endDate}T${endTime}`);
        matchesTime = isWithinInterval(callDate, { start, end });
      }
      
      const query = String(call.query || '');
      const matchesSearch = query.toLowerCase().includes(searchTerm.toLowerCase());
      return matchesTime && matchesSearch;
    });

    return [...filtered].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }, [toolCalls, startDate, endDate, startTime, endTime, searchTerm]);

  const multiQueryTimestamps = useMemo(() => {
    const counts: Record<string, number> = {};
    filteredCalls.forEach(call => {
      const ts = call.timestamp.toISOString();
      counts[ts] = (counts[ts] || 0) + 1;
    });
    return new Set(Object.entries(counts).filter(([_, count]) => count > 1).map(([ts]) => ts));
  }, [filteredCalls]);

  const timestampToGroupIdx = useMemo(() => {
    const map: Record<string, number> = {};
    let idx = 0;
    let lastTs = "";
    // We need to calculate this for ALL filtered calls to keep group indices consistent
    filteredCalls.forEach(call => {
      const ts = call.timestamp.toISOString();
      if (ts !== lastTs) {
        lastTs = ts;
        idx++;
      }
      map[ts] = idx;
    });
    return map;
  }, [filteredCalls]);

  const displayCalls = useMemo(() => {
    if (!selectedDay) return filteredCalls;
    return filteredCalls.filter(call => format(call.timestamp, 'yyyy-MM-dd') === selectedDay);
  }, [filteredCalls, selectedDay]);

  const paginatedCalls = useMemo(() => {
    const startIdx = (currentPage - 1) * pageSize;
    return displayCalls.slice(startIdx, startIdx + pageSize);
  }, [displayCalls, currentPage, pageSize]);

  const totalPages = Math.ceil(displayCalls.length / pageSize);

  const timelineDateRange = useMemo(() => {
    if (startDate && endDate) {
      try {
        const s = parseISO(startDate);
        const e = parseISO(endDate);
        if (!isNaN(s.getTime()) && !isNaN(e.getTime())) {
          return s <= e 
            ? { start: startOfDay(s), end: startOfDay(e) } 
            : { start: startOfDay(e), end: startOfDay(s) };
        }
      } catch {
        // ignore
      }
    }

    if (toolCalls.length > 0) {
      const times = toolCalls.map(c => c.timestamp.getTime());
      const minD = new Date(Math.min(...times));
      const maxD = new Date(Math.max(...times));
      return { start: startOfDay(minD), end: startOfDay(maxD) };
    }

    return null;
  }, [startDate, endDate, toolCalls]);

  const dailyTimelineData = useMemo<DailyTimelinePoint[]>(() => {
    if (!timelineDateRange) return [];

    const { start, end } = timelineDateRange;
    const diffDays = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays < 0 || diffDays > 730) {
      return [];
    }

    const days = eachDayOfInterval({ start, end });

    const dayBuckets: Record<string, { total: number; priceCount: number; sortCount: number }> = {};
    
    filteredCalls.forEach(call => {
      const dStr = format(call.timestamp, 'yyyy-MM-dd');
      if (!dayBuckets[dStr]) {
        dayBuckets[dStr] = { total: 0, priceCount: 0, sortCount: 0 };
      }
      dayBuckets[dStr].total++;
      if (call.price_min !== undefined || call.price_max !== undefined) {
        dayBuckets[dStr].priceCount++;
      }
      if (call.order_by) {
        dayBuckets[dStr].sortCount++;
      }
    });

    const CZECH_DAYS = ['Ne', 'Po', 'Út', 'St', 'Čt', 'Pá', 'So'];

    const rawPoints = days.map(day => {
      const dateStr = format(day, 'yyyy-MM-dd');
      const displayDate = format(day, 'd. M.');
      const fullDate = format(day, 'dd.MM.yyyy');
      const dayOfWeek = CZECH_DAYS[day.getDay()];
      const bucket = dayBuckets[dateStr];
      const count = bucket ? bucket.total : 0;
      const isZero = count === 0;

      return {
        date: day,
        dateStr,
        displayDate,
        fullDate,
        dayOfWeek,
        label: `${dayOfWeek} ${displayDate}`,
        count,
        isZero,
        priceCount: bucket ? bucket.priceCount : 0,
        sortCount: bucket ? bucket.sortCount : 0,
        displayCount: count
      };
    });

    const maxCount = Math.max(...rawPoints.map(p => p.count), 0);
    const zeroMarkerHeight = maxCount > 0 ? Math.max(1, Math.round(maxCount * 0.04)) : 1;

    return rawPoints.map(p => ({
      ...p,
      displayCount: p.isZero ? zeroMarkerHeight : p.count
    }));
  }, [timelineDateRange, filteredCalls]);

  const zeroAreas = useMemo<ZeroArea[]>(() => {
    const areas: ZeroArea[] = [];
    let currentStreak: DailyTimelinePoint[] = [];

    dailyTimelineData.forEach(point => {
      if (point.isZero) {
        currentStreak.push(point);
      } else {
        if (currentStreak.length > 0) {
          const first = currentStreak[0];
          const last = currentStreak[currentStreak.length - 1];
          areas.push({
            id: `${first.dateStr}_${last.dateStr}`,
            startDateStr: first.dateStr,
            endDateStr: last.dateStr,
            startDisplay: first.displayDate,
            endDisplay: last.displayDate,
            daysCount: currentStreak.length,
            days: [...currentStreak]
          });
          currentStreak = [];
        }
      }
    });

    if (currentStreak.length > 0) {
      const first = currentStreak[0];
      const last = currentStreak[currentStreak.length - 1];
      areas.push({
        id: `${first.dateStr}_${last.dateStr}`,
        startDateStr: first.dateStr,
        endDateStr: last.dateStr,
        startDisplay: first.displayDate,
        endDisplay: last.displayDate,
        daysCount: currentStreak.length,
        days: [...currentStreak]
      });
    }

    return areas;
  }, [dailyTimelineData]);

  const timelineStats = useMemo(() => {
    const totalDays = dailyTimelineData.length;
    const zeroDays = dailyTimelineData.filter(d => d.isZero).length;
    const activeDays = totalDays - zeroDays;
    const totalSearches = filteredCalls.length;
    const avgPerActiveDay = activeDays > 0 ? (totalSearches / activeDays) : 0;
    const peakDay = dailyTimelineData.length > 0 
      ? [...dailyTimelineData].sort((a, b) => b.count - a.count)[0] 
      : null;

    return {
      totalDays,
      zeroDays,
      activeDays,
      totalSearches,
      avgPerActiveDay,
      peakDay: peakDay && peakDay.count > 0 ? peakDay : null,
      zeroAreasCount: zeroAreas.length
    };
  }, [dailyTimelineData, filteredCalls, zeroAreas]);

  const stats = useMemo<Stats>(() => {
    const total = filteredCalls.length;
    if (total === 0) return {
      totalSearches: 0,
      topPhrases: [],
      priceRangePercentage: 0,
      sortingPercentage: 0,
      cheapestCount: 0,
      mostExpensiveCount: 0,
      multiQuerySessions: 0,
      multiQueryPercentage: 0,
      avgQueriesPerMultiSession: 0,
      priceConsiderationCount: 0
    };

    const phrases: Record<string, number> = {};
    const timestampGroups: Record<string, number> = {};
    let withPrice = 0;
    let withSort = 0;
    let cheapest = 0;
    let expensive = 0;
    let priceConsiderationCount = 0;

    filteredCalls.forEach(call => {
      const queryStr = String(call.query || '');
      phrases[queryStr] = (phrases[queryStr] || 0) + 1;
      
      const tsKey = call.timestamp.toISOString();
      timestampGroups[tsKey] = (timestampGroups[tsKey] || 0) + 1;

      const hasPriceRange = call.price_min !== undefined || call.price_max !== undefined;
      const hasSort = !!call.order_by;

      if (hasPriceRange) withPrice++;
      if (hasSort) withSort++;
      
      if (hasPriceRange || hasSort) {
        priceConsiderationCount++;
      }

      if (call.order_by === 'asc') cheapest++;
      if (call.order_by === 'desc') expensive++;
    });

    const multiQueryEntries = Object.values(timestampGroups).filter(count => count > 1);
    const multiQuerySessions = multiQueryEntries.length;
    const totalMultiQueryCalls = multiQueryEntries.reduce((sum, count) => sum + count, 0);
    const avgQueriesPerMultiSession = multiQuerySessions > 0 ? totalMultiQueryCalls / multiQuerySessions : 0;
    const multiQueryPercentage = (totalMultiQueryCalls / total) * 100;

    const allPhrases = Object.entries(phrases)
      .map(([phrase, count]) => ({ 
        phrase, 
        count, 
        percentage: (count / total) * 100 
      }))
      .sort((a, b) => b.count - a.count);

    const topPhrases = showAllPhrases ? allPhrases : allPhrases.slice(0, 10);

    return {
      totalSearches: total,
      topPhrases,
      priceRangePercentage: (withPrice / total) * 100,
      sortingPercentage: (withSort / total) * 100,
      cheapestCount: cheapest,
      mostExpensiveCount: expensive,
      multiQuerySessions,
      multiQueryPercentage,
      avgQueriesPerMultiSession,
      priceConsiderationCount
    };
  }, [filteredCalls, showAllPhrases]);

  const handleExport = () => {
    const dataToExport = selectedDay ? displayCalls : filteredCalls;
    const dateSuffix = selectedDay ? `_${selectedDay}` : `_${format(new Date(), 'yyyy-MM-dd_HHmm')}`;
    const csv = convertToCSV(dataToExport);
    downloadCSV(csv, `datart_report${dateSuffix}.csv`);
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = () => {
    setIsDragging(false);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    console.log("Files dropped");
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const filesArray = Array.from(e.dataTransfer.files) as File[];
      addDebugLog(`Dropped ${filesArray.length} files`);
      processMultipleFiles(filesArray);
    } else {
      console.warn("No files found in drop event");
    }
  };

  const uploadStatusClass = (type: 'success' | 'error' | 'info') =>
    type === 'success' ? "bg-success/10 text-success hairline" :
    type === 'error' ? "bg-danger/10 text-danger hairline-danger" :
    "bg-accent-soft text-accent hairline-accent";

  return (
    <div className="min-h-screen flex flex-col">

      {/* Horní lišta */}
      <header className="topbar sticky top-0 z-20 h-14 flex items-center gap-3 px-4 sm:px-5">
        <div className="flex items-center gap-2.5 min-w-0">
          <a href="https://www.jan-kuchar.cz" aria-label="jan-kuchar.cz" className="mark">JK</a>
          <span className="text-fg-subtle text-lg font-light" aria-hidden="true">/</span>
          <img src="/favicon.svg" alt="" className="size-[26px] shrink-0" />
          <span className="text-[15px] font-light tracking-[-0.01em] whitespace-nowrap max-[340px]:sr-only">
            Search <b className="font-semibold">Analyzer</b>
          </span>
        </div>
        <div className="flex-1" />
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              console.log("Header upload button clicked");
              fileInputRef.current?.click();
            }}
            className="btn btn-secondary btn-sm"
            title={uploadedFiles.length > 0 ? 'Sloučit další JSON' : 'Nahrát JSON'}
          >
            <FileUp />
            <span className={cn(toolCalls.length > 0 && "max-sm:sr-only")}>
              {uploadedFiles.length > 0 ? 'Sloučit další JSON' : 'Nahrát JSON'}
            </span>
          </button>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            className="hidden"
            multiple
          />

          {toolCalls.length > 0 && (
            <>
              <button
                onClick={handleReset}
                className="btn btn-danger btn-sm"
                title="Resetovat"
              >
                <X className="sm:hidden" />
                <span className="max-sm:sr-only">Resetovat</span>
              </button>
              <button
                onClick={handleExport}
                className="btn btn-primary btn-sm"
                title={selectedDay ? `Exportovat den (${displayCalls.length})` : 'Exportovat CSV'}
              >
                <Download />
                <span className="max-sm:sr-only">
                  {selectedDay ? `Exportovat den (${nf(displayCalls.length)})` : 'Exportovat CSV'}
                </span>
              </button>
            </>
          )}
        </div>
      </header>

      <main className="flex-1 w-full max-w-[1200px] mx-auto px-4 sm:px-6 pt-7 pb-8 space-y-4">

        {/* Titulek stránky */}
        <div className="pb-1">
          <h1 className="text-2xl sm:text-[32px] sm:leading-[1.15] font-semibold tracking-[-0.02em] text-fg">Datart Search Analyzer</h1>
          <p className="text-[13px] text-fg-muted mt-1">Analýza logů vyhledávacího nástroje</p>
        </div>

        {toolCalls.length === 0 ? (
          <div
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            className="space-y-4"
          >
            <div
              className={cn(
                "dropzone grid justify-items-center text-center gap-2.5 px-3.5 py-7 sm:px-5 sm:py-10",
                isDragging && "is-over"
              )}
            >
              <span className="size-[52px] rounded-full bg-accent-soft text-accent grid place-items-center">
                <Upload size={24} strokeWidth={1.8} />
              </span>
              <h2 className="mt-1.5 text-xl font-semibold tracking-[-0.01em] text-fg">Nahrajte logy k analýze</h2>
              <p className="text-fg-muted max-w-[46ch]">
                Přetáhněte jeden nebo více JSON souborů s logy, nebo klikněte na tlačítko níže.
                Budeme analyzovat a sloučíme volání <code className="text-info">search_datart_tool</code>.
              </p>

              <button
                onClick={() => {
                  console.log("Empty state upload button clicked");
                  fileInputRef.current?.click();
                }}
                className="btn btn-primary mt-1.5"
              >
                <FileUp />
                Vybrat soubory
              </button>
              <span className="text-xs text-fg-subtle mt-0.5">Podporované formáty: JSON a NDJSON · data zůstávají jen v prohlížeči</span>

              {uploadStatus && (
                <div className={cn(
                  "mt-3 px-4 py-3 rounded-row text-sm max-w-md text-center",
                  uploadStatusClass(uploadStatus.type)
                )}>
                  {uploadStatus.message}
                </div>
              )}
            </div>

            <div className="panel !bg-transparent p-5">
              <h3 className="text-[15px] font-semibold tracking-[-0.01em] text-fg mb-2.5 flex items-center gap-2">
                <Clock size={16} className="text-accent" />
                Jak získat logy z Google Cloud?
              </h3>
              <ol className="space-y-1.5 text-fg-muted list-decimal pl-5 marker:text-fg-subtle">
                <li>Otevřete <a href="https://console.cloud.google.com/logs/query" target="_blank" rel="noreferrer" className="hover:underline">Google Cloud Console - Log Explorer</a>.</li>
                <li>Do vyhledávacího pole vložte filtr:<br />
                  <code className="block bg-surface-2 hairline px-3 py-2 rounded-row mt-2 text-info text-xs">
                    SEARCH("search_datart_tool called with query")
                  </code>
                </li>
                <li>Klikněte na tlačítko <strong className="text-fg font-semibold">Actions</strong> vpravo nahoře a zvolte <strong className="text-fg font-semibold">Download</strong>.</li>
                <li>V dialogu ponechte formát <strong className="text-fg font-semibold">JSON</strong> a potvrďte stažení.</li>
                <li>Stažený soubor nahrajte sem do analyzátoru.</li>
              </ol>
            </div>
          </div>
        ) : (
          <>
            {/* List of uploaded files */}
            {uploadedFiles.length > 0 && (
              <section className="panel p-5 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b-[0.5px] border-line pb-3">
                  <div className="flex items-center gap-2">
                    <Files size={18} className="text-accent" />
                    <h3 className="text-[15px] font-semibold tracking-[-0.01em] text-fg">Sloučené soubory logů ({uploadedFiles.length})</h3>
                  </div>
                  <div className="text-xs text-fg-muted">
                    Celkem sloučeno: <span className="text-fg font-semibold tabular-nums">{nf(toolCalls.length)}</span> vyhledávacích dotazů
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {uploadedFiles.map((file) => (
                    <div key={file.id} className="flex items-center justify-between p-3 bg-surface-2 hairline rounded-card hover:bg-surface-3 transition-colors group">
                      <div className="min-w-0 pr-2">
                        <p className="text-sm font-medium text-fg truncate" title={file.name}>
                          {file.name}
                        </p>
                        <div className="flex items-center gap-2 text-xs text-fg-subtle mt-1 tabular-nums">
                          <span>{nf(file.size / 1024, 1)} KB</span>
                          <span>·</span>
                          <span className="text-fg-muted">{nf(file.extractedCount)} záznamů</span>
                        </div>
                      </div>
                      <button
                        onClick={() => handleRemoveFile(file.id)}
                        className="btn btn-ghost btn-sm btn-icon !text-fg-subtle hover:!text-danger hover:!bg-danger/15 md:opacity-0 md:group-hover:opacity-100 focus:opacity-100"
                        title="Odebrat soubor ze sloučení"
                      >
                        <Trash2 />
                      </button>
                    </div>
                  ))}
                </div>

                {uploadStatus && (
                  <div className={cn(
                    "px-4 py-2 rounded-row text-xs w-full text-center",
                    uploadStatusClass(uploadStatus.type)
                  )}>
                    {uploadStatus.message}
                  </div>
                )}
              </section>
            )}

            {/* Filters */}
            <section className="panel p-5">
              <div className="flex items-center gap-2 mb-4 border-b-[0.5px] border-line pb-3">
                <Filter size={18} className="text-accent" />
                <h3 className="text-[15px] font-semibold tracking-[-0.01em] text-fg">Filtrování reportu</h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="grid gap-1.5">
                  <label className="field-label">
                    <Calendar size={12} /> Od data
                  </label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="input tabular-nums"
                  />
                </div>
                <div className="grid gap-1.5">
                  <label className="field-label">
                    <Clock size={12} /> Od času
                  </label>
                  <input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="input tabular-nums"
                  />
                </div>
                <div className="grid gap-1.5">
                  <label className="field-label">
                    <Calendar size={12} /> Do data
                  </label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="input tabular-nums"
                  />
                </div>
                <div className="grid gap-1.5">
                  <label className="field-label">
                    <Clock size={12} /> Do času
                  </label>
                  <input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="input tabular-nums"
                  />
                </div>
              </div>
            </section>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
              <div className="card px-4 py-3.5">
                <div className="flex items-center justify-between mb-3">
                  <div className="size-8 grid place-items-center bg-surface-2 hairline rounded-row text-accent">
                    <Search size={16} />
                  </div>
                  <span className="badge b-neutral">Celkem</span>
                </div>
                <div className="text-[26px] font-semibold tracking-[-0.02em] tabular-nums text-fg">{nf(stats.totalSearches)}</div>
                <div className="text-xs text-fg-muted mt-0.5">Počet vyhledávání</div>
              </div>

              <div className="card px-4 py-3.5">
                <div className="flex items-center justify-between mb-3">
                  <div className="size-8 grid place-items-center bg-surface-2 hairline rounded-row text-accent">
                    <DollarSign size={16} />
                  </div>
                  <span className="badge b-neutral">Cenové filtry</span>
                </div>
                <div className="text-[26px] font-semibold tracking-[-0.02em] tabular-nums text-fg">{pf(stats.priceRangePercentage)}</div>
                <div className="text-xs text-fg-muted mt-0.5">S definovanou cenou</div>
              </div>

              <div className="card px-4 py-3.5">
                <div className="flex items-center justify-between mb-3">
                  <div className="size-8 grid place-items-center bg-surface-2 hairline rounded-row text-accent">
                    <ArrowUpDown size={16} />
                  </div>
                  <span className="badge b-neutral">Řazení</span>
                </div>
                <div className="text-[26px] font-semibold tracking-[-0.02em] tabular-nums text-fg">{pf(stats.sortingPercentage)}</div>
                <div className="text-xs text-fg-muted mt-0.5">S požadavkem na řazení</div>
              </div>

              <div className="card px-4 py-3.5">
                <div className="flex items-center justify-between mb-3">
                  <div className="size-8 grid place-items-center bg-surface-2 hairline rounded-row text-accent">
                    <BarChart3 size={16} />
                  </div>
                  <span className="badge b-neutral">Multi-dotazy</span>
                </div>
                <div className="text-[26px] font-semibold tracking-[-0.02em] tabular-nums text-fg">{pf(stats.multiQueryPercentage)}</div>
                <div className="text-xs text-fg-muted mt-0.5 tabular-nums">
                  {nf(stats.multiQuerySessions)} událostí (ø {nf(stats.avgQueriesPerMultiSession, 1)})
                </div>
              </div>

              <div className="card px-4 py-3.5 sm:col-span-2 lg:col-span-1">
                <div className="flex items-center justify-between mb-3">
                  <div className="size-8 grid place-items-center bg-surface-2 hairline rounded-row text-accent">
                    <TrendingUp size={16} />
                  </div>
                  <span className="badge b-neutral">Top fráze</span>
                </div>
                <div className="text-xl font-semibold tracking-[-0.01em] truncate text-fg leading-[39px]">{stats.topPhrases?.[0]?.phrase || '-'}</div>
                <div className="text-xs text-fg-muted mt-0.5">Nejčastější dotaz</div>
              </div>
            </div>

            {/* Daily Timeline Section with Red Zero Areas Highlight */}
            {dailyTimelineData.length > 0 && (
              <section className="panel p-5 space-y-5">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className="size-9 shrink-0 grid place-items-center bg-accent-soft rounded-button text-accent">
                      <CalendarDays size={18} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-[15px] font-semibold tracking-[-0.01em] text-fg">Časová osa vyhledávání po dnech</h3>
                        {selectedDay && (
                          <span className="badge badge-dot b-accent tabular-nums">
                            Vybrán den: {format(parseISO(selectedDay), 'd. M. yyyy')}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-fg-muted mt-0.5">
                        Denní počty vyhledávacích dotazů s červeně zvýrazněnými nulovými oblastmi (dny bez zaznamenaných hledání).
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {/* Zero days indicator badge */}
                    {timelineStats.zeroDays > 0 ? (
                      <span className="badge badge-dot b-err tabular-nums">
                        {timelineStats.zeroDays} {timelineStats.zeroDays === 1 ? 'nulový den' : (timelineStats.zeroDays < 5 ? 'nulové dny' : 'nulových dnů')} ({timelineStats.zeroAreasCount} {timelineStats.zeroAreasCount === 1 ? 'oblast' : 'oblasti'})
                      </span>
                    ) : (
                      <span className="badge badge-dot b-ok">
                        100% aktivních dní (žádné nulové výpadky)
                      </span>
                    )}

                    {selectedDay && (
                      <button
                        onClick={() => setSelectedDay(null)}
                        className="btn btn-secondary btn-sm"
                        title="Zrušit výběr dne"
                      >
                        <X />
                        <span>Zrušit výběr dne</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Timeline metric tiles */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <div className="sunken px-3.5 py-3">
                    <span className="text-xs text-fg-muted block mb-1">Délka období</span>
                    <div className="text-xl font-semibold tracking-[-0.01em] text-fg flex items-baseline gap-1.5 tabular-nums">
                      {nf(timelineStats.totalDays)} <span className="text-xs font-normal text-fg-subtle">dní</span>
                    </div>
                  </div>

                  <div className="sunken px-3.5 py-3">
                    <span className="text-xs text-fg-muted block mb-1">Aktivní dny s hledáním</span>
                    <div className="text-xl font-semibold tracking-[-0.01em] text-fg flex items-baseline gap-1.5 tabular-nums">
                      {nf(timelineStats.activeDays)} <span className="text-xs font-normal text-fg-subtle">dní ({timelineStats.totalDays > 0 ? pf((timelineStats.activeDays / timelineStats.totalDays) * 100, 0) : pf(0, 0)})</span>
                    </div>
                  </div>

                  <div className={cn(
                    "sunken px-3.5 py-3",
                    timelineStats.zeroDays > 0 && "!bg-danger/10 hairline-danger"
                  )}>
                    <span className="text-xs text-fg-muted block mb-1">Nulové oblasti (výpadky)</span>
                    <div className={cn(
                      "text-xl font-semibold tracking-[-0.01em] flex items-baseline gap-1.5 tabular-nums",
                      timelineStats.zeroDays > 0 ? "text-danger" : "text-fg"
                    )}>
                      {nf(timelineStats.zeroDays)} <span className="text-xs font-normal text-fg-subtle">dní ({timelineStats.zeroAreasCount} oblastí)</span>
                    </div>
                  </div>

                  <div className="sunken px-3.5 py-3">
                    <span className="text-xs text-fg-muted block mb-1">Průměr / Špička za den</span>
                    <div className="text-xl font-semibold tracking-[-0.01em] text-fg flex items-baseline gap-1.5 tabular-nums">
                      ø {nf(timelineStats.avgPerActiveDay)} <span className="text-xs font-normal text-fg-subtle">/ max {nf(timelineStats.peakDay?.count || 0)}</span>
                    </div>
                  </div>
                </div>

                {/* Detected Zero Areas Banner (Highlighting zero search intervals in Red) */}
                {zeroAreas.length > 0 && (
                  <div className="p-4 bg-danger/[0.06] hairline-danger rounded-card space-y-2.5">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2 text-fg font-semibold text-xs">
                        <AlertTriangle size={15} className="text-danger shrink-0" />
                        <span>Detekované nulové oblasti (dny bez vyhledávání):</span>
                      </div>
                      <span className="text-xs text-fg-subtle">
                        Kliknutím na oblast vyberete daný den
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-2 pt-0.5">
                      {zeroAreas.map(area => {
                        const isSelected = selectedDay === area.startDateStr;
                        return (
                          <button
                            key={area.id}
                            onClick={() => setSelectedDay(prev => prev === area.startDateStr ? null : area.startDateStr)}
                            className={cn(
                              "px-3 h-7 rounded-row text-xs font-medium transition-colors flex items-center gap-2 tabular-nums",
                              isSelected
                                ? "bg-danger text-white"
                                : "bg-danger/15 hover:bg-danger/25 text-danger hairline-danger"
                            )}
                            title={`Zobrazit den ${area.startDisplay}`}
                          >
                            <span className={cn("size-1.5 rounded-full shrink-0", isSelected ? "bg-white" : "bg-danger")} />
                            <span>
                              {area.daysCount === 1
                                ? `${area.startDisplay} (${area.days[0].dayOfWeek}) — 1 den (0 hledání)`
                                : `${area.startDisplay} – ${area.endDisplay} — ${area.daysCount} dny bez hledání`}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Chart Header & Legend */}
                <div className="flex items-center justify-between text-xs text-fg-muted flex-wrap gap-3">
                  <div className="flex items-center gap-4 flex-wrap">
                    <div className="flex items-center gap-1.5">
                      <span className="size-2.5 rounded-[3px] bg-chart-1 inline-block" />
                      <span>Dny s aktivním hledáním</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="size-2.5 rounded-[3px] bg-danger inline-block" />
                      <span>Nulová oblast (červeně, 0 hledání)</span>
                    </div>
                  </div>
                  <span className="text-xs text-fg-subtle flex items-center gap-1.5">
                    <Lightbulb size={13} className="text-accent" />
                    Tip: Kliknutím na sloupec dne vyfiltrujete tabulku
                  </span>
                </div>

                {/* Recharts Bar Chart */}
                <div className="w-full h-[320px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={dailyTimelineData}
                      margin={{ top: 20, right: 15, left: 0, bottom: dailyTimelineData.length > 12 ? 45 : 20 }}
                    >
                      <CartesianGrid vertical={false} stroke={CHART_GRID} />
                      <XAxis
                        dataKey="label"
                        tick={{ fontSize: 11, fill: CHART_AXIS }}
                        tickLine={false}
                        axisLine={{ stroke: CHART_GRID }}
                        interval={dailyTimelineData.length > 30 ? Math.ceil(dailyTimelineData.length / 22) : 0}
                        angle={dailyTimelineData.length > 12 ? -45 : 0}
                        textAnchor={dailyTimelineData.length > 12 ? 'end' : 'middle'}
                        height={dailyTimelineData.length > 12 ? 50 : 30}
                      />
                      <YAxis
                        tick={{ fontSize: 11, fill: CHART_AXIS }}
                        axisLine={false}
                        tickLine={false}
                        allowDecimals={false}
                        tickFormatter={(v: number) => nf(v)}
                      />
                      <Tooltip
                        cursor={{ fill: 'rgba(255, 255, 255, 0.04)' }}
                        content={
                          <TimelineTooltip
                            filteredCount={filteredCalls.length}
                            selectedDay={selectedDay}
                          />
                        }
                      />
                      <Bar
                        dataKey="displayCount"
                        radius={[4, 4, 0, 0]}
                        onClick={(entry: any) => {
                          if (entry && entry.dateStr) {
                            setSelectedDay(prev => prev === entry.dateStr ? null : entry.dateStr);
                          }
                        }}
                        shape={(props: any) => {
                          const { x, y, width, height, payload } = props;
                          if (!payload) return null;
                          const isZero = payload.isZero;
                          const isSelected = selectedDay === payload.dateStr;

                          if (isZero) {
                            const colTop = 15;
                            const baselineY = y + height;
                            const colHeight = Math.max(30, baselineY - colTop);

                            return (
                              <g className="cursor-pointer">
                                {/* Red background column highlight */}
                                <rect
                                  x={x - 1}
                                  y={colTop}
                                  width={Math.max(4, width + 2)}
                                  height={colHeight}
                                  fill={DANGER}
                                  fillOpacity={isSelected ? 0.24 : 0.1}
                                  stroke={DANGER}
                                  strokeWidth={isSelected ? 1.5 : 0.5}
                                  strokeDasharray="3 3"
                                  strokeOpacity={isSelected ? 0.9 : 0.5}
                                  rx={4}
                                />
                                {/* Solid red baseline bar */}
                                <rect
                                  x={x}
                                  y={Math.max(colTop, y)}
                                  width={Math.max(3, width)}
                                  height={Math.max(6, height)}
                                  fill={DANGER}
                                  rx={3}
                                />
                                {width >= 10 && (
                                  <text
                                    x={x + width / 2}
                                    y={Math.max(colTop + 10, y - 4)}
                                    textAnchor="middle"
                                    fill={DANGER}
                                    fontSize={10}
                                    fontWeight={600}
                                  >
                                    0
                                  </text>
                                )}
                              </g>
                            );
                          }

                          return (
                            <g className="cursor-pointer">
                              <rect
                                x={x}
                                y={y}
                                width={Math.max(2, width)}
                                height={height}
                                fill={isSelected ? '#409cff' : CHART[0]}
                                stroke={isSelected ? '#f5f5f7' : 'none'}
                                strokeWidth={isSelected ? 1.5 : 0}
                                rx={Math.min(4, width / 2)}
                              />
                            </g>
                          );
                        }}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Day-by-Day Strip (Calendar Ribbon) */}
                <div className="pt-4 border-t-[0.5px] border-line space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-fg-muted">
                      Denní páska se všemi dny ({timelineStats.totalDays} dní):
                    </span>
                    <div className="seg self-start sm:self-auto max-w-full overflow-x-auto">
                      <button
                        onClick={() => setTimelineFilterMode('all')}
                        aria-pressed={timelineFilterMode === 'all'}
                      >
                        Všechny ({timelineStats.totalDays})
                      </button>
                      <button
                        onClick={() => setTimelineFilterMode('zero')}
                        aria-pressed={timelineFilterMode === 'zero'}
                      >
                        <span className="size-1.5 rounded-full bg-danger" />
                        Nulové dny ({timelineStats.zeroDays})
                      </button>
                      <button
                        onClick={() => setTimelineFilterMode('active')}
                        aria-pressed={timelineFilterMode === 'active'}
                      >
                        Aktivní ({timelineStats.activeDays})
                      </button>
                    </div>
                  </div>

                  <div className="overflow-x-auto pb-2 -mx-1 px-1">
                    <div className="flex gap-2 min-w-max py-1">
                      {dailyTimelineData
                        .filter(d => {
                          if (timelineFilterMode === 'zero') return d.isZero;
                          if (timelineFilterMode === 'active') return !d.isZero;
                          return true;
                        })
                        .map(day => {
                          const isSelected = selectedDay === day.dateStr;
                          return (
                            <button
                              key={day.dateStr}
                              onClick={() => setSelectedDay(prev => prev === day.dateStr ? null : day.dateStr)}
                              className={cn(
                                "flex flex-col items-center justify-between p-2.5 rounded-button text-center transition-colors min-w-[72px] shrink-0 tabular-nums",
                                day.isZero
                                  ? isSelected
                                    ? "bg-danger/25 text-fg shadow-[0_0_0_1.5px_var(--color-danger)_inset]"
                                    : "bg-danger/10 hover:bg-danger/20 hairline-danger text-fg-muted"
                                  : isSelected
                                    ? "bg-accent-soft text-fg shadow-[0_0_0_1.5px_var(--color-accent)_inset]"
                                    : "bg-surface-2 hover:bg-surface-3 hairline text-fg-muted"
                              )}
                            >
                              <span className="text-[11px] font-medium text-fg-subtle">
                                {day.dayOfWeek}
                              </span>
                              <span className="text-xs font-semibold text-fg my-0.5">
                                {day.displayDate}
                              </span>
                              <span className={cn(
                                "text-[11px] font-semibold px-1.5 py-0.5 rounded-[5px] mt-1",
                                day.isZero
                                  ? "bg-danger/20 text-danger"
                                  : "bg-accent-soft text-accent"
                              )}>
                                {day.isZero ? '0' : nf(day.count)}
                              </span>
                            </button>
                          );
                        })}
                    </div>
                  </div>
                </div>
              </section>
            )}

            {/* Charts Section */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Top Phrases Chart */}
              <div className="lg:col-span-2 panel p-5 min-w-0">
                <div className="flex items-center justify-between gap-3 mb-6">
                  <div className="flex items-center gap-2">
                    <BarChart3 size={18} className="text-accent" />
                    <h3 className="text-[15px] font-semibold tracking-[-0.01em] text-fg">
                      {showAllPhrases ? 'Všechny vyhledávané fráze' : 'Top 10 vyhledávaných frází'}
                    </h3>
                  </div>
                  <button
                    onClick={() => setShowAllPhrases(!showAllPhrases)}
                    className="btn btn-ghost btn-sm"
                  >
                    {showAllPhrases ? 'Zobrazit Top 10' : 'Zobrazit vše'}
                  </button>
                </div>
                <div className={cn("w-full", showAllPhrases ? "h-[600px] overflow-y-auto pr-2" : "h-[350px]")}>
                  <ResponsiveContainer width="100%" height={showAllPhrases ? Math.max((stats.topPhrases?.length || 0) * 35, 350) : "100%"}>
                    <BarChart data={stats.topPhrases} layout="vertical" margin={{ left: 40, right: 60 }}>
                      <CartesianGrid horizontal={true} vertical={false} stroke={CHART_GRID} />
                      <XAxis type="number" hide />
                      <YAxis
                        dataKey="phrase"
                        type="category"
                        width={120}
                        tick={{ fontSize: 12, fill: 'rgba(235,235,245,.60)' }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip
                        cursor={{ fill: 'rgba(255,255,255,.04)' }}
                        contentStyle={TOOLTIP_STYLE}
                        labelStyle={{ color: '#f5f5f7', fontWeight: 600 }}
                        itemStyle={{ color: '#f5f5f7' }}
                        formatter={(value: number, name: string, props: any) => [
                          `${nf(value)} (${pf(props.payload.percentage)})`,
                          'Počet'
                        ]}
                      />
                      <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={24}>
                        {stats.topPhrases?.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={CHART[index % CHART.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Price Consideration Distribution */}
              <div className="panel p-5">
                <div className="flex items-center gap-2 mb-6">
                  <DollarSign size={18} className="text-accent" />
                  <h3 className="text-[15px] font-semibold tracking-[-0.01em] text-fg">Zohlednění ceny</h3>
                </div>
                <div className="h-[250px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={[
                          { name: 'Zohledňuje cenu', value: stats.priceConsiderationCount },
                          { name: 'Nezohledňuje cenu', value: stats.totalSearches - stats.priceConsiderationCount }
                        ]}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={5}
                        dataKey="value"
                        stroke="none"
                      >
                        <Cell fill={CHART[0]} />
                        <Cell fill={CHART[1]} />
                      </Pie>
                      <Tooltip
                        contentStyle={TOOLTIP_STYLE}
                        itemStyle={{ color: '#f5f5f7' }}
                        formatter={(value: number, name: string) => [
                          `${nf(value)} (${pf((value / stats.totalSearches) * 100)})`,
                          name
                        ]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-3 mt-4">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <div className="size-2.5 rounded-[3px] bg-chart-1" />
                      <span className="text-fg-muted">Zohledňuje cenu</span>
                    </div>
                    <div className="text-right tabular-nums">
                      <div className="font-semibold text-fg">{nf(stats.priceConsiderationCount)}</div>
                      <div className="text-xs text-fg-subtle">{pf((stats.priceConsiderationCount / stats.totalSearches) * 100)}</div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <div className="size-2.5 rounded-[3px] bg-chart-2" />
                      <span className="text-fg-muted">Nezohledňuje cenu</span>
                    </div>
                    <div className="text-right tabular-nums">
                      <div className="font-semibold text-fg">{nf(stats.totalSearches - stats.priceConsiderationCount)}</div>
                      <div className="text-xs text-fg-subtle">{pf(((stats.totalSearches - stats.priceConsiderationCount) / stats.totalSearches) * 100)}</div>
                    </div>
                  </div>
                  <div className="pt-3 border-t-[0.5px] border-line">
                    <p className="text-xs text-fg-subtle leading-relaxed">
                      * Zohlednění ceny zahrnuje vyhledávání s nastaveným cenovým rozsahem (min/max) nebo aplikovaným řazením (od nejlevnějšího/nejdražšího).
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Data Table */}
            <section className="panel overflow-hidden">
              <div className="p-5 border-b-[0.5px] border-line flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="flex items-center gap-3 flex-wrap">
                  <h3 className="text-[15px] font-semibold tracking-[-0.01em] text-fg">Detailní výpis vyhledávání</h3>
                  <span className="text-xs text-fg-subtle tabular-nums">
                    {selectedDay
                      ? `${nf(displayCalls.length)} záznamů (den ${format(parseISO(selectedDay), 'd. M. yyyy')})`
                      : `${nf(filteredCalls.length)} záznamů`}
                  </span>
                  {selectedDay && (
                    <div className="badge b-accent pr-1 tabular-nums">
                      <span>Aktivní filtr dne: {format(parseISO(selectedDay), 'd. M. yyyy')}</span>
                      <button
                        onClick={() => setSelectedDay(null)}
                        className="hover:text-fg hover:bg-accent-soft p-0.5 rounded-[5px] transition-colors"
                        title="Zrušit filtr dne"
                      >
                        <X size={13} />
                      </button>
                    </div>
                  )}
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="flex items-center gap-2 text-xs text-fg-muted">
                    <span>Zobrazit:</span>
                    <select
                      value={pageSize}
                      onChange={(e) => {
                        setPageSize(Number(e.target.value));
                        setCurrentPage(1);
                      }}
                      className="input !h-8 !w-auto !px-2 text-xs tabular-nums"
                    >
                      <option value={25}>25</option>
                      <option value={50}>50</option>
                      <option value={100}>100</option>
                    </select>
                  </div>
                  <div className="relative w-full sm:w-64">
                    <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-fg-subtle pointer-events-none" />
                    <input
                      type="text"
                      placeholder="Hledat v dotazech..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="input !rounded-full pl-10 pr-4"
                    />
                  </div>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-left border-collapse text-[13px]">
                  <thead>
                    <tr>
                      <th className="px-4 sm:px-5 py-2.5 text-[11px] font-semibold text-fg-subtle whitespace-nowrap border-b-[0.5px] border-line">Čas</th>
                      <th className="px-4 sm:px-5 py-2.5 text-[11px] font-semibold text-fg-subtle whitespace-nowrap border-b-[0.5px] border-line">Hledaná fráze</th>
                      <th className="px-4 sm:px-5 py-2.5 text-[11px] font-semibold text-fg-subtle whitespace-nowrap border-b-[0.5px] border-line text-right">Cena od</th>
                      <th className="px-4 sm:px-5 py-2.5 text-[11px] font-semibold text-fg-subtle whitespace-nowrap border-b-[0.5px] border-line text-right">Cena do</th>
                      <th className="px-4 sm:px-5 py-2.5 text-[11px] font-semibold text-fg-subtle whitespace-nowrap border-b-[0.5px] border-line">Řazení</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedCalls.map((call, i) => {
                      const ts = call.timestamp.toISOString();
                      const isMulti = multiQueryTimestamps.has(ts);
                      const groupIdx = timestampToGroupIdx[ts];
                      const globalIdx = (currentPage - 1) * pageSize + i;
                      const isFirstInGroup = globalIdx === 0 || (displayCalls[globalIdx - 1] && displayCalls[globalIdx - 1].timestamp.toISOString() !== ts);

                      return (
                        <tr key={i} className={cn(
                          "hover:bg-white/[0.03] transition-colors group relative [&>td]:border-b-[0.5px] [&>td]:border-line last:[&>td]:border-b-0",
                          isMulti && (groupIdx % 2 === 0 ? "bg-chart-4/[0.07]" : "bg-chart-3/[0.07]"),
                          isMulti && isFirstInGroup && globalIdx !== 0 && "[&>td]:border-t [&>td]:border-t-line-strong"
                        )}>
                          <td className="px-4 sm:px-5 py-2.5 font-mono text-xs text-fg-muted tabular-nums whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              {isMulti && (
                                <div className={cn(
                                  "size-1.5 rounded-full shrink-0",
                                  groupIdx % 2 === 0 ? "bg-chart-4" : "bg-chart-3"
                                )} title="Součást multi-dotazu" />
                              )}
                              <div>
                                {format(call.timestamp, 'HH:mm:ss')}
                                <div className="text-[11px] text-fg-subtle">{format(call.timestamp, 'dd.MM.yyyy')}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 sm:px-5 py-2.5 font-medium text-fg">
                            <div className="flex items-center gap-2">
                              {call.query}
                              {isMulti && (
                                <span className={cn(
                                  "badge !h-5 !px-1.5 !text-[11px]",
                                  groupIdx % 2 === 0
                                    ? "bg-chart-4/15 text-chart-4"
                                    : "bg-chart-3/15 text-chart-3"
                                )}>
                                  Multi
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 sm:px-5 py-2.5 text-right tabular-nums whitespace-nowrap">
                          {call.price_min ? (
                            <span className="text-fg font-medium">{nf(call.price_min)} Kč</span>
                          ) : <span className="text-fg-subtle">-</span>}
                        </td>
                        <td className="px-4 sm:px-5 py-2.5 text-right tabular-nums whitespace-nowrap">
                          {call.price_max ? (
                            <span className="text-fg font-medium">{nf(call.price_max)} Kč</span>
                          ) : <span className="text-fg-subtle">-</span>}
                        </td>
                        <td className="px-4 sm:px-5 py-2.5">
                          {call.order_by === 'asc' && (
                            <span className="badge b-neutral">
                              <ArrowUpDown size={11} /> Nejlevnější
                            </span>
                          )}
                          {call.order_by === 'desc' && (
                            <span className="badge b-neutral">
                              <ArrowUpDown size={11} /> Nejdražší
                            </span>
                          )}
                          {!call.order_by && <span className="text-fg-subtle">-</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                </table>

                {filteredCalls.length > 0 && (
                  <div className="px-5 py-3 border-t-[0.5px] border-line flex flex-col sm:flex-row items-center justify-between gap-3">
                    <div className="text-xs text-fg-subtle tabular-nums">
                      Zobrazeno {nf(Math.min(filteredCalls.length, (currentPage - 1) * pageSize + 1))} - {nf(Math.min(filteredCalls.length, currentPage * pageSize))} z {nf(filteredCalls.length)} záznamů
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                        disabled={currentPage === 1}
                        className="btn btn-secondary btn-sm btn-icon"
                      >
                        <ChevronLeft />
                      </button>
                      <div className="flex items-center gap-1">
                        {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                          let pageNum;
                          if (totalPages <= 5) {
                            pageNum = i + 1;
                          } else if (currentPage <= 3) {
                            pageNum = i + 1;
                          } else if (currentPage >= totalPages - 2) {
                            pageNum = totalPages - 4 + i;
                          } else {
                            pageNum = currentPage - 2 + i;
                          }

                          return (
                            <button
                              key={pageNum}
                              onClick={() => setCurrentPage(pageNum)}
                              className={cn(
                                "btn btn-sm btn-icon tabular-nums",
                                currentPage === pageNum
                                  ? "bg-accent-soft text-accent shadow-[0_0_0_.5px_rgba(10,132,255,.5)_inset]"
                                  : "btn-secondary text-fg-muted"
                              )}
                            >
                              {pageNum}
                            </button>
                          );
                        })}
                      </div>
                      <button
                        onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                        disabled={currentPage === totalPages}
                        className="btn btn-secondary btn-sm btn-icon"
                      >
                        <ChevronRight />
                      </button>
                    </div>
                  </div>
                )}

                {displayCalls.length === 0 && (
                  <div className="p-12 text-center text-fg-muted">
                    {selectedDay ? (
                      <div className="max-w-md mx-auto space-y-3">
                        <div className="size-12 rounded-full bg-danger/15 text-danger flex items-center justify-center mx-auto">
                          <AlertTriangle size={22} />
                        </div>
                        <h4 className="text-base font-semibold text-fg">Nulová oblast — žádná vyhledávání</h4>
                        <p className="text-xs text-fg-muted">
                          V den {format(parseISO(selectedDay), 'd. M. yyyy')} nebyl zaznamenán žádný dotaz na vyhledávací nástroj.
                        </p>
                        <button
                          onClick={() => setSelectedDay(null)}
                          className="btn btn-secondary btn-sm mt-2"
                        >
                          <X /> Zrušit filtr dne a zobrazit vše
                        </button>
                      </div>
                    ) : (
                      <div>Nenalezeny žádné záznamy odpovídající filtrům.</div>
                    )}
                  </div>
                )}
              </div>
            </section>
          </>
        )}

        {debugLogs.length > 0 && (
          <div className="card overflow-hidden">
            <button
              onClick={() => setShowDebug(!showDebug)}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/[0.03] transition-colors"
            >
              <h4 className="text-xs font-medium text-fg-muted flex items-center gap-2">
                <BarChart3 size={14} />
                Debug Logy ({debugLogs.length})
              </h4>
              <div className="flex items-center gap-4">
                {showDebug && (
                  <span
                    onClick={(e) => { e.stopPropagation(); setDebugLogs([]); }}
                    className="text-xs text-accent hover:text-accent-hover font-medium"
                  >
                    Vymazat
                  </span>
                )}
                <ChevronRight size={16} className={cn("text-fg-subtle transition-transform", showDebug && "rotate-90")} />
              </div>
            </button>

            {showDebug && (
              <div className="px-4 pb-4 border-t-[0.5px] border-line">
                <div className="max-h-60 overflow-y-auto text-[11px] font-mono space-y-1 mt-3">
                  {debugLogs.map((log, i) => (
                    <div key={i} className="text-fg-muted border-b-[0.5px] border-line pb-1 last:border-0">
                      {log}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      <footer className="flex justify-between gap-3 flex-wrap px-4 sm:px-5 py-2.5 border-t-[0.5px] border-line text-xs text-fg-subtle">
        <span>Datart Search Log Analyzer · Vytvořeno pro analýzu AI asistentů</span>
        <span>AI Statistiky · © {new Date().getFullYear()} Jan Kuchař</span>
      </footer>
    </div>
  );
}
