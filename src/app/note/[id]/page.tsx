"use client";

import NovelEditor from "./novelEditor";

function Page({ params }: { params: { id: string } }) {
  return (
    <div className="mb-12 flex min-h-[100svh] flex-col items-center sm:px-5 sm:pt-[calc(20vh)] md:mb-0">
      <NovelEditor id={params.id} />
    </div>
  );
}

export default Page;
