import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Loader2, FileSearch, Brain, FileText, Database, CheckCircle2, Clock, XCircle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface ProgressStage {
  icon: typeof FileSearch;
  message: string;
  color: string;
}

const PROGRESS_STAGES: ProgressStage[] = [
  { icon: FileSearch, message: "Extracting text from PDF...", color: "text-blue-500" },
  { icon: Brain, message: "Analyzing page relevance...", color: "text-purple-500" },
  { icon: FileText, message: "Processing batch...", color: "text-amber-500" },
  { icon: Database, message: "Extracting registers...", color: "text-green-500" },
  { icon: Brain, message: "Merging results...", color: "text-indigo-500" },
  { icon: CheckCircle2, message: "Finalizing...", color: "text-emerald-500" },
];

interface AnimatedProgressProps {
  progress: number;
  statusMessage: string;
  startTime: number;
  fileName?: string;
  /** Optional callback to cancel the current operation */
  onCancel?: () => void;
}

export function AnimatedProgress({ 
  progress, 
  statusMessage, 
  startTime,
  fileName,
  onCancel,
}: AnimatedProgressProps) {
  const [elapsedTime, setElapsedTime] = useState(0);
  const [currentStageIndex, setCurrentStageIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsedTime(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [startTime]);

  useEffect(() => {
    if (progress < 20) {
      setCurrentStageIndex(0);
    } else if (progress < 40) {
      setCurrentStageIndex(1);
    } else if (progress < 60) {
      setCurrentStageIndex(2);
    } else if (progress < 80) {
      setCurrentStageIndex(3);
    } else if (progress < 95) {
      setCurrentStageIndex(4);
    } else {
      setCurrentStageIndex(5);
    }
  }, [progress]);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins > 0) {
      return `${mins}m ${secs}s`;
    }
    return `${secs}s`;
  };

  const currentStage = PROGRESS_STAGES[currentStageIndex];
  const StageIcon = currentStage.icon;

  return (
    <Card className="max-w-xl mx-auto overflow-visible">
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
            <p className="text-sm text-muted-foreground truncate max-w-md mx-auto">
              {fileName}
            </p>
          )}
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Progress</span>
            <span className="font-mono font-medium">{Math.round(progress)}%</span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={currentStageIndex}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
            className="flex items-center justify-center gap-3 py-3"
          >
            <motion.div
              animate={{ scale: [1, 1.1, 1] }}
              transition={{ duration: 1.5, repeat: Infinity }}
            >
              <StageIcon className={`h-5 w-5 ${currentStage.color}`} />
            </motion.div>
            <span className="text-sm font-medium">{currentStage.message}</span>
          </motion.div>
        </AnimatePresence>

        {statusMessage && (
          <motion.div
            key={statusMessage}
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center space-y-1 p-3 rounded-md bg-muted/50"
          >
            <p className="text-sm font-medium">{statusMessage}</p>
          </motion.div>
        )}

        <div className="flex items-center justify-between border-t pt-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="h-4 w-4" />
            <span>Elapsed time: </span>
            <span className="font-mono font-medium">{formatTime(elapsedTime)}</span>
          </div>
          
          {onCancel && (
            <Button
              variant="outline"
              size="sm"
              onClick={onCancel}
              className="text-destructive hover:text-destructive hover:bg-destructive/10"
            >
              <XCircle className="h-4 w-4 mr-2" />
              Cancel
            </Button>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex justify-between text-xs text-muted-foreground">
            {PROGRESS_STAGES.slice(0, 4).map((stage, index) => {
              const IconComponent = stage.icon;
              const isActive = index <= currentStageIndex;
              const isCurrent = index === currentStageIndex;
              return (
                <motion.div
                  key={index}
                  className={`flex flex-col items-center gap-1 ${
                    isActive ? "opacity-100" : "opacity-40"
                  }`}
                  animate={isCurrent ? { scale: [1, 1.05, 1] } : {}}
                  transition={{ duration: 1, repeat: Infinity }}
                >
                  <div className={`p-1.5 rounded-full ${
                    isActive ? "bg-primary/20" : "bg-muted"
                  }`}>
                    <IconComponent className={`h-3 w-3 ${
                      isActive ? stage.color : "text-muted-foreground"
                    }`} />
                  </div>
                </motion.div>
              );
            })}
          </div>
          <div className="h-1 bg-muted rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-gradient-to-r from-blue-500 via-purple-500 to-green-500"
              initial={{ width: "0%" }}
              animate={{ width: `${Math.min(100, progress)}%` }}
              transition={{ duration: 0.5, ease: "easeOut" }}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
