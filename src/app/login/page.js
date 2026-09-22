import { Suspense } from "react";
import LoginForm from "./LoginForm";

// Server-component wrapper so Next.js can prerender the static shell around
// the client form. The form uses useSearchParams(), which Next.js requires
// to be inside a Suspense boundary during static generation
// (https://nextjs.org/docs/messages/missing-suspense-with-csr-bailout).
export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
