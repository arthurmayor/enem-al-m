import type { ReactNode } from "react";

interface StatCardProps {
  label: string;
  children: ReactNode;
  className?: string;
}

export default function StatCard({ label, children, className = "" }: StatCardProps) {
  return (
    <div
      className={`bg-white border border-[#E8E6E1] rounded-[14px] px-[18px] py-4 ${className}`}
    >
      <div className="text-[11px] font-semibold uppercase tracking-[0.5px] text-[#888780] mb-1.5">
        {label}
      </div>
      {children}
    </div>
  );
}
