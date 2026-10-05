import { useState } from "react";
import { whatIf, type Balances } from "../lib/calc";
import { formatINRShort, formatRatio, parseAmount } from "../lib/format";
import type { Level, Settings } from "../lib/types";
import { Alert, Card, Field } from "./ui";

export function WhatIfCard({
  settings,
  bal,
  className = "",
}: {
  settings: Settings;
  bal: Balances;
  className?: string;
}) {
  const [text, setText] = useState("");
  const result = text.trim() === "" ? null : whatIf(settings, bal, parseAmount(text));
  const name = (l: Level | null) => (l ? settings.labels.levels[l].name : "no level");

  return (
    <Card title="What-if: lifestyle upgrade" className={className}>
      <p className="mb-3 text-sm text-muted">
        Try a new monthly survival budget with the same balances before you commit to it.
      </p>
      <Field
        label="New monthly budget (₹)"
        error={result && !result.valid ? result.message : undefined}
        hint={`Current: ${formatINRShort(settings.monthlySurvivalB)}/month`}
      >
        {(p) => (
          <input
            {...p}
            className="input"
            inputMode="decimal"
            placeholder="e.g. 1,00,000"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        )}
      </Field>
      {result?.valid && (
        <div className="mt-3 space-y-2" aria-live="polite">
          <p className="text-sm">
            You would be at <strong className="text-lg">{name(result.newLevel)}</strong>
            {result.newRatio !== null && <> ({formatRatio(result.newRatio)} of annual survival)</>}
            {result.currentLevel && <>, today you are at {name(result.currentLevel)}</>}.
          </p>
          {result.dropsLevel ? (
            <Alert tone="danger">
              <strong>Warning:</strong> this upgrade drops you from {name(result.currentLevel)} to{" "}
              {name(result.newLevel)}. You would need {formatINRShort(result.shortfallToKeepLevel)}{" "}
              more liquid money to stay where you are.
            </Alert>
          ) : (
            <Alert tone="ok">Your level holds with this budget.</Alert>
          )}
        </div>
      )}
    </Card>
  );
}
