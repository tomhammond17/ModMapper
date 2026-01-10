import { Download, Copy, FileText, FileCode, File, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import type { ModbusFileFormat, ModbusRegister } from "@shared/schema";
import { formatToCSV, formatToJSON, formatToXML } from "./preview-panel";

interface DownloadSectionProps {
  registers: ModbusRegister[];
  filename: string;
  format: ModbusFileFormat;
}

function getFormatIcon(format: ModbusFileFormat) {
  switch (format) {
    case "csv":
      return <FileText className="h-5 w-5" />;
    case "json":
      return <FileCode className="h-5 w-5" />;
    case "xml":
      return <File className="h-5 w-5" />;
  }
}

function getContentType(format: ModbusFileFormat): string {
  switch (format) {
    case "csv":
      return "text/csv";
    case "json":
      return "application/json";
    case "xml":
      return "application/xml";
  }
}

function getFileContent(registers: ModbusRegister[], format: ModbusFileFormat): string {
  switch (format) {
    case "csv":
      return formatToCSV(registers);
    case "json":
      return formatToJSON(registers);
    case "xml":
      return formatToXML(registers);
  }
}

function formatFileSize(content: string): string {
  const bytes = new Blob([content]).size;
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

export function DownloadSection({ registers, filename, format }: DownloadSectionProps) {
  const [copied, setCopied] = useState(false);
  const content = getFileContent(registers, format);
  const fileSize = formatFileSize(content);

  const baseFilename = filename.replace(/\.[^/.]+$/, "");
  const outputFilename = `${baseFilename}.${format}`;

  const handleDownload = () => {
    const blob = new Blob([content], { type: getContentType(format) });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = outputFilename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4 pb-4">
        <CardTitle className="text-lg">Download</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-4 p-4 bg-muted/30 rounded-md">
          <div className="flex items-center justify-center w-12 h-12 rounded-md bg-primary/10">
            {getFormatIcon(format)}
          </div>
          <div className="flex-1 min-w-0">
            <p
              className="font-medium truncate"
              data-testid="text-output-filename"
            >
              {outputFilename}
            </p>
            <div className="flex flex-wrap items-center gap-2 mt-1">
              <Badge variant="outline" data-testid="badge-output-format">
                {format.toUpperCase()}
              </Badge>
              <Badge variant="secondary" data-testid="badge-output-size">
                {fileSize}
              </Badge>
              <Badge variant="secondary" data-testid="badge-record-count">
                {registers.length} records
              </Badge>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            onClick={handleDownload}
            className="bg-success hover:bg-success/90"
            data-testid="button-download"
          >
            <Download className="h-4 w-4 mr-2" />
            Download {format.toUpperCase()}
          </Button>
          <Button
            variant="outline"
            onClick={handleCopy}
            data-testid="button-copy"
          >
            {copied ? (
              <>
                <Check className="h-4 w-4 mr-2" />
                Copied!
              </>
            ) : (
              <>
                <Copy className="h-4 w-4 mr-2" />
                Copy to Clipboard
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
