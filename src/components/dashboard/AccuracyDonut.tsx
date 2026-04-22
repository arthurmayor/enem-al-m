import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";

interface AccuracyDonutProps {
  accuracyPct: number | null;
  size?: number;
}

const OK = "hsl(var(--success))";
const ERR = "hsl(var(--chart-violet))";
const EMPTY = "hsl(var(--muted))";

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
      <div className="absolute inset-[10%] rounded-full border border-border/60 bg-background/85 shadow-[inset_0_1px_0_hsl(var(--background)),0_18px_36px_-26px_hsl(var(--chart-violet)/0.4)]" />
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
        <span className="text-[12px] font-bold text-foreground leading-none tracking-[-0.03em]">
          {hasData ? `${pct}%` : "—"}
        </span>
      </div>
    </div>
  );
}
