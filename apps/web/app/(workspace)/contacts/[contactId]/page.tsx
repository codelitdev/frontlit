"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { TagEditor } from "@sendlit/email-blocks";
import { ApiError } from "@/lib/api-client";
import {
  addContactTag,
  deleteContact,
  getContact,
  removeContactTag,
  updateContact,
  type Contact,
} from "@/lib/api";
import { PageHeader } from "@/components/workspace/page-header";
import { Loading } from "@/components/workspace/loading";
import { ScrollablePage } from "@/components/workspace/scrollable-page";
import { Banner } from "@/components/workspace/banner";
import { DeleteConfirm } from "@/components/workspace/delete-confirm";
import { Badge } from "@/components/ui/codelit/badge";
import { Button } from "@/components/ui/codelit/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/codelit/card";
import { Input } from "@/components/ui/codelit/input";
import { Label } from "@/components/ui/codelit/label";
import { Switch } from "@/components/ui/codelit/switch";
import { useSetBreadcrumb } from "@/components/workspace/breadcrumb-context";

export default function ContactDetailPage({
  params,
}: {
  params: Promise<{ contactId: string }>;
}) {
  const { contactId } = use(params);
  const router = useRouter();
  const [contact, setContact] = useState<Contact | null>(null);
  const [name, setName] = useState("");
  const [subscribed, setSubscribed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useSetBreadcrumb([
    { label: "Contacts", href: "/contacts" },
    { label: contact?.name || contact?.email || "Contact" },
  ]);

  useEffect(() => {
    getContact(contactId)
      .then((loaded) => {
        setContact(loaded);
        setName(loaded.name ?? "");
        setSubscribed(loaded.subscribed);
      })
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : "Failed to load contact."),
      );
  }, [contactId]);

  const dirty =
    Boolean(contact) &&
    (name !== (contact?.name ?? "") || subscribed !== contact?.subscribed);

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    if (!contact || !dirty) return;
    setSaving(true);
    try {
      const updated = await updateContact(contact.contactId, {
        name,
        subscribed,
      });
      setContact(updated);
      setName(updated.name ?? "");
      setSubscribed(updated.subscribed);
      toast.success("Contact saved.");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to save contact.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!contact) return;
    await deleteContact(contact.contactId);
    toast.success("Contact deleted.");
    router.push("/contacts");
  }

  async function handleAddTag(tag: string) {
    if (!contact) return;
    try {
      setContact(await addContactTag(contact.contactId, tag));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to add tag.");
    }
  }

  async function handleRemoveTag(tag: string) {
    if (!contact) return;
    try {
      setContact(await removeContactTag(contact.contactId, tag));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to remove tag.");
    }
  }

  if (error) {
    return (
      <ScrollablePage>
        <div className="mx-auto w-full max-w-6xl">
          <Banner>{error}</Banner>
        </div>
      </ScrollablePage>
    );
  }

  if (!contact) {
    return (
      <ScrollablePage>
        <Loading />
      </ScrollablePage>
    );
  }

  return (
    <ScrollablePage>
      <div className="mx-auto w-full max-w-6xl space-y-6">
        <PageHeader
          title={contact.name || contact.email}
          description={contact.email}
          action={
            <div className="flex items-center gap-2">
              <Badge variant={contact.subscribed ? "success" : "outline"}>
                {contact.subscribed ? "Subscribed" : "Unsubscribed"}
              </Badge>
              <DeleteConfirm
                title={`Delete ${contact.name || contact.email}?`}
                description={`Delete ${contact.email}? This cannot be undone.`}
                onConfirm={handleDelete}
              />
            </div>
          }
        />

        <form onSubmit={handleSave} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="max-w-sm space-y-1.5">
                <Label htmlFor="contact-name">Name</Label>
                <Input
                  id="contact-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Jane Doe"
                />
              </div>
              <div className="flex items-center gap-3">
                <Switch
                  id="contact-subscribed"
                  checked={subscribed}
                  onCheckedChange={setSubscribed}
                />
                <Label htmlFor="contact-subscribed">Subscribed to broadcasts</Label>
              </div>
              <Button type="submit" disabled={!dirty || saving}>
                {saving ? "Saving…" : "Save changes"}
              </Button>
            </CardContent>
          </Card>
        </form>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Tags</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <TagEditor
              tags={contact.tags}
              onAdd={handleAddTag}
              onRemove={handleRemoveTag}
            />
            <p className="text-xs text-muted-foreground">
              Tag changes are saved immediately.
            </p>
          </CardContent>
        </Card>
      </div>
    </ScrollablePage>
  );
}
