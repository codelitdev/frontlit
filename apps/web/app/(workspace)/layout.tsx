import { API_PUBLIC_URL } from "@/lib/config";
import { ApiPublicUrlProvider } from "@/lib/public-config";
import { requireAuth } from "@/lib/server-auth";
import { AppSidebar } from "@/components/workspace/app-sidebar";
import { BreadcrumbProvider } from "@/components/workspace/breadcrumb-context";
import { WorkspaceBreadcrumb } from "@/components/workspace/workspace-breadcrumb";
import {
  WorkspaceAccessGate,
  WorkspaceAccessProvider,
} from "@/components/workspace/workspace-access";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { ImagePickerProvider } from "@/components/media/image-picker-provider";

export default async function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAuth();

  return (
    <ApiPublicUrlProvider apiPublicUrl={API_PUBLIC_URL}>
      <WorkspaceAccessProvider>
        <ImagePickerProvider>
          <SidebarProvider>
            <AppSidebar />

            <SidebarInset className="min-h-0 min-w-0 overflow-hidden">
              <BreadcrumbProvider>
                <header className="flex h-12 w-full shrink-0 items-center gap-2 border-b px-4">
                  <SidebarTrigger className="-ml-1" />
                  <Separator
                    orientation="vertical"
                    className="mr-2 data-vertical:h-4 data-vertical:self-auto"
                  />
                  <WorkspaceBreadcrumb />
                </header>
                <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                  <WorkspaceAccessGate>{children}</WorkspaceAccessGate>
                </div>
              </BreadcrumbProvider>
            </SidebarInset>
          </SidebarProvider>
        </ImagePickerProvider>
      </WorkspaceAccessProvider>
    </ApiPublicUrlProvider>
  );
}
