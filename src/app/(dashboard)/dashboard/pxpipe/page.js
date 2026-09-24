import { Suspense } from "react";
import { CardSkeleton } from "@/shared/components";
import PxpipeClient from "./PxpipeClient";

// PxpipeClient calls useSearchParams(); wrap it in a Suspense boundary so
// Next.js can prerender the route without bailing out
// (https://nextjs.org/docs/messages/missing-suspense-with-csr-bailout).
export default function PxpipePage() {
  return (
    <Suspense fallback={<CardSkeleton />}>
      <PxpipeClient />
    </Suspense>
  );
}
