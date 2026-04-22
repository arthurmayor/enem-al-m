import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ExamPoint } from "@/hooks/dashboard/useExamsEvolution";

interface Props {
  data: ExamPoint[];
  height?: number;
}

export default function ExamsChart({ data, height = 220 }: Props) {
  if (!data || data.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-[13px] text-[#B4B2A9] text-center px-4"
        style={{ height }}
      >
        Faça um simulado para ver sua evolução.
      </div>
    );
  }

  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer>
        <AreaChart
          data={data}
          margin={{ top: 12, right: 10, left: -10, bottom: 0 }}
        >
          <defs>
            <linearGradient id="examsEvolutionFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="hsl(var(--chart-violet))" stopOpacity={0.28} />
              <stop offset="100%" stopColor="hsl(var(--chart-violet))" stopOpacity={0.03} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeDasharray="3 6" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            domain={[0, 100]}
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => `${v}%`}
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
            formatter={(value: number) => [`${Math.round(value)}%`, "Nota"]}
          />
          <Area
            type="monotone"
            dataKey="pctAcerto"
            name="Nota"
            stroke="hsl(var(--chart-violet))"
            fill="url(#examsEvolutionFill)"
            strokeWidth={2.5}
            dot={{ r: 5, fill: "hsl(var(--chart-violet))", stroke: "hsl(var(--background))", strokeWidth: 2 }}
            activeDot={{ r: 6, fill: "hsl(var(--chart-violet))", stroke: "hsl(var(--background))", strokeWidth: 3 }}
            connectNulls
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
