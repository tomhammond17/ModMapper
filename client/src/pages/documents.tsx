import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FolderTree } from "@/components/folders/folder-tree";
import { FolderBreadcrumb } from "@/components/folders/folder-breadcrumb";
import { useAuth } from "@/contexts/auth-context";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { FileText, MoreHorizontal, Trash2, FolderInput, Download, Eye, Clock } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface Document {
  id: string;
  filename: string;
  sourceFormat: string;
  registers: unknown[];
  createdAt: string;
  folderId: string | null;
  versionNumber?: number;
}

export default function DocumentsPage() {
  const { isPro } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);

  const { data, isLoading } = useQuery<{ success: boolean; documents: Document[] }>({
    queryKey: ["documents", selectedFolderId],
    queryFn: async () => {
      const url = selectedFolderId
        ? `/api/v1/documents?folderId=${selectedFolderId}`
        : "/api/v1/documents";
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch documents");
      return res.json();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/v1/documents/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      toast({ title: "Document deleted" });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to delete document",
        variant: "destructive",
      });
    },
  });

  const documents = data?.documents ?? [];

  return (
    <div className="container mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Documents</h1>
          <p className="text-muted-foreground">
            Manage your converted Modbus register files
          </p>
        </div>
        <Button onClick={() => setLocation("/")}>
          New Conversion
        </Button>
      </div>

      <div className="grid lg:grid-cols-[250px,1fr] gap-6">
        {isPro && (
          <aside className="space-y-4">
            <Card>
              <CardContent className="p-4">
                <FolderTree
                  selectedFolderId={selectedFolderId}
                  onSelectFolder={setSelectedFolderId}
                />
              </CardContent>
            </Card>
          </aside>
        )}

        <main className="space-y-4">
          {isPro && selectedFolderId && (
            <FolderBreadcrumb
              folderId={selectedFolderId}
              onNavigate={setSelectedFolderId}
            />
          )}

          {isLoading ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map((i) => (
                <Card key={i}>
                  <CardHeader>
                    <Skeleton className="h-5 w-3/4" />
                    <Skeleton className="h-4 w-1/2" />
                  </CardHeader>
                  <CardContent>
                    <Skeleton className="h-4 w-full" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : documents.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <FileText className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">No documents yet</h3>
                <p className="text-muted-foreground text-center mb-4">
                  {selectedFolderId
                    ? "This folder is empty. Upload a file to get started."
                    : "Upload a Modbus register file to get started."}
                </p>
                <Button onClick={() => setLocation("/")}>
                  Upload File
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {documents.map((doc) => (
                <Card key={doc.id} className="group">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <CardTitle className="text-base truncate">
                          {doc.filename}
                        </CardTitle>
                        <CardDescription className="flex items-center gap-2 mt-1">
                          <Badge variant="outline" className="text-xs">
                            {doc.sourceFormat.toUpperCase()}
                          </Badge>
                          {doc.versionNumber && doc.versionNumber > 1 && (
                            <Badge variant="secondary" className="text-xs">
                              v{doc.versionNumber}
                            </Badge>
                          )}
                        </CardDescription>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 opacity-0 group-hover:opacity-100"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setLocation(`/documents/${doc.id}`)}>
                            <Eye className="mr-2 h-4 w-4" />
                            View
                          </DropdownMenuItem>
                          <DropdownMenuItem>
                            <Download className="mr-2 h-4 w-4" />
                            Export
                          </DropdownMenuItem>
                          {isPro && (
                            <DropdownMenuItem>
                              <FolderInput className="mr-2 h-4 w-4" />
                              Move to folder
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => deleteMutation.mutate(doc.id)}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between text-sm text-muted-foreground">
                      <span>{(doc.registers as unknown[]).length} registers</span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatDistanceToNow(new Date(doc.createdAt), { addSuffix: true })}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
