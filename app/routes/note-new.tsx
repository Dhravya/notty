import { redirect } from "react-router";
import type { LoaderFunctionArgs } from "react-router";

export async function loader({}: LoaderFunctionArgs) {
  // Generate a new 10-digit note ID
  const id = Math.floor(Date.now() / 1000).toString().padStart(10, "0");
  return redirect(`/note?id=${id}`);
}

export default function NewNotePage() {
  // This component shouldn't render because of the redirect
  return null;
}
