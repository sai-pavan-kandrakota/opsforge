"use client";

import { useState } from "react";

type Preset = {
  name: string;
  expression: string;
  description: string;
};

const presets: Preset[] = [
  {
    name: "Every minute",
    expression: "* * * * *",
    description: "Runs every minute",
  },
  {
    name: "Every 5 minutes",
    expression: "*/5 * * * *",
    description: "Runs every 5 minutes",
  },
  {
    name: "Every hour",
    expression: "0 * * * *",
    description: "Runs at the start of every hour",
  },
  {
    name: "Every day at midnight",
    expression: "0 0 * * *",
    description: "Runs every day at 12:00 AM",
  },
  {
    name: "Every day at 9 AM",
    expression: "0 9 * * *",
    description: "Runs every day at 9:00 AM",
  },
  {
    name: "Every Monday",
    expression: "0 9 * * 1",
    description: "Runs every Monday at 9:00 AM",
  },
  {
    name: "Every Sunday",
    expression: "0 0 * * 0",
    description: "Runs every Sunday at midnight",
  },
  {
    name: "First day of month",
    expression: "0 0 1 * *",
    description: "Runs at midnight on the first day of every month",
  },
];

const fieldInfo = [
  {
    name: "Minute",
    range: "0–59",
    position: "1st",
  },
  {
    name: "Hour",
    range: "0–23",
    position: "2nd",
  },
  {
    name: "Day of Month",
    range: "1–31",
    position: "3rd",
  },
  {
    name: "Month",
    range: "1–12",
    position: "4th",
  },
  {
    name: "Day of Week",
    range: "0–7",
    position: "5th",
  },
];

function isValidField(
  value: string,
  min: number,
  max: number
): boolean {
  if (value === "*") return true;

  const parts = value.split(",");

  return parts.every((part) => {
    // A comma-separated list with an empty or whitespace-only segment (e.g.
    // "5,,10", a leading/trailing comma, or "5, ,10") is malformed cron
    // syntax. Number("") and Number(" ") both coerce to 0, which is within
    // range for any field whose minimum is 0 (minute, hour, day-of-week),
    // so this must be rejected before it ever reaches numeric parsing below.
    if (part.trim() === "") {
      return false;
    }

    if (part.startsWith("*/")) {
      const step = Number(part.slice(2));
      return Number.isInteger(step) && step > 0 && step <= max;
    }

    if (part.includes("/")) {
      const [range, stepValue] = part.split("/");
      const step = Number(stepValue);

      if (!Number.isInteger(step) || step <= 0) {
        return false;
      }

      if (range === "*") {
        return true;
      }

      if (range.includes("-")) {
        const [start, end] = range.split("-").map(Number);

        return (
          Number.isInteger(start) &&
          Number.isInteger(end) &&
          start >= min &&
          end <= max &&
          start <= end
        );
      }

      return false;
    }

    if (part.includes("-")) {
      const [start, end] = part.split("-").map(Number);

      return (
        Number.isInteger(start) &&
        Number.isInteger(end) &&
        start >= min &&
        end <= max &&
        start <= end
      );
    }

    const number = Number(part);

    return (
      Number.isInteger(number) &&
      number >= min &&
      number <= max
    );
  });
}

function validateCron(expression: string): boolean {
  const fields = expression.trim().split(/\s+/);

  if (fields.length !== 5) {
    return false;
  }

  const ranges = [
    [0, 59],
    [0, 23],
    [1, 31],
    [1, 12],
    [0, 7],
  ];

  return fields.every((field, index) =>
    isValidField(field, ranges[index][0], ranges[index][1])
  );
}

function describeCron(expression: string): string {
  const normalized = expression.trim();

  const knownDescriptions: Record<string, string> = {
    "* * * * *": "Every minute",
    "*/5 * * * *": "Every 5 minutes",
    "*/10 * * * *": "Every 10 minutes",
    "*/15 * * * *": "Every 15 minutes",
    "0 * * * *": "At the start of every hour",
    "0 */2 * * *": "Every 2 hours",
    "0 */6 * * *": "Every 6 hours",
    "0 0 * * *": "Every day at midnight",
    "0 9 * * *": "Every day at 9:00 AM",
    "0 12 * * *": "Every day at noon",
    "0 18 * * *": "Every day at 6:00 PM",
    "0 9 * * 1": "Every Monday at 9:00 AM",
    "0 9 * * 5": "Every Friday at 9:00 AM",
    "0 0 * * 0": "Every Sunday at midnight",
    "0 0 1 * *": "At midnight on the first day of every month",
  };

  if (knownDescriptions[normalized]) {
    return knownDescriptions[normalized];
  }

  const fields = normalized.split(/\s+/);

  const minute = fields[0];
  const hour = fields[1];
  const day = fields[2];
  const month = fields[3];
  const weekday = fields[4];

  let description = "Runs ";

  if (minute.startsWith("*/")) {
    description += `every ${minute.slice(2)} minutes`;
  } else if (minute === "*") {
    description += "every minute";
  } else {
    description += `at minute ${minute}`;
  }

  if (hour !== "*") {
    if (hour.startsWith("*/")) {
      description += `, every ${hour.slice(2)} hours`;
    } else {
      description += ` during hour ${hour}`;
    }
  }

  if (day !== "*") {
    description += ` on day ${day} of the month`;
  }

  if (month !== "*") {
    description += ` in month ${month}`;
  }

  if (weekday !== "*") {
    const weekdays: Record<string, string> = {
      "0": "Sunday",
      "1": "Monday",
      "2": "Tuesday",
      "3": "Wednesday",
      "4": "Thursday",
      "5": "Friday",
      "6": "Saturday",
      "7": "Sunday",
    };

    if (weekdays[weekday]) {
      description += ` on ${weekdays[weekday]}`;
    } else {
      description += ` on weekday ${weekday}`;
    }
  }

  return description;
}

export default function CronGenerator() {
  const [expression, setExpression] = useState("*/5 * * * *");
  const [copied, setCopied] = useState(false);

  const isValid = validateCron(expression);
  const description = isValid
    ? describeCron(expression)
    : "Enter a valid 5-field cron expression.";

  async function copyExpression() {
    try {
      await navigator.clipboard.writeText(expression);

      setCopied(true);

      setTimeout(() => {
        setCopied(false);
      }, 1500);
    } catch {
      setCopied(false);
    }
  }

  function selectPreset(value: string) {
    setExpression(value);
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      {/* Header */}
      <header className="border-b border-zinc-800">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
          <a
            href="/"
            className="flex items-center gap-3"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white font-bold text-zinc-950">
              O
            </div>

            <span className="text-xl font-semibold">
              OpsForge
            </span>
          </a>

          <a
            href="/"
            className="text-sm text-zinc-400 transition hover:text-white"
          >
            ← All tools
          </a>
        </div>
      </header>

      {/* Main */}
      <section className="mx-auto max-w-6xl px-6 py-16">
        <div className="mb-10">
          <p className="text-sm font-medium uppercase tracking-widest text-zinc-500">
            DevOps Tool
          </p>

          <h1 className="mt-3 text-4xl font-bold tracking-tight sm:text-5xl">
            Cron Generator
          </h1>

          <p className="mt-4 max-w-2xl text-lg leading-8 text-zinc-400">
            Create, validate, and understand cron expressions
            for Linux, DevOps automation, CI/CD jobs, and scheduled tasks.
          </p>
        </div>

        {/* Generator */}
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6">
          <label
            htmlFor="cron"
            className="mb-3 block text-sm font-medium text-zinc-300"
          >
            Cron Expression
          </label>

          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              id="cron"
              value={expression}
              onChange={(event) =>
                setExpression(event.target.value)
              }
              spellCheck={false}
              placeholder="*/5 * * * *"
              className={`flex-1 rounded-lg border bg-zinc-950 px-4 py-3 font-mono text-lg text-white outline-none transition placeholder:text-zinc-600 ${
                isValid
                  ? "border-zinc-700 focus:border-zinc-400"
                  : "border-red-900 focus:border-red-500"
              }`}
            />

            <button
              onClick={copyExpression}
              className="rounded-lg bg-white px-6 py-3 font-medium text-zinc-950 transition hover:bg-zinc-200"
            >
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>

          <div role="status" className="mt-5 rounded-xl border border-zinc-800 bg-zinc-950 p-5">
            <div className="flex items-center gap-3">
              <div
                className={`h-2.5 w-2.5 rounded-full ${
                  isValid ? "bg-emerald-500" : "bg-red-500"
                }`}
              />

              <span
                className={
                  isValid
                    ? "text-emerald-400"
                    : "text-red-400"
                }
              >
                {isValid ? "Valid cron expression" : "Invalid cron expression"}
              </span>
            </div>

            <p className="mt-3 text-lg text-zinc-200">
              {description}
            </p>
          </div>
        </div>

        {/* Field breakdown */}
        <section className="mt-8">
          <h2 className="mb-4 text-2xl font-semibold">
            Cron field breakdown
          </h2>

          <div className="overflow-hidden rounded-2xl border border-zinc-800">
            <div className="grid grid-cols-3 border-b border-zinc-800 bg-zinc-900 px-5 py-4 text-sm font-medium text-zinc-400 sm:grid-cols-3">
              <span>Field</span>
              <span>Position</span>
              <span>Range</span>
            </div>

            {fieldInfo.map((field) => (
              <div
                key={field.name}
                className="grid grid-cols-3 border-b border-zinc-800 px-5 py-4 text-sm last:border-0"
              >
                <span className="text-zinc-200">
                  {field.name}
                </span>

                <span className="text-zinc-400">
                  {field.position}
                </span>

                <span className="font-mono text-zinc-400">
                  {field.range}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* Presets */}
        <section className="mt-12">
          <div className="mb-5">
            <p className="text-sm font-medium uppercase tracking-widest text-zinc-500">
              Quick Start
            </p>

            <h2 className="mt-2 text-2xl font-semibold">
              Common cron expressions
            </h2>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {presets.map((preset) => (
              <button
                key={preset.expression}
                onClick={() =>
                  selectPreset(preset.expression)
                }
                className="group rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 text-left transition hover:border-zinc-600 hover:bg-zinc-900"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-zinc-200">
                    {preset.name}
                  </span>

                  <span className="text-zinc-600 transition group-hover:text-white" aria-hidden="true">
                    →
                  </span>
                </div>

                <code className="mt-3 block font-mono text-sm text-zinc-400">
                  {preset.expression}
                </code>

                <p className="mt-2 text-sm text-zinc-500">
                  {preset.description}
                </p>
              </button>
            ))}
          </div>
        </section>

        {/* Examples */}
        <section className="mt-12 border-t border-zinc-800 pt-10">
          <h2 className="text-2xl font-semibold">
            Cron examples for DevOps
          </h2>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
              <code className="font-mono text-lg text-white">
                0 2 * * *
              </code>

              <p className="mt-3 text-sm leading-6 text-zinc-400">
                Runs every day at 2:00 AM. Useful for
                scheduled maintenance or nightly jobs.
              </p>
            </div>

            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
              <code className="font-mono text-lg text-white">
                */15 * * * *
              </code>

              <p className="mt-3 text-sm leading-6 text-zinc-400">
                Runs every 15 minutes. Useful for periodic
                polling or lightweight automation.
              </p>
            </div>
          </div>
        </section>

        {/* Warning */}
        <section className="mt-8 rounded-xl border border-amber-900/50 bg-amber-950/10 p-5">
          <div className="font-semibold text-amber-400">
            Timezone reminder
          </div>

          <p className="mt-2 text-sm leading-6 text-zinc-400">
            Cron jobs normally use the timezone configured on
            the machine or scheduler running them. A cron
            expression such as{" "}
            <code className="font-mono text-zinc-300">
              0 9 * * *
            </code>{" "}
            does not automatically mean 9:00 AM in your local
            timezone.
          </p>
        </section>
      </section>

      {/* Footer */}
      <footer className="border-t border-zinc-800">
        <div className="mx-auto flex max-w-7xl justify-between px-6 py-8 text-sm text-zinc-500">
          <span>© 2026 OpsForge</span>
          <span>DevOps · Cloud · SRE</span>
        </div>
      </footer>
    </main>
  );
}