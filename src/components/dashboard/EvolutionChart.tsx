import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { EvolutionPoint } from "@/hooks/dashboard/useQuestionsEvolution";

interface Props {
  data: EvolutionPoint[];
  height?: number;
}

export default function EvolutionChart({ data, height = 200 }: Props) {
  if (!data || data.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-[13px] text-[#B4B2A9]"
        style={{ height }}
      >
        Sem dados suficientes para mostrar a evolução.
      </div>
    );
  }

  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer>
        <AreaChart
          data={data}
          margin={{ top: 12, right: 10, left: -18, bottom: 0 }}
        >
          <defs>
            <linearGradient id="questionsEvolutionFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="hsl(var(--signal-info))" stopOpacity={0.28} />
              <stop offset="100%" stopColor="hsl(var(--signal-info))" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeDasharray="3 6" />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            axisLine={false}
            tickLine={false}
            allowDecimals={false}
          />
          <Tooltip
            cursor={{ stroke: "hsl(var(--border))", strokeWidth: 1, strokeDasharray: "4 4" }}
            contentStyle={{
              borderRadius: 16,
              border: "1px solid hsl(var(--border))",
              fontSize: 12,
              background: "hsl(var(--background) / 0.96)",
              boxShadow: "0 18px 40px -28px hsl(var(--foreground) / 0.25)",
            }}
            formatter={(v: number) => [`${v} questões`, "Respondidas"]}
          />
          <Area
            type="monotone"
            dataKey="count"
            stroke="hsl(var(--signal-info))"
            fill="url(#questionsEvolutionFill)"
            strokeWidth={2.5}
            dot={{ r: 3, fill: "hsl(var(--signal-info))", stroke: "hsl(var(--background))", strokeWidth: 2 }}
            activeDot={{ r: 5, fill: "hsl(var(--signal-info))", stroke: "hsl(var(--background))", strokeWidth: 3 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
