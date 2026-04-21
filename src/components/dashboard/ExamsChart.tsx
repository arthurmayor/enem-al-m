import {
  CartesianGrid,
  Line,
  LineChart,
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
        <LineChart
          data={data}
          margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
        >
          <CartesianGrid vertical={false} stroke="#E8E6E1" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11, fill: "#888780" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            domain={[0, 100]}
            tick={{ fontSize: 11, fill: "#888780" }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => `${v}%`}
          />
          <Tooltip
            cursor={{ stroke: "#E8E6E1", strokeWidth: 1 }}
            contentStyle={{
              borderRadius: 8,
              border: "1px solid #E8E6E1",
              fontSize: 12,
            }}
            formatter={(value: number) => [`${Math.round(value)}%`, "Nota"]}
          />
          <Line
            type="monotone"
            dataKey="pctAcerto"
            name="Nota"
            stroke="#D85A30"
            strokeWidth={2.5}
            dot={{ r: 5, fill: "#D85A30", stroke: "#fff", strokeWidth: 2 }}
            activeDot={{ r: 6 }}
            connectNulls
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
