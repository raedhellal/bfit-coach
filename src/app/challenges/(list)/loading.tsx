import { Card, Skeleton } from "@/components/ui/kit";

/**
 * Explicit loading state for the challenge list's server reads.
 *
 * In the `(list)` route group (perf/coach-fast-routes-no-skeleton) so that it wraps the
 * LIST only. At `challenges/loading.tsx` it also wrapped `challenges/[id]`, and the
 * detail page showed this skeleton, then held it for React's ~300 ms reveal throttle,
 * although the detail answers in 40-70 ms. `(roster)` is the same move for `/`.
 */
export default function Loading() {
  return (
    <main className="page">
      <Skeleton w={140} h={26} style={{ marginBottom: 8 }} />
      <Skeleton w={260} h={13} style={{ marginBottom: 18 }} />
      <div style={{ display: "grid", gap: 12 }}>
        {[0, 1, 2].map((i) => (
          <Card key={i}>
            <Skeleton h={18} w={220} />
            <Skeleton h={13} w={160} style={{ marginTop: 10 }} />
          </Card>
        ))}
      </div>
    </main>
  );
}
