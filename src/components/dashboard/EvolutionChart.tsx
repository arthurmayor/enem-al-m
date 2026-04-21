import {
  CartesianGrid,
  Line,
  LineChart,
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
        <LineChart
          data={data}
          margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
        >
          <CartesianGrid vertical={false} stroke="#E8E6E1" />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: "#888780" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "#888780" }}
            axisLine={false}
            tickLine={false}
            allowDecimals={false}
          />
          <Tooltip
            cursor={{ stroke: "#E8E6E1", strokeWidth: 1 }}
            contentStyle={{
              borderRadius: 8,
              border: "1px solid #E8E6E1",
              fontSize: 12,
            }}
            formatter={(v: number) => [`${v} questões`, "Respondidas"]}
          />
          <Line
            type="monotone"
            dataKey="count"
            stroke="#D85A30"
            strokeWidth={2.5}
            dot={{ r: 3, fill: "#D85A30" }}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
