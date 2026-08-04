import { getOverview } from "@/lib/repo";
import HomeActions from "@/app/ui/HomeActions";

export const dynamic = "force-dynamic";

function daysAgoLabel(isoDate: string): string {
  const day = new Date(`${isoDate}T00:00:00.000Z`);
  const now = new Date();
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const diffDays = Math.round((todayUtc - day.getTime()) / 86_400_000);

  if (diffDays <= 0) return "today";
  if (diffDays === 1) return "1 day ago";
  return `${diffDays} days ago`;
}

export default async function Home() {
  const overview = await getOverview();

  return (
    <main>
      <h1>Flashcards</h1>
      <div className="cardFrame" style={{ marginTop: 12 }}>
        <div>
          <strong>Cards to study today:</strong> {overview.dueCount}
        </div>
        <div style={{ marginTop: 8 }}>
          <strong>Last time you studied:</strong>{" "}
          {overview.lastStudiedDay ?? "Never"}
          {overview.lastStudiedDay ? (
            <span className="muted"> ({daysAgoLabel(overview.lastStudiedDay)})</span>
          ) : null}
        </div>
      </div>

      <div style={{ marginTop: 16 }}>
        <HomeActions />
      </div>
    </main>
  );
}
