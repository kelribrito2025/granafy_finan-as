import { useTheme, type Theme } from "@/contexts/ThemeContext";

const options: Array<{ value: Theme; label: string }> = [
  { value: "light", label: "Claro" },
  { value: "dark", label: "Escuro" },
];

export function ThemeToggle({ className = "", showLabel = true }: { className?: string; showLabel?: boolean }) {
  const { theme, setTheme } = useTheme();

  return (
    <div className={`theme-toggle flex items-center gap-3 ${className}`}>
      {showLabel && <span className="theme-toggle-label text-[11.5px] font-semibold">Aparência</span>}
      <div
        role="group"
        aria-label="Tema da interface"
        className="theme-toggle-options ml-auto grid grid-cols-2 rounded-[11px] p-1"
      >
        {options.map(option => (
          <button
            key={option.value}
            type="button"
            aria-pressed={theme === option.value}
            onClick={() => setTheme?.(option.value)}
            className={`min-w-[60px] rounded-[8px] px-2.5 py-1.5 text-[10.5px] font-bold transition-colors active:scale-[.97] ${
              theme === option.value ? "theme-toggle-active" : "theme-toggle-inactive"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
