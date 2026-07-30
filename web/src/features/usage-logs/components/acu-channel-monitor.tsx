import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  CircleOff,
  Clock3,
  Gauge,
  HeartPulse,
  Network,
  RefreshCw,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useIsAdmin } from "@/hooks/use-admin";

import {
  getACUChannelMonitor,
  pauseACUChannel,
  type ACUChannelMonitorProfile,
} from "../api";

function ms(value?: number) {
  if (!value) return "n/a";
  return value < 1000
    ? `${Math.round(value)} ms`
    : `${(value / 1000).toFixed(1)} s`;
}

function stateTone(state: string) {
  if (state === "healthy") return "secondary";
  if (state === "degraded" || state === "half_open") return "outline";
  return "destructive";
}

function profileFilterValues(
  profiles: ACUChannelMonitorProfile[],
  key: "model" | "provider" | "protocol" | "state",
) {
  if (key === "model") return profiles.map((item) => item.canonicalModel);
  if (key === "protocol") return profiles.flatMap((item) => item.protocol);
  return profiles.map((item) => item[key]);
}

export function ACUChannelMonitor() {
  const { t } = useTranslation();
  const isAdmin = useIsAdmin();
  const queryClient = useQueryClient();
  const [range, setRange] = useState<"1h" | "24h" | "7d">("1h");
  const [filters, setFilters] = useState({
    model: "",
    provider: "",
    protocol: "",
    state: "",
  });
  const query = useQuery({
    queryKey: ["acu-channel-monitor", range],
    queryFn: () => getACUChannelMonitor(range),
    refetchInterval: 60_000,
  });
  const pause = useMutation({
    mutationFn: ({
      channel,
      duration,
    }: {
      channel: string;
      duration: 30 | 120;
    }) => pauseACUChannel(channel, duration),
    onSuccess: () => {
      toast.success(t("Channel paused"));
      void queryClient.invalidateQueries({ queryKey: ["acu-channel-monitor"] });
    },
    onError: () => toast.error(t("Channel pause failed")),
  });
  const profiles = useMemo(
    () =>
      (query.data?.data?.profiles ?? []).filter(
        (profile) =>
          (!filters.model || profile.canonicalModel === filters.model) &&
          (!filters.provider || profile.provider === filters.provider) &&
          (!filters.protocol || profile.protocol.includes(filters.protocol)) &&
          (!filters.state || profile.state === filters.state),
      ),
    [filters, query.data],
  );
  const allProfiles = query.data?.data?.profiles ?? [];
  const summary = {
    active: allProfiles.filter(
      (item) => item.enabled && item.administratorAllowed,
    ).length,
    providers: new Set(allProfiles.map((item) => item.provider)).size,
    healthy: allProfiles.filter((item) => item.state === "healthy").length,
    degraded: allProfiles.filter(
      (item) => item.state === "degraded" || item.state === "half_open",
    ).length,
    cooldown: allProfiles.filter((item) => item.state === "open").length,
    disabled: allProfiles.filter(
      (item) => item.state === "disabled" || !item.enabled,
    ).length,
  };
  const statItems = [
    [t("Active Profiles"), summary.active, Activity],
    [t("Independent Providers"), summary.providers, Network],
    [t("Healthy"), summary.healthy, HeartPulse],
    [t("Degraded"), summary.degraded, Gauge],
    [t("Cooldown"), summary.cooldown, Clock3],
    [t("Disabled"), summary.disabled, CircleOff],
  ] as const;
  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto overflow-x-hidden pb-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">{t("Channel Monitor")}</h2>
          <p className="text-muted-foreground text-xs">
            {t("Execution supply health, recovery and verified inventory.")}
          </p>
        </div>
        <Button
          variant="outline"
          size="icon"
          title={t("Refresh")}
          onClick={() => void query.refetch()}
        >
          <RefreshCw className="size-4" />
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded border bg-border lg:grid-cols-6">
        {statItems.map(([label, value, Icon]) => (
          <div key={label} className="bg-background min-w-0 p-3">
            <div className="text-muted-foreground flex items-center gap-1.5 text-[11px]">
              <Icon className="size-3.5" />
              {label}
            </div>
            <div className="mt-1 text-sm font-semibold">{value}</div>
          </div>
        ))}
      </div>
      <Tabs defaultValue="current" className="min-w-0">
        <TabsList>
          <TabsTrigger value="current">{t("Current")}</TabsTrigger>
          <TabsTrigger value="history">{t("History")}</TabsTrigger>
          <TabsTrigger value="inventory">{t("Supply inventory")}</TabsTrigger>
        </TabsList>
        <TabsContent value="current" className="min-w-0 space-y-3">
          <div className="flex flex-wrap gap-2">
            {(["model", "protocol", "provider", "state"] as const).map(
              (key) => (
                <select
                  key={key}
                  aria-label={key}
                  className="bg-background h-8 rounded border px-2 text-xs"
                  value={filters[key]}
                  onChange={(event) =>
                    setFilters((current) => ({
                      ...current,
                      [key]: event.target.value,
                    }))
                  }
                >
                  <option value="">
                    {t("All")} {key}
                  </option>
                  {[...new Set(profileFilterValues(allProfiles, key))]
                    .filter(Boolean)
                    .sort()
                    .map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                </select>
              ),
            )}
          </div>
          <MonitorTable
            profiles={profiles}
            canPause={isAdmin}
            onPause={(channel, duration) => pause.mutate({ channel, duration })}
          />
        </TabsContent>
        <TabsContent value="history" className="min-w-0 space-y-3">
          <div className="flex gap-1">
            {(["1h", "24h", "7d"] as const).map((value) => (
              <Button
                key={value}
                size="sm"
                variant={range === value ? "default" : "outline"}
                onClick={() => setRange(value)}
              >
                {value}
              </Button>
            ))}
          </div>
          <div className="h-80 min-w-0 rounded border p-3">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={query.data?.data?.history ?? []}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="bucket"
                  tickFormatter={(value) =>
                    new Date(String(value)).toLocaleString([], {
                      month: "2-digit",
                      day: "2-digit",
                      hour: "2-digit",
                    })
                  }
                />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line
                  dataKey="p95_first_model_event_ms"
                  name={t("p95 First Model Event")}
                  stroke="#2563eb"
                  dot={false}
                />
                <Line
                  dataKey="server_error_count"
                  name={t("5xx / 524")}
                  stroke="#e11d48"
                  dot={false}
                />
                <Line
                  dataKey="watchdog_count"
                  name={t("Watchdog")}
                  stroke="#f97316"
                  dot={false}
                />
                <Line
                  dataKey="recovery_count"
                  name={t("Recovery")}
                  stroke="#0f766e"
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </TabsContent>
        <TabsContent value="inventory" className="min-w-0">
          <InventoryTable rows={query.data?.data?.supplyInventory ?? []} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function MonitorTable(props: {
  profiles: ACUChannelMonitorProfile[];
  canPause: boolean;
  onPause: (channel: string, duration: 30 | 120) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="max-w-full overflow-x-auto rounded border">
      <table className="w-full min-w-[1180px] text-left text-xs">
        <thead className="bg-muted/50">
          <tr>
            {[
              "Model",
              "Protocol",
              "Provider / Channel",
              "Multiplier",
              "State",
              "Success",
              "Failures",
              "p50 / p95",
              "Last error",
              "Last success",
              "Cooldown",
              "Eligible",
              ...(props.canPause ? ["Actions"] : []),
            ].map((label) => (
              <th key={label} className="px-3 py-2 font-medium">
                {t(label)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {props.profiles.map((profile) => (
            <tr key={profile.executionProfileId} className="border-t align-top">
              <td className="px-3 py-2 font-medium">
                {profile.canonicalModel}
              </td>
              <td className="px-3 py-2">{profile.protocol.join(", ")}</td>
              <td className="px-3 py-2">
                <div>{profile.provider}</div>
                <div className="text-muted-foreground">{profile.channel}</div>
              </td>
              <td className="px-3 py-2">{profile.multiplier || t("n/a")}</td>
              <td className="px-3 py-2">
                <Badge variant={stateTone(profile.state)}>
                  {profile.state}
                </Badge>
              </td>
              <td className="px-3 py-2">
                {((profile.recentSuccessRate ?? 0) * 100).toFixed(0)}%
              </td>
              <td className="px-3 py-2">{profile.consecutiveFailures}</td>
              <td className="px-3 py-2">
                {ms(profile.p50FirstModelEventLatencyMs)} /{" "}
                {ms(profile.p95FirstModelEventLatencyMs)}
              </td>
              <td
                className="max-w-40 truncate px-3 py-2"
                title={profile.lastError}
              >
                {profile.lastError || t("none")}
              </td>
              <td className="px-3 py-2">
                {profile.lastSuccessAt
                  ? new Date(profile.lastSuccessAt).toLocaleString()
                  : t("n/a")}
              </td>
              <td className="px-3 py-2">
                {profile.cooldownUntil
                  ? new Date(profile.cooldownUntil).toLocaleString()
                  : t("none")}
              </td>
              <td className="px-3 py-2">
                {profile.routingEligible ? t("yes") : t("no")}
              </td>
              {props.canPause && (
                <td className="px-3 py-2">
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => props.onPause(profile.channel, 30)}
                    >
                      30m
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => props.onPause(profile.channel, 120)}
                    >
                      2h
                    </Button>
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function InventoryTable(props: { rows: Array<Record<string, unknown>> }) {
  const { t } = useTranslation();
  return (
    <div className="max-w-full overflow-x-auto rounded border">
      <table className="w-full min-w-[900px] text-left text-xs">
        <thead className="bg-muted/50">
          <tr>
            {[
              "Provider",
              "Channel",
              "Endpoint",
              "Protocol candidates",
              "Models",
              "Verification",
              "Routing",
            ].map((label) => (
              <th key={label} className="px-3 py-2 font-medium">
                {t(label)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {props.rows.map((row, index) => {
            const models = Array.isArray(row.exactCanonicalMatches)
              ? row.exactCanonicalMatches.join(", ")
              : "";
            const protocols = [
              Array.isArray(row.responsesCandidates) &&
              row.responsesCandidates.length
                ? "Responses"
                : "",
              Array.isArray(row.messagesCandidates) &&
              row.messagesCandidates.length
                ? "Messages"
                : "",
            ]
              .filter(Boolean)
              .join(", ");
            return (
              <tr key={String(row.channelId ?? index)} className="border-t">
                <td className="px-3 py-2">{String(row.providerId ?? "")}</td>
                <td className="px-3 py-2 font-medium">
                  {String(row.channelId ?? "")}
                </td>
                <td className="px-3 py-2">{String(row.endpointHost ?? "")}</td>
                <td className="px-3 py-2">{protocols || t("undetermined")}</td>
                <td className="max-w-96 px-3 py-2">
                  {models || t("no canonical match")}
                </td>
                <td className="px-3 py-2">
                  {String(row.status ?? "discovered")}
                </td>
                <td className="px-3 py-2">
                  {String(row.routingActive ?? "inactive")}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
