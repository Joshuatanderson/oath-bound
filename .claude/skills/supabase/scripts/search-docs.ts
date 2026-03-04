#!/usr/bin/env bun
/**
 * Search the Supabase documentation (public API, no auth required).
 * Usage: bun run scripts/search-docs.ts --query="row level security" [--limit=10]
 */

import { parseArgs, docsGraphql, output } from "./lib.ts";

const args = parseArgs({
  query: { required: true },
  limit: {},
});

function escapeGraphQL(str: string): string {
  return str
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t");
}

const limitArg = args.limit ? `, limit: ${parseInt(args.limit)}` : "";

const graphqlQuery = `
  query SearchDocs {
    searchDocs(query: "${escapeGraphQL(args.query.trim())}"${limitArg}) {
      nodes {
        __typename
        title
        href
        content
        ... on Guide {
          subsections {
            nodes { title href content }
          }
        }
        ... on ClientLibraryFunctionReference {
          language
          methodName
        }
      }
      totalCount
    }
  }
`;

interface SearchResponse {
  data: {
    searchDocs: {
      nodes: Array<{
        __typename?: string;
        title: string;
        href: string;
        content: string;
        subsections?: { nodes: Array<{ title: string; href: string; content: string }> };
      }>;
      totalCount: number;
    };
  };
}

const response = await docsGraphql<SearchResponse>(graphqlQuery);
const nodes = response.data?.searchDocs?.nodes ?? [];

const typeMap: Record<string, string> = {
  Guide: "guide",
  CLICommandReference: "cli-reference",
  ManagementApiReference: "api-reference",
  ClientLibraryFunctionReference: "function-reference",
  TroubleshootingGuide: "troubleshooting",
};

output({
  totalCount: response.data?.searchDocs?.totalCount ?? 0,
  results: nodes.map((node) => ({
    title: node.title,
    href: node.href,
    content: node.content,
    type: typeMap[node.__typename ?? ""] ?? "guide",
    subsections: node.subsections?.nodes,
  })),
});
