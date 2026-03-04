#!/usr/bin/env bun
/**
 * Manage Edge Functions: list, get, invoke, deploy.
 * Usage:
 *   bun run scripts/edge-functions.ts --action=list
 *   bun run scripts/edge-functions.ts --action=get --slug=my-function
 *   bun run scripts/edge-functions.ts --action=invoke --name=my-function [--body='{"key":"val"}'] [--method=POST]
 *   bun run scripts/edge-functions.ts --action=deploy --name=my-function --entrypoint=index.ts --files='[{"name":"index.ts","content":"..."}]'
 */

import {
  parseArgs,
  managementApi,
  managementApiMultipart,
  getProjectRef,
  getEnv,
  assertAllowed,
  output,
} from "./lib.ts";

const args = parseArgs({ action: { required: true } });

const ref = getProjectRef();

switch (args.action) {
  case "list": {
    interface RawFn {
      id: string;
      slug: string;
      name: string;
      status: string;
      version: number;
      created_at: string;
      updated_at: string;
    }
    const fns = await managementApi<RawFn[]>(`/projects/${ref}/functions`);
    output(
      fns.map((fn) => ({
        id: fn.id,
        slug: fn.slug,
        name: fn.name,
        status: fn.status,
        version: fn.version,
        createdAt: fn.created_at,
        updatedAt: fn.updated_at,
      }))
    );
    break;
  }

  case "get": {
    if (!args.slug) {
      console.error("Error: --slug is required for get action");
      process.exit(1);
    }
    const fn = await managementApi<Record<string, unknown>>(`/projects/${ref}/functions/${encodeURIComponent(args.slug)}`);
    output(fn);
    break;
  }

  case "invoke": {
    if (!args.name) {
      console.error("Error: --name is required for invoke action");
      process.exit(1);
    }
    assertAllowed("write");

    const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");
    const method = (args.method as string) || "POST";
    const body = args.body ? JSON.parse(args.body) : undefined;

    const url = `https://${ref}.supabase.co/functions/v1/${args.name}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
    };

    const fetchOptions: RequestInit = { method, headers };
    if (body && method !== "GET") {
      fetchOptions.body = JSON.stringify(body);
    }

    const startTime = Date.now();
    const response = await fetch(url, fetchOptions);
    const duration = Date.now() - startTime;

    const contentType = response.headers.get("content-type") || "";
    let data: unknown;
    if (contentType.includes("application/json")) {
      try {
        data = await response.json();
      } catch {
        data = await response.text();
      }
    } else {
      data = await response.text();
    }

    output({
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
      data,
      duration,
      headers: Object.fromEntries(response.headers.entries()),
    });
    break;
  }

  case "deploy": {
    if (!args.name) {
      console.error("Error: --name is required for deploy action");
      process.exit(1);
    }
    if (!args.files) {
      console.error('Error: --files is required (JSON array of {name, content})');
      process.exit(1);
    }
    assertAllowed("write");

    const files: Array<{ name: string; content: string }> = JSON.parse(args.files);
    const entrypoint = args.entrypoint || "index.ts";
    const verifyJwt = args.verify_jwt === "true";

    const metadata: Record<string, unknown> = {
      name: args.name,
      entrypoint_path: entrypoint,
      verify_jwt: verifyJwt,
    };
    if (args.import_map_path) {
      metadata.import_map_path = args.import_map_path;
    }

    const formData = new FormData();
    formData.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
    for (const file of files) {
      formData.append("file", new Blob([file.content], { type: "application/typescript" }), file.name);
    }

    const result = await managementApiMultipart<Record<string, unknown>>(
      `/projects/${ref}/functions/deploy?slug=${encodeURIComponent(args.name)}`,
      formData
    );
    output(result);
    break;
  }

  default:
    console.error(`Error: Unknown action "${args.action}". Must be: list, get, invoke, deploy`);
    process.exit(1);
}
