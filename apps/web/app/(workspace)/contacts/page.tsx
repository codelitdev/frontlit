"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { TagEditor } from "@sendlit/email-blocks";
import { ApiError } from "@/lib/api-client";
import {
    type Contact,
    type ContactFilter,
    createContact,
    deleteContact,
    getEmailSettings,
    listContacts,
} from "@/lib/api";
import {
    EMPTY_CONTACT_FILTER,
    serializeContactFilter,
} from "@/lib/contact-filters";
import {
    CONTACT_PAGE_SIZE,
    contactListHref,
    contactPageCount,
    contactPageRange,
    parseContactPage,
} from "@/lib/contact-page";
import { ContactAudienceFilter } from "@/components/contacts/contact-audience-filter";
import { Loading } from "@/components/workspace/loading";
import { ScrollablePage } from "@/components/workspace/scrollable-page";
import { Banner } from "@/components/workspace/banner";
import { DeleteConfirm } from "@/components/workspace/delete-confirm";
import { Badge } from "@/components/ui/codelit/badge";
import { Button } from "@/components/ui/codelit/button";
import { Input } from "@/components/ui/codelit/input";
import { Label } from "@/components/ui/codelit/label";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/codelit/dialog";
import { useSetBreadcrumb } from "@/components/workspace/breadcrumb-context";

/**
 * Contacts: FrontLit's leads/audience, captured via public-site email forms
 * and support tickets or created here. A read-through over SendLit contacts
 * (architecture.md §10.2) — FrontLit stores no contact rows of its own.
 */
export default function ContactsPage({
    searchParams,
}: {
    searchParams: Promise<{ page?: string | string[] }>;
}) {
    const query = use(searchParams);
    const page = parseContactPage(query.page);

    return <ContactsWorkspace page={page} />;
}

function ContactsWorkspace({ page }: { page: number }) {
    useSetBreadcrumb([{ label: "Contacts" }]);
    const router = useRouter();
    const [contacts, setContacts] = useState<Contact[]>([]);
    const [total, setTotal] = useState(0);
    const [hasAnyContacts, setHasAnyContacts] = useState(false);
    const [filter, setFilter] = useState<ContactFilter>(EMPTY_CONTACT_FILTER);
    const [loading, setLoading] = useState(true);
    const [notConnected, setNotConnected] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [newContactOpen, setNewContactOpen] = useState(false);
    const [newEmail, setNewEmail] = useState("");
    const [newName, setNewName] = useState("");
    const [newTags, setNewTags] = useState<string[]>([]);
    const [creating, setCreating] = useState(false);

    const serializedFilter = serializeContactFilter(filter);

    function handleLoadError(err: unknown) {
        if (err instanceof ApiError && err.status === 409) {
            setNotConnected(true);
            return;
        }
        setLoadError(
            err instanceof ApiError ? err.message : "Failed to load contacts.",
        );
    }

    const pageCount = contactPageCount(total);
    const range = contactPageRange(page, total);

    useEffect(() => {
        if (total > 0 && page > pageCount) {
            router.replace(contactListHref(pageCount));
        }
    }, [page, pageCount, router, total]);

    useEffect(() => {
        let cancelled = false;
        getEmailSettings()
            .then((settings) => {
                if (cancelled) return;
                if (!settings.connected) {
                    setNotConnected(true);
                    return;
                }
                return listContacts({
                    filter: serializedFilter,
                    offset: page,
                    itemsPerPage: CONTACT_PAGE_SIZE,
                }).then((result) => {
                    if (cancelled) return;
                    setContacts(result.items);
                    setTotal(result.total);
                    if (!serializedFilter) {
                        setHasAnyContacts(result.total > 0);
                    }
                });
            })
            .catch(handleLoadError)
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [page, serializedFilter]);

    async function reload(nextFilter: ContactFilter = filter, nextPage = page) {
        const serialized = serializeContactFilter(nextFilter);
        const result = await listContacts({
            filter: serialized,
            offset: nextPage,
            itemsPerPage: CONTACT_PAGE_SIZE,
        });
        setContacts(result.items);
        setTotal(result.total);
        if (!serialized) {
            setHasAnyContacts(result.total > 0);
            return;
        }
        if (result.total > 0) {
            setHasAnyContacts(true);
            return;
        }
        const unfiltered = await listContacts({ itemsPerPage: 1 });
        setHasAnyContacts(unfiltered.total > 0);
    }

    function handleFilterChange(next: ContactFilter) {
        setFilter(next);
        if (page !== 1) router.replace(contactListHref(1));
    }

    async function handleCreateContact(event: React.FormEvent) {
        event.preventDefault();
        if (!newEmail.trim()) return;
        setCreating(true);
        try {
            await createContact({
                email: newEmail.trim(),
                name: newName.trim() || undefined,
                tags: newTags.length > 0 ? newTags : undefined,
            });
            setNewEmail("");
            setNewName("");
            setNewTags([]);
            setNewContactOpen(false);
            if (page !== 1) router.replace(contactListHref(1));
            await reload(filter, 1);
            toast.success("Contact saved.");
        } catch (err) {
            toast.error(
                err instanceof ApiError
                    ? err.message
                    : "Failed to create contact.",
            );
        } finally {
            setCreating(false);
        }
    }

    async function handleDeleteContact(contact: Contact) {
        try {
            await deleteContact(contact.contactId);
            const remainingOnPage = contacts.length - 1;
            if (remainingOnPage === 0 && page > 1) {
                router.replace(contactListHref(page - 1));
                await reload(filter, page - 1);
            } else {
                await reload();
            }
            toast.success("Contact deleted.");
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
            <div className="mx-auto w-full max-w-6xl">
                <header className="mb-7 flex flex-col gap-5 border-b pb-5 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                        <h1 className="text-2xl font-semibold tracking-tight">
                            Contacts
                        </h1>
                        <p className="mt-1 text-sm text-muted-foreground">
                            Your SendLit audience — leads from forms, tickets,
                            and contacts you add here.
                        </p>
                    </div>
                    {!notConnected && (
                        <Button
                            onClick={() => {
                                setNewEmail("");
                                setNewName("");
                                setNewTags([]);
                                setNewContactOpen(true);
                            }}
                        >
                            <Plus />
                            New contact
                        </Button>
                    )}
                </header>

                <div className="space-y-7">
                    {notConnected && (
                        <Banner variant="warning">
                            Configure the email delivery connection in Settings
                            first.
                        </Banner>
                    )}
                    {loadError && <Banner>{loadError}</Banner>}

                    {!notConnected && !loadError && !hasAnyContacts && (
                        <p className="text-sm text-muted-foreground">
                            No contacts yet. Create one to get started.
                        </p>
                    )}

                    {!notConnected && !loadError && hasAnyContacts && (
                        <>
                            <ContactAudienceFilter
                                value={filter}
                                onChange={handleFilterChange}
                                count={total}
                            />
                            {contacts.length === 0 ? (
                                <p className="p-5 text-sm text-muted-foreground">
                                    No contacts match this filter.
                                </p>
                            ) : (
                                <div className="divide-y overflow-hidden rounded-xl border bg-card">
                                    {contacts.map((contact) => {
                                        const name = contact.name?.trim();
                                        return (
                                            <div
                                                key={contact.contactId}
                                                className="group flex items-center gap-3 px-4 py-3.5 hover:bg-muted/35 sm:px-5"
                                            >
                                                <Link
                                                    href={`/contacts/${contact.contactId}`}
                                                    className="min-w-0 flex-1"
                                                >
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <span className="truncate text-sm font-semibold group-hover:underline">
                                                            {name ||
                                                                contact.email}
                                                        </span>
                                                        <Badge
                                                            variant={
                                                                contact.subscribed
                                                                    ? "success"
                                                                    : "outline"
                                                            }
                                                            className="px-2 py-0.5 text-[0.6875rem] font-medium"
                                                        >
                                                            {contact.subscribed
                                                                ? "Subscribed"
                                                                : "Unsubscribed"}
                                                        </Badge>
                                                    </div>
                                                    <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5">
                                                        {name ? (
                                                            <span className="truncate text-xs text-muted-foreground">
                                                                {contact.email}
                                                            </span>
                                                        ) : null}
                                                        {contact.tags.length ===
                                                        0 ? (
                                                            <span className="text-xs text-muted-foreground">
                                                                No tags
                                                            </span>
                                                        ) : (
                                                            contact.tags.map(
                                                                (tag) => (
                                                                    <Badge
                                                                        key={
                                                                            tag
                                                                        }
                                                                        variant="neutral"
                                                                        className="px-2 py-0.5 text-[0.6875rem] font-medium"
                                                                    >
                                                                        {tag}
                                                                    </Badge>
                                                                ),
                                                            )
                                                        )}
                                                    </div>
                                                </Link>
                                                <DeleteConfirm
                                                    title={`Delete ${name || contact.email}?`}
                                                    description={`Delete ${contact.email}? This cannot be undone.`}
                                                    onConfirm={() =>
                                                        handleDeleteContact(
                                                            contact,
                                                        )
                                                    }
                                                />
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                            {total > CONTACT_PAGE_SIZE && (
                                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                    <p className="text-xs text-muted-foreground">
                                        {range.from}–{range.to} of {total}
                                    </p>
                                    <div className="flex gap-2">
                                        {page > 1 ? (
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                asChild
                                            >
                                                <Link
                                                    href={contactListHref(
                                                        page - 1,
                                                    )}
                                                >
                                                    Previous
                                                </Link>
                                            </Button>
                                        ) : (
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                disabled
                                            >
                                                Previous
                                            </Button>
                                        )}
                                        {page < pageCount ? (
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                asChild
                                            >
                                                <Link
                                                    href={contactListHref(
                                                        page + 1,
                                                    )}
                                                >
                                                    Next
                                                </Link>
                                            </Button>
                                        ) : (
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                disabled
                                            >
                                                Next
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>

            <Dialog open={newContactOpen} onOpenChange={setNewContactOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>New contact</DialogTitle>
                        <DialogDescription>
                            Save this person to the team&rsquo;s SendLit
                            audience.
                        </DialogDescription>
                    </DialogHeader>
                    <form
                        onSubmit={handleCreateContact}
                        className="mt-5 space-y-4"
                    >
                        <div className="space-y-1.5">
                            <Label htmlFor="new-contact-email">Email</Label>
                            <Input
                                id="new-contact-email"
                                type="email"
                                autoFocus
                                required
                                value={newEmail}
                                onChange={(event) =>
                                    setNewEmail(event.target.value)
                                }
                                placeholder="jane@example.com"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="new-contact-name">Name</Label>
                            <Input
                                id="new-contact-name"
                                value={newName}
                                onChange={(event) =>
                                    setNewName(event.target.value)
                                }
                                placeholder="Jane Doe"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label>Tags</Label>
                            <TagEditor
                                tags={newTags}
                                onAdd={(tag) =>
                                    setNewTags((current) =>
                                        current.includes(tag)
                                            ? current
                                            : [...current, tag],
                                    )
                                }
                                onRemove={(tag) =>
                                    setNewTags((current) =>
                                        current.filter((item) => item !== tag),
                                    )
                                }
                            />
                        </div>
                        <div className="flex justify-end gap-2">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setNewContactOpen(false)}
                            >
                                Cancel
                            </Button>
                            <Button type="submit" disabled={creating}>
                                Create contact
                            </Button>
                        </div>
                    </form>
                </DialogContent>
            </Dialog>
        </ScrollablePage>
    );
}
