"use client";

export default function MainContent({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto w-full min-w-0 max-w-none px-3 pb-[calc(3.25rem+env(safe-area-inset-bottom,0px)+0.5rem)] pt-3 md:w-[90%] md:px-8 md:pb-8 md:pt-7">
      {children}
    </main>
  );
}
