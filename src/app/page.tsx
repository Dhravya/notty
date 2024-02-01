"use client";

import { redirect } from "next/navigation";

export default function HomePage() {
  return redirect(
    `/note/${Math.floor(Math.random() * 9000000000) + 1000000000}`,
  );
}
