import { Area, ComposedChart, Line, ResponsiveContainer, YAxis } from "recharts";

interface SparklineProps {
  /**
   * Time-ordered series (oldest → newest). One slot per time bucket; use
   * `null` for buckets with no data so Recharts breaks the line at the
   * gap and the sparkline visually reflects the real timeline.
   */
  data: (number | null)[];
  color?: string;
  fillColor?: string;
  height?: number;
  strokeWidth?: number;
  showArea?: boolean;
}

/**
 * Minimal non-interactive line chart used inside stat cards. No axes,
 * no tooltip, no grid — just the trend line. Renders nothing if the
 * series has fewer than two non-null points (a single dot wouldn't
 * convey a trend).
 */
export default function Sparkline({
  data,
  color = "#D85A30",
  fillColor,
  height = 28,
  strokeWidth = 1.5,
  showArea = false,
}: SparklineProps) {
  if (!data || data.length < 2) return null;
  const realPoints = data.filter((v): v is number => v != null).length;
  if (realPoints < 2) return null;

  const points = data.map((v, i) => ({ i, v }));

  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer>
        <ComposedChart
          data={points}
          margin={{ top: 2, right: 2, bottom: 2, left: 2 }}
        >
          <YAxis hide domain={["dataMin", "dataMax"]} />
          {showArea && (
            <Area
              type="monotone"
              dataKey="v"
              stroke="none"
              fill={fillColor ?? color}
              fillOpacity={0.12}
              isAnimationActive={false}
              connectNulls={false}
            />
          )}
          <Line
            type="monotone"
            dataKey="v"
            stroke={color}
            strokeWidth={strokeWidth}
            dot={false}
            isAnimationActive={false}
            connectNulls={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
