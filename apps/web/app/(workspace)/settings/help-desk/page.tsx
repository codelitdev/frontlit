import { redirect } from "next/navigation";

export default function HelpDeskSettingsRedirect() {
    redirect("/website?tab=help-desk");
}
