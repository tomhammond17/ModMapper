import { Check, FileText, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { ThumbnailData } from "@/hooks/use-thumbnail-renderer";
import type { SearchResult } from "@/hooks/use-pdf-search";

interface ThumbnailItemProps {
  pageNum: number;
  thumbnail: ThumbnailData | undefined;
  isSelected: boolean;
  isCurrentPage: boolean;
  searchMatch: SearchResult | undefined;
  onPageClick: (pageNum: number) => void;
  onToggleSelection: (pageNum: number) => void;
}

/**
 * Individual thumbnail item for the PDF viewer sidebar.
 * Shows page preview, selection state, and search match count.
 */
export function ThumbnailItem({
  pageNum,
  thumbnail,
  isSelected,
  isCurrentPage,
  searchMatch,
  onPageClick,
  onToggleSelection,
}: ThumbnailItemProps) {
  return (
    <div
      className={`relative rounded-md overflow-hidden cursor-pointer transition-all ${
        isCurrentPage ? "ring-2 ring-primary" : "ring-1 ring-border"
      } ${isSelected ? "ring-2 ring-primary bg-primary/10" : ""}`}
      onClick={() => onPageClick(pageNum)}
      data-testid={`thumbnail-page-${pageNum}`}
    >
      {thumbnail?.dataUrl ? (
        <img
          src={thumbnail.dataUrl}
          alt={`Page ${pageNum}`}
          className="w-full"
        />
      ) : thumbnail?.loading ? (
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
          <span className="text-xs text-white font-medium">{pageNum}</span>
          {searchMatch && (
            <Badge variant="secondary" className="text-[10px] h-4 px-1">
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
          onToggleSelection(pageNum);
        }}
        data-testid={`checkbox-page-${pageNum}`}
      >
        {isSelected && <Check className="h-3 w-3" />}
      </button>
    </div>
  );
}
