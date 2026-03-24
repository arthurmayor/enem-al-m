interface Props {
  current: number;
  total: number;
}

const ProgressIndicator = ({ current, total }: Props) => {
  return (
    <div className="flex items-center gap-1.5">
      {Array.from({ length: total }, (_, i) => {
        const step = i + 1;
        const isActive = step <= current;
        return (
          <div
            key={step}
            className={`h-1 flex-1 rounded-full transition-all duration-500 ${
              isActive ? "bg-foreground" : "bg-border"
            }`}
          />
        );
      })}
    </div>
  );
};

export default ProgressIndicator;
