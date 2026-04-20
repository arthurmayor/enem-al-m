interface SubjectSelectProps {
  value: string;
  onChange: (value: string) => void;
  subjects: string[];
  className?: string;
}

export default function SubjectSelect({
  value,
  onChange,
  subjects,
  className = "",
}: SubjectSelectProps) {
  const options = ["Geral", ...subjects.filter((s) => s && s !== "Geral")];

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`border border-[#E8E6E1] rounded-lg text-[13px] font-medium text-[#2C2C2A] bg-white px-[10px] py-1 focus:outline-none focus:border-coral transition-colors ${className}`}
    >
      {options.map((subj) => (
        <option key={subj} value={subj}>
          {subj}
        </option>
      ))}
    </select>
  );
}
