import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";
import { pdfjsLib } from "@/lib/pdf-worker";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Search,
  Check,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  X,
  FileText,
  Loader2,
} from "lucide-react";

interface PdfViewerProps {
  file: File | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPagesSelected: (pages: number[]) => void;
  initialSelectedPages?: number[];
}

interface ThumbnailData {
  pageNum: number;
  dataUrl: string | null;
  loading: boolean;
}

interface SearchResult {
  pageNum: number;
  matches: number;
}

const THUMBNAIL_SCALE = 0.25;
const RENDER_SCALE_BASE = 1.5;
const MAX_THUMBNAILS_PER_BATCH = 10;

export function PdfViewer({
  file,
  open,
  onOpenChange,
  onPagesSelected,
  initialSelectedPages = [],
}: PdfViewerProps) {
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedPages, setSelectedPages] = useState<Set<number>>(
    new Set(initialSelectedPages)
  );
  const [thumbnails, setThumbnails] = useState<Map<number, ThumbnailData>>(
    new Map()
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [loading, setLoading] = useState(true);
  const [pageLoading, setPageLoading] = useState(false);

  const mainCanvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const thumbnailQueueRef = useRef<number[]>([]);
  const isRenderingThumbnailsRef = useRef(false);
  const isOpenRef = useRef(open);
  const currentFileRef = useRef<File | null>(null);

  useEffect(() => {
    isOpenRef.current = open;
  }, [open]);

  useEffect(() => {
    if (file !== currentFileRef.current) {
      currentFileRef.current = file;
      setSelectedPages(new Set());
    }
  }, [file]);

  useEffect(() => {
    if (!file || !open) return;

    let cancelled = false;

    if (pdfDoc) {
      pdfDoc.destroy();
      setPdfDoc(null);
    }
    thumbnailQueueRef.current = [];
    isRenderingThumbnailsRef.current = false;
    setThumbnails(new Map());

    const loadPdf = async () => {
      setLoading(true);
      try {
        const arrayBuffer = await file.arrayBuffer();
        const doc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        if (cancelled) {
          doc.destroy();
          return;
        }
        setPdfDoc(doc);
        setNumPages(doc.numPages);
        setCurrentPage(1);
        setSearchResults([]);
        setSearchQuery("");
      } catch (error) {
        console.error("Failed to load PDF:", error);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadPdf();

    return () => {
      cancelled = true;
    };
  }, [file, open]);

  useEffect(() => {
    if (!pdfDoc || !open) return;

    const pagesToLoad: number[] = [];
    for (let i = 1; i <= Math.min(numPages, MAX_THUMBNAILS_PER_BATCH); i++) {
      if (!thumbnails.has(i)) {
        pagesToLoad.push(i);
      }
    }

    if (pagesToLoad.length > 0) {
      thumbnailQueueRef.current = [...pagesToLoad, ...thumbnailQueueRef.current.filter(p => !pagesToLoad.includes(p))];
      processThumbnailQueue();
    }
  }, [pdfDoc, numPages, open]);

  const processThumbnailQueue = useCallback(async () => {
    if (isRenderingThumbnailsRef.current || !pdfDoc) return;

    isRenderingThumbnailsRef.current = true;

    while (thumbnailQueueRef.current.length > 0 && isOpenRef.current) {
      const pageNum = thumbnailQueueRef.current.shift()!;
      
      if (!isOpenRef.current) break;

      setThumbnails((prev) => {
        const newMap = new Map(prev);
        if (!newMap.has(pageNum)) {
          newMap.set(pageNum, { pageNum, dataUrl: null, loading: true });
        }
        return newMap;
      });

      try {
        const page = await pdfDoc.getPage(pageNum);
        const viewport = page.getViewport({ scale: THUMBNAIL_SCALE });

        const canvas = document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext("2d")!;

        await page.render({ canvasContext: ctx, viewport, canvas }).promise;

        const dataUrl = canvas.toDataURL();
        page.cleanup();

        setThumbnails((prev) => {
          const newMap = new Map(prev);
          newMap.set(pageNum, { pageNum, dataUrl, loading: false });
          return newMap;
        });
      } catch (error) {
        console.error(`Failed to render thumbnail for page ${pageNum}:`, error);
        setThumbnails((prev) => {
          const newMap = new Map(prev);
          newMap.set(pageNum, { pageNum, dataUrl: null, loading: false });
          return newMap;
        });
      }
    }

    isRenderingThumbnailsRef.current = false;
  }, [pdfDoc]);

  const loadMoreThumbnails = useCallback(() => {
    if (!pdfDoc) return;

    const loadedCount = thumbnails.size;
    const nextBatch: number[] = [];

    for (
      let i = loadedCount + 1;
      i <= Math.min(loadedCount + MAX_THUMBNAILS_PER_BATCH, numPages);
      i++
    ) {
      if (!thumbnails.has(i)) {
        nextBatch.push(i);
      }
    }

    if (nextBatch.length > 0) {
      thumbnailQueueRef.current = [...thumbnailQueueRef.current, ...nextBatch];
      processThumbnailQueue();
    }
  }, [pdfDoc, thumbnails, numPages, processThumbnailQueue]);

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

  const handleSearch = useCallback(async () => {
    if (!pdfDoc || !searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    const results: SearchResult[] = [];
    const query = searchQuery.toLowerCase();

    try {
      for (let i = 1; i <= numPages; i++) {
        const page = await pdfDoc.getPage(i);
        const textContent = await page.getTextContent();
        let matches = 0;

        for (const item of textContent.items) {
          if ("str" in item && item.str.toLowerCase().includes(query)) {
            matches++;
          }
        }

        if (matches > 0) {
          results.push({ pageNum: i, matches });
        }

        page.cleanup();
      }

      setSearchResults(results);
    } catch (error) {
      console.error("Search failed:", error);
    } finally {
      setIsSearching(false);
    }
  }, [pdfDoc, searchQuery, numPages]);

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

  const handleClose = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  useEffect(() => {
    if (!open) {
      pdfDoc?.destroy();
      setPdfDoc(null);
      setThumbnails(new Map());
      thumbnailQueueRef.current = [];
      isRenderingThumbnailsRef.current = false;
    }
  }, [open]);

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
                      (pageNum) => {
                        const thumb = thumbnails.get(pageNum);
                        const isSelected = selectedPages.has(pageNum);
                        const isCurrentPage = currentPage === pageNum;
                        const searchMatch = searchResults.find(
                          (r) => r.pageNum === pageNum
                        );

                        return (
                          <div
                            key={pageNum}
                            className={`relative rounded-md overflow-hidden cursor-pointer transition-all ${
                              isCurrentPage
                                ? "ring-2 ring-primary"
                                : "ring-1 ring-border"
                            } ${isSelected ? "ring-2 ring-primary bg-primary/10" : ""}`}
                            onClick={() => setCurrentPage(pageNum)}
                            data-testid={`thumbnail-page-${pageNum}`}
                          >
                            {thumb?.dataUrl ? (
                              <img
                                src={thumb.dataUrl}
                                alt={`Page ${pageNum}`}
                                className="w-full"
                              />
                            ) : thumb?.loading ? (
                              <div className="w-full aspect-[8.5/11] flex items-center justify-center bg-muted">
                                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                              </div>
                            ) : (
                              <div className="w-full aspect-[8.5/11] flex items-center justify-center bg-muted">
                                <FileText className="h-6 w-6 text-muted-foreground" />
                              </div>
                            )}

                            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-1">
                              <div className="flex items-center justify-between">
                                <span className="text-xs text-white font-medium">
                                  {pageNum}
                                </span>
                                {searchMatch && (
                                  <Badge
                                    variant="secondary"
                                    className="text-[10px] h-4 px-1"
                                  >
                                    {searchMatch.matches}
                                  </Badge>
                                )}
                              </div>
                            </div>

                            <button
                              className={`absolute top-1 right-1 w-5 h-5 rounded-sm flex items-center justify-center transition-colors ${
                                isSelected
                                  ? "bg-primary text-primary-foreground"
                                  : "bg-white/80 text-muted-foreground hover:bg-white"
                              }`}
                              onClick={(e) => {
                                e.stopPropagation();
                                togglePageSelection(pageNum);
                              }}
                              data-testid={`checkbox-page-${pageNum}`}
                            >
                              {isSelected && <Check className="h-3 w-3" />}
                            </button>
                          </div>
                        );
                      }
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

          <div className="flex-1 flex flex-col min-w-0">
            <div className="flex items-center justify-between gap-4 px-4 py-2 border-b bg-muted/30">
              <div className="flex items-center gap-2">
                <Button
                  size="icon"
                  variant="outline"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage <= 1}
                  data-testid="button-prev-page"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm min-w-[80px] text-center">
                  Page {currentPage} of {numPages}
                </span>
                <Button
                  size="icon"
                  variant="outline"
                  onClick={() =>
                    setCurrentPage((p) => Math.min(numPages, p + 1))
                  }
                  disabled={currentPage >= numPages}
                  data-testid="button-next-page"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  size="icon"
                  variant="outline"
                  onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}
                  disabled={zoom <= 0.5}
                  data-testid="button-zoom-out"
                >
                  <ZoomOut className="h-4 w-4" />
                </Button>
                <span className="text-sm min-w-[60px] text-center">
                  {Math.round(zoom * 100)}%
                </span>
                <Button
                  size="icon"
                  variant="outline"
                  onClick={() => setZoom((z) => Math.min(3, z + 0.25))}
                  disabled={zoom >= 3}
                  data-testid="button-zoom-in"
                >
                  <ZoomIn className="h-4 w-4" />
                </Button>
              </div>

              <Button
                variant={selectedPages.has(currentPage) ? "default" : "outline"}
                size="sm"
                onClick={() => togglePageSelection(currentPage)}
                data-testid="button-toggle-current-page"
              >
                {selectedPages.has(currentPage) ? (
                  <>
                    <Check className="h-4 w-4 mr-1" />
                    Selected
                  </>
                ) : (
                  "Select This Page"
                )}
              </Button>
            </div>

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
