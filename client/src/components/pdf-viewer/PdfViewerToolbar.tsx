import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Check } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PdfViewerToolbarProps {
  currentPage: number;
  numPages: number;
  zoom: number;
  isCurrentPageSelected: boolean;
  onPrevPage: () => void;
  onNextPage: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onToggleCurrentPage: () => void;
}

/**
 * Toolbar component for the PDF viewer.
 * Provides navigation, zoom controls, and page selection.
 */
export function PdfViewerToolbar({
  currentPage,
  numPages,
  zoom,
  isCurrentPageSelected,
  onPrevPage,
  onNextPage,
  onZoomIn,
  onZoomOut,
  onToggleCurrentPage,
}: PdfViewerToolbarProps) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-2 border-b bg-muted/30">
      <div className="flex items-center gap-2">
        <Button
          size="icon"
          variant="outline"
          onClick={onPrevPage}
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
          onClick={onNextPage}
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
          onClick={onZoomOut}
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
          onClick={onZoomIn}
          disabled={zoom >= 3}
          data-testid="button-zoom-in"
        >
          <ZoomIn className="h-4 w-4" />
        </Button>
      </div>

      <Button
        variant={isCurrentPageSelected ? "default" : "outline"}
        size="sm"
        onClick={onToggleCurrentPage}
        data-testid="button-toggle-current-page"
      >
        {isCurrentPageSelected ? (
          <>
            <Check className="h-4 w-4 mr-1" />
            Selected
          </>
        ) : (
          "Select This Page"
        )}
      </Button>
    </div>
  );
}
