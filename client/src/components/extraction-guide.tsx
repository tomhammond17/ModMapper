import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Lightbulb, RefreshCw, HelpCircle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { ExtractionMetadata, ModbusRegister } from "@shared/schema";

interface ExtractionGuideProps {
  metadata: ExtractionMetadata;
  registers: ModbusRegister[];
  selectedFile: File | null;
  onReExtract: (pageRanges: string) => void;
  isProcessing: boolean;
}

export function ExtractionGuide({ 
  metadata, 
  registers, 
  selectedFile,
  onReExtract, 
  isProcessing 
}: ExtractionGuideProps) {
  const [pageRanges, setPageRanges] = useState("");
  
  const shouldShowGuide = metadata.registersFound < 300;
  
  if (!shouldShowGuide) {
    return null;
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pageRanges.trim() && !isProcessing) {
      onReExtract(pageRanges.trim());
    }
  };

  const confidenceMessage = metadata.confidenceLevel === "low" 
    ? "The initial extraction found fewer registers than expected."
    : metadata.confidenceLevel === "medium"
    ? "Some registers may have been missed during extraction."
    : "A few additional registers might be available.";

  return (
    <Card className="border-amber-500/30 bg-amber-50/50 dark:bg-amber-950/20">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Lightbulb className="h-5 w-5 text-amber-600 dark:text-amber-400" />
          Help Us Find More Registers
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {confidenceMessage} Your PDF likely has a register table in an Appendix or specific section. 
          If you know which pages contain the register tables, specify them below for targeted extraction.
        </p>
        
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label htmlFor="page-ranges" className="text-sm font-medium">
                Page Ranges
              </Label>
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-xs">
                  <p>Enter page numbers or ranges where register tables are located.</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Examples: "54-70" or "10, 15-20, 45"
                  </p>
                </TooltipContent>
              </Tooltip>
            </div>
            <div className="flex gap-2">
              <Input
                id="page-ranges"
                data-testid="input-page-ranges"
                placeholder="e.g., 54-70 or 10, 15-20"
                value={pageRanges}
                onChange={(e) => setPageRanges(e.target.value)}
                className="flex-1"
                disabled={isProcessing || !selectedFile}
              />
              <Button 
                type="submit" 
                data-testid="button-re-extract"
                disabled={!pageRanges.trim() || isProcessing || !selectedFile}
              >
                {isProcessing ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Extracting...
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Re-extract
                  </>
                )}
              </Button>
            </div>
          </div>
        </form>

        <div className="text-xs text-muted-foreground bg-muted/50 rounded-md p-3 space-y-1">
          <p className="font-medium">Tips for finding register tables:</p>
          <ul className="list-disc list-inside space-y-0.5 ml-1">
            <li>Check the Table of Contents for "Modbus", "Register", or "Communication"</li>
            <li>Look for Appendix sections (often at the end of the document)</li>
            <li>Search for pages with columns like "Address", "Register", "Data Type"</li>
          </ul>
        </div>

        {registers.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Currently extracted: {registers.length} registers from {metadata.pagesAnalyzed} pages.
            New registers will be merged with existing ones.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
