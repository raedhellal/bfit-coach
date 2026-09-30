import { Card, Skeleton } from "@/components/ui/kit";

/** Explicit loading state for one challenge's progress read. */
export default function Loading() {
  return (
    <main className="page">
      <Skeleton w={120} h={13} style={{ marginBottom: 18 }} />
      <Skeleton w={260} h={26} style={{ marginBottom: 8 }} />
      <Skeleton w={200} h={13} style={{ marginBottom: 18 }} />
      <Card>
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} h={22} style={{ marginTop: i === 0 ? 0 : 14 }} />
        ))}
      </Card>
    </main>
  );
}
