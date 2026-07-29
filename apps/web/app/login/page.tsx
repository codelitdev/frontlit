import { redirect } from "next/navigation";
import { API_PUBLIC_URL, WEB_CLIENT } from "@/lib/config";
import { getWebLoginUrl } from "@/lib/login-url";

export const dynamic = "force-dynamic";

export default function LoginPage() {
    redirect(
        getWebLoginUrl({
            apiPublicUrl: API_PUBLIC_URL,
            webClient: WEB_CLIENT,
        }),
    );
}
