import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { CostByTagChart } from "../components/CostByTagChart";
import { CostTimeChart } from "../components/CostTimeChart";
import { MetricCard } from "../components/MetricCard";
import { Skeleton } from "../components/Skeleton";
import { TopTemplatesTable } from "../components/TopTemplatesTable";
import {
  getByTag,
  getOverview,
  getTimeseries,
  getTopTemplates,
  type ByTagRow,
  type Overview,
  type Period,
  type TimeseriesPoint,
  type TopTemplateRow,
} from "../lib/api";

const panelClass = "border border-white/10 bg-black/65 p-5 backdrop-blur-md";

export function Dashboard() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [overviewError, setOverviewError] = useState<string | null>(null);

  const [series, setSeries] = useState<TimeseriesPoint[]>([]);
  const [seriesLoading, setSeriesLoading] = useState(true);
  const [seriesError, setSeriesError] = useState<string | null>(null);
  const [period, setPeriod] = useState<Period>("7d");

  const [tagData, setTagData] = useState<ByTagRow[]>([]);
  const [tagLoading, setTagLoading] = useState(true);
  const [tagError, setTagError] = useState<string | null>(null);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);

  const [templates, setTemplates] = useState<TopTemplateRow[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [templatesError, setTemplatesError] = useState<string | null>(null);

  useEffect(() => {
    let cancel = false;
    setOverviewError(null);
    getOverview()
      .then((d) => {
        if (!cancel) setOverview(d);
      })
      .catch((e: unknown) => {
        if (!cancel) setOverviewError(e instanceof Error ? e.message : "Failed");
      });
    return () => {
      cancel = true;
    };
  }, []);

  useEffect(() => {
    let cancel = false;
    setSeriesLoading(true);
    setSeriesError(null);
    getTimeseries(period, "day")
      .then((d) => {
        if (!cancel) setSeries(d);
      })
      .catch((e: unknown) => {
        if (!cancel) setSeriesError(e instanceof Error ? e.message : "Failed");
      })
      .finally(() => {
        if (!cancel) setSeriesLoading(false);
      });
    return () => {
      cancel = true;
    };
  }, [period]);

  useEffect(() => {
    let cancel = false;
    setTagLoading(true);
    setTagError(null);
    getByTag(period)
      .then((d) => {
        if (!cancel) setTagData(d);
      })
      .catch((e: unknown) => {
        if (!cancel) setTagError(e instanceof Error ? e.message : "Failed");
      })
      .finally(() => {
        if (!cancel) setTagLoading(false);
      });
    return () => {
      cancel = true;
    };
  }, [period]);

  useEffect(() => {
    let cancel = false;
    setTemplatesLoading(true);
    setTemplatesError(null);
    getTopTemplates(10)
      .then((d) => {
        if (!cancel) setTemplates(d);
      })
      .catch((e: unknown) => {
        if (!cancel) setTemplatesError(e instanceof Error ? e.message : "Failed");
      })
      .finally(() => {
        if (!cancel) setTemplatesLoading(false);
      });
    return () => {
      cancel = true;
    };
  }, []);

  const overviewLoading = overview === null && overviewError === null;

  return (
    <div className="space-y-8">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-[#4FABFF]">
          Overview
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white">
          Dashboard
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          Cost attribution across features and templates.
        </p>
      </div>

      {overviewError && <ErrorBanner message={overviewError} />}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <MetricCard
          label="Today"
          cost={overview?.today.cost ?? null}
          requests={overview?.today.requests ?? null}
          loading={overviewLoading}
          variant="dark"
        />
        <MetricCard
          label="This week"
          cost={overview?.week.cost ?? null}
          requests={overview?.week.requests ?? null}
          loading={overviewLoading}
          variant="dark"
        />
        <MetricCard
          label="This month"
          cost={overview?.month.cost ?? null}
          requests={overview?.month.requests ?? null}
          loading={overviewLoading}
          variant="dark"
        />
      </div>

      <section className={panelClass}>
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-white">Cost over time</h2>
          <PeriodToggle value={period} onChange={setPeriod} />
        </div>
        <div className="mt-4">
          {seriesError ? (
            <ErrorBanner message={seriesError} />
          ) : seriesLoading ? (
            <Skeleton className="h-72 w-full" />
          ) : (
            <CostTimeChart data={series} theme="dark" />
          )}
        </div>
      </section>

      <section className={panelClass}>
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-white">Cost by feature tag</h2>
          {selectedTag && (
            <button
              type="button"
              onClick={() => setSelectedTag(null)}
              className="text-xs font-medium text-[#4FABFF] transition-colors hover:text-[#B1C5FF]"
            >
              Clear filter ({selectedTag})
            </button>
          )}
        </div>
        <div className="mt-4">
          {tagError ? (
            <ErrorBanner message={tagError} />
          ) : tagLoading ? (
            <Skeleton className="h-72 w-full" />
          ) : (
            <CostByTagChart
              data={tagData}
              selectedTag={selectedTag}
              onSelect={setSelectedTag}
              theme="dark"
            />
          )}
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-white">Top prompt templates</h2>
          {selectedTag && (
            <span className="text-xs text-neutral-500">
              Filtered to <span className="font-mono text-neutral-400">{selectedTag}</span>
            </span>
          )}
        </div>
        {templatesError ? (
          <ErrorBanner message={templatesError} />
        ) : templatesLoading ? (
          <Skeleton className="h-48 w-full" />
        ) : (
          <TopTemplatesTable rows={templates} filterTag={selectedTag} variant="dark" />
        )}
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
    <div className="inline-flex overflow-hidden border border-white/10 bg-black text-xs font-medium">
      {opts.map((p) => (
        <button
          key={p}
          type="button"
          onClick={() => onChange(p)}
          className={cn(
            "px-3 py-1.5 transition-colors",
            value === p
              ? "bg-[#076EFF] text-white"
              : "text-neutral-400 hover:bg-white/5 hover:text-white"
          )}
        >
          {p}
        </button>
      ))}
    </div>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
      {message}
    </div>
  );
}
