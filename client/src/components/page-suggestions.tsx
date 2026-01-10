/**
 * Page Suggestions Component
 * 
 * Displays AI-detected pages likely to contain Modbus registers,
 * allowing users to select suggested pages or enter manually.
 */

import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Loader2, Sparkles, Table2, FileText, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface PageSuggestion {
  pageNum: number;
  score: number;
  hasTable: boolean;
  sectionTitle?: string;
}

interface PageSuggestionsProps {
  suggestions: PageSuggestion[];
  onSelectPages: (pageRange: string) => void;
  onDismiss: () => void;
  isLoading?: boolean;
  className?: string;
}

export function PageSuggestions({
  suggestions,
  onSelectPages,
  onDismiss,
  isLoading = false,
  className,
}: PageSuggestionsProps) {
  const [selectedPages, setSelectedPages] = useState<Set<number>>(
    new Set(suggestions.map(s => s.pageNum))
  );

  // Update selection when suggestions change
  React.useEffect(() => {
    setSelectedPages(new Set(suggestions.map(s => s.pageNum)));
  }, [suggestions]);

  const togglePage = (pageNum: number) => {
    const newSelected = new Set(selectedPages);
    if (newSelected.has(pageNum)) {
      newSelected.delete(pageNum);
    } else {
      newSelected.add(pageNum);
    }
    setSelectedPages(newSelected);
  };

  const handleUseSelected = () => {
    const pages = Array.from(selectedPages).sort((a, b) => a - b);
    if (pages.length === 0) return;

    // Convert to page range string
    const ranges: string[] = [];
    let start = pages[0];
    let end = pages[0];

    for (let i = 1; i <= pages.length; i++) {
      if (i < pages.length && pages[i] === end + 1) {
        end = pages[i];
      } else {
        ranges.push(start === end ? `${start}` : `${start}-${end}`);
        if (i < pages.length) {
          start = pages[i];
          end = pages[i];
        }
      }
    }

    onSelectPages(ranges.join(", "));
  };

  if (isLoading) {
    return (
      <Card className={cn("max-w-xl mx-auto", className)}>
        <CardContent className="flex flex-col items-center justify-center py-12 space-y-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Analyzing PDF for register pages...</p>
        </CardContent>
      </Card>
    );
  }

  if (suggestions.length === 0) {
    return (
      <Card className={cn("max-w-xl mx-auto", className)}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Page Analysis
          </CardTitle>
          <CardDescription>No suggested pages found</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            The PDF analysis didn't find any pages that clearly contain Modbus register tables.
            You can manually specify page numbers to extract.
          </p>
          <Button onClick={onDismiss} variant="outline" className="w-full">
            Enter Pages Manually
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn("max-w-xl mx-auto", className)}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          Suggested Pages
        </CardTitle>
        <CardDescription>
          We found {suggestions.length} pages likely to contain Modbus registers
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {suggestions.map((suggestion) => (
            <label
              key={suggestion.pageNum}
              className={cn(
                "flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors",
                selectedPages.has(suggestion.pageNum)
                  ? "border-primary bg-primary/5"
                  : "border-border hover:bg-muted/50"
              )}
              data-has-table={suggestion.hasTable}
            >
              <Checkbox
                checked={selectedPages.has(suggestion.pageNum)}
                onCheckedChange={() => togglePage(suggestion.pageNum)}
              />
              
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium">Page {suggestion.pageNum}</span>
                  {suggestion.hasTable && (
                    <Badge variant="secondary" className="text-xs">
                      <Table2 className="h-3 w-3 mr-1" />
                      Table
                    </Badge>
                  )}
                </div>
                {suggestion.sectionTitle && (
                  <p className="text-sm text-muted-foreground truncate">
                    {suggestion.sectionTitle}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <FileText className="h-3 w-3" />
                <span>Score: {Math.round(suggestion.score)}</span>
              </div>
            </label>
          ))}
        </div>

        <div className="flex items-center justify-between pt-4 border-t">
          <Button variant="ghost" onClick={onDismiss}>
            Skip - Manual Entry
          </Button>
          <Button
            onClick={handleUseSelected}
            disabled={selectedPages.size === 0}
            className="gap-2"
          >
            <CheckCircle2 className="h-4 w-4" />
            Use {selectedPages.size} Page{selectedPages.size !== 1 ? "s" : ""}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

