import { getOverview } from "@/lib/repo";
import HomeActions from "@/app/ui/HomeActions";

export const dynamic = "force-dynamic";

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
        </div>
      </div>

      <div style={{ marginTop: 16 }}>
        <HomeActions />
      </div>
    </main>
  );
}
