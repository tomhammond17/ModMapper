import { useState, useCallback } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";

export interface SearchResult {
  pageNum: number;
  matches: number;
}

interface UsePdfSearchOptions {
  pdfDoc: PDFDocumentProxy | null;
  numPages: number;
}

interface UsePdfSearchResult {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  searchResults: SearchResult[];
  isSearching: boolean;
  handleSearch: () => Promise<void>;
}

/**
 * Hook to search text content within a PDF document.
 * Searches all pages and returns match counts per page.
 */
export function usePdfSearch({
  pdfDoc,
  numPages,
}: UsePdfSearchOptions): UsePdfSearchResult {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);

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

  return {
    searchQuery,
    setSearchQuery,
    searchResults,
    isSearching,
    handleSearch,
  };
}
