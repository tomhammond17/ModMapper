import { TemplateEditor } from "@/components/templates/template-editor";

interface TemplateEditorPageProps {
  params: { id: string };
}

export default function TemplateEditorPage({ params }: TemplateEditorPageProps) {
  return <TemplateEditor templateId={params.id} />;
}
