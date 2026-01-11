import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

export interface TemplateConfig {
  showFields?: string[];
  fieldMapping?: Record<string, string>;
  fieldOrder?: string[];
  csv?: {
    delimiter?: string;
    includeHeader?: boolean;
    customHeaders?: string[];
  };
  json?: {
    rootKey?: string;
    prettyPrint?: boolean;
  };
  xml?: {
    rootElement?: string;
    itemElement?: string;
    useAttributes?: boolean;
  };
}

export interface Template {
  id: string;
  userId: string;
  name: string;
  format: "csv" | "json" | "xml";
  config: TemplateConfig;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

const API_BASE = "/api/v1";

export function useTemplates(format?: string) {
  return useQuery<{ success: boolean; templates: Template[] }>({
    queryKey: ["templates", format],
    queryFn: async () => {
      const url = format
        ? `${API_BASE}/templates?format=${format}`
        : `${API_BASE}/templates`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch templates");
      return res.json();
    },
  });
}

export function useTemplate(templateId: string | null) {
  return useQuery<{ success: boolean; template: Template }>({
    queryKey: ["templates", templateId],
    queryFn: async () => {
      if (!templateId) throw new Error("No template ID");
      const res = await fetch(`${API_BASE}/templates/${templateId}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch template");
      return res.json();
    },
    enabled: !!templateId,
  });
}

export function useCreateTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      name: string;
      format: "csv" | "json" | "xml";
      config: TemplateConfig;
    }) => {
      const res = await apiRequest("POST", `${API_BASE}/templates`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["templates"] });
    },
  });
}

export function useUpdateTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      ...data
    }: {
      id: string;
      name?: string;
      config?: TemplateConfig;
      isDefault?: boolean;
    }) => {
      const res = await apiRequest("PATCH", `${API_BASE}/templates/${id}`, data);
      return res.json();
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["templates"] });
      queryClient.invalidateQueries({ queryKey: ["templates", id] });
    },
  });
}

export function useDeleteTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `${API_BASE}/templates/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["templates"] });
    },
  });
}

export function usePreviewTemplate() {
  return useMutation({
    mutationFn: async ({
      templateId,
      registers,
    }: {
      templateId: string;
      registers: unknown[];
    }) => {
      const res = await apiRequest(
        "POST",
        `${API_BASE}/templates/${templateId}/preview`,
        { registers }
      );
      return res.json();
    },
  });
}
