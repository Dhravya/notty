import { env } from "@/env";
import { NextResponse } from "next/server";

export const runtime = "edge";

export async function POST(req: Request) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return new Response(
      "Missing BLOB_READ_WRITE_TOKEN. Don't forget to add that to your .env file.",
      {
        status: 401,
      },
    );
  }

  const file = req.body ?? "";
  const filename = req.headers.get("x-vercel-filename") ?? "file.txt";
  const contentType = req.headers.get("content-type") ?? "text/plain";
  const fileType = `.${contentType.split("/")[1]}`;

  // construct final filename based on content-type if not provided
  const finalName = filename.includes(fileType)
    ? filename
    : `${filename}${fileType}`;

  const blob = await fetch("https://notty-images.dhravya.workers.dev", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Custom-Auth-Key": `${env.CLOUDFLARE_R2_TOKEN}`,
    },
    body: JSON.stringify({
      filename: finalName,
      file,
    }),
  });

  const url = await blob.text();

  return NextResponse.json({
    success: true,
    message: "File uploaded successfully",
    data: url,
  });
}
