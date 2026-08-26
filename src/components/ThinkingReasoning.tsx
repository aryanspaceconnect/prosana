import React, { useLayoutEffect, useRef, useState } from "react";

export type TraceRow = {
  primary: string;
  secondary?: string;
  mono?: boolean;
  add?: number;
  del?: number;
  href?: string;
  type?: 'Step' | 'Reasoning' | 'Search' | 'Coding' | 'Tool';
};

export interface ThinkingReasoningProps {
  isWorking?: boolean;
  rows?: TraceRow[];
  query?: string;
  variant?: "Steps" | "Reasoning" | "Search" | "Coding";
  elapsedSeconds?: number;
  customSentences?: string[]; // Legacy prop compatibility
  isStreaming?: boolean; // Legacy prop compatibility
}

export function ThinkingReasoning({
  isWorking = false,
  rows = [],
  query,
  variant = "Steps",
  elapsedSeconds,
  customSentences,
  isStreaming
}: ThinkingReasoningProps) {
  // Process customSentences or legacy props into real rows if provided
  const actualRows: TraceRow[] = rows.length > 0 
    ? rows 
    : (customSentences && customSentences.length > 0 
        ? customSentences.map(s => ({ primary: s, type: 'Reasoning' })) 
        : []);

  const working = isWorking || Boolean(isStreaming);
  const [manualExpanded, setManualExpanded] = useState<boolean | null>(null);
  const [selectedTool, setSelectedTool] = useState<string | null>(null);
  
  const expanded = manualExpanded ?? working;
  const traceRef = useRef<HTMLDivElement>(null);
  const [lineHeight, setLineHeight] = useState(0);

  useLayoutEffect(() => {
    if (traceRef.current) {
      setLineHeight(traceRef.current.offsetHeight);
    }
  }, [actualRows.length, expanded, variant]);

  const activeText = "Working...";
  const toolsCount = actualRows.filter(r => r.type === 'Tool' || r.type === 'Coding').length;
  
  let doneText = "Thought complete";
  if (toolsCount > 0) {
    doneText = `Ran ${toolsCount} tool${toolsCount > 1 ? 's' : ''}`;
  } else if (elapsedSeconds && elapsedSeconds > 0) {
    doneText = `Thought for ${elapsedSeconds.toFixed(1)}s`;
  } else if (actualRows.length > 0) {
    doneText = `Thought (${actualRows.length} step${actualRows.length > 1 ? 's' : ''})`;
  }

  // If not working and there are no actual thoughts/tools, do NOT render empty fake trace!
  if (!working && actualRows.length === 0) {
    return null;
  }

  return (
    <div className="flex w-full max-w-md flex-col my-1 font-sans">
      {/* Header Button */}
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setManualExpanded((current) => !(current ?? working))}
        className="-mx-1 flex w-fit items-center gap-2 rounded-lg px-2 py-1 transition-colors duration-150 hover:bg-slate-100 cursor-pointer"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill={working ? "#334155" : "#94a3b8"}>
          <path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8z" />
        </svg>

        {working ? (
          <span
            className="bg-clip-text text-[13px] font-medium whitespace-nowrap text-transparent"
            style={{
              backgroundImage:
                "linear-gradient(90deg, #64748b 35%, #0f172a 50%, #64748b 65%)",
              backgroundSize: "200% 100%",
              animation: "shimmer-text 1.4s linear infinite",
            }}
          >
            {activeText}
          </span>
        ) : (
          <span className="text-[12.5px] font-medium whitespace-nowrap text-slate-600">
            {doneText}
          </span>
        )}

        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#94a3b8"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="transition-transform duration-300"
          style={{ transform: expanded ? "rotate(180deg)" : "rotate(0deg)" }}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {/* Expandable Trace View */}
      <div
        className="grid transition-[grid-template-rows,opacity] duration-300"
        style={{
          gridTemplateRows: expanded ? "1fr" : "0fr",
          opacity: expanded ? 1 : 0,
          transitionTimingFunction: "cubic-bezier(0.23, 1, 0.32, 1)",
        }}
      >
        <div className="overflow-hidden">
          <div className="relative mt-1 ml-[5px] pl-3.5">
            {actualRows.length > 0 && (
              <span
                aria-hidden
                className="absolute left-[3px] w-px bg-slate-200/80"
                style={{
                  top: 0,
                  height: lineHeight ? Math.max(0, lineHeight - 4) : 0,
                  transition: "height 300ms cubic-bezier(0.23,1,0.32,1)"
                }}
              />
            )}
            <div ref={traceRef} className="flex flex-col gap-1 py-1">
              {query && (
                <div className="flex h-6 items-center gap-2 px-1.5">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" className="shrink-0">
                    <circle cx="11" cy="11" r="7" />
                    <path d="M21 21l-4.3-4.3" />
                  </svg>
                  <span className="text-[12px] text-slate-700 font-medium">{query}</span>
                </div>
              )}

              {actualRows.map((row, i) => {
                const isSelected = selectedTool === row.primary;
                return (
                  <div
                    key={i}
                    onClick={() => row.secondary ? setSelectedTool(isSelected ? null : row.primary) : undefined}
                    className={`flex min-h-6 w-full items-start gap-2 rounded-md px-1.5 py-0.5 text-left transition-colors ${
                      row.secondary ? "cursor-pointer hover:bg-slate-100/70" : ""
                    }`}
                  >
                    {/* Status Dot / Icon */}
                    {row.type === 'Search' ? (
                      <span className="flex size-3.5 shrink-0 items-center justify-center rounded-full text-white bg-emerald-500 mt-0.5">
                        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                          <circle cx="12" cy="12" r="9" />
                        </svg>
                      </span>
                    ) : i < actualRows.length - 1 || !working ? (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-1">
                        <path d="M20 6L9 17l-5-5" />
                      </svg>
                    ) : (
                      <span className="size-3 shrink-0 rounded-full border-[1.5px] border-slate-300 border-t-slate-800 animate-spin mt-0.5" />
                    )}

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className={`text-[12px] ${row.type === 'Reasoning' ? 'text-slate-600 font-normal leading-relaxed' : 'font-medium text-slate-800'}`}>
                          {row.primary}
                        </span>
                        {row.secondary && (
                          <span className={`shrink-0 text-[11px] text-slate-400 ${row.mono ? "font-mono bg-slate-100 px-1 py-0.2 rounded" : ""}`}>
                            {row.secondary}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export const ThinkingState = ThinkingReasoning;
export default ThinkingReasoning;
