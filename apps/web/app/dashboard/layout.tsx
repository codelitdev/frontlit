import Link from "next/link";
import { requireAuth } from "@/lib/server-auth";
import { TeamSwitcher } from "@/components/dashboard/team-switcher";
import { SignOutButton } from "@/components/dashboard/sign-out-button";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
    await requireAuth();

    return (
        <div className="flex min-h-screen">
            <aside className="flex w-60 shrink-0 flex-col border-r border-neutral-200 bg-neutral-50">
                <div className="border-b border-neutral-200 p-3">
                    <TeamSwitcher />
                </div>
                <nav className="flex-1 space-y-1 p-3 text-sm">
                    <Link href="/dashboard" className="block rounded-md px-2 py-1.5 hover:bg-neutral-100">
                        Overview
                    </Link>
                    <Link href="/dashboard/pages" className="block rounded-md px-2 py-1.5 hover:bg-neutral-100">
                        Pages
                    </Link>
                    <Link href="/dashboard/media" className="block rounded-md px-2 py-1.5 hover:bg-neutral-100">
                        Media
                    </Link>
                    <Link href="/dashboard/blog" className="block rounded-md px-2 py-1.5 hover:bg-neutral-100">
                        Blog
                    </Link>
                    <Link href="/dashboard/docs" className="block rounded-md px-2 py-1.5 hover:bg-neutral-100">
                        Docs
                    </Link>
                    <Link href="/dashboard/changelog" className="block rounded-md px-2 py-1.5 hover:bg-neutral-100">
                        Changelog
                    </Link>
                    <Link href="/dashboard/newsletter" className="block rounded-md px-2 py-1.5 hover:bg-neutral-100">
                        Newsletter
                    </Link>
                    <Link href="/dashboard/chatbot" className="block rounded-md px-2 py-1.5 hover:bg-neutral-100">
                        Chatbot
                    </Link>
                    <Link href="/dashboard/support" className="block rounded-md px-2 py-1.5 hover:bg-neutral-100">
                        Support
                    </Link>
                    <Link href="/dashboard/settings/domain" className="block rounded-md px-2 py-1.5 hover:bg-neutral-100">
                        Domain
                    </Link>
                    <Link href="/dashboard/settings/branding" className="block rounded-md px-2 py-1.5 hover:bg-neutral-100">
                        Branding
                    </Link>
                    <Link href="/dashboard/settings/code-injection" className="block rounded-md px-2 py-1.5 hover:bg-neutral-100">
                        Code injection
                    </Link>
                    <Link href="/dashboard/teams" className="block rounded-md px-2 py-1.5 hover:bg-neutral-100">
                        Team settings
                    </Link>
                </nav>
                <div className="border-t border-neutral-200 p-3">
                    <SignOutButton />
                </div>
            </aside>
            <main className="flex-1 p-8">{children}</main>
        </div>
    );
}
