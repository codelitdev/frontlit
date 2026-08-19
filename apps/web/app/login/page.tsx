import { redirect } from "next/navigation";
import { API_PUBLIC_URL, WEB_CLIENT } from "@/lib/config";
import { getWebLoginUrl } from "@/lib/login-url";

export const dynamic = "force-dynamic";

export default async function LoginPage({
    searchParams,
}: {
    searchParams: Promise<{ next?: string }>;
}) {
    const { next } = await searchParams;
    redirect(
        getWebLoginUrl({
            apiPublicUrl: API_PUBLIC_URL,
            webClient: WEB_CLIENT,
            next,
        }),
    );
}
