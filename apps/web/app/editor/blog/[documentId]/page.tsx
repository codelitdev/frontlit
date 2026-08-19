import { redirect } from "next/navigation";

export default async function LegacyBlogEditor({
    params,
}: {
    params: Promise<{ documentId: string }>;
}) {
    const { documentId } = await params;
    redirect(`/editor/content/articles/${documentId}`);
}
