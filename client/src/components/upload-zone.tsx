import { useCallback, useState } from "react";
import { Upload, FileCheck, X, FileText, FileCode, File } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { ModbusFileFormat } from "@shared/schema";

interface UploadZoneProps {
  onFileSelect: (file: File) => void;
  isProcessing: boolean;
  selectedFile: File | null;
  onClear: () => void;
}

function getFileIcon(format: ModbusFileFormat | null) {
  switch (format) {
    case "csv":
      return <FileText className="h-12 w-12 text-success" />;
    case "json":
      return <FileCode className="h-12 w-12 text-primary" />;
    case "xml":
      return <File className="h-12 w-12 text-warning" />;
    default:
      return <Upload className="h-12 w-12 text-muted-foreground" />;
  }
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

function getFormatFromFilename(filename: string): ModbusFileFormat | null {
  const ext = filename.split(".").pop()?.toLowerCase();
  if (ext === "csv") return "csv";
  if (ext === "json") return "json";
  if (ext === "xml") return "xml";
  return null;
}

export function UploadZone({
  onFileSelect,
  isProcessing,
  selectedFile,
  onClear,
}: UploadZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) {
        onFileSelect(file);
      }
    },
    [onFileSelect]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        onFileSelect(file);
      }
    },
    [onFileSelect]
  );

  const format = selectedFile
    ? getFormatFromFilename(selectedFile.name)
    : null;

  return (
    <div
      className={`relative border-2 border-dashed rounded-md p-8 md:p-12 text-center transition-all duration-200 ${
        isDragOver
          ? "border-primary bg-primary/5 scale-[1.01]"
          : selectedFile
            ? "border-success/50 bg-success/5"
            : "border-secondary/50 bg-card"
      }`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      data-testid="upload-zone"
    >
      <input
        type="file"
        accept=".csv,.xml,.json"
        onChange={handleFileInput}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        disabled={isProcessing}
        data-testid="input-file-upload"
      />

      {selectedFile ? (
        <div className="space-y-4">
          <div className="flex justify-center">
            <div className="relative">
              {getFileIcon(format)}
              <div className="absolute -top-1 -right-1">
                <FileCheck className="h-5 w-5 text-success" />
              </div>
            </div>
          </div>
          <div className="space-y-2">
            <p
              className="text-lg font-medium text-foreground truncate max-w-md mx-auto"
              data-testid="text-filename"
            >
              {selectedFile.name}
            </p>
            <div className="flex items-center justify-center gap-3">
              <Badge variant="secondary" data-testid="badge-file-size">
                {formatFileSize(selectedFile.size)}
              </Badge>
              {format && (
                <Badge variant="outline" data-testid="badge-file-format">
                  {format.toUpperCase()}
                </Badge>
              )}
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onClear();
            }}
            disabled={isProcessing}
            data-testid="button-clear-file"
          >
            <X className="h-4 w-4 mr-2" />
            Clear selection
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex justify-center">
            <Upload className="h-12 w-12 text-muted-foreground" />
          </div>
          <div className="space-y-2">
            <p className="text-lg font-medium text-foreground">
              Drag & drop files or click to browse
            </p>
            <p className="text-sm text-muted-foreground">
              Supports CSV, XML, and JSON formats
            </p>
          </div>
          <Button variant="default" size="default" data-testid="button-browse">
            <Upload className="h-4 w-4 mr-2" />
            Select File
          </Button>
        </div>
      )}
    </div>
  );
}
