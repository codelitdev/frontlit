import { notFound } from "next/navigation";
import ArticleEditor from "@/components/content/editors/article-editor";
import DocumentationEditor from "@/components/content/editors/documentation-editor";
import ProductUpdateEditor from "@/components/content/editors/product-update-editor";

export default async function ContentEditorPage({
  params,
}: {
  params: Promise<{ type: string; documentId: string }>;
}) {
  const { type, documentId } = await params;
  const childParams = Promise.resolve({ documentId });

  if (type === "articles") return <ArticleEditor params={childParams} />;
  if (type === "documentation") {
    return <DocumentationEditor params={childParams} />;
  }
  if (type === "changelog") {
    return <ProductUpdateEditor params={childParams} />;
  }
  notFound();
}
