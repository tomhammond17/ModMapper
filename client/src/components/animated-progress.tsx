import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Upload, FileSearch, Brain, FileText, CheckCircle2, XCircle, Info } from "lucide-react";
import { motion } from "framer-motion";
import type { ProcessingStage } from "@/hooks/use-pdf-processing";

interface StageConfig {
  id: ProcessingStage;
  label: string;
  icon: typeof FileSearch;
}

const STAGES: StageConfig[] = [
  { id: "uploading", label: "Uploading", icon: Upload },
  { id: "extracting", label: "Extracting Text", icon: FileSearch },
  { id: "scoring", label: "Scoring Pages", icon: FileSearch },
  { id: "analyzing", label: "Analyzing with AI", icon: Brain },
  { id: "parsing", label: "Parsing Results", icon: FileText },
  { id: "complete", label: "Complete", icon: CheckCircle2 },
];

function getStageIndex(stage: ProcessingStage): number {
  const idx = STAGES.findIndex(s => s.id === stage);
  return idx >= 0 ? idx : 0;
}

interface AnimatedProgressProps {
  progress: number;
  statusMessage: string;
  startTime: number;
  fileName?: string;
  onCancel?: () => void;
  stage: ProcessingStage;
  totalBatches: number;
  currentBatch: number;
  pagesProcessed: number;
}

export function AnimatedProgress({ 
  statusMessage,
  startTime,
  fileName,
  onCancel,
  stage,
  totalBatches,
  currentBatch,
  pagesProcessed,
}: AnimatedProgressProps) {
  const [elapsedTime, setElapsedTime] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsedTime(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [startTime]);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins > 0) {
      return `${mins}m ${secs}s`;
    }
    return `${secs}s`;
  };

  const currentStageIndex = getStageIndex(stage);

  return (
    <Card className="max-w-xl mx-auto overflow-visible" data-testid="card-processing-progress">
      <CardContent className="pt-6 space-y-6">
        <div className="text-center space-y-2">
          <motion.div 
            className="flex justify-center"
            animate={{ rotate: 360 }}
            transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
          >
            <div className="p-4 rounded-full bg-primary/10">
              <Loader2 className="h-8 w-8 text-primary" />
            </div>
          </motion.div>
          
          {fileName && (
            <p className="text-sm text-muted-foreground truncate max-w-md mx-auto" data-testid="text-processing-filename">
              {fileName}
            </p>
          )}
        </div>

        <div className="space-y-4">
          {STAGES.slice(0, -1).map((stageConfig, index) => {
            const isCompleted = index < currentStageIndex;
            const isCurrent = index === currentStageIndex;
            const isPending = index > currentStageIndex;
            const StageIcon = stageConfig.icon;

            return (
              <div 
                key={stageConfig.id} 
                className="flex items-center gap-3"
                data-testid={`stage-${stageConfig.id}`}
              >
                <div className={`
                  flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center
                  ${isCompleted ? "bg-green-500/20 text-green-500" : ""}
                  ${isCurrent ? "bg-primary/20 text-primary" : ""}
                  ${isPending ? "bg-muted text-muted-foreground" : ""}
                `}>
                  {isCompleted ? (
                    <CheckCircle2 className="h-4 w-4" />
                  ) : isCurrent ? (
                    <motion.div
                      animate={{ scale: [1, 1.2, 1] }}
                      transition={{ duration: 1.5, repeat: Infinity }}
                    >
                      <StageIcon className="h-4 w-4" />
                    </motion.div>
                  ) : (
                    <StageIcon className="h-4 w-4" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className={`text-sm font-medium ${isPending ? "text-muted-foreground" : ""}`}>
                      {stageConfig.label}
                    </span>
                    
                    {isCurrent && stageConfig.id === "analyzing" && totalBatches > 0 && (
                      <span className="text-xs font-mono bg-primary/10 text-primary px-2 py-0.5 rounded" data-testid="text-batch-progress">
                        Batch {currentBatch}/{totalBatches}
                      </span>
                    )}
                    
                    {isCompleted && (
                      <span className="text-xs text-green-500">Done</span>
                    )}
                  </div>

                  {isCurrent && (
                    <motion.div 
                      className="h-1 bg-muted rounded-full mt-1 overflow-hidden"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                    >
                      <motion.div 
                        className="h-full bg-primary rounded-full"
                        animate={{ x: ["-100%", "100%"] }}
                        transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
                        style={{ width: "50%" }}
                      />
                    </motion.div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {statusMessage && (
          <motion.div
            key={statusMessage}
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center p-3 rounded-md bg-muted/50"
          >
            <p className="text-sm" data-testid="text-status-message">{statusMessage}</p>
          </motion.div>
        )}

        <div className="flex items-center gap-2 p-3 rounded-md bg-blue-500/10 border border-blue-500/20">
          <Info className="h-4 w-4 text-blue-500 flex-shrink-0" />
          <p className="text-xs text-blue-600 dark:text-blue-400" data-testid="text-time-estimate">
            Typical extraction takes about 5 seconds per page.
            {pagesProcessed > 0 && ` Processing ${pagesProcessed} pages.`}
          </p>
        </div>

        <div className="flex items-center justify-between border-t pt-4">
          <div className="text-sm text-muted-foreground">
            <span>Elapsed: </span>
            <span className="font-mono font-medium" data-testid="text-elapsed-time">{formatTime(elapsedTime)}</span>
          </div>
          
          {onCancel && (
            <Button
              variant="outline"
              size="sm"
              onClick={onCancel}
              className="text-destructive hover:text-destructive"
              data-testid="button-cancel-processing"
            >
              <XCircle className="h-4 w-4 mr-2" />
              Cancel
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
