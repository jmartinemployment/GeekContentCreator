import { redirect } from "next/navigation";

/** Legacy homemade creates surface — CWV2 Projects is the happy path. */
export default function CreatesRedirectPage() {
  redirect("/app");
}
