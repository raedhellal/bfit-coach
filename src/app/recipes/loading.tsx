import { Card, Skeleton } from "@/components/ui/kit";

/** Explicit loading state for the library read. */
export default function Loading() {
  return (
    <main className="page">
      <Skeleton w={140} h={26} style={{ marginBottom: 8 }} />
      <Skeleton w={240} h={13} style={{ marginBottom: 18 }} />
      <div style={{ display: "grid", gap: 12 }}>
        {[0, 1, 2].map((i) => (
          <Card key={i}>
            <Skeleton h={18} w={200} />
            <Skeleton h={13} w={220} style={{ marginTop: 10 }} />
          </Card>
        ))}
      </div>
    </main>
  );
}
