import { redirect } from "next/navigation";

/** Invented create-form path retired — CWV2 ProjectForm lives on /app. */
export default function CreateRedirectPage() {
  redirect("/app");
}
