import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { useCompareVersions } from "@/hooks/use-versions";
import { Plus, Minus, Edit } from "lucide-react";

interface VersionCompareDialogProps {
  documentId: string;
  v1: number;
  v2: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function VersionCompareDialog({
  documentId,
  v1,
  v2,
  open,
  onOpenChange,
}: VersionCompareDialogProps) {
  const { data, isLoading } = useCompareVersions(documentId, v1, v2);

  const comparison = data?.comparison;
  const hasChanges =
    comparison &&
    (comparison.added.length > 0 ||
      comparison.removed.length > 0 ||
      comparison.modified.length > 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>
            Comparing v{v1} → v{v2}
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : !hasChanges ? (
          <div className="text-center py-8 text-muted-foreground">
            No differences found between these versions.
          </div>
        ) : (
          <ScrollArea className="max-h-[60vh] pr-4">
            <div className="space-y-6">
              {comparison.added.length > 0 && (
                <div>
                  <h3 className="font-medium flex items-center gap-2 mb-3">
                    <Plus className="h-4 w-4 text-green-500" />
                    Added Registers
                    <Badge variant="secondary">{comparison.added.length}</Badge>
                  </h3>
                  <div className="space-y-2">
                    {comparison.added.map((reg: any, i: number) => (
                      <div
                        key={i}
                        className="p-3 rounded-md border border-green-200 bg-green-50 dark:bg-green-950/20 dark:border-green-900"
                      >
                        <div className="font-mono text-sm">
                          <span className="text-muted-foreground">Address:</span>{" "}
                          {reg.address}
                        </div>
                        <div className="text-sm">
                          <span className="text-muted-foreground">Name:</span>{" "}
                          {reg.name}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {comparison.removed.length > 0 && (
                <div>
                  <h3 className="font-medium flex items-center gap-2 mb-3">
                    <Minus className="h-4 w-4 text-red-500" />
                    Removed Registers
                    <Badge variant="secondary">{comparison.removed.length}</Badge>
                  </h3>
                  <div className="space-y-2">
                    {comparison.removed.map((reg: any, i: number) => (
                      <div
                        key={i}
                        className="p-3 rounded-md border border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-900"
                      >
                        <div className="font-mono text-sm">
                          <span className="text-muted-foreground">Address:</span>{" "}
                          {reg.address}
                        </div>
                        <div className="text-sm">
                          <span className="text-muted-foreground">Name:</span>{" "}
                          {reg.name}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {comparison.modified.length > 0 && (
                <div>
                  <h3 className="font-medium flex items-center gap-2 mb-3">
                    <Edit className="h-4 w-4 text-yellow-500" />
                    Modified Registers
                    <Badge variant="secondary">{comparison.modified.length}</Badge>
                  </h3>
                  <div className="space-y-2">
                    {comparison.modified.map((change: any, i: number) => (
                      <div
                        key={i}
                        className="p-3 rounded-md border border-yellow-200 bg-yellow-50 dark:bg-yellow-950/20 dark:border-yellow-900"
                      >
                        <div className="font-mono text-sm mb-2">
                          <span className="text-muted-foreground">Address:</span>{" "}
                          {change.old.address}
                        </div>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <div className="text-muted-foreground mb-1">Before (v{v1})</div>
                            <pre className="text-xs bg-background p-2 rounded overflow-auto">
                              {JSON.stringify(change.old, null, 2)}
                            </pre>
                          </div>
                          <div>
                            <div className="text-muted-foreground mb-1">After (v{v2})</div>
                            <pre className="text-xs bg-background p-2 rounded overflow-auto">
                              {JSON.stringify(change.new, null, 2)}
                            </pre>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}
