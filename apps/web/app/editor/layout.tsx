import { requireAuth } from "@/lib/server-auth";
import { EditorAccessGate } from "@/components/workspace/editor-access-gate";
import { ImagePickerProvider } from "@/components/media/image-picker-provider";

export default async function EditorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAuth();
  return (
    <ImagePickerProvider>
      <EditorAccessGate>{children}</EditorAccessGate>
    </ImagePickerProvider>
  );
}
