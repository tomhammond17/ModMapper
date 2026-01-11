import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { TemplateConfig } from "@/hooks/use-templates";

interface FormatSettingsProps {
  format: "csv" | "json" | "xml";
  config: TemplateConfig;
  onChange: (config: TemplateConfig) => void;
}

export function FormatSettings({ format, config, onChange }: FormatSettingsProps) {
  if (format === "csv") {
    return (
      <div className="space-y-4">
        <div className="space-y-2">
          <Label>Delimiter</Label>
          <Select
            value={config.csv?.delimiter || ","}
            onValueChange={(value) =>
              onChange({
                ...config,
                csv: { ...config.csv, delimiter: value },
              })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value=",">Comma (,)</SelectItem>
              <SelectItem value=";">Semicolon (;)</SelectItem>
              <SelectItem value="\t">Tab</SelectItem>
              <SelectItem value="|">Pipe (|)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <Label>Include Header Row</Label>
            <p className="text-xs text-muted-foreground">
              Add column names as the first row
            </p>
          </div>
          <Switch
            checked={config.csv?.includeHeader !== false}
            onCheckedChange={(checked) =>
              onChange({
                ...config,
                csv: { ...config.csv, includeHeader: checked },
              })
            }
          />
        </div>
      </div>
    );
  }

  if (format === "json") {
    return (
      <div className="space-y-4">
        <div className="space-y-2">
          <Label>Root Key</Label>
          <Input
            placeholder="registers"
            value={config.json?.rootKey || ""}
            onChange={(e) =>
              onChange({
                ...config,
                json: { ...config.json, rootKey: e.target.value || "registers" },
              })
            }
          />
          <p className="text-xs text-muted-foreground">
            The key name for the array of registers
          </p>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <Label>Pretty Print</Label>
            <p className="text-xs text-muted-foreground">
              Format JSON with indentation
            </p>
          </div>
          <Switch
            checked={config.json?.prettyPrint !== false}
            onCheckedChange={(checked) =>
              onChange({
                ...config,
                json: { ...config.json, prettyPrint: checked },
              })
            }
          />
        </div>
      </div>
    );
  }

  if (format === "xml") {
    return (
      <div className="space-y-4">
        <div className="space-y-2">
          <Label>Root Element</Label>
          <Input
            placeholder="ModbusRegisters"
            value={config.xml?.rootElement || ""}
            onChange={(e) =>
              onChange({
                ...config,
                xml: { ...config.xml, rootElement: e.target.value || "ModbusRegisters" },
              })
            }
          />
        </div>

        <div className="space-y-2">
          <Label>Item Element</Label>
          <Input
            placeholder="Register"
            value={config.xml?.itemElement || ""}
            onChange={(e) =>
              onChange({
                ...config,
                xml: { ...config.xml, itemElement: e.target.value || "Register" },
              })
            }
          />
        </div>

        <div className="flex items-center justify-between">
          <div>
            <Label>Use Attributes</Label>
            <p className="text-xs text-muted-foreground">
              Use XML attributes instead of child elements
            </p>
          </div>
          <Switch
            checked={config.xml?.useAttributes || false}
            onCheckedChange={(checked) =>
              onChange({
                ...config,
                xml: { ...config.xml, useAttributes: checked },
              })
            }
          />
        </div>
      </div>
    );
  }

  return null;
}
