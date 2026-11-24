import { useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import { ChevronDown, ChevronUp } from 'lucide-react';
import {
  computeUtilizationSummary,
  type UtilizationSlice,
} from '../office/utilization';
import type {
  AgentId,
  LightingPreset,
  OfficeSimulationState,
} from '../office/types';

interface UtilizationDashboardProps {
  simState: OfficeSimulationState;
  lighting: LightingPreset;
  selectedAgentId: AgentId | null;
  onSelectAgent: (agentId: AgentId) => void;
}

const CHART_SIZE = 68;
const OUTER_RADIUS = 31;
const INNER_RADIUS = 20;

export function UtilizationDashboard({
  simState,
  lighting,
  selectedAgentId,
  onSelectAgent,
}: UtilizationDashboardProps) {
  const [expanded, setExpanded] = useState(false);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const prevArcsRef = useRef<Map<string, d3.PieArcDatum<UtilizationSlice>>>(
    new Map()
  );
  const summary = useMemo(() => computeUtilizationSummary(simState), [simState]);

  const isDark = lighting === 'malam';
  const activeColor = isDark ? '#34d399' : '#059669';
  const idleColor = isDark ? '#f59e0b' : '#d97706';
  const trackColor = isDark ? '#1e293b' : '#e2e8f0';

  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl) return;

    const svg = d3.select(svgEl);
    let rootG = svg.select<SVGGElement>('g.pie-root');
    if (rootG.empty()) {
      rootG = svg
        .append('g')
        .attr('class', 'pie-root')
        .attr('transform', `translate(${CHART_SIZE / 2}, ${CHART_SIZE / 2})`);

      // Background ring track for visual clarity during transitions
      rootG
        .append('circle')
        .attr('class', 'pie-track')
        .attr('r', (OUTER_RADIUS + INNER_RADIUS) / 2)
        .attr('fill', 'none')
        .attr('stroke-width', OUTER_RADIUS - INNER_RADIUS);
    }

    rootG.select('circle.pie-track').attr('stroke', trackColor);

    const hasBoth = summary.activeCount > 0 && summary.idleCount > 0;
    const pieGenerator = d3
      .pie<UtilizationSlice>()
      .value((d) => d.count)
      .sort(null)
      .padAngle(hasBoth ? 0.05 : 0);

    const arcGenerator = d3
      .arc<d3.PieArcDatum<UtilizationSlice>>()
      .innerRadius(INNER_RADIUS)
      .outerRadius(OUTER_RADIUS)
      .cornerRadius(hasBoth ? 2.5 : 0);

    const pieData = pieGenerator(summary.slices);
    const reducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const paths = rootG
      .selectAll<SVGPathElement, d3.PieArcDatum<UtilizationSlice>>('path.pie-slice')
      .data(pieData, (d) => d.data.key);

    const prevMap = prevArcsRef.current;

    const entered = paths
      .enter()
      .append('path')
      .attr('class', 'pie-slice')
      .each((d) => {
        if (!prevMap.has(d.data.key)) {
          prevMap.set(d.data.key, {
            ...d,
            startAngle: d.startAngle,
            endAngle: d.startAngle,
          });
        }
      });

    const merged = entered.merge(paths);

    merged
      .attr('fill', (d) => (d.data.key === 'active' ? activeColor : idleColor))
      .attr('data-slice', (d) => d.data.key);

    if (reducedMotion) {
      merged.attr('d', (d) => {
        prevMap.set(d.data.key, d);
        return arcGenerator(d) ?? '';
      });
    } else {
      merged
        .transition()
        .duration(300)
        .ease(d3.easeCubicOut)
        .attrTween('d', (d) => {
          const prev = prevMap.get(d.data.key) ?? d;
          const interp = d3.interpolate(prev, d);
          prevMap.set(d.data.key, d);
          return (t: number) => arcGenerator(interp(t)) ?? '';
        });
    }

    paths.exit().remove();
  }, [summary.slices, summary.activeCount, summary.idleCount, activeColor, idleColor, trackColor]);

  const surfaceClass = isDark
    ? 'border-slate-700/90 bg-[#0f172a]/94 text-slate-100'
    : 'border-slate-200/95 bg-[#fcfbf8]/95 text-slate-900';

  const mutedTextClass = isDark ? 'text-slate-400' : 'text-slate-600';

  return (
    <section
      aria-label="Ringkasan utilisasi agen AI"
      data-testid="utilization-dashboard"
      data-active-count={summary.activeCount}
      data-idle-count={summary.idleCount}
      data-utilization-percent={summary.utilizationPercent}
      className={`pointer-events-auto rounded-xl border px-3.5 py-2.5 shadow-sm transition-colors duration-200 ${surfaceClass}`}
    >
      <div className="flex items-center gap-3.5">
        {/* Dynamic D3 Utilization Donut Chart */}
        <div className="relative h-[68px] w-[68px] shrink-0">
          <svg
            ref={svgRef}
            width={CHART_SIZE}
            height={CHART_SIZE}
            viewBox={`0 0 ${CHART_SIZE} ${CHART_SIZE}`}
            role="img"
            aria-label={`Diagram lingkaran utilisasi agen: ${summary.utilizationPercent}% aktif (${summary.activeCount} aktif, ${summary.idleCount} siaga)`}
            data-testid="utilization-pie-svg"
            className="block"
          />
          <div
            className="pointer-events-none absolute inset-0 flex items-center justify-center"
            aria-hidden="true"
          >
            <span className="font-mono text-xs font-semibold tracking-tight tabular-nums">
              {summary.utilizationPercent}%
            </span>
          </div>
        </div>

        {/* Summary Metrics (Active vs Idle) */}
        <div className="min-w-[144px]">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xs font-semibold tracking-tight">
              Utilisasi Agen
            </h2>
            <button
              type="button"
              onClick={() => setExpanded((prev) => !prev)}
              aria-expanded={expanded}
              aria-label={expanded ? 'Ringkas daftar agen' : 'Tampilkan rincian agen'}
              className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-blue-600 ${
                isDark
                  ? 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  : 'text-slate-600 hover:bg-slate-200/70 hover:text-slate-900'
              }`}
            >
              <span>{expanded ? 'Ringkas' : 'Rincian'}</span>
              {expanded ? (
                <ChevronUp className="h-3 w-3" aria-hidden="true" />
              ) : (
                <ChevronDown className="h-3 w-3" aria-hidden="true" />
              )}
            </button>
          </div>

          <div className="mt-1.5 space-y-1 text-xs">
            <div className="flex items-center justify-between gap-4">
              <span className="inline-flex items-center gap-1.5">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-xs"
                  style={{ backgroundColor: activeColor }}
                  aria-hidden="true"
                />
                <span>Aktif</span>
              </span>
              <span className="font-mono font-medium tabular-nums">
                {summary.activeCount}/{summary.total}
              </span>
            </div>

            <div className="flex items-center justify-between gap-4">
              <span className="inline-flex items-center gap-1.5">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-xs"
                  style={{ backgroundColor: idleColor }}
                  aria-hidden="true"
                />
                <span>Siaga</span>
              </span>
              <span className="font-mono font-medium tabular-nums">
                {summary.idleCount}/{summary.total}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Expandable Per-Agent Real-Time Breakdown */}
      {expanded && (
        <div
          className={`mt-2.5 border-t pt-2 ${
            isDark ? 'border-slate-800' : 'border-slate-200/90'
          }`}
        >
          <ul className="max-h-56 space-y-1 overflow-y-auto pr-1" aria-label="Status utilisasi per agen">
            {summary.agents.map((item) => {
              const isSelected = selectedAgentId === item.id;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => onSelectAgent(item.id)}
                    className={`flex w-full items-center justify-between gap-3 rounded-md px-2 py-1 text-left text-xs transition-colors focus-visible:outline-2 focus-visible:outline-blue-600 ${
                      isSelected
                        ? isDark
                          ? 'bg-slate-800 text-white font-medium'
                          : 'bg-slate-200/80 text-slate-950 font-medium'
                        : isDark
                        ? 'text-slate-200 hover:bg-slate-800/70'
                        : 'text-slate-800 hover:bg-slate-100'
                    }`}
                  >
                    <span className="inline-flex min-w-0 items-center gap-1.5">
                      <span
                        className="h-2 w-2 shrink-0 rounded-xs"
                        style={{ backgroundColor: item.accentHex }}
                        aria-hidden="true"
                      />
                      <span className="truncate">{item.name}</span>
                    </span>
                    <span className={`shrink-0 text-[11px] ${mutedTextClass}`}>
                      {item.activityLabel}
                      <span className="mx-1" aria-hidden="true">
                        ·
                      </span>
                      <span
                        style={{
                          color: item.bucket === 'active' ? activeColor : idleColor,
                        }}
                        className="font-medium"
                      >
                        {item.bucket === 'active' ? 'Aktif' : 'Siaga'}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
