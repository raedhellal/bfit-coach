import { Card, Skeleton } from "@/components/ui/kit";

/** Explicit loading state for the recipe read. */
export default function Loading() {
  return (
    <main className="page">
      <Skeleton w={220} h={26} style={{ marginBottom: 18 }} />
      <Card style={{ marginBottom: 16 }}>
        <Skeleton h={44} w={320} />
      </Card>
      <Card>
        <Skeleton h={132} r={14} />
      </Card>
    </main>
  );
}
