import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useRestoreVersion, type Version } from "@/hooks/use-versions";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

interface RestoreVersionDialogProps {
  documentId: string;
  version: Version;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function RestoreVersionDialog({
  documentId,
  version,
  open,
  onOpenChange,
}: RestoreVersionDialogProps) {
  const { toast } = useToast();
  const restoreVersion = useRestoreVersion();

  const handleRestore = async () => {
    try {
      await restoreVersion.mutateAsync({
        documentId,
        versionNumber: version.versionNumber,
      });
      toast({
        title: "Version restored",
        description: `Document restored to version ${version.versionNumber}.`,
      });
      onOpenChange(false);
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to restore version",
        variant: "destructive",
      });
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Restore version {version.versionNumber}?</AlertDialogTitle>
          <AlertDialogDescription>
            This will create a new version based on version {version.versionNumber}.
            The current version will be preserved in the history.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleRestore}
            disabled={restoreVersion.isPending}
          >
            {restoreVersion.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Restore
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
