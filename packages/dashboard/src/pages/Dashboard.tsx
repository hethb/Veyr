import { useEffect, useState } from "react";
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
        <h1 className="text-2xl font-semibold text-slate-900">Dashboard</h1>
        <p className="mt-1 text-sm text-slate-500">
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
        />
        <MetricCard
          label="This week"
          cost={overview?.week.cost ?? null}
          requests={overview?.week.requests ?? null}
          loading={overviewLoading}
        />
        <MetricCard
          label="This month"
          cost={overview?.month.cost ?? null}
          requests={overview?.month.requests ?? null}
          loading={overviewLoading}
        />
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">Cost over time</h2>
          <PeriodToggle value={period} onChange={setPeriod} />
        </div>
        <div className="mt-4">
          {seriesError ? (
            <ErrorBanner message={seriesError} />
          ) : seriesLoading ? (
            <Skeleton className="h-72 w-full" />
          ) : (
            <CostTimeChart data={series} />
          )}
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">Cost by feature tag</h2>
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
          {tagError ? (
            <ErrorBanner message={tagError} />
          ) : tagLoading ? (
            <Skeleton className="h-72 w-full" />
          ) : (
            <CostByTagChart
              data={tagData}
              selectedTag={selectedTag}
              onSelect={setSelectedTag}
            />
          )}
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">
            Top prompt templates
          </h2>
          {selectedTag && (
            <span className="text-xs text-slate-500">
              Filtered to <span className="font-mono">{selectedTag}</span>
            </span>
          )}
        </div>
        {templatesError ? (
          <ErrorBanner message={templatesError} />
        ) : templatesLoading ? (
          <Skeleton className="h-48 w-full" />
        ) : (
          <TopTemplatesTable rows={templates} filterTag={selectedTag} />
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

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      {message}
    </div>
  );
}
