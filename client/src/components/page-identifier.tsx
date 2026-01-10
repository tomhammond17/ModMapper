import { useState, useMemo, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FileText, Zap, BookOpen, ListOrdered, Target, ArrowRight, Lightbulb, AlertCircle, Eye } from "lucide-react";
import { PdfViewer } from "./pdf-viewer";

interface PageIdentifierProps {
  fileName: string;
  file: File | null;
  onExtractPages: (pageRanges: string) => void;
  onExtractFullDocument: () => void;
  onCancel: () => void;
}

function validatePageRanges(input: string): { valid: boolean; error?: string; normalized?: string } {
  if (!input.trim()) {
    return { valid: false, error: "Please enter page numbers or ranges" };
  }
  
  const parts = input.split(/[,;]+/).map(p => p.trim()).filter(Boolean);
  if (parts.length === 0) {
    return { valid: false, error: "Please enter page numbers or ranges" };
  }
  
  const normalized: string[] = [];
  
  for (const part of parts) {
    const rangeMatch = part.match(/^(\d+)\s*[-–]\s*(\d+)$/);
    if (rangeMatch) {
      const start = parseInt(rangeMatch[1], 10);
      const end = parseInt(rangeMatch[2], 10);
      if (start < 1 || end < 1) {
        return { valid: false, error: `Invalid page number: pages must be 1 or greater` };
      }
      if (start > end) {
        return { valid: false, error: `Invalid range "${part}": start must be less than or equal to end` };
      }
      normalized.push(`${start}-${end}`);
    } else if (/^\d+$/.test(part)) {
      const page = parseInt(part, 10);
      if (page < 1) {
        return { valid: false, error: `Invalid page number: pages must be 1 or greater` };
      }
      normalized.push(part);
    } else {
      return { valid: false, error: `Invalid format "${part}": use numbers like "5" or ranges like "10-20"` };
    }
  }
  
  return { valid: true, normalized: normalized.join(", ") };
}

export function PageIdentifier({ 
  fileName,
  file,
  onExtractPages, 
  onExtractFullDocument,
  onCancel 
}: PageIdentifierProps) {
  const [pageRanges, setPageRanges] = useState("");
  const [showFullDocOption, setShowFullDocOption] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  
  const validation = useMemo(() => validatePageRanges(pageRanges), [pageRanges]);

  const handlePagesSelected = useCallback((pages: number[]) => {
    if (pages.length === 0) return;
    
    const ranges: string[] = [];
    let start = pages[0];
    let end = pages[0];

    for (let i = 1; i < pages.length; i++) {
      if (pages[i] === end + 1) {
        end = pages[i];
      } else {
        ranges.push(start === end ? `${start}` : `${start}-${end}`);
        start = pages[i];
        end = pages[i];
      }
    }
    ranges.push(start === end ? `${start}` : `${start}-${end}`);

    setPageRanges(ranges.join(", "));
  }, []);

  const handleExtractPages = () => {
    if (validation.valid && validation.normalized) {
      onExtractPages(validation.normalized);
    }
  };

  const isValidInput = validation.valid;
  const showError = pageRanges.trim().length > 0 && !validation.valid;

  return (
    <Card className="max-w-2xl mx-auto">
      <CardHeader className="pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-md bg-primary/10">
            <FileText className="h-5 w-5 text-primary" />
          </div>
          <div>
            <CardTitle className="text-lg">Page Identifier</CardTitle>
            <CardDescription className="text-sm">
              {fileName}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-4 rounded-md bg-accent/50 border border-accent">
            <Target className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
            <div className="space-y-2">
              <p className="font-medium text-sm">
                Do you know which pages contain register tables?
              </p>
              <p className="text-sm text-muted-foreground">
                Specifying pages reduces API usage and improves accuracy by focusing on relevant content.
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <Label htmlFor="page-ranges" className="text-sm font-medium flex items-center gap-2">
              <Zap className="h-4 w-4 text-amber-500" />
              Recommended: Enter page ranges
            </Label>
            <Input
              id="page-ranges"
              data-testid="input-page-ranges"
              placeholder="e.g., 54-70 or 10, 15-20, 45"
              value={pageRanges}
              onChange={(e) => setPageRanges(e.target.value)}
              className={`font-mono ${showError ? "border-destructive" : ""}`}
            />
            {showError ? (
              <p className="text-xs text-destructive flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                {validation.error}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Separate multiple ranges with commas. Example: 1-5, 10, 15-20
              </p>
            )}
          </div>

          <div className="grid gap-3 pt-2">
            <Button 
              onClick={handleExtractPages}
              disabled={!isValidInput}
              className="w-full"
              data-testid="button-extract-pages"
            >
              <Target className="h-4 w-4 mr-2" />
              Extract from Specified Pages
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </div>
        </div>

        <div className="border-t pt-4">
          <div className="space-y-4">
            <Button
              variant="outline"
              onClick={() => setViewerOpen(true)}
              className="w-full"
              data-testid="button-open-pdf-viewer"
            >
              <Eye className="h-4 w-4 mr-2" />
              Browse PDF to Find Pages
            </Button>
            
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Lightbulb className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium text-muted-foreground">
                  Tips for finding register tables
                </span>
              </div>
              <div className="grid gap-2 text-sm text-muted-foreground">
                <div className="flex items-start gap-2">
                  <BookOpen className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <span>Check the Table of Contents for "Register Map" or "Modbus Registers"</span>
                </div>
                <div className="flex items-start gap-2">
                  <ListOrdered className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <span>Register tables are often in Appendices or near the end of technical manuals</span>
                </div>
                <div className="flex items-start gap-2">
                  <FileText className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <span>Look for sections titled "Communication Protocol" or "Data Points"</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="border-t pt-4">
          {!showFullDocOption ? (
            <button
              onClick={() => setShowFullDocOption(true)}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors underline underline-offset-4"
              data-testid="button-show-full-doc-option"
            >
              I don't know which pages to extract
            </button>
          ) : (
            <div className="space-y-3 p-4 rounded-md bg-muted/50">
              <p className="text-sm text-muted-foreground">
                Full document extraction will analyze all pages, which uses more API tokens 
                and takes longer. The AI will automatically identify and prioritize pages 
                that likely contain register tables.
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={onExtractFullDocument}
                  className="flex-1"
                  data-testid="button-extract-full-document"
                >
                  <FileText className="h-4 w-4 mr-2" />
                  Extract Full Document
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => setShowFullDocOption(false)}
                  data-testid="button-hide-full-doc-option"
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end pt-2">
          <Button
            variant="ghost"
            onClick={onCancel}
            data-testid="button-cancel-page-identifier"
          >
            Choose Different File
          </Button>
        </div>
      </CardContent>

      <PdfViewer
        file={file}
        open={viewerOpen}
        onOpenChange={setViewerOpen}
        onPagesSelected={handlePagesSelected}
      />
    </Card>
  );
}
