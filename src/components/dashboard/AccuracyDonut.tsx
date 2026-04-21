import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";

interface AccuracyDonutProps {
  accuracyPct: number | null;
  size?: number;
}

const OK = "#059669";
const ERR = "#DC2626";
const EMPTY = "#E8E6E1";

/**
 * Mini donut showing % acerto vs % erro. When accuracy is null we render a
 * neutral grey ring so the layout stays consistent.
 */
export default function AccuracyDonut({
  accuracyPct,
  size = 64,
}: AccuracyDonutProps) {
  const hasData = accuracyPct != null;
  const pct = hasData ? Math.max(0, Math.min(100, accuracyPct!)) : 0;

  const data = hasData
    ? [
        { name: "acerto", value: pct },
        { name: "erro", value: 100 - pct },
      ]
    : [{ name: "empty", value: 100 }];

  const colors = hasData ? [OK, ERR] : [EMPTY];

  return (
    <div
      style={{ width: size, height: size }}
      className="relative shrink-0"
      aria-label={
        hasData ? `${pct}% de acertos` : "Sem dados de acerto ainda"
      }
    >
      <ResponsiveContainer>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={size * 0.32}
            outerRadius={size * 0.48}
            startAngle={90}
            endAngle={-270}
            paddingAngle={hasData ? 2 : 0}
            dataKey="value"
            stroke="none"
            isAnimationActive={false}
          >
            {data.map((_, i) => (
              <Cell key={i} fill={colors[i % colors.length]} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-[12px] font-bold text-[#2C2C2A] leading-none">
          {hasData ? `${pct}%` : "—"}
        </span>
      </div>
    </div>
  );
}
