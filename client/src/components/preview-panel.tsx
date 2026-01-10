import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileText, FileCode, File, Eye } from "lucide-react";
import type { ModbusFileFormat, ModbusRegister } from "@shared/schema";

interface PreviewPanelProps {
  registers: ModbusRegister[];
  format: ModbusFileFormat;
}

function formatToCSV(registers: ModbusRegister[]): string {
  const header = "address,name,datatype,description,writable";
  const rows = registers.map((r) => {
    const desc = r.description.includes(",") || r.description.includes('"')
      ? `"${r.description.replace(/"/g, '""')}"`
      : r.description;
    const name = r.name.includes(",") || r.name.includes('"')
      ? `"${r.name.replace(/"/g, '""')}"`
      : r.name;
    return `${r.address},${name},${r.datatype},${desc},${r.writable}`;
  });
  return [header, ...rows].join("\n");
}

function formatToJSON(registers: ModbusRegister[]): string {
  return JSON.stringify({ registers }, null, 2);
}

function formatToXML(registers: ModbusRegister[]): string {
  const escapeXml = (str: string) =>
    str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");

  const registerXml = registers
    .map(
      (r) => `  <register>
    <address>${r.address}</address>
    <name>${escapeXml(r.name)}</name>
    <datatype>${r.datatype}</datatype>
    <description>${escapeXml(r.description)}</description>
    <writable>${r.writable}</writable>
  </register>`
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<modbusConfiguration>
${registerXml}
</modbusConfiguration>`;
}

function getFormatIcon(format: ModbusFileFormat) {
  switch (format) {
    case "csv":
      return <FileText className="h-4 w-4" />;
    case "json":
      return <FileCode className="h-4 w-4" />;
    case "xml":
      return <File className="h-4 w-4" />;
  }
}

function getPreviewContent(registers: ModbusRegister[], format: ModbusFileFormat): string {
  switch (format) {
    case "csv":
      return formatToCSV(registers);
    case "json":
      return formatToJSON(registers);
    case "xml":
      return formatToXML(registers);
    default:
      return "";
  }
}

export function PreviewPanel({ registers, format }: PreviewPanelProps) {
  const previewContent = getPreviewContent(registers, format);
  const lineCount = previewContent.split("\n").length;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4 pb-4">
        <div className="flex items-center gap-2">
          <Eye className="h-5 w-5 text-muted-foreground" />
          <CardTitle className="text-lg">Preview</CardTitle>
        </div>
        <div className="flex items-center gap-2">
          {getFormatIcon(format)}
          <Badge variant="outline" data-testid="badge-preview-format">
            {format.toUpperCase()}
          </Badge>
          <Badge variant="secondary" data-testid="badge-line-count">
            {lineCount} lines
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="formatted" className="w-full">
          <TabsList className="mb-4">
            <TabsTrigger value="formatted" data-testid="tab-formatted">
              Formatted
            </TabsTrigger>
            <TabsTrigger value="raw" data-testid="tab-raw">
              Raw
            </TabsTrigger>
          </TabsList>
          <TabsContent value="formatted">
            <ScrollArea className="h-64 w-full rounded-md border bg-muted/30">
              <pre
                className="p-4 text-sm font-mono whitespace-pre-wrap break-words"
                data-testid="preview-formatted"
              >
                {previewContent}
              </pre>
            </ScrollArea>
          </TabsContent>
          <TabsContent value="raw">
            <ScrollArea className="h-64 w-full rounded-md border bg-muted/30">
              <pre
                className="p-4 text-xs font-mono whitespace-pre break-all"
                data-testid="preview-raw"
              >
                {previewContent}
              </pre>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

export { formatToCSV, formatToJSON, formatToXML };
