import { useState } from "react";
import { ChevronRight, ChevronDown, Folder, FolderOpen, Plus, MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useFolders, type Folder as FolderType } from "@/hooks/use-folders";
import { CreateFolderDialog } from "./create-folder-dialog";
import { RenameFolderDialog } from "./rename-folder-dialog";
import { DeleteFolderDialog } from "./delete-folder-dialog";

interface FolderTreeProps {
  selectedFolderId: string | null;
  onSelectFolder: (folderId: string | null) => void;
}

export function FolderTree({ selectedFolderId, onSelectFolder }: FolderTreeProps) {
  const { data, isLoading } = useFolders();
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createParentId, setCreateParentId] = useState<string | null>(null);
  const [renameFolder, setRenameFolder] = useState<FolderType | null>(null);
  const [deleteFolder, setDeleteFolder] = useState<FolderType | null>(null);

  const folders = data?.folders ?? [];
  const rootFolders = folders.filter(f => f.parentId === null);
  const getChildren = (parentId: string) => folders.filter(f => f.parentId === parentId);

  const toggleExpand = (folderId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  };

  const handleCreateFolder = (parentId: string | null) => {
    setCreateParentId(parentId);
    setCreateDialogOpen(true);
  };

  const renderFolder = (folder: FolderType, depth: number = 0) => {
    const children = getChildren(folder.id);
    const hasChildren = children.length > 0;
    const isExpanded = expandedFolders.has(folder.id);
    const isSelected = selectedFolderId === folder.id;

    return (
      <div key={folder.id}>
        <div
          className={cn(
            "flex items-center gap-1 py-1.5 px-2 rounded-md cursor-pointer hover:bg-muted/50 group",
            isSelected && "bg-muted"
          )}
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
          onClick={() => onSelectFolder(folder.id)}
        >
          <button
            onClick={(e) => toggleExpand(folder.id, e)}
            className="p-0.5 hover:bg-muted rounded"
          >
            {hasChildren ? (
              isExpanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )
            ) : (
              <span className="w-4" />
            )}
          </button>
          {isExpanded && hasChildren ? (
            <FolderOpen className="h-4 w-4 text-primary" />
          ) : (
            <Folder className="h-4 w-4 text-muted-foreground" />
          )}
          <span className="flex-1 truncate text-sm">{folder.name}</span>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 opacity-0 group-hover:opacity-100"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => handleCreateFolder(folder.id)}>
                New subfolder
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setRenameFolder(folder)}>
                Rename
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive"
                onClick={() => setDeleteFolder(folder)}
              >
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        {isExpanded && children.map(child => renderFolder(child, depth + 1))}
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="space-y-2 p-2">
        <div className="h-8 bg-muted animate-pulse rounded" />
        <div className="h-8 bg-muted animate-pulse rounded" />
        <div className="h-8 bg-muted animate-pulse rounded" />
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between px-2 py-1">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Folders
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={() => handleCreateFolder(null)}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      <div
        className={cn(
          "flex items-center gap-2 py-1.5 px-2 rounded-md cursor-pointer hover:bg-muted/50",
          selectedFolderId === null && "bg-muted"
        )}
        onClick={() => onSelectFolder(null)}
      >
        <Folder className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm">All Documents</span>
      </div>

      {rootFolders.map(folder => renderFolder(folder))}

      <CreateFolderDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        parentId={createParentId}
      />

      {renameFolder && (
        <RenameFolderDialog
          folder={renameFolder}
          open={!!renameFolder}
          onOpenChange={(open) => !open && setRenameFolder(null)}
        />
      )}

      {deleteFolder && (
        <DeleteFolderDialog
          folder={deleteFolder}
          open={!!deleteFolder}
          onOpenChange={(open) => !open && setDeleteFolder(null)}
        />
      )}
    </div>
  );
}
