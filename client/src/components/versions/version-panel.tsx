import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { History, RotateCcw, GitCompare } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { useVersions, type Version } from "@/hooks/use-versions";
import { RestoreVersionDialog } from "./restore-version-dialog";
import { VersionCompareDialog } from "./version-compare-dialog";

interface VersionPanelProps {
  documentId: string;
  currentVersion: number;
}

export function VersionPanel({ documentId, currentVersion }: VersionPanelProps) {
  const { data, isLoading } = useVersions(documentId);
  const [restoreVersion, setRestoreVersion] = useState<Version | null>(null);
  const [compareVersions, setCompareVersions] = useState<{ v1: number; v2: number } | null>(null);

  const versions = data?.versions ?? [];

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <History className="h-5 w-5" />
            Version History
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (versions.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <History className="h-5 w-5" />
            Version History
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-4">
            No version history available.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <History className="h-5 w-5" />
            Version History
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[300px] pr-4">
            <div className="space-y-2">
              {versions.map((version) => (
                <div
                  key={version.id}
                  className="p-3 rounded-md border bg-card hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">v{version.versionNumber}</span>
                      {version.isLatestVersion && (
                        <Badge variant="secondary" className="text-xs">
                          Current
                        </Badge>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(version.createdAt), { addSuffix: true })}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    {(version.registers as unknown[]).length} registers
                  </p>
                  {!version.isLatestVersion && (
                    <div className="flex gap-2 mt-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setRestoreVersion(version)}
                      >
                        <RotateCcw className="h-3 w-3 mr-1" />
                        Restore
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          setCompareVersions({
                            v1: version.versionNumber,
                            v2: currentVersion,
                          })
                        }
                      >
                        <GitCompare className="h-3 w-3 mr-1" />
                        Compare
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      {restoreVersion && (
        <RestoreVersionDialog
          documentId={documentId}
          version={restoreVersion}
          open={!!restoreVersion}
          onOpenChange={(open) => !open && setRestoreVersion(null)}
        />
      )}

      {compareVersions && (
        <VersionCompareDialog
          documentId={documentId}
          v1={compareVersions.v1}
          v2={compareVersions.v2}
          open={!!compareVersions}
          onOpenChange={(open) => !open && setCompareVersions(null)}
        />
      )}
    </>
  );
}
