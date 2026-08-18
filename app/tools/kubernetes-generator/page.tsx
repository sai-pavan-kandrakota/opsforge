"use client";

import { useState } from "react";

type ResourceType = "deployment" | "service" | "namespace";

export default function KubernetesGenerator() {
  const [resourceType, setResourceType] =
    useState<ResourceType>("deployment");

  const [name, setName] = useState("my-app");
  const [namespace, setNamespace] = useState("default");
  const [image, setImage] = useState("nginx:1.27");
  const [replicas, setReplicas] = useState("3");
  const [containerPort, setContainerPort] = useState("80");
  const [servicePort, setServicePort] = useState("80");
  const [copied, setCopied] = useState(false);

  function generateYaml() {
    if (resourceType === "namespace") {
      return `apiVersion: v1
kind: Namespace
metadata:
  name: ${namespace}`;
    }

    if (resourceType === "service") {
      return `apiVersion: v1
kind: Service
metadata:
  name: ${name}
  namespace: ${namespace}
spec:
  selector:
    app: ${name}
  ports:
    - protocol: TCP
      port: ${servicePort}
      targetPort: ${containerPort}
  type: ClusterIP`;
    }

    return `apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${name}
  namespace: ${namespace}
spec:
  replicas: ${replicas}
  selector:
    matchLabels:
      app: ${name}
  template:
    metadata:
      labels:
        app: ${name}
    spec:
      containers:
        - name: ${name}
          image: ${image}
          ports:
            - containerPort: ${containerPort}`;
  }

  const yaml = generateYaml();

  async function copyYaml() {
    try {
      await navigator.clipboard.writeText(yaml);
      setCopied(true);

      setTimeout(() => {
        setCopied(false);
      }, 1500);
    } catch {
      setCopied(false);
    }
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
            className="text-sm text-zinc-400 hover:text-white"
          >
            ← All tools
          </a>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-6 py-16">
        <div className="mb-10">
          <p className="text-sm font-medium uppercase tracking-widest text-zinc-500">
            Kubernetes Tool
          </p>

          <h1 className="mt-3 text-4xl font-bold tracking-tight sm:text-5xl">
            Kubernetes Generator
          </h1>

          <p className="mt-4 max-w-2xl text-lg leading-8 text-zinc-400">
            Generate clean Kubernetes manifests without
            writing boilerplate YAML manually.
          </p>
        </div>

        <div className="grid gap-8 lg:grid-cols-2">
          {/* Configuration */}
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6">
            <h2 className="text-xl font-semibold">
              Configuration
            </h2>

            <div className="mt-6 space-y-5">
              <div>
                <label className="mb-2 block text-sm text-zinc-400">
                  Resource type
                </label>

                <select
                  value={resourceType}
                  onChange={(e) =>
                    setResourceType(
                      e.target.value as ResourceType
                    )
                  }
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-3 text-white outline-none focus:border-zinc-400"
                >
                  <option value="deployment">
                    Deployment
                  </option>

                  <option value="service">
                    Service
                  </option>

                  <option value="namespace">
                    Namespace
                  </option>
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm text-zinc-400">
                  Name
                </label>

                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-3 text-white outline-none focus:border-zinc-400"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm text-zinc-400">
                  Namespace
                </label>

                <input
                  value={namespace}
                  onChange={(e) =>
                    setNamespace(e.target.value)
                  }
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-3 text-white outline-none focus:border-zinc-400"
                />
              </div>

              {resourceType === "deployment" && (
                <>
                  <div>
                    <label className="mb-2 block text-sm text-zinc-400">
                      Container image
                    </label>

                    <input
                      value={image}
                      onChange={(e) =>
                        setImage(e.target.value)
                      }
                      placeholder="nginx:1.27"
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-3 font-mono text-white outline-none focus:border-zinc-400"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm text-zinc-400">
                      Replicas
                    </label>

                    <input
                      type="number"
                      min="1"
                      value={replicas}
                      onChange={(e) =>
                        setReplicas(e.target.value)
                      }
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-3 text-white outline-none focus:border-zinc-400"
                    />
                  </div>
                </>
              )}

              {resourceType !== "namespace" && (
                <>
                  <div>
                    <label className="mb-2 block text-sm text-zinc-400">
                      Container port
                    </label>

                    <input
                      type="number"
                      value={containerPort}
                      onChange={(e) =>
                        setContainerPort(e.target.value)
                      }
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-3 text-white outline-none focus:border-zinc-400"
                    />
                  </div>

                  {resourceType === "service" && (
                    <div>
                      <label className="mb-2 block text-sm text-zinc-400">
                        Service port
                      </label>

                      <input
                        type="number"
                        value={servicePort}
                        onChange={(e) =>
                          setServicePort(e.target.value)
                        }
                        className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-3 text-white outline-none focus:border-zinc-400"
                      />
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Output */}
          <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/60">
            <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-4">
              <div>
                <h2 className="font-semibold">
                  Generated YAML
                </h2>

                <p className="mt-1 text-xs text-zinc-500">
                  Ready to copy into your Kubernetes project
                </p>
              </div>

              <button
                onClick={copyYaml}
                className="rounded-md border border-zinc-700 px-3 py-2 text-sm text-zinc-300 hover:border-zinc-500 hover:text-white"
              >
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>

            <pre className="min-h-[520px] overflow-auto p-5 font-mono text-sm leading-6 text-zinc-300">
              {yaml}
            </pre>
          </div>
        </div>

        <section className="mt-16 border-t border-zinc-800 pt-10">
          <h2 className="text-2xl font-semibold">
            What this generator creates
          </h2>

          <div className="mt-8 grid gap-4 md:grid-cols-3">
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
              <h3 className="font-semibold">
                Deployments
              </h3>

              <p className="mt-2 text-sm leading-6 text-zinc-400">
                Generate Deployments with replicas,
                container images, labels, and ports.
              </p>
            </div>

            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
              <h3 className="font-semibold">
                Services
              </h3>

              <p className="mt-2 text-sm leading-6 text-zinc-400">
                Create ClusterIP Services with selectors
                and port mappings.
              </p>
            </div>

            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
              <h3 className="font-semibold">
                Namespaces
              </h3>

              <p className="mt-2 text-sm leading-6 text-zinc-400">
                Generate simple namespace manifests for
                organizing workloads.
              </p>
            </div>
          </div>
        </section>

        <section className="mt-8 rounded-xl border border-amber-900/50 bg-amber-950/10 p-5">
          <h3 className="font-semibold text-amber-400">
            Important
          </h3>

          <p className="mt-2 text-sm leading-6 text-zinc-400">
            Generated YAML is a starting point. Review
            security settings, resource limits, probes,
            policies, secrets, and environment-specific
            configuration before deploying to production.
          </p>
        </section>
      </section>

      <footer className="border-t border-zinc-800">
        <div className="mx-auto flex max-w-7xl justify-between px-6 py-8 text-sm text-zinc-500">
          <span>© 2026 OpsForge</span>
          <span>DevOps · Cloud · SRE</span>
        </div>
      </footer>
    </main>
  );
}