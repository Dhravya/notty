"use client";

import { redirect } from "next/navigation";

function Page({ params }: { params: { id: string } }) {
  return redirect(`/note?id=${params.id}`)
}

export default Page;
