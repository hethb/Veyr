import { useMemo, useState } from "react";
import { CostByTagChart } from "./CostByTagChart";
import { CostTimeChart } from "./CostTimeChart";
import { MetricCard } from "./MetricCard";
import { TopTemplatesTable } from "./TopTemplatesTable";
import {
  buildDemoByTag,
  buildDemoTimeseries,
  demoOverview,
  demoTopTemplates,
} from "../lib/demoData";
import type { Period } from "../lib/api";

/**
 * Read-only preview of the dashboard for unauthenticated visitors.
 * Same components as the real dashboard — just fed with mock data.
 */
export function DemoDashboard() {
  const [period, setPeriod] = useState<Period>("7d");
  const [selectedTag, setSelectedTag] = useState<string | null>(null);

  const series = useMemo(() => buildDemoTimeseries(period), [period]);
  const tagData = useMemo(() => buildDemoByTag(period), [period]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
        <div className="text-sm text-amber-900">
          <span className="font-semibold">Sample data.</span> This is what your
          dashboard will look like once you start sending traffic through PromptLens.
        </div>
        <span className="hidden rounded-full bg-amber-200 px-2 py-0.5 text-xs font-medium text-amber-900 sm:inline">
          DEMO
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <MetricCard
          label="Today"
          cost={demoOverview.today.cost}
          requests={demoOverview.today.requests}
          loading={false}
        />
        <MetricCard
          label="This week"
          cost={demoOverview.week.cost}
          requests={demoOverview.week.requests}
          loading={false}
        />
        <MetricCard
          label="This month"
          cost={demoOverview.month.cost}
          requests={demoOverview.month.requests}
          loading={false}
        />
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-900">Cost over time</h3>
          <PeriodToggle value={period} onChange={setPeriod} />
        </div>
        <div className="mt-4">
          <CostTimeChart data={series} />
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-900">
            Cost by feature tag
          </h3>
          {selectedTag && (
            <button
              type="button"
              onClick={() => setSelectedTag(null)}
              className="text-xs font-medium text-indigo-600 hover:text-indigo-800"
            >
              Clear filter ({selectedTag})
            </button>
          )}
        </div>
        <div className="mt-4">
          <CostByTagChart
            data={tagData}
            selectedTag={selectedTag}
            onSelect={setSelectedTag}
          />
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Tip: click a bar to filter the templates table below.
        </p>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-900">
            Top prompt templates
          </h3>
          {selectedTag && (
            <span className="text-xs text-slate-500">
              Filtered to <span className="font-mono">{selectedTag}</span>
            </span>
          )}
        </div>
        <TopTemplatesTable rows={demoTopTemplates} filterTag={selectedTag} />
      </section>
    </div>
  );
}

interface PeriodToggleProps {
  value: Period;
  onChange: (p: Period) => void;
}

function PeriodToggle({ value, onChange }: PeriodToggleProps) {
  const opts: Period[] = ["7d", "30d"];
  return (
    <div className="inline-flex overflow-hidden rounded-lg border border-slate-200 bg-white text-xs font-medium">
      {opts.map((p) => (
        <button
          key={p}
          type="button"
          onClick={() => onChange(p)}
          className={`px-3 py-1.5 transition-colors ${
            value === p
              ? "bg-indigo-600 text-white"
              : "text-slate-600 hover:bg-slate-50"
          }`}
        >
          {p}
        </button>
      ))}
    </div>
  );
}
