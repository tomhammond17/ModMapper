/**
 * Workflow Stepper Component
 * 
 * Visual indicator showing the current step in the conversion workflow:
 * Upload -> Configure -> Process -> Review
 */

import React from "react";
import { Check, Upload, Settings, Cog, FileCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ConversionStep } from "@/hooks/use-pdf-processing";

interface Step {
  id: ConversionStep;
  name: string;
  icon: typeof Upload;
}

const STEPS: Step[] = [
  { id: "upload", name: "Upload", icon: Upload },
  { id: "pageIdentify", name: "Configure", icon: Settings },
  { id: "converting", name: "Process", icon: Cog },
  { id: "preview", name: "Review", icon: FileCheck },
];

const STEP_ORDER: ConversionStep[] = ["upload", "pageIdentify", "converting", "preview"];

function getStepIndex(step: ConversionStep): number {
  return STEP_ORDER.indexOf(step);
}

interface WorkflowStepperProps {
  currentStep: ConversionStep;
  className?: string;
}

export function WorkflowStepper({ currentStep, className }: WorkflowStepperProps) {
  const currentIndex = getStepIndex(currentStep);

  return (
    <nav aria-label="Progress" className={cn("w-full", className)}>
      <ol className="flex items-center justify-between">
        {STEPS.map((step, index) => {
          const isCompleted = index < currentIndex;
          const isActive = index === currentIndex;
          const isPending = index > currentIndex;
          const StepIcon = step.icon;

          return (
            <li
              key={step.id}
              className="relative flex-1 flex items-center"
              data-step
              data-active={isActive}
              data-completed={isCompleted}
            >
              {/* Connector line (before step, except for first) */}
              {index > 0 && (
                <div
                  data-connector
                  className={cn(
                    "absolute left-0 right-1/2 top-1/2 -translate-y-1/2 h-0.5 -z-10",
                    isCompleted || isActive ? "bg-primary" : "bg-muted"
                  )}
                />
              )}

              {/* Connector line (after step, except for last) */}
              {index < STEPS.length - 1 && (
                <div
                  data-connector
                  className={cn(
                    "absolute left-1/2 right-0 top-1/2 -translate-y-1/2 h-0.5 -z-10",
                    isCompleted ? "bg-primary" : "bg-muted"
                  )}
                />
              )}

              {/* Step circle and label */}
              <div className="relative flex flex-col items-center w-full">
                <div
                  className={cn(
                    "flex h-10 w-10 items-center justify-center rounded-full border-2 transition-all duration-300",
                    isCompleted && "bg-primary border-primary text-primary-foreground",
                    isActive && "border-primary bg-primary/10 text-primary",
                    isPending && "border-muted bg-background text-muted-foreground"
                  )}
                >
                  {isCompleted ? (
                    <Check className="h-5 w-5" />
                  ) : (
                    <span className="text-sm font-semibold">{index + 1}</span>
                  )}
                </div>

                <div className="mt-2 flex flex-col items-center">
                  <span
                    className={cn(
                      "text-sm font-medium transition-colors",
                      isActive && "text-primary",
                      isCompleted && "text-foreground",
                      isPending && "text-muted-foreground"
                    )}
                  >
                    {step.name}
                  </span>
                  
                  {/* Icon indicator */}
                  <StepIcon 
                    className={cn(
                      "h-4 w-4 mt-1 transition-colors",
                      isActive && "text-primary",
                      isCompleted && "text-muted-foreground",
                      isPending && "text-muted-foreground/50"
                    )} 
                  />
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

