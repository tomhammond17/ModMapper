import { FileText, FileCode, File } from "lucide-react";
import type { ModbusFileFormat, ModbusSourceFormat } from "@shared/schema";

interface FormatSelectorProps {
  selectedFormat: ModbusFileFormat;
  onFormatChange: (format: ModbusFileFormat) => void;
  disabled?: boolean;
  sourceFormat?: ModbusSourceFormat | null;
}

const formats: { value: ModbusFileFormat; label: string; icon: typeof FileText }[] = [
  { value: "csv", label: "CSV", icon: FileText },
  { value: "json", label: "JSON", icon: FileCode },
  { value: "xml", label: "XML", icon: File },
];

export function FormatSelector({
  selectedFormat,
  onFormatChange,
  disabled,
  sourceFormat,
}: FormatSelectorProps) {
  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-medium text-muted-foreground">
        Output Format
      </label>
      <div className="inline-flex rounded-md overflow-hidden border border-secondary/50">
        {formats.map((format, index) => {
          const Icon = format.icon;
          const isSelected = selectedFormat === format.value;
          const isSource = sourceFormat === format.value;

          return (
            <button
              key={format.value}
              onClick={() => onFormatChange(format.value)}
              disabled={disabled}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors ${
                index > 0 ? "border-l border-secondary/50" : ""
              } ${
                isSelected
                  ? "bg-primary text-primary-foreground"
                  : "bg-card text-foreground hover-elevate"
              } ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
              data-testid={`button-format-${format.value}`}
            >
              <Icon className="h-4 w-4" />
              {format.label}
              {isSource && !isSelected && (
                <span className="text-xs text-muted-foreground">(source)</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
