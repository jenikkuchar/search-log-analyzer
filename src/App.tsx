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
  X
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
    <div className={cn(
      "p-3.5 rounded-xl border shadow-2xl text-xs font-sans max-w-xs transition-all z-50",
      data.isZero 
        ? "bg-slate-950/95 border-rose-500/60 shadow-rose-950/40 text-slate-200 ring-1 ring-rose-500/30" 
        : "bg-slate-900/95 border-slate-700 shadow-slate-950/60 text-slate-200"
    )}>
      <div className="flex items-center justify-between gap-3 mb-2 pb-2 border-b border-slate-700/60">
        <div>
          <span className="font-bold text-white text-sm">
            {data.dayOfWeek} {data.fullDate}
          </span>
        </div>
        {data.isZero ? (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-rose-500/25 text-rose-400 border border-rose-500/40 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
            Nulová oblast
          </span>
        ) : (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/20 text-blue-400 border border-blue-500/30">
            Aktivní den
          </span>
        )}
      </div>

      {data.isZero ? (
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 font-bold text-sm text-rose-400">
            <AlertTriangle size={14} className="text-rose-400 shrink-0" />
            <span>0 vyhledávání</span>
          </div>
          <p className="text-slate-400 text-[11px] leading-relaxed">
            V tento den nebyla zaznamenána žádná aktivita vyhledávání (výpadek nebo období bez dotazů).
          </p>
          <div className="pt-1 text-[10px] text-rose-300/75 italic">
            Kliknutím na sloupec vyberete tento den
          </div>
        </div>
      ) : (
        <div className="space-y-1.5 text-slate-300">
          <div className="flex items-center justify-between gap-4">
            <span className="text-slate-400">Počet vyhledávání:</span>
            <span className="font-bold text-white text-sm">{data.count}</span>
          </div>
          {filteredCount > 0 && (
            <div className="flex items-center justify-between gap-4 text-[11px]">
              <span className="text-slate-400">Podíl z vybraného období:</span>
              <span className="text-emerald-400 font-medium">{((data.count / filteredCount) * 100).toFixed(1)}%</span>
            </div>
          )}
          {data.priceCount > 0 && (
            <div className="flex items-center justify-between gap-4 text-[11px]">
              <span className="text-slate-400">S filtrem ceny:</span>
              <span className="text-amber-400 font-medium">{data.priceCount}</span>
            </div>
          )}
          {data.sortCount > 0 && (
            <div className="flex items-center justify-between gap-4 text-[11px]">
              <span className="text-slate-400">S explicitním řazením:</span>
              <span className="text-blue-400 font-medium">{data.sortCount}</span>
            </div>
          )}
          <div className="pt-1 text-[10px] text-slate-500 italic">
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

  const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

  return (
    <div className="min-h-screen bg-[#0F172A] text-slate-100 font-sans p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-white">Datart Search Analyzer</h1>
            <p className="text-slate-400 mt-1 italic font-serif">Analýza logů vyhledávacího nástroje</p>
          </div>
          
          <div className="flex items-center gap-3">
            <button 
              onClick={() => {
                console.log("Header upload button clicked");
                fileInputRef.current?.click();
              }}
              className="flex items-center gap-2 px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg hover:bg-slate-700 transition-colors shadow-sm text-sm font-medium text-slate-200"
            >
              <FileUp size={18} />
              {uploadedFiles.length > 0 ? 'Sloučit další JSON' : 'Nahrát JSON'}
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
                  className="flex items-center gap-2 px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg hover:bg-rose-500/20 hover:border-rose-500/50 transition-all shadow-sm text-sm font-medium text-slate-300"
                >
                  Resetovat
                </button>
                <button 
                  onClick={handleExport}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500 transition-colors shadow-sm text-sm font-medium"
                >
                  <Download size={18} />
                  {selectedDay ? `Exportovat den (${displayCalls.length})` : 'Exportovat CSV'}
                </button>
              </>
            )}
          </div>
        </header>

        {toolCalls.length === 0 ? (
          <div 
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            className={cn(
              "flex flex-col items-center justify-center min-h-[60vh] py-12 px-4 md:px-8 border-2 border-dashed rounded-2xl transition-all",
              isDragging ? "border-blue-500 bg-blue-500/10" : "border-slate-700 bg-slate-800/50"
            )}
          >
            <div className="p-6 bg-slate-800 rounded-full mb-4">
              <FileUp size={48} className="text-slate-500" />
            </div>
            <h2 className="text-xl font-semibold mb-2 text-white">Nahrajte logy k analýze</h2>
            <p className="text-slate-400 text-center max-w-md px-4 mb-6">
              Přetáhněte jeden nebo více JSON souborů s logy, nebo klikněte na tlačítko níže. 
              Budeme analyzovat a sloučíme volání <code className="bg-slate-800 px-1 rounded text-xs text-blue-400">search_datart_tool</code>.
            </p>
            
            <button 
              onClick={() => {
                console.log("Empty state upload button clicked");
                fileInputRef.current?.click();
              }}
              className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-500 transition-all shadow-lg font-semibold mb-8"
            >
              <FileUp size={20} />
              Vybrat soubory
            </button>

            {uploadStatus && (
              <div className={cn(
                "px-4 py-3 rounded-lg text-sm max-w-md text-center animate-in fade-in slide-in-from-bottom-2 mb-8",
                uploadStatus.type === 'success' ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" :
                uploadStatus.type === 'error' ? "bg-rose-500/10 text-rose-400 border border-rose-500/20" :
                "bg-blue-500/10 text-blue-400 border border-blue-500/20"
              )}>
                {uploadStatus.message}
              </div>
            )}

            <div className="max-w-2xl w-full bg-slate-900/50 border border-slate-800 rounded-2xl p-6 mt-4">
              <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider mb-4 flex items-center gap-2">
                <Clock size={16} className="text-blue-400" />
                Jak získat logy z Google Cloud?
              </h3>
              <ol className="space-y-3 text-sm text-slate-400 list-decimal list-inside">
                <li>Otevřete <a href="https://console.cloud.google.com/logs/query" target="_blank" rel="noreferrer" className="text-blue-400 hover:underline">Google Cloud Console - Log Explorer</a>.</li>
                <li>Do vyhledávacího pole vložte filtr:<br />
                  <code className="block bg-slate-950 p-2 rounded mt-2 text-blue-300 font-mono text-xs border border-slate-800">
                    SEARCH("search_datart_tool called with query")
                  </code>
                </li>
                <li>Klikněte na tlačítko <strong>Actions</strong> vpravo nahoře a zvolte <strong>Download</strong>.</li>
                <li>V dialogu ponechte formát <strong>JSON</strong> a potvrďte stažení.</li>
                <li>Stažený soubor nahrajte sem do analyzátoru.</li>
              </ol>
            </div>
          </div>
        ) : (
          <>
            {/* List of uploaded files */}
            {uploadedFiles.length > 0 && (
              <section className="bg-slate-800/80 p-5 rounded-2xl border border-slate-700 shadow-xl space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-700 pb-3">
                  <div className="flex items-center gap-2">
                    <Files size={20} className="text-blue-400" />
                    <h3 className="font-semibold text-white">Sloučené soubory logů ({uploadedFiles.length})</h3>
                  </div>
                  <div className="text-xs text-slate-400 font-mono">
                    Celkem sloučeno: <span className="text-emerald-400 font-bold">{toolCalls.length}</span> vyhledávacích dotazů
                  </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {uploadedFiles.map((file) => (
                    <div key={file.id} className="flex items-center justify-between p-3 bg-slate-900/60 border border-slate-800 rounded-xl hover:border-slate-700 hover:bg-slate-900/90 transition-all group">
                      <div className="min-w-0 pr-2">
                        <p className="text-sm font-medium text-slate-200 truncate" title={file.name}>
                          {file.name}
                        </p>
                        <div className="flex items-center gap-3 text-xs text-slate-400 mt-1">
                          <span>{(file.size / 1024).toFixed(1)} KB</span>
                          <span>•</span>
                          <span className="text-emerald-500 font-medium">{file.extractedCount} záznamů</span>
                        </div>
                      </div>
                      <button 
                        onClick={() => handleRemoveFile(file.id)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors md:opacity-0 md:group-hover:opacity-100 focus:opacity-100"
                        title="Odebrat soubor ze sloučení"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                </div>
                
                {uploadStatus && (
                  <div className={cn(
                    "px-4 py-2 rounded-lg text-xs w-full text-center transition-all animate-in fade-in",
                    uploadStatus.type === 'success' ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" :
                    uploadStatus.type === 'error' ? "bg-rose-500/10 text-rose-400 border border-rose-500/20" :
                    "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                  )}>
                    {uploadStatus.message}
                  </div>
                )}
              </section>
            )}

            {/* Filters */}
            <section className="bg-slate-800 p-6 rounded-2xl border border-slate-700 shadow-xl">
              <div className="flex items-center gap-2 mb-6 border-b border-slate-700 pb-4">
                <Filter size={20} className="text-blue-400" />
                <h3 className="font-semibold text-white">Filtrování reportu</h3>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1">
                    <Calendar size={12} /> Od data
                  </label>
                  <input 
                    type="date" 
                    value={startDate} 
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full p-2 bg-slate-900 border border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all text-slate-200"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1">
                    <Clock size={12} /> Od času
                  </label>
                  <input 
                    type="time" 
                    value={startTime} 
                    onChange={(e) => setStartTime(e.target.value)}
                    className="w-full p-2 bg-slate-900 border border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all text-slate-200"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1">
                    <Calendar size={12} /> Do data
                  </label>
                  <input 
                    type="date" 
                    value={endDate} 
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full p-2 bg-slate-900 border border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all text-slate-200"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1">
                    <Clock size={12} /> Do času
                  </label>
                  <input 
                    type="time" 
                    value={endTime} 
                    onChange={(e) => setEndTime(e.target.value)}
                    className="w-full p-2 bg-slate-900 border border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all text-slate-200"
                  />
                </div>
              </div>
            </section>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6">
              <div className="bg-slate-800 p-6 rounded-2xl border border-slate-700 shadow-lg">
                <div className="flex items-center justify-between mb-4">
                  <div className="p-2 bg-slate-900 rounded-lg">
                    <Search size={20} className="text-slate-200" />
                  </div>
                  <span className="text-xs font-medium text-emerald-400 bg-emerald-400/10 px-2 py-1 rounded-full">Celkem</span>
                </div>
                <div className="text-3xl font-bold text-white">{stats.totalSearches}</div>
                <div className="text-sm text-slate-400 mt-1">Počet vyhledávání</div>
              </div>

              <div className="bg-slate-800 p-6 rounded-2xl border border-slate-700 shadow-lg">
                <div className="flex items-center justify-between mb-4">
                  <div className="p-2 bg-slate-900 rounded-lg">
                    <DollarSign size={20} className="text-amber-400" />
                  </div>
                  <span className="text-xs font-medium text-amber-400 bg-amber-400/10 px-2 py-1 rounded-full">Cenové filtry</span>
                </div>
                <div className="text-3xl font-bold text-white">{stats.priceRangePercentage.toFixed(1)}%</div>
                <div className="text-sm text-slate-400 mt-1">S definovanou cenou</div>
              </div>

              <div className="bg-slate-800 p-6 rounded-2xl border border-slate-700 shadow-lg">
                <div className="flex items-center justify-between mb-4">
                  <div className="p-2 bg-slate-900 rounded-lg">
                    <ArrowUpDown size={20} className="text-blue-400" />
                  </div>
                  <span className="text-xs font-medium text-blue-400 bg-blue-400/10 px-2 py-1 rounded-full">Řazení</span>
                </div>
                <div className="text-3xl font-bold text-white">{stats.sortingPercentage.toFixed(1)}%</div>
                <div className="text-sm text-slate-400 mt-1">S požadavkem na řazení</div>
              </div>

              <div className="bg-slate-800 p-6 rounded-2xl border border-slate-700 shadow-lg">
                <div className="flex items-center justify-between mb-4">
                  <div className="p-2 bg-slate-900 rounded-lg">
                    <BarChart3 size={20} className="text-rose-400" />
                  </div>
                  <span className="text-xs font-medium text-rose-400 bg-rose-400/10 px-2 py-1 rounded-full">Multi-dotazy</span>
                </div>
                <div className="text-3xl font-bold text-white">{stats.multiQueryPercentage.toFixed(1)}%</div>
                <div className="text-sm text-slate-400 mt-1">
                  {stats.multiQuerySessions} událostí (ø {stats.avgQueriesPerMultiSession.toFixed(1)})
                </div>
              </div>

              <div className="bg-slate-800 p-6 rounded-2xl border border-slate-700 shadow-lg">
                <div className="flex items-center justify-between mb-4">
                  <div className="p-2 bg-slate-900 rounded-lg">
                    <TrendingUp size={20} className="text-violet-400" />
                  </div>
                  <span className="text-xs font-medium text-violet-400 bg-violet-400/10 px-2 py-1 rounded-full">Top fráze</span>
                </div>
                <div className="text-xl font-bold truncate text-white">{stats.topPhrases?.[0]?.phrase || '-'}</div>
                <div className="text-sm text-slate-400 mt-1">Nejčastější dotaz</div>
              </div>
            </div>

            {/* Daily Timeline Section with Red Zero Areas Highlight */}
            {dailyTimelineData.length > 0 && (
              <section className="bg-slate-800 p-6 rounded-2xl border border-slate-700 shadow-xl space-y-6">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-blue-500/10 border border-blue-500/20 rounded-xl text-blue-400">
                      <CalendarDays size={22} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-white text-lg">Časová osa vyhledávání po dnech</h3>
                        {selectedDay && (
                          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-500/20 text-blue-300 border border-blue-500/30">
                            Vybrán den: {format(parseISO(selectedDay), 'd. M. yyyy')}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Denní počty vyhledávacích dotazů s červeně zvýrazněnými nulovými oblastmi (dny bez zaznamenaných hledání).
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2.5">
                    {/* Zero days indicator badge */}
                    {timelineStats.zeroDays > 0 ? (
                      <div className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-500/15 border border-rose-500/40 rounded-xl text-rose-400 text-xs font-semibold shadow-sm">
                        <AlertTriangle size={14} className="text-rose-400" />
                        <span>
                          {timelineStats.zeroDays} {timelineStats.zeroDays === 1 ? 'nulový den' : (timelineStats.zeroDays < 5 ? 'nulové dny' : 'nulových dnů')} ({timelineStats.zeroAreasCount} {timelineStats.zeroAreasCount === 1 ? 'oblast' : 'oblasti'})
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400 text-xs font-medium">
                        <span>100% aktivních dní (žádné nulové výpadky)</span>
                      </div>
                    )}

                    {selectedDay && (
                      <button
                        onClick={() => setSelectedDay(null)}
                        className="px-2.5 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg text-xs font-medium transition-colors flex items-center gap-1"
                        title="Zrušit výběr dne"
                      >
                        <X size={13} />
                        <span>Zrušit výběr dne</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Timeline metric tiles */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-1">
                  <div className="bg-slate-900/60 p-3.5 rounded-xl border border-slate-700/60">
                    <span className="text-[11px] font-medium text-slate-400 block mb-1">Délka období</span>
                    <div className="text-xl font-bold text-white flex items-baseline gap-1.5">
                      {timelineStats.totalDays} <span className="text-xs font-normal text-slate-400">dní</span>
                    </div>
                  </div>

                  <div className="bg-slate-900/60 p-3.5 rounded-xl border border-slate-700/60">
                    <span className="text-[11px] font-medium text-slate-400 block mb-1">Aktivní dny s hledáním</span>
                    <div className="text-xl font-bold text-emerald-400 flex items-baseline gap-1.5">
                      {timelineStats.activeDays} <span className="text-xs font-normal text-slate-400">dní ({timelineStats.totalDays > 0 ? ((timelineStats.activeDays / timelineStats.totalDays) * 100).toFixed(0) : 0}%)</span>
                    </div>
                  </div>

                  <div className={cn(
                    "p-3.5 rounded-xl border transition-all",
                    timelineStats.zeroDays > 0 
                      ? "bg-rose-950/30 border-rose-500/40 text-rose-300" 
                      : "bg-slate-900/60 border-slate-700/60 text-slate-300"
                  )}>
                    <span className="text-[11px] font-medium text-slate-400 block mb-1">Nulové oblasti (výpadky)</span>
                    <div className={cn(
                      "text-xl font-bold flex items-baseline gap-1.5",
                      timelineStats.zeroDays > 0 ? "text-rose-400" : "text-slate-200"
                    )}>
                      {timelineStats.zeroDays} <span className="text-xs font-normal opacity-75">dní ({timelineStats.zeroAreasCount} oblastí)</span>
                    </div>
                  </div>

                  <div className="bg-slate-900/60 p-3.5 rounded-xl border border-slate-700/60">
                    <span className="text-[11px] font-medium text-slate-400 block mb-1">Průměr / Špička za den</span>
                    <div className="text-xl font-bold text-blue-400 flex items-baseline gap-1.5">
                      ø {timelineStats.avgPerActiveDay.toFixed(0)} <span className="text-xs font-normal text-slate-400">/ max {timelineStats.peakDay?.count || 0}</span>
                    </div>
                  </div>
                </div>

                {/* Detected Zero Areas Banner (Highlighting zero search intervals in Red) */}
                {zeroAreas.length > 0 && (
                  <div className="p-4 bg-rose-950/20 border border-rose-500/30 rounded-xl space-y-2.5">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2 text-rose-300 font-semibold text-xs">
                        <AlertTriangle size={15} className="text-rose-400 shrink-0" />
                        <span>Detekované nulové oblasti (dny bez vyhledávání):</span>
                      </div>
                      <span className="text-[11px] text-rose-400/80">
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
                              "px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-2 border",
                              isSelected
                                ? "bg-rose-600 text-white border-rose-400 shadow-lg shadow-rose-950 ring-2 ring-rose-400"
                                : "bg-rose-900/40 hover:bg-rose-900/70 text-rose-200 border-rose-500/40 hover:border-rose-400"
                            )}
                            title={`Zobrazit den ${area.startDisplay}`}
                          >
                            <span className="w-2 h-2 rounded-full bg-rose-400 animate-pulse shrink-0" />
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
                <div className="flex items-center justify-between text-xs text-slate-400 pt-1 flex-wrap gap-3">
                  <div className="flex items-center gap-4 flex-wrap">
                    <div className="flex items-center gap-1.5">
                      <span className="w-3 h-3 rounded-sm bg-blue-500 inline-block" />
                      <span>Dny s aktivním hledáním</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-3 h-3 rounded-sm bg-rose-500 inline-block" />
                      <span className="text-rose-300 font-medium">Nulová oblast (červeně, 0 hledání)</span>
                    </div>
                  </div>
                  <span className="text-[11px] text-slate-500">
                    💡 Tip: Kliknutím na sloupec dne vyfiltrujete tabulku
                  </span>
                </div>

                {/* Recharts Bar Chart */}
                <div className="w-full h-[320px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart 
                      data={dailyTimelineData} 
                      margin={{ top: 20, right: 15, left: 0, bottom: dailyTimelineData.length > 12 ? 45 : 20 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" opacity={0.6} />
                      <XAxis 
                        dataKey="label" 
                        tick={{ fontSize: 11, fill: '#94A3B8' }}
                        tickLine={false}
                        axisLine={{ stroke: '#475569' }}
                        interval={dailyTimelineData.length > 30 ? Math.ceil(dailyTimelineData.length / 22) : 0}
                        angle={dailyTimelineData.length > 12 ? -45 : 0}
                        textAnchor={dailyTimelineData.length > 12 ? 'end' : 'middle'}
                        height={dailyTimelineData.length > 12 ? 50 : 30}
                      />
                      <YAxis 
                        tick={{ fontSize: 11, fill: '#94A3B8' }}
                        axisLine={false}
                        tickLine={false}
                        allowDecimals={false}
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
                                  fill="#ef4444"
                                  fillOpacity={isSelected ? 0.28 : 0.14}
                                  stroke="#ef4444"
                                  strokeWidth={isSelected ? 2 : 1}
                                  strokeDasharray="3 3"
                                  strokeOpacity={isSelected ? 0.9 : 0.45}
                                  rx={4}
                                />
                                {/* Solid red baseline bar */}
                                <rect
                                  x={x}
                                  y={Math.max(colTop, y)}
                                  width={Math.max(3, width)}
                                  height={Math.max(6, height)}
                                  fill="#ef4444"
                                  stroke="#dc2626"
                                  strokeWidth={1}
                                  rx={3}
                                />
                                {width >= 10 && (
                                  <text
                                    x={x + width / 2}
                                    y={Math.max(colTop + 10, y - 4)}
                                    textAnchor="middle"
                                    fill="#f87171"
                                    fontSize={9}
                                    fontWeight="bold"
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
                                fill={isSelected ? '#60a5fa' : '#3b82f6'}
                                stroke={isSelected ? '#93c5fd' : '#2563eb'}
                                strokeWidth={isSelected ? 2 : 1}
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
                <div className="pt-2 border-t border-slate-700/60 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-slate-300">
                      Denní páska se všemi dny ({timelineStats.totalDays} dní):
                    </span>
                    <div className="flex items-center gap-1.5 text-xs bg-slate-900 p-1 rounded-lg border border-slate-700 self-start sm:self-auto">
                      <button
                        onClick={() => setTimelineFilterMode('all')}
                        className={cn(
                          "px-2.5 py-1 rounded text-xs transition-colors font-medium",
                          timelineFilterMode === 'all' 
                            ? "bg-slate-700 text-white shadow-sm" 
                            : "text-slate-400 hover:text-slate-200"
                        )}
                      >
                        Všechny ({timelineStats.totalDays})
                      </button>
                      <button
                        onClick={() => setTimelineFilterMode('zero')}
                        className={cn(
                          "px-2.5 py-1 rounded text-xs transition-colors font-medium flex items-center gap-1",
                          timelineFilterMode === 'zero' 
                            ? "bg-rose-600 text-white shadow-sm" 
                            : "text-rose-400 hover:text-rose-300"
                        )}
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
                        Nulové dny ({timelineStats.zeroDays})
                      </button>
                      <button
                        onClick={() => setTimelineFilterMode('active')}
                        className={cn(
                          "px-2.5 py-1 rounded text-xs transition-colors font-medium",
                          timelineFilterMode === 'active' 
                            ? "bg-blue-600 text-white shadow-sm" 
                            : "text-slate-400 hover:text-slate-200"
                        )}
                      >
                        Aktivní ({timelineStats.activeDays})
                      </button>
                    </div>
                  </div>

                  <div className="overflow-x-auto pb-2 -mx-2 px-2 scrollbar-thin scrollbar-thumb-slate-700">
                    <div className="flex gap-2 min-w-max">
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
                                "flex flex-col items-center justify-between p-2.5 rounded-xl border text-center transition-all min-w-[72px] shrink-0",
                                day.isZero
                                  ? isSelected
                                    ? "bg-rose-950 border-2 border-rose-400 text-rose-200 shadow-lg shadow-rose-950 ring-2 ring-rose-500"
                                    : "bg-rose-950/50 hover:bg-rose-900/60 border border-rose-500/50 text-rose-300 shadow-sm"
                                  : isSelected
                                    ? "bg-blue-950 border-2 border-blue-400 text-blue-100 shadow-lg shadow-blue-950 ring-2 ring-blue-500"
                                    : "bg-slate-900/80 hover:bg-slate-700/60 border border-slate-700 text-slate-300"
                              )}
                            >
                              <span className="text-[10px] font-semibold uppercase opacity-75">
                                {day.dayOfWeek}
                              </span>
                              <span className="text-xs font-bold my-0.5">
                                {day.displayDate}
                              </span>
                              <span className={cn(
                                "text-[11px] font-extrabold px-1.5 py-0.5 rounded-md mt-1",
                                day.isZero
                                  ? "bg-rose-500/30 text-rose-300 border border-rose-500/40"
                                  : "bg-blue-500/20 text-blue-300 border border-blue-500/20"
                              )}>
                                {day.isZero ? '0' : day.count}
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
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Top Phrases Chart */}
              <div className="lg:col-span-2 bg-slate-800 p-6 rounded-2xl border border-slate-700 shadow-lg">
                <div className="flex items-center justify-between mb-8">
                  <div className="flex items-center gap-2">
                    <BarChart3 size={20} className="text-blue-400" />
                    <h3 className="font-semibold text-white">
                      {showAllPhrases ? 'Všechny vyhledávané fráze' : 'Top 10 vyhledávaných frází'}
                    </h3>
                  </div>
                  <button 
                    onClick={() => setShowAllPhrases(!showAllPhrases)}
                    className="text-xs text-blue-400 hover:text-blue-300 font-medium px-3 py-1 bg-blue-400/10 rounded-full transition-colors"
                  >
                    {showAllPhrases ? 'Zobrazit Top 10' : 'Zobrazit vše'}
                  </button>
                </div>
                <div className={cn("w-full transition-all", showAllPhrases ? "h-[600px] overflow-y-auto pr-2" : "h-[350px]")}>
                  <ResponsiveContainer width="100%" height={showAllPhrases ? Math.max((stats.topPhrases?.length || 0) * 35, 350) : "100%"}>
                    <BarChart data={stats.topPhrases} layout="vertical" margin={{ left: 40, right: 60 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#334155" />
                      <XAxis type="number" hide />
                      <YAxis 
                        dataKey="phrase" 
                        type="category" 
                        width={120} 
                        tick={{ fontSize: 12, fill: '#94A3B8' }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip 
                        cursor={{ fill: '#1E293B' }}
                        contentStyle={{ backgroundColor: '#0F172A', borderRadius: '12px', border: '1px solid #334155', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.5)' }}
                        itemStyle={{ color: '#F8FAFC' }}
                        formatter={(value: number, name: string, props: any) => [
                          `${value} (${props.payload.percentage.toFixed(1)}%)`, 
                          'Počet'
                        ]}
                      />
                      <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={24}>
                        {stats.topPhrases?.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Price Consideration Distribution */}
              <div className="bg-slate-800 p-6 rounded-2xl border border-slate-700 shadow-lg">
                <div className="flex items-center gap-2 mb-8">
                  <DollarSign size={20} className="text-violet-400" />
                  <h3 className="font-semibold text-white">Zohlednění ceny</h3>
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
                      >
                        <Cell fill="#8b5cf6" />
                        <Cell fill="#334155" />
                      </Pie>
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#0F172A', borderRadius: '12px', border: '1px solid #334155' }}
                        itemStyle={{ color: '#F8FAFC' }}
                        formatter={(value: number, name: string) => [
                          `${value} (${((value / stats.totalSearches) * 100).toFixed(1)}%)`,
                          name
                        ]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-4 mt-4">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-[#8b5cf6]" />
                      <span className="text-slate-300">Zohledňuje cenu</span>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold text-white">{stats.priceConsiderationCount}</div>
                      <div className="text-[10px] text-slate-500">{((stats.priceConsiderationCount / stats.totalSearches) * 100).toFixed(1)}%</div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-[#334155]" />
                      <span className="text-slate-300">Nezohledňuje cenu</span>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold text-white">{stats.totalSearches - stats.priceConsiderationCount}</div>
                      <div className="text-[10px] text-slate-500">{(((stats.totalSearches - stats.priceConsiderationCount) / stats.totalSearches) * 100).toFixed(1)}%</div>
                    </div>
                  </div>
                  <div className="pt-2 mt-2 border-t border-slate-700/50">
                    <p className="text-[10px] text-slate-500 italic leading-relaxed">
                      * Zohlednění ceny zahrnuje vyhledávání s nastaveným cenovým rozsahem (min/max) nebo aplikovaným řazením (od nejlevnějšího/nejdražšího).
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Data Table */}
            <section className="bg-slate-800 rounded-2xl border border-slate-700 shadow-lg overflow-hidden">
              <div className="p-6 border-b border-slate-700 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-4 flex-wrap">
                  <h3 className="font-semibold text-white">Detailní výpis vyhledávání</h3>
                  <span className="text-xs text-slate-400">
                    {selectedDay 
                      ? `${displayCalls.length} záznamů (den ${format(parseISO(selectedDay), 'd. M. yyyy')})` 
                      : `${filteredCalls.length} záznamů`}
                  </span>
                  {selectedDay && (
                    <div className="flex items-center gap-1.5 px-2.5 py-1 bg-blue-500/20 border border-blue-500/40 rounded-lg text-blue-300 text-xs font-medium">
                      <span>Aktivní filtr dne: {format(parseISO(selectedDay), 'd. M. yyyy')}</span>
                      <button 
                        onClick={() => setSelectedDay(null)} 
                        className="hover:text-white hover:bg-blue-500/30 p-0.5 rounded transition-colors"
                        title="Zrušit filtr dne"
                      >
                        <X size={13} />
                      </button>
                    </div>
                  )}
                </div>
                <div className="flex flex-col md:flex-row items-center gap-3">
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <span>Zobrazit:</span>
                    <select 
                      value={pageSize} 
                      onChange={(e) => {
                        setPageSize(Number(e.target.value));
                        setCurrentPage(1);
                      }}
                      className="bg-slate-900 border border-slate-700 rounded px-2 py-1 outline-none focus:ring-1 focus:ring-blue-500 text-slate-200"
                    >
                      <option value={25}>25</option>
                      <option value={50}>50</option>
                      <option value={100}>100</option>
                    </select>
                  </div>
                  <div className="relative w-full md:w-64">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input 
                      type="text" 
                      placeholder="Hledat v dotazech..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-slate-200 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                    />
                  </div>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-900/50">
                      <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500">Čas</th>
                      <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500">Hledaná fráze</th>
                      <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500">Cena od</th>
                      <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500">Cena do</th>
                      <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500">Řazení</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700">
                    {paginatedCalls.map((call, i) => {
                      const ts = call.timestamp.toISOString();
                      const isMulti = multiQueryTimestamps.has(ts);
                      const groupIdx = timestampToGroupIdx[ts];
                      const globalIdx = (currentPage - 1) * pageSize + i;
                      const isFirstInGroup = globalIdx === 0 || (displayCalls[globalIdx - 1] && displayCalls[globalIdx - 1].timestamp.toISOString() !== ts);
                      
                      return (
                        <tr key={i} className={cn(
                          "hover:bg-slate-700/30 transition-colors group relative",
                          isMulti && (groupIdx % 2 === 0 ? "bg-violet-500/[0.08]" : "bg-orange-500/[0.08]"),
                          isMulti && isFirstInGroup && globalIdx !== 0 && "border-t-2 border-slate-600"
                        )}>
                          <td className="px-6 py-4 text-sm font-mono text-slate-400">
                            <div className="flex items-center gap-2">
                              {isMulti && (
                                <div className={cn(
                                  "w-1.5 h-1.5 rounded-full shadow-[0_0_8px_rgba(255,255,255,0.2)]",
                                  groupIdx % 2 === 0 ? "bg-violet-400 shadow-violet-500/50" : "bg-orange-400 shadow-orange-500/50"
                                )} title="Součást multi-dotazu" />
                              )}
                              <div>
                                {format(call.timestamp, 'HH:mm:ss')}
                                <div className="text-[10px] opacity-50">{format(call.timestamp, 'dd.MM.yyyy')}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-sm font-medium text-slate-200">
                            <div className="flex items-center gap-2">
                              {call.query}
                              {isMulti && (
                                <span className={cn(
                                  "text-[8px] px-1.5 py-0.5 rounded font-black uppercase tracking-widest border",
                                  groupIdx % 2 === 0 
                                    ? "bg-violet-500/20 text-violet-300 border-violet-500/30" 
                                    : "bg-orange-500/20 text-orange-300 border-orange-500/30"
                                )}>
                                  Multi
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4 text-sm">
                          {call.price_min ? (
                            <span className="text-emerald-400 font-semibold">{call.price_min} Kč</span>
                          ) : '-'}
                        </td>
                        <td className="px-6 py-4 text-sm">
                          {call.price_max ? (
                            <span className="text-rose-400 font-semibold">{call.price_max} Kč</span>
                          ) : '-'}
                        </td>
                        <td className="px-6 py-4 text-sm">
                          {call.order_by === 'asc' && (
                            <span className="inline-flex items-center gap-1 px-2 py-1 bg-emerald-400/10 text-emerald-400 rounded text-xs font-medium">
                              <ArrowUpDown size={10} /> Nejlevnější
                            </span>
                          )}
                          {call.order_by === 'desc' && (
                            <span className="inline-flex items-center gap-1 px-2 py-1 bg-rose-400/10 text-rose-400 rounded text-xs font-medium">
                              <ArrowUpDown size={10} /> Nejdražší
                            </span>
                          )}
                          {!call.order_by && '-'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                </table>
                
                {filteredCalls.length > 0 && (
                  <div className="p-4 bg-slate-900/30 border-t border-slate-700 flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="text-xs text-slate-500">
                      Zobrazeno {Math.min(filteredCalls.length, (currentPage - 1) * pageSize + 1)} - {Math.min(filteredCalls.length, currentPage * pageSize)} z {filteredCalls.length} záznamů
                    </div>
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                        disabled={currentPage === 1}
                        className="p-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      >
                        <ChevronLeft size={16} />
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
                                "w-8 h-8 rounded-lg text-xs font-medium transition-all",
                                currentPage === pageNum 
                                  ? "bg-blue-600 text-white shadow-lg shadow-blue-600/20" 
                                  : "bg-slate-800 border border-slate-700 text-slate-400 hover:text-white"
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
                        className="p-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      >
                        <ChevronRight size={16} />
                      </button>
                    </div>
                  </div>
                )}

                {displayCalls.length === 0 && (
                  <div className="p-12 text-center text-slate-400">
                    {selectedDay ? (
                      <div className="max-w-md mx-auto space-y-3">
                        <div className="w-12 h-12 rounded-full bg-rose-500/20 border border-rose-500/40 text-rose-400 flex items-center justify-center mx-auto">
                          <AlertTriangle size={24} />
                        </div>
                        <h4 className="text-base font-semibold text-white">Nulová oblast — žádná vyhledávání</h4>
                        <p className="text-xs text-slate-400">
                          V den {format(parseISO(selectedDay), 'd. M. yyyy')} nebyl zaznamenán žádný dotaz na vyhledávací nástroj.
                        </p>
                        <button
                          onClick={() => setSelectedDay(null)}
                          className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-xs font-semibold transition-colors inline-flex items-center gap-1.5 mt-2"
                        >
                          <X size={14} /> Zrušit filtr dne a zobrazit vše
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

        <footer className="text-center py-8 text-slate-500 text-sm border-t border-slate-800">
          © {new Date().getFullYear()} Datart Search Log Analyzer • Vytvořeno pro analýzu AI asistentů
        </footer>

        {debugLogs.length > 0 && (
          <div className="bg-slate-900 border border-slate-800 rounded-xl mt-8 overflow-hidden">
            <button 
              onClick={() => setShowDebug(!showDebug)}
              className="w-full flex items-center justify-between p-4 hover:bg-slate-800/50 transition-colors"
            >
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-2">
                <BarChart3 size={14} />
                Debug Logy ({debugLogs.length})
              </h4>
              <div className="flex items-center gap-4">
                {showDebug && (
                  <span 
                    onClick={(e) => { e.stopPropagation(); setDebugLogs([]); }}
                    className="text-[10px] text-slate-600 hover:text-slate-400 font-bold uppercase tracking-widest"
                  >
                    Vymazat
                  </span>
                )}
                <ChevronRight size={16} className={cn("text-slate-500 transition-transform", showDebug && "rotate-90")} />
              </div>
            </button>
            
            {showDebug && (
              <div className="p-4 pt-0 border-t border-slate-800/50">
                <div className="max-h-60 overflow-y-auto text-[10px] font-mono space-y-1 mt-4">
                  {debugLogs.map((log, i) => (
                    <div key={i} className="text-slate-400 border-b border-slate-800/50 pb-1 last:border-0">
                      {log}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
