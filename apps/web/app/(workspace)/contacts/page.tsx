"use client";

import { useEffect, useState } from "react";
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
 * Contacts: FrontLit's leads/audience, captured via public-site email forms
 * and support tickets or created here. A read-through over SendLit contacts
 * (architecture.md §10.2) — FrontLit stores no contact rows of its own.
 */
export default function ContactsPage() {
    useSetBreadcrumb([{ label: "Contacts" }]);
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
                    itemsPerPage: 100,
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
    }, [serializedFilter]);

    async function reload(nextFilter: ContactFilter = filter) {
        const serialized = serializeContactFilter(nextFilter);
        const result = await listContacts({
            filter: serialized,
            itemsPerPage: 100,
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
            await reload();
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
            await reload();
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
                            This team isn&rsquo;t connected to SendLit yet.
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
                                onChange={setFilter}
                                count={total}
                            />
                            <div className="overflow-hidden rounded-xl border bg-card">
                                {contacts.length === 0 ? (
                                    <p className="p-5 text-sm text-muted-foreground">
                                        No contacts match this filter.
                                    </p>
                                ) : (
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Email</TableHead>
                                                <TableHead>Name</TableHead>
                                                <TableHead>Tags</TableHead>
                                                <TableHead>Status</TableHead>
                                                <TableHead className="w-px" />
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {contacts.map((contact) => (
                                                <TableRow
                                                    key={contact.contactId}
                                                >
                                                    <TableCell className="font-medium">
                                                        {contact.email}
                                                    </TableCell>
                                                    <TableCell className="text-muted-foreground">
                                                        {contact.name || "—"}
                                                    </TableCell>
                                                    <TableCell>
                                                        {contact.tags.length ===
                                                        0 ? (
                                                            <span className="text-muted-foreground">
                                                                —
                                                            </span>
                                                        ) : (
                                                            <div className="flex flex-wrap gap-1">
                                                                {contact.tags.map(
                                                                    (tag) => (
                                                                        <Badge
                                                                            key={
                                                                                tag
                                                                            }
                                                                            variant="neutral"
                                                                        >
                                                                            {
                                                                                tag
                                                                            }
                                                                        </Badge>
                                                                    ),
                                                                )}
                                                            </div>
                                                        )}
                                                    </TableCell>
                                                    <TableCell>
                                                        <Badge
                                                            variant={
                                                                contact.subscribed
                                                                    ? "success"
                                                                    : "outline"
                                                            }
                                                        >
                                                            {contact.subscribed
                                                                ? "Subscribed"
                                                                : "Unsubscribed"}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell>
                                                        <DeleteConfirm
                                                            description={`Delete ${contact.email} from SendLit? This cannot be undone.`}
                                                            onConfirm={() =>
                                                                handleDeleteContact(
                                                                    contact,
                                                                )
                                                            }
                                                        />
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                )}
                            </div>
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
