import { Card, Skeleton } from "@/components/ui/kit";

/** Explicit loading state for the routine's server fetch. */
export default function Loading() {
  return (
    <main className="page">
      <Skeleton w={120} h={13} style={{ marginBottom: 18 }} />
      <Skeleton w={220} h={26} style={{ marginBottom: 24 }} />
      <Card style={{ marginBottom: 16 }}>
        <Skeleton h={18} w={160} />
        <Skeleton h={44} style={{ marginTop: 12 }} />
      </Card>
      {[0, 1].map((i) => (
        <Card key={i} style={{ marginBottom: 14 }}>
          <Skeleton h={16} w={180} />
          <Skeleton h={72} r={14} style={{ marginTop: 14 }} />
          <Skeleton h={72} r={14} style={{ marginTop: 10 }} />
        </Card>
      ))}
    </main>
  );
}
