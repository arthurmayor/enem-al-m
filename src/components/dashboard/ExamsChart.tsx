import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
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

interface BucketPoint {
  date: string;
  count: number;
  pctAcerto: number | null;
}

function bucketize(data: ExamPoint[]): BucketPoint[] {
  const map = new Map<string, BucketPoint>();
  for (const p of data) {
    const cur = map.get(p.date);
    if (cur) {
      cur.count += 1;
      cur.pctAcerto = p.pctAcerto;
    } else {
      map.set(p.date, {
        date: p.date,
        count: 1,
        pctAcerto: p.pctAcerto,
      });
    }
  }
  return Array.from(map.values());
}

export default function ExamsChart({ data, height = 220 }: Props) {
  if (!data || data.length === 0) return null;

  const bucketed = bucketize(data);
  const maxCount = Math.max(1, ...bucketed.map((b) => b.count));

  return (
    <div>
      <div style={{ width: "100%", height }}>
        <ResponsiveContainer>
          <ComposedChart
            data={bucketed}
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
              yAxisId="left"
              domain={[0, 100]}
              tick={{ fontSize: 11, fill: "#888780" }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => `${v}%`}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              domain={[0, Math.max(4, maxCount + 1)]}
              allowDecimals={false}
              tick={{ fontSize: 11, fill: "#888780" }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              contentStyle={{
                borderRadius: 8,
                border: "1px solid #E8E6E1",
                fontSize: 12,
              }}
              formatter={(value: number, name: string) => {
                if (name === "% acerto") return [`${Math.round(value)}%`, name];
                return [value, name];
              }}
            />
            <Bar
              yAxisId="right"
              dataKey="count"
              name="Simulados realizados"
              fill="#D3D1C7"
              radius={[4, 4, 0, 0]}
              barSize={18}
            />
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="pctAcerto"
              name="% acerto"
              stroke="#D85A30"
              strokeWidth={2.5}
              dot={{ r: 5, fill: "#D85A30", stroke: "#fff", strokeWidth: 2 }}
              activeDot={{ r: 6 }}
              connectNulls
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div className="flex gap-4 mt-2 text-[11px] text-[#888780]">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-coral" />
          % acerto
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-[#D3D1C7]" />
          Simulados realizados
        </span>
      </div>
    </div>
  );
}
