import { cn } from "@/lib/utils";
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

interface DemoDashboardProps {
  variant?: "light" | "dark";
}

/**
 * Read-only preview of the dashboard for unauthenticated visitors.
 * Same components as the real dashboard — just fed with mock data.
 */
export function DemoDashboard({ variant = "light" }: DemoDashboardProps) {
  const [period, setPeriod] = useState<Period>("7d");
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const dark = variant === "dark";

  const series = useMemo(() => buildDemoTimeseries(period), [period]);
  const tagData = useMemo(() => buildDemoByTag(period), [period]);

  const panelClass = cn(
    "border p-5",
    dark ? "border-white/10 bg-black" : "rounded-xl border-slate-200 bg-white shadow-sm"
  );

  return (
    <div className={cn("space-y-6", dark && "bg-black p-6")}>
      <div
        className={cn(
          "flex items-center justify-between border px-4 py-3",
          dark
            ? "border-[#4FABFF]/30 bg-[#076EFF]/5"
            : "rounded-xl border-amber-200 bg-amber-50"
        )}
      >
        <div className={cn("text-sm", dark ? "text-neutral-300" : "text-amber-900")}>
          <span className={cn("font-semibold", dark && "text-[#4FABFF]")}>
            Sample data.
          </span>{" "}
          This is what your dashboard will look like once you start sending traffic
          through PromptLens.
        </div>
        <span
          className={cn(
            "hidden px-2 py-0.5 text-xs font-medium sm:inline",
            dark
              ? "border border-[#4FABFF]/40 bg-[#076EFF]/10 text-[#4FABFF]"
              : "rounded-full bg-amber-200 text-amber-900"
          )}
        >
          DEMO
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <MetricCard
          label="Today"
          cost={demoOverview.today.cost}
          requests={demoOverview.today.requests}
          loading={false}
          variant={variant}
        />
        <MetricCard
          label="This week"
          cost={demoOverview.week.cost}
          requests={demoOverview.week.requests}
          loading={false}
          variant={variant}
        />
        <MetricCard
          label="This month"
          cost={demoOverview.month.cost}
          requests={demoOverview.month.requests}
          loading={false}
          variant={variant}
        />
      </div>

      <section className={panelClass}>
        <div className="flex items-center justify-between">
          <h3 className={cn("text-base font-semibold", dark ? "text-white" : "text-slate-900")}>
            Cost over time
          </h3>
          <PeriodToggle value={period} onChange={setPeriod} dark={dark} />
        </div>
        <div className="mt-4">
          <CostTimeChart data={series} theme={variant} />
        </div>
      </section>

      <section className={panelClass}>
        <div className="flex items-center justify-between">
          <h3 className={cn("text-base font-semibold", dark ? "text-white" : "text-slate-900")}>
            Cost by feature tag
          </h3>
          {selectedTag && (
            <button
              type="button"
              onClick={() => setSelectedTag(null)}
              className={cn(
                "text-xs font-medium",
                dark ? "text-[#4FABFF] hover:text-[#B1C5FF]" : "text-indigo-600 hover:text-indigo-800"
              )}
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
            theme={variant}
          />
        </div>
        <p className={cn("mt-3 text-xs", dark ? "text-neutral-500" : "text-slate-500")}>
          Tip: click a bar to filter the templates table below.
        </p>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h3 className={cn("text-base font-semibold", dark ? "text-white" : "text-slate-900")}>
            Top prompt templates
          </h3>
          {selectedTag && (
            <span className={cn("text-xs", dark ? "text-neutral-500" : "text-slate-500")}>
              Filtered to <span className="font-mono">{selectedTag}</span>
            </span>
          )}
        </div>
        <TopTemplatesTable rows={demoTopTemplates} filterTag={selectedTag} variant={variant} />
      </section>
    </div>
  );
}

interface PeriodToggleProps {
  value: Period;
  onChange: (p: Period) => void;
  dark?: boolean;
}

function PeriodToggle({ value, onChange, dark }: PeriodToggleProps) {
  const opts: Period[] = ["7d", "30d"];
  return (
    <div
      className={cn(
        "inline-flex overflow-hidden border text-xs font-medium",
        dark ? "border-white/10 bg-black" : "rounded-lg border-slate-200 bg-white"
      )}
    >
      {opts.map((p) => (
        <button
          key={p}
          type="button"
          onClick={() => onChange(p)}
          className={cn(
            "px-3 py-1.5 transition-colors",
            value === p
              ? dark
                ? "bg-[#076EFF] text-white"
                : "bg-indigo-600 text-white"
              : dark
                ? "text-neutral-400 hover:bg-white/5 hover:text-white"
                : "text-slate-600 hover:bg-slate-50"
          )}
        >
          {p}
        </button>
      ))}
    </div>
  );
}
