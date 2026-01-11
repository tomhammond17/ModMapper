import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { pdfjsLib } from "@/lib/pdf-worker";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, Check, X, FileText, Loader2 } from "lucide-react";
import { usePdfDocument } from "@/hooks/use-pdf-document";
import { useThumbnailRenderer } from "@/hooks/use-thumbnail-renderer";
import { usePdfSearch } from "@/hooks/use-pdf-search";
import { ThumbnailItem, PdfViewerToolbar } from "@/components/pdf-viewer/index";

interface PdfViewerProps {
  file: File | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPagesSelected: (pages: number[]) => void;
  initialSelectedPages?: number[];
}

const RENDER_SCALE_BASE = 1.5;

export function PdfViewer({
  file,
  open,
  onOpenChange,
  onPagesSelected,
  initialSelectedPages = [],
}: PdfViewerProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedPages, setSelectedPages] = useState<Set<number>>(
    new Set(initialSelectedPages)
  );
  const [zoom, setZoom] = useState(1);
  const [pageLoading, setPageLoading] = useState(false);

  const mainCanvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const currentFileRef = useRef<File | null>(null);

  // Use extracted hooks
  const { pdfDoc, numPages, loading } = usePdfDocument({ file, open });
  const { thumbnails, loadMoreThumbnails } = useThumbnailRenderer({
    pdfDoc,
    numPages,
    open,
  });
  const {
    searchQuery,
    setSearchQuery,
    searchResults,
    isSearching,
    handleSearch,
  } = usePdfSearch({ pdfDoc, numPages });

  // Reset selected pages when file changes
  useEffect(() => {
    if (file !== currentFileRef.current) {
      currentFileRef.current = file;
      setSelectedPages(new Set());
    }
  }, [file]);

  // Reset current page when PDF loads
  useEffect(() => {
    if (pdfDoc) {
      setCurrentPage(1);
    }
  }, [pdfDoc]);

  // Render main page canvas
  useEffect(() => {
    if (!pdfDoc || !mainCanvasRef.current || !open) return;

    let cancelled = false;

    const renderPage = async () => {
      setPageLoading(true);
      try {
        const page = await pdfDoc.getPage(currentPage);
        if (cancelled) return;

        const scale = RENDER_SCALE_BASE * zoom;
        const viewport = page.getViewport({ scale });

        const canvas = mainCanvasRef.current!;
        canvas.width = viewport.width;
        canvas.height = viewport.height;

        const ctx = canvas.getContext("2d")!;
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        await page.render({ canvasContext: ctx, viewport, canvas }).promise;

        if (textLayerRef.current) {
          textLayerRef.current.innerHTML = "";
          const textContent = await page.getTextContent();

          textLayerRef.current.style.width = `${viewport.width}px`;
          textLayerRef.current.style.height = `${viewport.height}px`;

          for (const item of textContent.items) {
            if ("str" in item && item.str) {
              const tx = pdfjsLib.Util.transform(
                viewport.transform,
                item.transform
              );
              const div = document.createElement("span");
              div.textContent = item.str;
              div.style.position = "absolute";
              div.style.left = `${tx[4]}px`;
              div.style.top = `${viewport.height - tx[5]}px`;
              div.style.fontSize = `${Math.abs(tx[0])}px`;
              div.style.fontFamily = "sans-serif";
              div.style.color = "transparent";
              div.style.whiteSpace = "pre";
              textLayerRef.current.appendChild(div);
            }
          }
        }

        page.cleanup();
      } catch (error) {
        console.error("Failed to render page:", error);
      } finally {
        if (!cancelled) {
          setPageLoading(false);
        }
      }
    };

    renderPage();

    return () => {
      cancelled = true;
    };
  }, [pdfDoc, currentPage, zoom, open]);

  const togglePageSelection = useCallback((pageNum: number) => {
    setSelectedPages((prev) => {
      const next = new Set(prev);
      if (next.has(pageNum)) {
        next.delete(pageNum);
      } else {
        next.add(pageNum);
      }
      return next;
    });
  }, []);

  const handleConfirmSelection = useCallback(() => {
    const sortedPages = Array.from(selectedPages).sort((a, b) => a - b);
    onPagesSelected(sortedPages);
    onOpenChange(false);
  }, [selectedPages, onPagesSelected, onOpenChange]);

  const selectionSummary = useMemo(() => {
    if (selectedPages.size === 0) return "";

    const sorted = Array.from(selectedPages).sort((a, b) => a - b);
    const ranges: string[] = [];
    let start = sorted[0];
    let end = sorted[0];

    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i] === end + 1) {
        end = sorted[i];
      } else {
        ranges.push(start === end ? `${start}` : `${start}-${end}`);
        start = sorted[i];
        end = sorted[i];
      }
    }
    ranges.push(start === end ? `${start}` : `${start}-${end}`);

    return ranges.join(", ");
  }, [selectedPages]);

  // Navigation handlers
  const handlePrevPage = useCallback(() => {
    setCurrentPage((p) => Math.max(1, p - 1));
  }, []);

  const handleNextPage = useCallback(() => {
    setCurrentPage((p) => Math.min(numPages, p + 1));
  }, [numPages]);

  const handleZoomIn = useCallback(() => {
    setZoom((z) => Math.min(3, z + 0.25));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom((z) => Math.max(0.5, z - 0.25));
  }, []);

  const handleToggleCurrentPage = useCallback(() => {
    togglePageSelection(currentPage);
  }, [togglePageSelection, currentPage]);

  if (!file) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-4 py-3 border-b flex-shrink-0">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <FileText className="h-5 w-5 text-primary" />
              <DialogTitle className="text-base font-medium">
                {file.name}
              </DialogTitle>
              {numPages > 0 && (
                <Badge variant="secondary" className="text-xs">
                  {numPages} pages
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2">
              {selectedPages.size > 0 && (
                <Badge variant="default" className="text-xs">
                  {selectedPages.size} selected
                </Badge>
              )}
              <Button
                size="sm"
                onClick={handleConfirmSelection}
                disabled={selectedPages.size === 0}
                data-testid="button-confirm-selection"
              >
                <Check className="h-4 w-4 mr-1" />
                Use Selected Pages
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="flex flex-1 min-h-0">
          {/* Sidebar with search and thumbnails */}
          <div className="w-56 border-r flex flex-col bg-muted/30">
            <div className="p-3 border-b space-y-2">
              <div className="flex gap-2">
                <Input
                  placeholder="Search in PDF..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                  className="h-8 text-sm"
                  data-testid="input-pdf-search"
                />
                <Button
                  size="icon"
                  variant="outline"
                  className="h-8 w-8 flex-shrink-0"
                  onClick={handleSearch}
                  disabled={isSearching}
                  data-testid="button-pdf-search"
                >
                  {isSearching ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Search className="h-4 w-4" />
                  )}
                </Button>
              </div>
              {searchResults.length > 0 && (
                <div className="text-xs text-muted-foreground">
                  Found in {searchResults.length} page
                  {searchResults.length !== 1 ? "s" : ""}
                </div>
              )}
            </div>

            <ScrollArea className="flex-1">
              <div className="p-2 space-y-2">
                {loading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton
                      key={i}
                      className="w-full aspect-[8.5/11] rounded-md"
                    />
                  ))
                ) : (
                  <>
                    {Array.from({ length: numPages }, (_, i) => i + 1).map(
                      (pageNum) => (
                        <ThumbnailItem
                          key={pageNum}
                          pageNum={pageNum}
                          thumbnail={thumbnails.get(pageNum)}
                          isSelected={selectedPages.has(pageNum)}
                          isCurrentPage={currentPage === pageNum}
                          searchMatch={searchResults.find(
                            (r) => r.pageNum === pageNum
                          )}
                          onPageClick={setCurrentPage}
                          onToggleSelection={togglePageSelection}
                        />
                      )
                    )}
                    {thumbnails.size < numPages && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full"
                        onClick={loadMoreThumbnails}
                        data-testid="button-load-more-thumbnails"
                      >
                        Load More
                      </Button>
                    )}
                  </>
                )}
              </div>
            </ScrollArea>
          </div>

          {/* Main content area */}
          <div className="flex-1 flex flex-col min-w-0">
            <PdfViewerToolbar
              currentPage={currentPage}
              numPages={numPages}
              zoom={zoom}
              isCurrentPageSelected={selectedPages.has(currentPage)}
              onPrevPage={handlePrevPage}
              onNextPage={handleNextPage}
              onZoomIn={handleZoomIn}
              onZoomOut={handleZoomOut}
              onToggleCurrentPage={handleToggleCurrentPage}
            />

            <ScrollArea className="flex-1">
              <div className="flex items-center justify-center p-4 min-h-full">
                {loading ? (
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <span className="text-sm text-muted-foreground">
                      Loading PDF...
                    </span>
                  </div>
                ) : (
                  <div className="relative">
                    <canvas
                      ref={mainCanvasRef}
                      className="shadow-lg rounded-sm"
                    />
                    <div
                      ref={textLayerRef}
                      className="absolute top-0 left-0 pointer-events-none select-text"
                    />
                    {pageLoading && (
                      <div className="absolute inset-0 flex items-center justify-center bg-background/50">
                        <Loader2 className="h-6 w-6 animate-spin text-primary" />
                      </div>
                    )}
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>
        </div>

        {selectedPages.size > 0 && (
          <div className="px-4 py-3 border-t bg-muted/30 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-sm text-muted-foreground flex-shrink-0">
                Selected pages:
              </span>
              <code className="text-sm font-mono bg-muted px-2 py-1 rounded truncate">
                {selectionSummary}
              </code>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedPages(new Set())}
              data-testid="button-clear-selection"
            >
              <X className="h-4 w-4 mr-1" />
              Clear
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
