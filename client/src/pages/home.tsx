import { useState, useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import { Cpu, ArrowRight } from "lucide-react";
import { UploadZone } from "@/components/upload-zone";
import { FormatSelector } from "@/components/format-selector";
import { ConversionControls } from "@/components/conversion-controls";
import { RegisterTable } from "@/components/register-table";
import { PreviewPanel } from "@/components/preview-panel";
import { DownloadSection } from "@/components/download-section";
import { ThemeToggle } from "@/components/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { ModbusRegister, ModbusFileFormat, ConversionResult } from "@shared/schema";

type ConversionStep = "upload" | "converting" | "preview";

export default function Home() {
  const { toast } = useToast();
  const [step, setStep] = useState<ConversionStep>("upload");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [sourceFormat, setSourceFormat] = useState<ModbusFileFormat | null>(null);
  const [targetFormat, setTargetFormat] = useState<ModbusFileFormat>("json");
  const [registers, setRegisters] = useState<ModbusRegister[]>([]);
  const [filename, setFilename] = useState<string>("");
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState<string>("");

  const parseMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/parse", {
        method: "POST",
        body: formData,
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to parse file");
      }
      return response.json() as Promise<ConversionResult>;
    },
    onSuccess: (data) => {
      setRegisters(data.registers);
      setSourceFormat(data.sourceFormat);
      setFilename(data.filename);
      if (data.sourceFormat !== targetFormat) {
        setStep("preview");
      } else {
        const nextFormat = data.sourceFormat === "json" ? "csv" : "json";
        setTargetFormat(nextFormat);
        setStep("preview");
      }
      setProgress(100);
      setStatusMessage("Conversion complete!");
      toast({
        title: "Success",
        description: `Loaded ${data.registers.length} registers from ${data.filename}`,
      });
    },
    onError: (error: Error) => {
      setStep("upload");
      setProgress(0);
      setStatusMessage("");
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleFileSelect = useCallback((file: File) => {
    setSelectedFile(file);
    setFilename(file.name);

    const ext = file.name.split(".").pop()?.toLowerCase();
    if (ext === "csv") setSourceFormat("csv");
    else if (ext === "json") setSourceFormat("json");
    else if (ext === "xml") setSourceFormat("xml");
  }, []);

  const handleClearFile = useCallback(() => {
    setSelectedFile(null);
    setSourceFormat(null);
    setRegisters([]);
    setFilename("");
    setStep("upload");
    setProgress(0);
    setStatusMessage("");
  }, []);

  const handleConvert = useCallback(() => {
    if (!selectedFile) return;

    setStep("converting");
    setProgress(10);
    setStatusMessage("Reading file...");

    const progressInterval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 90) {
          clearInterval(progressInterval);
          return prev;
        }
        return prev + 10;
      });
    }, 200);

    setTimeout(() => {
      setStatusMessage("Parsing registers...");
    }, 400);

    setTimeout(() => {
      setStatusMessage("Validating data...");
    }, 800);

    parseMutation.mutate(selectedFile);
  }, [selectedFile, parseMutation]);

  const handleClearAll = useCallback(() => {
    handleClearFile();
  }, [handleClearFile]);

  const canConvert = !!selectedFile && !parseMutation.isPending;
  const isProcessing = parseMutation.isPending || step === "converting";

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b bg-card/80 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between gap-4 h-16">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-10 h-10 rounded-md bg-primary/10">
                <Cpu className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h1 className="text-lg font-semibold text-foreground">
                  Modbus Converter
                </h1>
                <p className="text-xs text-muted-foreground hidden sm:block">
                  Transform configuration files between formats
                </p>
              </div>
            </div>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        <section className="text-center space-y-4">
          <h2 className="text-2xl sm:text-3xl font-semibold text-foreground">
            Convert Modbus Configuration Files
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Upload your Modbus register configurations in CSV, XML, or JSON format. 
            Preview, edit, and download in your preferred format.
          </p>
        </section>

        <section className="space-y-6">
          <UploadZone
            onFileSelect={handleFileSelect}
            isProcessing={isProcessing}
            selectedFile={selectedFile}
            onClear={handleClearFile}
          />

          {selectedFile && step === "upload" && (
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6 p-6 bg-card rounded-md border">
              <div className="flex items-center gap-4 flex-wrap">
                {sourceFormat && (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">From</span>
                    <Badge variant="outline">{sourceFormat.toUpperCase()}</Badge>
                  </div>
                )}
                <ArrowRight className="h-4 w-4 text-muted-foreground hidden sm:block" />
                <FormatSelector
                  selectedFormat={targetFormat}
                  onFormatChange={setTargetFormat}
                  disabled={isProcessing}
                  sourceFormat={sourceFormat}
                />
              </div>
              <div className="flex-1" />
              <ConversionControls
                onConvert={handleConvert}
                onClear={handleClearAll}
                isProcessing={isProcessing}
                canConvert={canConvert}
                progress={progress}
                statusMessage={statusMessage}
                statusType={isProcessing ? "processing" : "success"}
              />
            </div>
          )}

          {step === "converting" && (
            <div className="p-8 bg-card rounded-md border text-center space-y-4">
              <div className="flex justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
              </div>
              <p className="text-lg font-medium text-foreground">
                Processing your document...
              </p>
              <p className="text-muted-foreground">{statusMessage}</p>
              <div className="max-w-xs mx-auto">
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            </div>
          )}
        </section>

        {step === "preview" && registers.length > 0 && (
          <section className="space-y-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 bg-success/10 rounded-md border border-success/20">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-success/20">
                  <svg
                    className="h-5 w-5 text-success"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                </div>
                <div>
                  <p className="font-medium text-foreground">
                    Conversion Successful
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {registers.length} registers loaded from {filename}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {sourceFormat && (
                  <>
                    <Badge variant="outline">{sourceFormat.toUpperCase()}</Badge>
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  </>
                )}
                <Badge variant="default">{targetFormat.toUpperCase()}</Badge>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 p-4 bg-card rounded-md border">
              <FormatSelector
                selectedFormat={targetFormat}
                onFormatChange={setTargetFormat}
                sourceFormat={sourceFormat}
              />
              <div className="flex-1" />
              <ConversionControls
                onConvert={() => {}}
                onClear={handleClearAll}
                isProcessing={false}
                canConvert={false}
              />
            </div>

            <RegisterTable
              registers={registers}
              onUpdate={setRegisters}
            />

            <div className="grid gap-6 lg:grid-cols-2">
              <PreviewPanel registers={registers} format={targetFormat} />
              <DownloadSection
                registers={registers}
                filename={filename}
                format={targetFormat}
              />
            </div>
          </section>
        )}

        <footer className="text-center py-8 border-t">
          <p className="text-sm text-muted-foreground">
            Modbus Document Converter helps engineers work with industrial automation systems
          </p>
        </footer>
      </main>
    </div>
  );
}
