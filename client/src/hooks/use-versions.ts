import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

export interface Version {
  id: string;
  versionNumber: number;
  registers: unknown[];
  createdAt: string;
  isLatestVersion: boolean;
}

export interface VersionComparison {
  added: unknown[];
  removed: unknown[];
  modified: Array<{ old: unknown; new: unknown }>;
}

const API_BASE = "/api/v1";

export function useVersions(documentId: string) {
  return useQuery<{ success: boolean; versions: Version[] }>({
    queryKey: ["documents", documentId, "versions"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/documents/${documentId}/versions`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch versions");
      return res.json();
    },
    enabled: !!documentId,
  });
}

export function useVersion(documentId: string, versionNumber: number) {
  return useQuery<{ success: boolean; version: Version }>({
    queryKey: ["documents", documentId, "versions", versionNumber],
    queryFn: async () => {
      const res = await fetch(
        `${API_BASE}/documents/${documentId}/versions/${versionNumber}`,
        { credentials: "include" }
      );
      if (!res.ok) throw new Error("Failed to fetch version");
      return res.json();
    },
    enabled: !!documentId && !!versionNumber,
  });
}

export function useCompareVersions(documentId: string, v1: number, v2: number) {
  return useQuery<{ success: boolean; comparison: VersionComparison }>({
    queryKey: ["documents", documentId, "versions", "compare", v1, v2],
    queryFn: async () => {
      const res = await fetch(
        `${API_BASE}/documents/${documentId}/versions/compare?v1=${v1}&v2=${v2}`,
        { credentials: "include" }
      );
      if (!res.ok) throw new Error("Failed to compare versions");
      return res.json();
    },
    enabled: !!documentId && !!v1 && !!v2,
  });
}

export function useCreateVersion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ documentId, registers }: { documentId: string; registers: unknown[] }) => {
      const res = await apiRequest("POST", `${API_BASE}/documents/${documentId}/versions`, {
        registers,
      });
      return res.json();
    },
    onSuccess: (_, { documentId }) => {
      queryClient.invalidateQueries({ queryKey: ["documents", documentId, "versions"] });
      queryClient.invalidateQueries({ queryKey: ["documents"] });
    },
  });
}

export function useRestoreVersion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ documentId, versionNumber }: { documentId: string; versionNumber: number }) => {
      const res = await apiRequest(
        "POST",
        `${API_BASE}/documents/${documentId}/restore/${versionNumber}`
      );
      return res.json();
    },
    onSuccess: (_, { documentId }) => {
      queryClient.invalidateQueries({ queryKey: ["documents", documentId] });
      queryClient.invalidateQueries({ queryKey: ["documents"] });
    },
  });
}
