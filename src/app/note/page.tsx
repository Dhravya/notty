"use client";

import { notFound, useSearchParams } from "next/navigation";
import NovelEditor from "./[id]/novelEditor";

function Page() {

    const params = useSearchParams();

    const id = params.get("id");

    if (!id) return notFound()

    return (
        <div className="mb-12 flex min-h-[100svh] flex-col items-center sm:px-5 sm:pt-[calc(20vh)] md:mb-0">
            <NovelEditor id={id} />
        </div>
    );
}

export default Page;
