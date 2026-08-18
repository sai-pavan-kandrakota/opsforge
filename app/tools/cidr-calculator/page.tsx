"use client";

import { useState } from "react";

type CidrResult = {
  ip: string;
  cidr: number;
  subnetMask: string;
  networkAddress: string;
  broadcastAddress: string;
  firstUsable: string;
  lastUsable: string;
  totalAddresses: number;
  usableHosts: number;
};

function ipToNumber(ip: string): number {
  const parts = ip.split(".").map(Number);

  return (
    ((parts[0] << 24) |
      (parts[1] << 16) |
      (parts[2] << 8) |
      parts[3]) >>>
    0
  );
}

function numberToIp(num: number): string {
  return [
    (num >>> 24) & 255,
    (num >>> 16) & 255,
    (num >>> 8) & 255,
    num & 255,
  ].join(".");
}

function calculateCidr(input: string): CidrResult | null {
  const match = input.trim().match(
    /^(\d{1,3}(?:\.\d{1,3}){3})\/(\d{1,2})$/
  );

  if (!match) return null;

  const ip = match[1];
  const cidr = Number(match[2]);

  const ipParts = ip.split(".").map(Number);

  if (
    ipParts.some((part) => part < 0 || part > 255) ||
    cidr < 0 ||
    cidr > 32
  ) {
    return null;
  }

  const ipNumber = ipToNumber(ip);

  const mask =
    cidr === 0
      ? 0
      : (0xffffffff << (32 - cidr)) >>> 0;

  const network = (ipNumber & mask) >>> 0;
  const broadcast = (network | (~mask >>> 0)) >>> 0;

  const totalAddresses = 2 ** (32 - cidr);

  let firstUsable = network;
  let lastUsable = broadcast;
  let usableHosts = totalAddresses;

  if (cidr === 32) {
    usableHosts = 1;
  } else if (cidr === 31) {
    usableHosts = 2;
    firstUsable = network;
    lastUsable = broadcast;
  } else {
    usableHosts = Math.max(totalAddresses - 2, 0);
    firstUsable = network + 1;
    lastUsable = broadcast - 1;
  }

  return {
    ip,
    cidr,
    subnetMask: numberToIp(mask),
    networkAddress: numberToIp(network),
    broadcastAddress: numberToIp(broadcast),
    firstUsable: numberToIp(firstUsable),
    lastUsable: numberToIp(lastUsable),
    totalAddresses,
    usableHosts,
  };
}

export default function CidrCalculator() {
  const [input, setInput] = useState("192.168.1.0/24");
  const [result, setResult] = useState<CidrResult | null>(
    calculateCidr("192.168.1.0/24")
  );
  const [error, setError] = useState("");

  function handleCalculate() {
    const calculated = calculateCidr(input);

    if (!calculated) {
      setResult(null);
      setError("Enter a valid IPv4 CIDR, for example 192.168.1.0/24.");
      return;
    }

    setError("");
    setResult(calculated);
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-white">
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

      <section className="mx-auto max-w-5xl px-6 py-16">
        <div className="mb-10">
          <p className="text-sm font-medium uppercase tracking-widest text-zinc-500">
            Networking Tool
          </p>

          <h1 className="mt-3 text-4xl font-bold tracking-tight sm:text-5xl">
            CIDR Calculator
          </h1>

          <p className="mt-4 max-w-2xl text-lg leading-8 text-zinc-400">
            Calculate subnet masks, network ranges, usable hosts,
            and broadcast addresses from an IPv4 CIDR block.
          </p>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6">
          <label
            htmlFor="cidr"
            className="mb-3 block text-sm font-medium text-zinc-300"
          >
            IPv4 CIDR
          </label>

          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              id="cidr"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  handleCalculate();
                }
              }}
              placeholder="192.168.1.0/24"
              className="flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-3 text-white outline-none transition placeholder:text-zinc-600 focus:border-zinc-400"
            />

            <button
              onClick={handleCalculate}
              className="rounded-lg bg-white px-6 py-3 font-medium text-zinc-950 transition hover:bg-zinc-200"
            >
              Calculate
            </button>
          </div>

          {error && (
            <p className="mt-4 text-sm text-red-400">
              {error}
            </p>
          )}

          <p className="mt-3 text-sm text-zinc-500">
            Example: 10.0.0.0/16
          </p>
        </div>

        {result && (
          <section className="mt-8">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-2xl font-semibold">
                Results
              </h2>

              <span className="rounded-full border border-zinc-800 bg-zinc-900 px-3 py-1 text-sm text-zinc-400">
                /{result.cidr}
              </span>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <ResultCard
                label="IP Address"
                value={result.ip}
              />

              <ResultCard
                label="Subnet Mask"
                value={result.subnetMask}
              />

              <ResultCard
                label="Network Address"
                value={result.networkAddress}
              />

              <ResultCard
                label="Broadcast Address"
                value={result.broadcastAddress}
              />

              <ResultCard
                label="First Usable IP"
                value={result.firstUsable}
              />

              <ResultCard
                label="Last Usable IP"
                value={result.lastUsable}
              />

              <ResultCard
                label="Total Addresses"
                value={result.totalAddresses.toLocaleString()}
              />

              <ResultCard
                label="Usable Hosts"
                value={result.usableHosts.toLocaleString()}
              />
            </div>
          </section>
        )}
      </section>
    </main>
  );
}

function ResultCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
      <p className="text-sm text-zinc-500">
        {label}
      </p>

      <p className="mt-2 font-mono text-lg font-medium text-white">
        {value}
      </p>
    </div>
  );
}