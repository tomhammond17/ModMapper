import { RefreshCw, Trash2, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

interface ConversionControlsProps {
  onConvert: () => void;
  onClear: () => void;
  isProcessing: boolean;
  canConvert: boolean;
  progress?: number;
  statusMessage?: string;
  statusType?: "processing" | "success" | "error";
}

export function ConversionControls({
  onConvert,
  onClear,
  isProcessing,
  canConvert,
  progress = 0,
  statusMessage,
  statusType = "processing",
}: ConversionControlsProps) {
  const statusColors = {
    processing: "text-warning",
    success: "text-success",
    error: "text-destructive",
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          onClick={onConvert}
          disabled={!canConvert || isProcessing}
          data-testid="button-convert"
        >
          {isProcessing ? (
            <>
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              Converting...
            </>
          ) : (
            <>
              <Zap className="h-4 w-4 mr-2" />
              Convert
            </>
          )}
        </Button>
        <Button
          variant="outline"
          onClick={onClear}
          disabled={isProcessing}
          data-testid="button-clear"
        >
          <Trash2 className="h-4 w-4 mr-2" />
          Clear
        </Button>
      </div>

      {isProcessing && (
        <div className="space-y-2">
          <Progress value={progress} className="h-2" data-testid="progress-bar" />
          {statusMessage && (
            <p
              className={`text-sm ${statusColors[statusType]}`}
              data-testid="text-status"
            >
              {statusMessage}
            </p>
          )}
        </div>
      )}

      {!isProcessing && statusMessage && (
        <p
          className={`text-sm ${statusColors[statusType]}`}
          data-testid="text-status"
        >
          {statusMessage}
        </p>
      )}
    </div>
  );
}
