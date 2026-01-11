import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

export interface Folder {
  id: string;
  userId: string;
  name: string;
  parentId: string | null;
  path: string;
  createdAt: string;
  updatedAt: string;
}

const API_BASE = "/api/v1";

export function useFolders() {
  return useQuery<{ success: boolean; folders: Folder[] }>({
    queryKey: ["folders"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/folders`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch folders");
      return res.json();
    },
  });
}

export function useFolder(folderId: string | null) {
  return useQuery<{ success: boolean; folder: Folder }>({
    queryKey: ["folders", folderId],
    queryFn: async () => {
      if (!folderId) throw new Error("No folder ID");
      const res = await fetch(`${API_BASE}/folders/${folderId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch folder");
      return res.json();
    },
    enabled: !!folderId,
  });
}

export function useFolderPath(folderId: string | null) {
  return useQuery<{ success: boolean; path: Folder[] }>({
    queryKey: ["folders", folderId, "path"],
    queryFn: async () => {
      if (!folderId) return { success: true, path: [] };
      const res = await fetch(`${API_BASE}/folders/${folderId}/path`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch folder path");
      return res.json();
    },
    enabled: !!folderId,
  });
}

export function useCreateFolder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ name, parentId }: { name: string; parentId?: string | null }) => {
      const res = await apiRequest("POST", `${API_BASE}/folders`, { name, parentId });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["folders"] });
    },
  });
}

export function useRenameFolder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const res = await apiRequest("PATCH", `${API_BASE}/folders/${id}`, { name });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["folders"] });
    },
  });
}

export function useMoveFolder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, parentId }: { id: string; parentId: string | null }) => {
      const res = await apiRequest("PATCH", `${API_BASE}/folders/${id}`, { parentId });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["folders"] });
    },
  });
}

export function useDeleteFolder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `${API_BASE}/folders/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["folders"] });
      queryClient.invalidateQueries({ queryKey: ["documents"] });
    },
  });
}
