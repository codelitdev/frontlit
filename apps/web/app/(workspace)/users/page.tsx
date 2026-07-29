"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ApiError } from "@/lib/api-client";
import {
    type Contact,
    deleteContact,
    getNewsletterSettings,
    listContacts,
} from "@/lib/api";
import { PageHeader } from "@/components/workspace/page-header";
import { Loading } from "@/components/workspace/loading";
import { ScrollablePage } from "@/components/workspace/scrollable-page";
import { Banner } from "@/components/workspace/banner";
import { DeleteConfirm } from "@/components/workspace/delete-confirm";
import { Badge } from "@/components/ui/codelit/badge";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { useSetBreadcrumb } from "@/components/workspace/breadcrumb-context";

/**
 * Users: FrontLit's leads/contacts, captured via public-site email forms
 * and support tickets. A read-through over SendLit contacts
 * (architecture.md §10.2) — FrontLit stores no contact rows of its own, so
 * this reuses the same backing data as the Newsletter page's audience.
 */
export default function AudiencePage() {
    useSetBreadcrumb([{ label: "Users" }]);
    const [contacts, setContacts] = useState<Contact[]>([]);
    const [loading, setLoading] = useState(true);
    const [notConnected, setNotConnected] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);

    function handleLoadError(err: unknown) {
        if (err instanceof ApiError && err.status === 409) {
            setNotConnected(true);
        } else {
            setLoadError(
                err instanceof ApiError ? err.message : "Failed to load users.",
            );
        }
    }

    useEffect(() => {
        getNewsletterSettings()
            .then((s) => {
                if (!s.connected) {
                    setNotConnected(true);
                    return;
                }
                return listContacts()
                    .then(({ items }) => setContacts(items))
                    .catch(handleLoadError);
            })
            .catch(handleLoadError)
            .finally(() => setLoading(false));
    }, []);

    async function handleDeleteContact(contactId: string) {
        try {
            await deleteContact(contactId);
            setContacts((prev) =>
                prev.filter((c) => c.contactId !== contactId),
            );
        } catch (err) {
            toast.error(
                err instanceof ApiError
                    ? err.message
                    : "Failed to delete contact.",
            );
        }
    }

    if (loading) {
        return (
            <ScrollablePage>
                <Loading />
            </ScrollablePage>
        );
    }

    return (
        <ScrollablePage>
            <div className="max-w-3xl space-y-6">
                <PageHeader
                    title="Users"
                    description="Leads captured through email forms and support tickets across this team's site."
                />

                {notConnected && (
                    <Banner variant="warning">
                        This team isn&rsquo;t connected to SendLit yet.
                        It&rsquo;s provisioned automatically in the background —
                        check back shortly, or contact support if this persists.
                    </Banner>
                )}

                {loadError && <Banner>{loadError}</Banner>}

                {!notConnected && !loadError && (
                    <div className="rounded-lg border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Email</TableHead>
                                    <TableHead>Tags</TableHead>
                                    <TableHead className="w-px" />
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {contacts.length === 0 && (
                                    <TableRow>
                                        <TableCell
                                            colSpan={3}
                                            className="text-center text-muted-foreground"
                                        >
                                            No users yet.
                                        </TableCell>
                                    </TableRow>
                                )}
                                {contacts.map((c) => (
                                    <TableRow key={c.contactId}>
                                        <TableCell className="font-medium">
                                            {c.email}
                                        </TableCell>
                                        <TableCell>
                                            {c.tags.length === 0 ? (
                                                <span className="text-muted-foreground">
                                                    no tags
                                                </span>
                                            ) : (
                                                <div className="flex flex-wrap gap-1">
                                                    {c.tags.map((tag) => (
                                                        <Badge
                                                            key={tag}
                                                            variant="neutral"
                                                        >
                                                            {tag}
                                                        </Badge>
                                                    ))}
                                                </div>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            <DeleteConfirm
                                                description={`Delete ${c.email} from SendLit? This cannot be undone.`}
                                                onConfirm={() =>
                                                    handleDeleteContact(
                                                        c.contactId,
                                                    )
                                                }
                                            />
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                )}
            </div>
        </ScrollablePage>
    );
}
