import { redirect } from "next/navigation";
import { API_PUBLIC_URL, WEB_CLIENT } from "@/lib/config";
import { getDashboardLoginUrl } from "@/lib/login-url";

export const dynamic = "force-dynamic";

export default function LoginPage() {
    redirect(
        getDashboardLoginUrl({
            apiPublicUrl: API_PUBLIC_URL,
            webClient: WEB_CLIENT,
        }),
    );
}
