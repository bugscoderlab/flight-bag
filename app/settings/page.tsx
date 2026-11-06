import { Settings } from "./settings";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <div className="stack">
      <div>
        <div className="caps mb">Settings</div>
        <h1 style={{ margin: 0 }}>Flight instruments</h1>
      </div>
      <Settings />
    </div>
  );
}
