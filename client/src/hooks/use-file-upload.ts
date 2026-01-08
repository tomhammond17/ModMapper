import { useState, useCallback } from "react";
import type { ModbusSourceFormat } from "@shared/schema";

export interface UseFileUploadResult {
  selectedFile: File | null;
  sourceFormat: ModbusSourceFormat | null;
  filename: string;
  handleFileSelect: (file: File) => void;
  clearFile: () => void;
}

function detectFormat(filename: string): ModbusSourceFormat | null {
  const ext = filename.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "csv":
      return "csv";
    case "json":
      return "json";
    case "xml":
      return "xml";
    case "pdf":
      return "pdf";
    default:
      return null;
  }
}

export function useFileUpload(): UseFileUploadResult {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [sourceFormat, setSourceFormat] = useState<ModbusSourceFormat | null>(null);
  const [filename, setFilename] = useState<string>("");

  const handleFileSelect = useCallback((file: File) => {
    setSelectedFile(file);
    setFilename(file.name);
    setSourceFormat(detectFormat(file.name));
  }, []);

  const clearFile = useCallback(() => {
    setSelectedFile(null);
    setSourceFormat(null);
    setFilename("");
  }, []);

  return {
    selectedFile,
    sourceFormat,
    filename,
    handleFileSelect,
    clearFile,
  };
}
