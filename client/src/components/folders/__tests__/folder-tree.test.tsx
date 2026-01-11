import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Mock the folders hook
const mockFolders = [
  { id: "folder-1", name: "Documents", parentId: null, path: "/" },
  { id: "folder-2", name: "Reports", parentId: null, path: "/" },
  { id: "folder-3", name: "Subfolder", parentId: "folder-1", path: "/folder-1/" },
];

let mockIsLoading = false;

vi.mock("@/hooks/use-folders", () => ({
  useFolders: () => ({
    data: { folders: mockFolders },
    isLoading: mockIsLoading,
  }),
}));

// Mock the dialog components to simplify testing
vi.mock("../create-folder-dialog", () => ({
  CreateFolderDialog: ({ open }: { open: boolean }) =>
    open ? <div data-testid="create-dialog">Create Dialog</div> : null,
}));

vi.mock("../rename-folder-dialog", () => ({
  RenameFolderDialog: ({ open }: { open: boolean }) =>
    open ? <div data-testid="rename-dialog">Rename Dialog</div> : null,
}));

vi.mock("../delete-folder-dialog", () => ({
  DeleteFolderDialog: ({ open }: { open: boolean }) =>
    open ? <div data-testid="delete-dialog">Delete Dialog</div> : null,
}));

// Create a wrapper with query client
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe("FolderTree", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsLoading = false;
  });

  describe("rendering", () => {
    it("should render folder tree header", async () => {
      const { FolderTree } = await import("../folder-tree");
      render(
        <FolderTree selectedFolderId={null} onSelectFolder={vi.fn()} />,
        { wrapper: createWrapper() }
      );

      expect(screen.getByText("Folders")).toBeInTheDocument();
    });

    it("should render All Documents option", async () => {
      const { FolderTree } = await import("../folder-tree");
      render(
        <FolderTree selectedFolderId={null} onSelectFolder={vi.fn()} />,
        { wrapper: createWrapper() }
      );

      expect(screen.getByText("All Documents")).toBeInTheDocument();
    });

    it("should render root folders", async () => {
      const { FolderTree } = await import("../folder-tree");
      render(
        <FolderTree selectedFolderId={null} onSelectFolder={vi.fn()} />,
        { wrapper: createWrapper() }
      );

      expect(screen.getByText("Documents")).toBeInTheDocument();
      expect(screen.getByText("Reports")).toBeInTheDocument();
    });

    it("should show loading skeleton when loading", async () => {
      mockIsLoading = true;

      const { FolderTree } = await import("../folder-tree");
      const { container } = render(
        <FolderTree selectedFolderId={null} onSelectFolder={vi.fn()} />,
        { wrapper: createWrapper() }
      );

      const skeletons = container.querySelectorAll(".animate-pulse");
      expect(skeletons.length).toBeGreaterThan(0);
    });
  });

  describe("folder selection", () => {
    it("should call onSelectFolder when folder is clicked", async () => {
      const { FolderTree } = await import("../folder-tree");
      const onSelectFolder = vi.fn();

      render(
        <FolderTree selectedFolderId={null} onSelectFolder={onSelectFolder} />,
        { wrapper: createWrapper() }
      );

      fireEvent.click(screen.getByText("Documents"));

      expect(onSelectFolder).toHaveBeenCalledWith("folder-1");
    });

    it("should call onSelectFolder with null when All Documents is clicked", async () => {
      const { FolderTree } = await import("../folder-tree");
      const onSelectFolder = vi.fn();

      render(
        <FolderTree selectedFolderId="folder-1" onSelectFolder={onSelectFolder} />,
        { wrapper: createWrapper() }
      );

      fireEvent.click(screen.getByText("All Documents"));

      expect(onSelectFolder).toHaveBeenCalledWith(null);
    });

    it("should highlight selected folder", async () => {
      const { FolderTree } = await import("../folder-tree");

      render(
        <FolderTree selectedFolderId="folder-1" onSelectFolder={vi.fn()} />,
        { wrapper: createWrapper() }
      );

      const folderElement = screen.getByText("Documents").closest("div");
      expect(folderElement?.className).toContain("bg-muted");
    });
  });

  describe("folder expansion", () => {
    it("should not show children by default", async () => {
      const { FolderTree } = await import("../folder-tree");

      render(
        <FolderTree selectedFolderId={null} onSelectFolder={vi.fn()} />,
        { wrapper: createWrapper() }
      );

      // Subfolder should not be visible initially
      expect(screen.queryByText("Subfolder")).not.toBeInTheDocument();
    });
  });

  describe("create folder button", () => {
    it("should show create folder button in header", async () => {
      const { FolderTree } = await import("../folder-tree");

      render(
        <FolderTree selectedFolderId={null} onSelectFolder={vi.fn()} />,
        { wrapper: createWrapper() }
      );

      // Plus button should be present
      const buttons = screen.getAllByRole("button");
      expect(buttons.length).toBeGreaterThan(0);
    });
  });
});
