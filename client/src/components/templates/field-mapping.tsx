import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import type { TemplateConfig } from "@/hooks/use-templates";

const AVAILABLE_FIELDS = [
  { key: "address", label: "Address" },
  { key: "name", label: "Name" },
  { key: "datatype", label: "Data Type" },
  { key: "description", label: "Description" },
  { key: "writable", label: "Writable" },
];

interface FieldMappingProps {
  config: TemplateConfig;
  onChange: (config: TemplateConfig) => void;
}

export function FieldMapping({ config, onChange }: FieldMappingProps) {
  const showFields = config.showFields ?? AVAILABLE_FIELDS.map((f) => f.key);
  const fieldMapping = config.fieldMapping ?? {};

  const handleFieldToggle = (fieldKey: string, checked: boolean) => {
    const newShowFields = checked
      ? [...showFields, fieldKey]
      : showFields.filter((f) => f !== fieldKey);

    onChange({
      ...config,
      showFields: newShowFields,
    });
  };

  const handleFieldRename = (fieldKey: string, newName: string) => {
    onChange({
      ...config,
      fieldMapping: {
        ...fieldMapping,
        [fieldKey]: newName || fieldKey,
      },
    });
  };

  return (
    <div className="space-y-4">
      <div>
        <Label className="text-sm font-medium">Include Fields</Label>
        <p className="text-xs text-muted-foreground mb-3">
          Select which fields to include in the export and optionally rename them.
        </p>
      </div>

      <div className="space-y-3">
        {AVAILABLE_FIELDS.map((field) => {
          const isEnabled = showFields.includes(field.key);
          const mappedName = fieldMapping[field.key] || "";

          return (
            <div key={field.key} className="flex items-center gap-4">
              <div className="flex items-center gap-2 w-32">
                <Checkbox
                  id={`field-${field.key}`}
                  checked={isEnabled}
                  onCheckedChange={(checked) =>
                    handleFieldToggle(field.key, checked === true)
                  }
                />
                <Label
                  htmlFor={`field-${field.key}`}
                  className="text-sm cursor-pointer"
                >
                  {field.label}
                </Label>
              </div>
              <Input
                placeholder={`Rename to... (default: ${field.key})`}
                value={mappedName}
                onChange={(e) => handleFieldRename(field.key, e.target.value)}
                disabled={!isEnabled}
                className="flex-1 h-8 text-sm"
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
