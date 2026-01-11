import { useState, useEffect, useRef, useCallback } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";

export interface ThumbnailData {
  pageNum: number;
  dataUrl: string | null;
  loading: boolean;
}

interface UseThumbnailRendererOptions {
  pdfDoc: PDFDocumentProxy | null;
  numPages: number;
  open: boolean;
  thumbnailScale?: number;
  maxThumbnailsPerBatch?: number;
}

interface UseThumbnailRendererResult {
  thumbnails: Map<number, ThumbnailData>;
  loadMoreThumbnails: () => void;
}

const DEFAULT_THUMBNAIL_SCALE = 0.25;
const DEFAULT_MAX_THUMBNAILS_PER_BATCH = 10;

/**
 * Hook to render PDF page thumbnails with lazy loading.
 * Handles queue-based rendering and batch loading.
 */
export function useThumbnailRenderer({
  pdfDoc,
  numPages,
  open,
  thumbnailScale = DEFAULT_THUMBNAIL_SCALE,
  maxThumbnailsPerBatch = DEFAULT_MAX_THUMBNAILS_PER_BATCH,
}: UseThumbnailRendererOptions): UseThumbnailRendererResult {
  const [thumbnails, setThumbnails] = useState<Map<number, ThumbnailData>>(
    new Map()
  );

  const thumbnailQueueRef = useRef<number[]>([]);
  const isRenderingThumbnailsRef = useRef(false);
  const isOpenRef = useRef(open);

  // Track open state
  useEffect(() => {
    isOpenRef.current = open;
  }, [open]);

  // Reset thumbnails when PDF changes or closes
  useEffect(() => {
    if (!open) {
      setThumbnails(new Map());
      thumbnailQueueRef.current = [];
      isRenderingThumbnailsRef.current = false;
    }
  }, [open, pdfDoc]);

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
        const viewport = page.getViewport({ scale: thumbnailScale });

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
  }, [pdfDoc, thumbnailScale]);

  // Load initial batch of thumbnails
  useEffect(() => {
    if (!pdfDoc || !open) return;

    const pagesToLoad: number[] = [];
    for (let i = 1; i <= Math.min(numPages, maxThumbnailsPerBatch); i++) {
      if (!thumbnails.has(i)) {
        pagesToLoad.push(i);
      }
    }

    if (pagesToLoad.length > 0) {
      thumbnailQueueRef.current = [
        ...pagesToLoad,
        ...thumbnailQueueRef.current.filter((p) => !pagesToLoad.includes(p)),
      ];
      processThumbnailQueue();
    }
  }, [pdfDoc, numPages, open, maxThumbnailsPerBatch, processThumbnailQueue]);

  const loadMoreThumbnails = useCallback(() => {
    if (!pdfDoc) return;

    const loadedCount = thumbnails.size;
    const nextBatch: number[] = [];

    for (
      let i = loadedCount + 1;
      i <= Math.min(loadedCount + maxThumbnailsPerBatch, numPages);
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
  }, [pdfDoc, thumbnails, numPages, maxThumbnailsPerBatch, processThumbnailQueue]);

  return { thumbnails, loadMoreThumbnails };
}
