"use client";

import { useState } from "react";
import DriverEditor from "../drivers/DriverEditor";
import PresetEditor, { type Preset } from "./PresetEditor";

type Driver = { id: number; name: string; is_active: number };

const TABS = [
  { key: "drivers", label: "Drivers" },
  { key: "truck", label: "Truck numbers" },
  { key: "trailer", label: "Trailer numbers" },
  { key: "description", label: "Descriptions" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default function CompassionTabs({
  drivers,
  trucks,
  trailers,
  descriptions,
}: {
  drivers: Driver[];
  trucks: Preset[];
  trailers: Preset[];
  descriptions: Preset[];
}) {
  const [tab, setTab] = useState<TabKey>("drivers");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`border-b-2 px-3 py-2 text-sm font-semibold transition ${
              tab === t.key
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "drivers" && <DriverEditor drivers={drivers} />}
      {tab === "truck" && (
        <PresetEditor
          kind="truck"
          title="Truck number"
          placeholder="e.g. T-101"
          presets={trucks}
        />
      )}
      {tab === "trailer" && (
        <PresetEditor
          kind="trailer"
          title="Trailer number"
          placeholder="e.g. TR-55"
          presets={trailers}
        />
      )}
      {tab === "description" && (
        <PresetEditor
          kind="description"
          title="Description"
          placeholder="e.g. Toll charges"
          presets={descriptions}
        />
      )}
    </div>
  );
}
