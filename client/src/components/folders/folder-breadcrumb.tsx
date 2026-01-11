import { useFolderPath } from "@/hooks/use-folders";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Home } from "lucide-react";
import { Fragment } from "react";

interface FolderBreadcrumbProps {
  folderId: string | null;
  onNavigate: (folderId: string | null) => void;
}

export function FolderBreadcrumb({ folderId, onNavigate }: FolderBreadcrumbProps) {
  const { data } = useFolderPath(folderId);
  const path = data?.path ?? [];

  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          {folderId ? (
            <BreadcrumbLink
              href="#"
              onClick={(e) => {
                e.preventDefault();
                onNavigate(null);
              }}
              className="flex items-center gap-1"
            >
              <Home className="h-4 w-4" />
              Documents
            </BreadcrumbLink>
          ) : (
            <BreadcrumbPage className="flex items-center gap-1">
              <Home className="h-4 w-4" />
              Documents
            </BreadcrumbPage>
          )}
        </BreadcrumbItem>

        {path.map((folder, index) => (
          <Fragment key={folder.id}>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              {index === path.length - 1 ? (
                <BreadcrumbPage>{folder.name}</BreadcrumbPage>
              ) : (
                <BreadcrumbLink
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    onNavigate(folder.id);
                  }}
                >
                  {folder.name}
                </BreadcrumbLink>
              )}
            </BreadcrumbItem>
          </Fragment>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
