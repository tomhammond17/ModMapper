import { useState, useEffect, useRef } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { pdfjsLib } from "@/lib/pdf-worker";

interface UsePdfDocumentOptions {
  file: File | null;
  open: boolean;
}

interface UsePdfDocumentResult {
  pdfDoc: PDFDocumentProxy | null;
  numPages: number;
  loading: boolean;
}

/**
 * Hook to load and manage a PDF document.
 * Handles loading, cleanup, and lifecycle management.
 */
export function usePdfDocument({
  file,
  open,
}: UsePdfDocumentOptions): UsePdfDocumentResult {
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const currentFileRef = useRef<File | null>(null);

  // Reset selection when file changes
  useEffect(() => {
    if (file !== currentFileRef.current) {
      currentFileRef.current = file;
    }
  }, [file]);

  // Load PDF document
  useEffect(() => {
    if (!file || !open) return;

    let cancelled = false;

    // Clean up previous document
    if (pdfDoc) {
      pdfDoc.destroy();
      setPdfDoc(null);
    }

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

  // Cleanup on close
  useEffect(() => {
    if (!open && pdfDoc) {
      pdfDoc.destroy();
      setPdfDoc(null);
    }
  }, [open, pdfDoc]);

  return { pdfDoc, numPages, loading };
}
