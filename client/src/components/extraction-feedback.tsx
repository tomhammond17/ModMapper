import { FileText, Clock, CheckCircle, AlertCircle, Info } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { ExtractionMetadata } from "@shared/schema";

interface ExtractionFeedbackProps {
  metadata: ExtractionMetadata;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

function getConfidenceBadgeVariant(level: "high" | "medium" | "low") {
  switch (level) {
    case "high":
      return "default";
    case "medium":
      return "secondary";
    case "low":
      return "outline";
  }
}

function getConfidenceIcon(level: "high" | "medium" | "low") {
  switch (level) {
    case "high":
      return <CheckCircle className="h-4 w-4 text-success" />;
    case "medium":
      return <Info className="h-4 w-4 text-warning" />;
    case "low":
      return <AlertCircle className="h-4 w-4 text-muted-foreground" />;
  }
}

export function ExtractionFeedback({ metadata }: ExtractionFeedbackProps) {
  return (
    <Card data-testid="card-extraction-feedback">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <FileText className="h-4 w-4" />
          Extraction Summary
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Total Pages</p>
            <p className="text-lg font-semibold" data-testid="text-total-pages">
              {metadata.totalPages}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Pages Analyzed</p>
            <p className="text-lg font-semibold" data-testid="text-pages-analyzed">
              {metadata.pagesAnalyzed}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Registers Found</p>
            <p className="text-lg font-semibold" data-testid="text-registers-found">
              {metadata.registersFound}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Processing Time</p>
            <p className="text-lg font-semibold flex items-center gap-1" data-testid="text-processing-time">
              <Clock className="h-4 w-4 text-muted-foreground" />
              {formatDuration(metadata.processingTimeMs)}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between pt-2 border-t">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Confidence:</span>
            <Badge 
              variant={getConfidenceBadgeVariant(metadata.confidenceLevel)}
              className="flex items-center gap-1"
              data-testid="badge-confidence"
            >
              {getConfidenceIcon(metadata.confidenceLevel)}
              {metadata.confidenceLevel.charAt(0).toUpperCase() + metadata.confidenceLevel.slice(1)}
            </Badge>
          </div>
          <span className="text-xs text-muted-foreground">
            {metadata.highRelevancePages} high-relevance pages found
          </span>
        </div>

        {metadata.batchSummary && (
          <div className="pt-2 border-t">
            <p className="text-xs text-muted-foreground mb-1">Batch Details:</p>
            <p className="text-xs font-mono bg-muted/50 p-2 rounded" data-testid="text-batch-summary">
              {metadata.batchSummary}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
